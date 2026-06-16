"""add api_keys table

Revision ID: 002
Revises: 001
Create Date: 2026-06-16
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())

    if "api_keys" not in existing:
        op.execute("""
            CREATE TABLE api_keys (
                id           TEXT PRIMARY KEY,
                project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name         TEXT NOT NULL,
                prefix       TEXT NOT NULL,
                hashed_token TEXT NOT NULL UNIQUE,
                created_at   TEXT NOT NULL,
                last_used_at TEXT
            )
        """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS api_keys")
