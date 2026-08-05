"""Tests for the structured-output paths — native, prompted, and the errors.

`litellm.completion` is monkeypatched throughout, so these make **no API calls
and cost nothing**. That's the point: the fallback exists for models we can't
afford to exercise on every change.

Runs under pytest, or standalone with no dependencies at all:

    python -m pytest tests/
    python tests/test_structured_output.py
"""

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import litellm

from minions.minion import Minion
from minions.models import MinionOutput
from minions.structured_output import (
    StructuredOutputError,
    _first_json_object,
    is_structured_output_error,
    parse_output,
    prompt_schema_section,
)

FINISH = (
    '{"next_thought":"done","next_tools":[{"tool_name":"_finish",'
    '"args":[{"key":"final_response","value":"42"}]}]}'
)


def fake_completion(script, calls):
    """Stand in for `litellm.completion`, replaying `script` one item per call.

    A `str` item is returned as message content; an `Exception` item is raised.
    Every call's kwargs are appended to `calls` so tests can assert on what was
    actually sent to the provider.
    """
    it = iter(script)

    def _fake(**kwargs):
        calls.append(kwargs)
        item = next(it)
        if isinstance(item, BaseException):
            raise item
        return types.SimpleNamespace(
            choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=item))],
            usage=types.SimpleNamespace(prompt_tokens=100, completion_tokens=20),
        )

    return _fake


# --------------------------------------------------------------------------
# parse_output
# --------------------------------------------------------------------------

def test_parses_plain_json():
    assert parse_output(FINISH).next_tools[0].tool_name == "_finish"


def test_parses_fenced_json():
    assert parse_output(f"```json\n{FINISH}\n```").next_thought == "done"
    assert parse_output(f"```\n{FINISH}\n```").next_thought == "done"


def test_parses_json_wrapped_in_prose():
    # Models without schema enforcement love to introduce themselves first.
    assert parse_output(f"Sure! Here you go:\n{FINISH}\nHope that helps.").next_thought == "done"


def test_brace_scanner_ignores_braces_inside_strings():
    assert _first_json_object('{"a":"}"}') == '{"a":"}"}'
    assert _first_json_object(r'{"a":"\""}') == r'{"a":"\""}'


def test_rejects_unusable_replies():
    for bad in ("", "   ", "no json here", '{"tool_name":"x","args":[]}'):
        try:
            parse_output(bad)
        except ValueError:
            continue
        raise AssertionError(f"should have rejected {bad!r}")


def test_rejection_message_is_addressed_to_the_model():
    # It is fed straight back to the model on retry, so it must describe the
    # required shape rather than quote a Python traceback.
    try:
        parse_output("nope")
    except ValueError as e:
        assert "next_thought" in str(e) and "next_tools" in str(e)


# --------------------------------------------------------------------------
# error classification
# --------------------------------------------------------------------------

def test_recognises_structured_output_failures():
    assert is_structured_output_error(
        Exception("GroqException - tool call validation failed: json_tool_call")
    )
    assert is_structured_output_error(Exception("response_format is not supported"))


def test_does_not_claim_unrelated_errors():
    assert not is_structured_output_error(Exception("Incorrect API key provided"))


# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------

def test_rejects_unknown_mode():
    try:
        Minion(model="openai/gpt-4o", structured_output="nonsense")
    except ValueError as e:
        assert "structured_output" in str(e)
        return
    raise AssertionError("should have rejected an unknown mode")


def test_schema_section_only_in_prompt_mode():
    native = Minion(model="openai/gpt-4o", structured_output="native")
    prompted = Minion(model="openai/gpt-4o", structured_output="prompt")

    assert "Output Format (STRICT)" not in native._build_instructions(True)
    assert "Output Format (STRICT)" in prompted._build_instructions(False)
    assert native._use_native_schema() is True
    assert prompted._use_native_schema() is False


def test_schema_section_shows_the_args_shape():
    # The flattened-envelope failure is specifically about `args`, so the
    # example has to show it.
    assert '"key": "city"' in prompt_schema_section()


# --------------------------------------------------------------------------
# the native path
# --------------------------------------------------------------------------

def test_native_path_sends_the_schema():
    calls = []
    litellm.completion = fake_completion([FINISH], calls)

    result = Minion(model="openai/gpt-4o", structured_output="native")("q")

    assert result.output == "42"
    assert calls[0]["response_format"] is MinionOutput


def test_provider_rejection_becomes_an_actionable_error():
    calls = []
    litellm.completion = fake_completion([Exception(
        "GroqException - tool call validation failed: parameters for tool "
        "json_tool_call did not match schema: missing properties: 'next_thought'"
    )], calls)

    try:
        Minion(model="groq/llama-3.3-70b-versatile", structured_output="native")("q")
    except StructuredOutputError as e:
        text = str(e)
        assert "groq/llama-3.3-70b-versatile" in text
        assert 'structured_output="prompt"' in text
        assert "reference/providers" in text
        assert "json_tool_call" in text     # original error is preserved
        return
    raise AssertionError("should have raised StructuredOutputError")


def test_unrelated_errors_still_propagate():
    calls = []
    litellm.completion = fake_completion([Exception("Incorrect API key provided")], calls)

    try:
        Minion(model="openai/gpt-4o", structured_output="native")("q")
    except StructuredOutputError:
        raise AssertionError("an auth error must not be reported as a schema problem")
    except Exception as e:
        assert "API key" in str(e)
        return
    raise AssertionError("should have raised")


# --------------------------------------------------------------------------
# the prompted path
# --------------------------------------------------------------------------

def test_prompted_path_recovers_from_a_bad_reply():
    calls = []
    litellm.completion = fake_completion(["I think I should call get_x", FINISH], calls)

    result = Minion(model="groq/llama-3.3-70b-versatile", structured_output="prompt")("q")

    assert result.output == "42"
    assert len(calls) == 2
    assert calls[0]["response_format"] == {"type": "json_object"}
    # The retry shows the model its own bad reply next to the complaint.
    assert calls[1]["messages"][-2]["content"] == "I think I should call get_x"
    assert "next_thought" in calls[1]["messages"][-1]["content"]


def test_retries_are_bounded_and_then_give_up():
    calls = []
    litellm.completion = fake_completion(["junk"] * 3, calls)

    try:
        Minion(
            model="groq/llama-3.3-70b-versatile",
            structured_output="prompt",
            max_parse_retries=2,
        )("q")
    except StructuredOutputError:
        assert len(calls) == 3      # the first attempt plus two retries
        return
    raise AssertionError("should have given up")


def test_usage_covers_every_attempt():
    # A reparse retry is a real API call; its tokens belong to the turn that
    # paid for them, or the fallback silently under-reports cost.
    from minions import tracing

    calls, usages = [], []
    litellm.completion = fake_completion(["junk", FINISH], calls)
    original = tracing.RunTracer.record_turn
    tracing.RunTracer.record_turn = lambda self, n, t, u: usages.append(u)
    try:
        Minion(model="groq/llama-3.3-70b-versatile", structured_output="prompt")("q")
    finally:
        tracing.RunTracer.record_turn = original

    assert usages[0].prompt_tokens == 200
    assert usages[0].completion_tokens == 40


# --------------------------------------------------------------------------
# auto mode
# --------------------------------------------------------------------------

def test_auto_falls_back_when_the_capability_table_is_wrong():
    calls = []
    litellm.completion = fake_completion(
        [Exception("tool call validation failed: json_tool_call"), FINISH], calls
    )

    result = Minion(model="openai/gpt-4o", structured_output="auto")("q")

    assert result.output == "42"
    assert calls[0]["response_format"] is MinionOutput          # tried native
    assert calls[1]["response_format"] == {"type": "json_object"}  # then prompted
    assert "Output Format (STRICT)" in calls[1]["messages"][0]["content"]


def test_explicit_native_does_not_silently_fall_back():
    calls = []
    litellm.completion = fake_completion(
        [Exception("tool call validation failed: json_tool_call"), FINISH], calls
    )

    try:
        Minion(model="openai/gpt-4o", structured_output="native")("q")
    except StructuredOutputError:
        assert len(calls) == 1
        return
    raise AssertionError("native mode must not fall back on its own")


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    original = litellm.completion
    failed = []
    for fn in tests:
        try:
            fn()
            print(f"  PASS {fn.__name__}")
        except Exception as e:
            failed.append(fn.__name__)
            print(f"  FAIL {fn.__name__}: {type(e).__name__}: {e}")
        finally:
            litellm.completion = original
    print(f"\n{len(tests) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
