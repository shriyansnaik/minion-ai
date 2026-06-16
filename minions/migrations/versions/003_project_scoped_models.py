"""make custom_models project-scoped

Revision ID: 003
Revises: 002
Create Date: 2026-06-16

custom_models was global (UNIQUE model_name). This rebuilds it with a project_id
FK and per-project uniqueness (project_id, model_name). SQLite can't ALTER a
constraint, so the table is recreated. Existing global rows have no project to
belong to and are dropped — re-add prices per project.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS custom_models")
    op.execute("""
        CREATE TABLE custom_models (
            id                    TEXT PRIMARY KEY,
            project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            model_name            TEXT NOT NULL,
            input_price_per_mtok  REAL NOT NULL,
            output_price_per_mtok REAL NOT NULL,
            created_at            TEXT NOT NULL,
            UNIQUE(project_id, model_name)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS custom_models")
    op.execute("""
        CREATE TABLE custom_models (
            id                    TEXT PRIMARY KEY,
            model_name            TEXT NOT NULL UNIQUE,
            input_price_per_mtok  REAL NOT NULL,
            output_price_per_mtok REAL NOT NULL,
            created_at            TEXT NOT NULL
        )
    """)
