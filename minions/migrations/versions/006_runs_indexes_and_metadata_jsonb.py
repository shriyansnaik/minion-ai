"""add indexes to runs; migrate metadata to JSONB on Postgres

Revision ID: 006
Revises: 005
Create Date: 2026-06-24

The runs table had no indexes beyond its primary key, so every list/filter
query was a full table scan. Adds composite indexes on the columns the trace
list actually filters/sorts by. On Postgres, also converts `metadata` from
TEXT to JSONB and adds a GIN index so exact key=value metadata filters can
use it for any key without per-key index work.

Note: the ALTER COLUMN ... TYPE JSONB step is a full-table rewrite on
Postgres. This only matters for an already-populated database upgrading
through this revision for the first time — alembic tracks applied revisions,
so a fresh install runs this against an empty table (instant), and an
already-upgraded database never re-runs it on later upgrades. Still, run it
in a maintenance window if upgrading a large, already-populated Postgres
deployment.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # One composite per query shape actually used, not a single wide index —
    # status/model are each independently-optional filters, so a left-prefix
    # (project_id, status, model, created_at) index would be useless whenever
    # only one of status/model is set. `id` rides along on the created_at
    # index since it's the keyset-pagination tie-breaker.
    op.execute("CREATE INDEX IF NOT EXISTS ix_runs_project_created ON runs (project_id, created_at, id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_runs_project_status  ON runs (project_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_runs_project_model   ON runs (project_id, model)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_runs_project_parent  ON runs (project_id, parent_trace_id)")

    if dialect == "postgresql":
        op.execute("ALTER TABLE runs ALTER COLUMN metadata TYPE JSONB USING metadata::jsonb")
        op.execute("ALTER TABLE runs ALTER COLUMN metadata SET DEFAULT '{}'::jsonb")
        op.execute("CREATE INDEX IF NOT EXISTS ix_runs_metadata_gin ON runs USING GIN (metadata)")
    # SQLite keeps metadata as TEXT — no GIN equivalent there; metadata
    # filtering falls back to json_extract with no index, which is fine at
    # local/dev scale and not meant to scale further.


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("DROP INDEX IF EXISTS ix_runs_metadata_gin")
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE runs ALTER COLUMN metadata TYPE TEXT USING metadata::text")
        op.execute("ALTER TABLE runs ALTER COLUMN metadata SET DEFAULT '{}'")
    op.execute("DROP INDEX IF EXISTS ix_runs_project_parent")
    op.execute("DROP INDEX IF EXISTS ix_runs_project_model")
    op.execute("DROP INDEX IF EXISTS ix_runs_project_status")
    op.execute("DROP INDEX IF EXISTS ix_runs_project_created")
