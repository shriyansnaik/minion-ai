"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-16
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())

    if "projects" not in existing:
        op.execute("""
            CREATE TABLE projects (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )
        """)

    if "runs" not in existing:
        op.execute("""
            CREATE TABLE runs (
                id                  TEXT PRIMARY KEY,
                created_at          TEXT NOT NULL,
                finished_at         TEXT,
                model               TEXT NOT NULL,
                status              TEXT NOT NULL DEFAULT 'running',
                system_prompt       TEXT,
                input               TEXT NOT NULL,
                output              TEXT,
                total_input_tokens  INTEGER DEFAULT 0,
                total_output_tokens INTEGER DEFAULT 0,
                total_latency_ms    INTEGER DEFAULT 0,
                parent_trace_id     TEXT,
                project_id          TEXT REFERENCES projects(id),
                tags                TEXT DEFAULT '[]',
                metadata            TEXT DEFAULT '{}',
                tools               TEXT DEFAULT '[]'
            )
        """)
    else:
        # Existing DB that predates some columns
        cols = {c["name"] for c in inspect(bind).get_columns("runs")}
        if "project_id" not in cols:
            op.execute("ALTER TABLE runs ADD COLUMN project_id TEXT REFERENCES projects(id)")
        if "system_prompt" not in cols:
            op.execute("ALTER TABLE runs ADD COLUMN system_prompt TEXT")
        if "tools" not in cols:
            op.execute("ALTER TABLE runs ADD COLUMN tools TEXT DEFAULT '[]'")

    if "turns" not in existing:
        op.execute("""
            CREATE TABLE turns (
                id            TEXT PRIMARY KEY,
                trace_id      TEXT NOT NULL,
                turn_number   INTEGER NOT NULL,
                thought       TEXT,
                input_tokens  INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                latency_ms    INTEGER DEFAULT 0,
                FOREIGN KEY (trace_id) REFERENCES runs(id)
            )
        """)

    if "tool_calls" not in existing:
        op.execute("""
            CREATE TABLE tool_calls (
                id          TEXT PRIMARY KEY,
                turn_id     TEXT NOT NULL,
                tool_name   TEXT NOT NULL,
                args        TEXT DEFAULT '{}',
                result      TEXT,
                latency_ms  INTEGER DEFAULT 0,
                FOREIGN KEY (turn_id) REFERENCES turns(id)
            )
        """)

    if "custom_models" not in existing:
        op.execute("""
            CREATE TABLE custom_models (
                id                    TEXT PRIMARY KEY,
                model_name            TEXT NOT NULL UNIQUE,
                input_price_per_mtok  REAL NOT NULL,
                output_price_per_mtok REAL NOT NULL,
                created_at            TEXT NOT NULL
            )
        """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tool_calls")
    op.execute("DROP TABLE IF EXISTS turns")
    op.execute("DROP TABLE IF EXISTS runs")
    op.execute("DROP TABLE IF EXISTS custom_models")
    op.execute("DROP TABLE IF EXISTS projects")
