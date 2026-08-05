"""Live smoke test across the Tier 1 providers.

**This script spends money.** Every other test in this directory stubs the
provider out; this one deliberately does not, because the thing it checks —
that OpenAI, Anthropic and Gemini really do enforce the `MinionOutput` schema
end to end — cannot be checked any other way.

It is the last gate before a release. Launch does not happen until all three
providers pass.

    # see what it would do, spend nothing:
    python tests/smoke_providers.py --dry-run

    # actually run it (needs the keys, costs a few cents):
    python tests/smoke_providers.py --i-understand-this-spends-money

    # one provider only:
    python tests/smoke_providers.py --i-understand-this-spends-money --only openai

Cost: five short runs per provider on a small prompt — cents, not dollars. Set
`--model` overrides if the defaults have been retired by the time you read this.
"""

import argparse
import os
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import minions
from minions.models import RunResult

SPEND_FLAG = "--i-understand-this-spends-money"

# One entry per Tier 1 provider: the model to exercise and the env var that
# must be set for it. Override a model with --model openai=gpt-4o-mini.
PROVIDERS = {
    "openai": {"model": "openai/gpt-4o", "env": "OPENAI_API_KEY"},
    "anthropic": {"model": "anthropic/claude-opus-4", "env": "ANTHROPIC_API_KEY"},
    "gemini": {"model": "gemini/gemini-2.5-pro", "env": "GEMINI_API_KEY"},
}


# ---------------------------------------------------------------------------
# Tools. Deliberately trivial and deterministic — this tests Minion's plumbing,
# not the model's cleverness.
# ---------------------------------------------------------------------------

def get_population(city: str) -> int:
    """Get the population of a city.

    Args:
        city: Name of the city, e.g. "Tokyo".
    """
    return {"Tokyo": 13_960_000, "Oslo": 709_000, "Lisbon": 548_000}.get(city, 0)


def get_country(city: str) -> str:
    """Get the country a city is in.

    Args:
        city: Name of the city, e.g. "Tokyo".
    """
    return {"Tokyo": "Japan", "Oslo": "Norway", "Lisbon": "Portugal"}.get(city, "unknown")


def slow_echo(text: str) -> str:
    """Echo the text back after a short delay.

    Args:
        text: The text to echo.
    """
    time.sleep(0.4)
    return text


# ---------------------------------------------------------------------------
# Checks. Each returns (name, ok, detail) and never raises.
# ---------------------------------------------------------------------------

def check_single_tool(model: str) -> tuple[bool, str]:
    """One turn, one tool, then finish. The minimum viable agent."""
    agent = minions.Minion(model=model, tools=[get_population], max_turns=4)
    result = agent("What is the population of Tokyo? Use the tool.")
    if not isinstance(result, RunResult):
        return False, f"expected RunResult, got {type(result).__name__}"
    if not result.output:
        return False, "run produced no output (hit max_turns?)"
    if "13" not in result.output.replace(",", "").replace(" ", ""):
        return False, f"population missing from output: {result.output[:120]!r}"
    return True, result.output[:80]


def check_multi_tool_turn(model: str) -> tuple[bool, str]:
    """Several tools in one turn — the shape Tier 3 models cannot produce."""
    agent = minions.Minion(model=model, tools=[get_population, get_country], max_turns=5)
    result = agent(
        "For Tokyo, Oslo and Lisbon, give me the population and the country. "
        "Look every one of them up with the tools."
    )
    if not result.output:
        return False, "run produced no output"
    missing = [c for c in ("Japan", "Norway", "Portugal") if c not in result.output]
    if missing:
        return False, f"missing from output: {missing}"
    return True, f"all three cities resolved"


def check_parallel_tools(model: str) -> tuple[bool, str]:
    """Same, with parallel execution on. Guards the threading path."""
    agent = minions.Minion(
        model=model, tools=[slow_echo], parallel_tools=True, max_turns=4
    )
    started = time.monotonic()
    result = agent(
        "Echo each of these back, all at once: 'alpha', 'beta', 'gamma', 'delta'."
    )
    elapsed = time.monotonic() - started
    if not result.output:
        return False, "run produced no output"
    found = [w for w in ("alpha", "beta", "gamma", "delta") if w in result.output.lower()]
    if len(found) < 4:
        return False, f"only echoed {found}"
    return True, f"4 echoes in {elapsed:.1f}s"


def check_sub_agents(model: str) -> tuple[bool, str]:
    """A named specialist, and the parent linking to its run."""
    counter = minions.Minion(
        name="geographer",
        description="Answers questions about cities using lookup tools.",
        model=model,
        tools=[get_population, get_country],
        max_turns=4,
    )
    manager = minions.Minion(model=model, sub_minions=[counter], max_turns=5)
    result = manager("Ask the geographer which country Oslo is in, then tell me.")
    if not result.output:
        return False, "run produced no output"
    if "Norway" not in result.output:
        return False, f"specialist answer missing: {result.output[:120]!r}"
    return True, "delegation round-trip ok"


def check_tracing(model: str) -> tuple[bool, str]:
    """A trace id comes back and the run is actually in the database."""
    from minions import trace_db

    agent = minions.Minion(model=model, tools=[get_population], max_turns=4)
    result = agent(
        "Population of Oslo?",
        tags=["smoke"],
        metadata={"suite": "tier1-smoke", "model": model},
    )
    if not result.trace_id:
        return False, "no trace_id returned — is tracing enabled?"

    from sqlalchemy import text

    with trace_db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT status, total_input_tokens FROM runs WHERE id=:id"),
            {"id": result.trace_id},
        ).mappings().fetchone()
    if not row:
        return False, f"trace {result.trace_id} not found in the database"
    if row["status"] != "completed":
        return False, f"run recorded as {row['status']!r}"
    if not row["total_input_tokens"]:
        return False, "no token usage recorded"
    return True, f"trace {result.trace_id[:8]}… recorded, {row['total_input_tokens']} input tokens"


CHECKS = [
    ("single tool", check_single_tool),
    ("multi-tool turn", check_multi_tool_turn),
    ("parallel tools", check_parallel_tools),
    ("sub-agents", check_sub_agents),
    ("tracing", check_tracing),
]


def run_provider(name: str, model: str, dry_run: bool) -> bool:
    # ASCII only: this prints to a console, and Windows defaults to cp1252.
    print(f"\n=== {name} - {model} ===")

    env = PROVIDERS[name]["env"]
    has_key = bool(os.environ.get(env))

    if dry_run:
        print(f"  {'key present' if has_key else 'KEY MISSING'}: {env}")
        for label, _ in CHECKS:
            print(f"  WOULD RUN  {label}")
        return has_key

    if not has_key:
        print(f"  SKIP  {env} is not set")
        return False

    passed = True
    for label, check in CHECKS:
        try:
            ok, detail = check(model)
        except Exception as e:
            ok, detail = False, f"{type(e).__name__}: {e}"
            traceback.print_exc()
        print(f"  {'PASS' if ok else 'FAIL'}  {label:<18} {detail}")
        passed = passed and ok
    return passed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        SPEND_FLAG, dest="confirmed", action="store_true",
        help="required to make real API calls",
    )
    parser.add_argument("--dry-run", action="store_true", help="list the checks, spend nothing")
    parser.add_argument("--only", choices=sorted(PROVIDERS), help="run one provider")
    parser.add_argument(
        "--model", action="append", default=[], metavar="PROVIDER=MODEL",
        help="override a provider's model, e.g. --model openai=openai/gpt-4o-mini",
    )
    args = parser.parse_args()

    for override in args.model:
        provider, _, model = override.partition("=")
        if provider not in PROVIDERS:
            print(f"unknown provider in --model: {provider!r}")
            return 2
        PROVIDERS[provider]["model"] = model

    if not args.confirmed and not args.dry_run:
        print(__doc__)
        print(f"Refusing to run without {SPEND_FLAG} (or --dry-run).")
        return 2

    targets = [args.only] if args.only else list(PROVIDERS)

    if not args.dry_run:
        minions.init(tracing=True, project="tier1-smoke")

    results = {name: run_provider(name, PROVIDERS[name]["model"], args.dry_run)
               for name in targets}

    print("\n" + "=" * 46)
    for name, ok in results.items():
        print(f"  {'PASS' if ok else 'FAIL/SKIP':<10} {name}")
    print("=" * 46)

    if args.dry_run:
        print("\nDry run - no API calls were made.")
        missing = [n for n, ok in results.items() if not ok]
        if missing:
            print(f"Keys not set for: {', '.join(missing)}")
        return 0

    if all(results.values()):
        print("\nAll Tier 1 providers passed. Traces are in the 'tier1-smoke' project;")
        print("open them with `minion serve` before calling it done.")
        return 0

    print("\nTier 1 is not green. This is a release blocker.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
