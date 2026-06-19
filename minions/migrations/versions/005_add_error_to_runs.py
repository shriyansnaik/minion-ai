"""add error column to runs

Revision ID: 005
Revises: 004
Create Date: 2026-06-19

Failed runs only recorded status='failed' with no detail. This adds an error
column (type, message, and traceback as text) so the UI can show why a run
failed instead of just that it did.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("runs")}
    if "error" not in cols:
        op.execute("ALTER TABLE runs ADD COLUMN error TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE runs DROP COLUMN error")
