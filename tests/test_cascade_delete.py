"""Tests for deleting a run and everything beneath it.

Builds a real SQLite trace database and deletes from it -- no API calls, no
network. Runs under pytest, or standalone:

    python tests/test_cascade_delete.py
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _fresh_db():
    """A trace database with the real schema, in a throwaway file."""
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "traces.db")
    os.environ["MINION_DB_PATH"] = path

    from minions import trace_db
    # Both globals have to go: _engine caches the connection, _initialized is
    # what makes _ensure_init skip running migrations a second time.
    trace_db._engine = None
    trace_db._initialized = False
    trace_db._ensure_init()
    return trace_db


def _tree(db):
    """A run tree four levels deep, plus an unrelated run that must survive.

    root
    +-- child_a
    |   +-- grandchild          <- orphaned by the old one-level delete
    |       +-- great_grandchild
    +-- child_b
    other                       <- untouched
    """
    ids = {}
    ids["root"] = db.create_run(model="m", input="root")
    ids["child_a"] = db.create_run(model="m", input="a", parent_trace_id=ids["root"])
    ids["child_b"] = db.create_run(model="m", input="b", parent_trace_id=ids["root"])
    ids["grandchild"] = db.create_run(model="m", input="g", parent_trace_id=ids["child_a"])
    ids["great_grandchild"] = db.create_run(
        model="m", input="gg", parent_trace_id=ids["grandchild"]
    )
    ids["other"] = db.create_run(model="m", input="unrelated")

    # Give every run a turn with a tool call, so the child-table cleanup is
    # exercised rather than assumed.
    for trace_id in ids.values():
        db.append_turn(
            trace_id, 0, "thought", 10, 5, 100,
            [{"tool_name": "t", "args": {"x": "1"}, "result": "ok", "latency_ms": 1}],
        )
    return ids


def _counts(db):
    from sqlalchemy import text
    with db.get_engine().connect() as conn:
        return {
            table: conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            for table in ("runs", "turns", "tool_calls")
        }


def test_delete_removes_the_whole_subtree():
    db = _fresh_db()
    ids = _tree(db)
    from minions.server.app import _cascade_delete_runs

    with db.get_engine().begin() as conn:
        deleted = _cascade_delete_runs(conn, [ids["root"]])

    # root + 2 children + grandchild + great-grandchild = 5
    assert deleted == 5, f"deleted {deleted}, expected 5"

    after = _counts(db)
    assert after["runs"] == 1, f"{after['runs']} runs left, expected only the unrelated one"
    assert after["turns"] == 1, f"{after['turns']} turns left"
    assert after["tool_calls"] == 1, f"{after['tool_calls']} tool_calls left"


def test_unrelated_runs_survive():
    db = _fresh_db()
    ids = _tree(db)
    from minions.server.app import _cascade_delete_runs
    from sqlalchemy import text

    with db.get_engine().begin() as conn:
        _cascade_delete_runs(conn, [ids["root"]])
        remaining = [
            r["id"] for r in conn.execute(text("SELECT id FROM runs")).mappings().fetchall()
        ]

    assert remaining == [ids["other"]], f"unexpected survivors: {remaining}"


def test_deleting_a_middle_node_leaves_its_ancestors():
    db = _fresh_db()
    ids = _tree(db)
    from minions.server.app import _cascade_delete_runs
    from sqlalchemy import text

    with db.get_engine().begin() as conn:
        deleted = _cascade_delete_runs(conn, [ids["child_a"]])
        remaining = {
            r["id"] for r in conn.execute(text("SELECT id FROM runs")).mappings().fetchall()
        }

    assert deleted == 3, f"deleted {deleted}, expected child_a + grandchild + great_grandchild"
    assert remaining == {ids["root"], ids["child_b"], ids["other"]}


def test_empty_input_is_a_no_op():
    db = _fresh_db()
    _tree(db)
    from minions.server.app import _cascade_delete_runs

    before = _counts(db)
    with db.get_engine().begin() as conn:
        assert _cascade_delete_runs(conn, []) == 0
    assert _counts(db) == before


def test_a_parent_cycle_cannot_hang_the_delete():
    """The schema shouldn't allow this, but an infinite loop would take the
    server down, so the walk has to terminate regardless."""
    db = _fresh_db()
    ids = _tree(db)
    from minions.server.app import _cascade_delete_runs
    from sqlalchemy import text

    with db.get_engine().begin() as conn:
        conn.execute(
            text("UPDATE runs SET parent_trace_id=:child WHERE id=:root"),
            {"child": ids["great_grandchild"], "root": ids["root"]},
        )

    with db.get_engine().begin() as conn:
        deleted = _cascade_delete_runs(conn, [ids["root"]])

    assert deleted == 5


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = []
    for fn in tests:
        try:
            fn()
            print(f"  PASS {fn.__name__}")
        except Exception as e:
            failed.append(fn.__name__)
            print(f"  FAIL {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
