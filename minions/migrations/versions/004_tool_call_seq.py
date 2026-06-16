"""add seq ordering column to tool_calls

Revision ID: 004
Revises: 003
Create Date: 2026-06-16

tool_calls were ordered by SQLite's implicit rowid, which doesn't exist on
Postgres. An explicit seq column (the tool's position within its turn) gives a
portable, stable ordering on both dialects.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("tool_calls")}
    if "seq" not in cols:
        op.execute("ALTER TABLE tool_calls ADD COLUMN seq INTEGER NOT NULL DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE tool_calls DROP COLUMN seq")
