"""Getting a `MinionOutput` envelope out of a model, whatever it supports.

Minion needs a strict `{next_thought, next_tools[]}` object every turn. Providers
give us two very different levels of help with that:

* **Native JSON-schema output** — the provider enforces the schema server-side.
  This is the reliable path, and what Tier 1 models use.
* **Nothing much** — the model has to be *asked* for the shape in the prompt and
  taken at its word. Left alone these models flatten the envelope and the run
  dies on turn 1.

This module holds the second path (schema injected into the prompt, plus a
bounded reparse/retry) and the detection that decides between them, so the agent
loop in `minion.py` stays about the agent loop.
"""

import json
import logging
import re

from .models import MinionOutput

log = logging.getLogger("minions.structured_output")

DOCS_URL = "https://minions-ai.vercel.app/reference/providers/"


class StructuredOutputError(RuntimeError):
    """Raised when a model cannot produce the required output envelope.

    Carries an explanation of *why* it happened and what to do, because the
    provider error underneath ("tool call validation failed", a raw
    BadRequestError) tells a first-time user nothing actionable.
    """


class SchemaUnsupportedError(StructuredOutputError):
    """The provider itself refused to enforce the schema for this model.

    Split out from the base because the two failures need different responses:
    this one means "use a different model, or the prompted fallback", whereas a
    plain StructuredOutputError means the request was fine and the *reply* was
    unusable. Only this one is worth retrying on the prompted path.
    """


# Fragments that show up when a provider rejects or mishandles structured
# output. Matched case-insensitively against the exception text.
_STRUCTURED_OUTPUT_SIGNALS = (
    "json_tool_call",
    "tool_use_failed",
    "response_format",
    "tool call validation failed",
    "does not support",
    "json_schema",
    "response_schema",
    "failed_generation",
)


def is_structured_output_error(exc: BaseException) -> bool:
    """Whether `exc` looks like the provider refusing/failing structured output.

    Deliberately a text match: LiteLLM normalises provider errors into a handful
    of exception classes, so the class alone can't distinguish "this model can't
    do schemas" from "your key is wrong".
    """
    text = str(exc).lower()
    return any(signal in text for signal in _STRUCTURED_OUTPUT_SIGNALS)


def native_schema_supported(model: str) -> bool:
    """Whether the provider enforces JSON schemas for `model`.

    Never raises — an unknown model, or a LiteLLM version without the helper,
    is reported as unsupported so we take the safe (prompted) path rather than
    failing the run.
    """
    try:
        import litellm

        return bool(litellm.supports_response_schema(model=model))
    except Exception as e:  # unknown model, network-free lookup table miss, …
        log.debug("could not determine schema support for %s (%s)", model, e)
        return False


def unsupported_model_error(model: str, cause: BaseException) -> SchemaUnsupportedError:
    """Build the error a user sees when a model can't do structured output."""
    return SchemaUnsupportedError(
        f"The model {model!r} could not produce the structured output Minion needs.\n"
        "\n"
        "Every turn, Minion asks for a strict JSON object -- a thought plus the tools\n"
        "to call next. This model's provider does not enforce that schema, so the\n"
        "model returned something else and the provider rejected it.\n"
        "\n"
        "What to do:\n"
        f"  1. Check the model:  litellm.supports_response_schema(model={model!r})\n"
        "  2. Use a Tier 1 model (OpenAI, Anthropic, Gemini), or a Tier 2 model that\n"
        "     supports native JSON-schema output.\n"
        "  3. Or retry this model with the prompted fallback:\n"
        "         Minion(..., structured_output=\"prompt\")\n"
        "     It asks for the shape in the prompt instead of enforcing it, and\n"
        "     re-prompts on a malformed reply. Less reliable, but it works with more\n"
        "     models.\n"
        "\n"
        f"Provider support and tiers: {DOCS_URL}\n"
        "\n"
        f"Original provider error:\n{cause}"
    )


def unparseable_output_error(
    model: str, cause: BaseException | None, finish_reason: str | None, used_native: bool
) -> StructuredOutputError:
    """Build the error for a model that was *asked* correctly and still didn't
    return a usable envelope after every retry.

    Deliberately distinct from `unsupported_model_error`: the provider accepted
    the request here, so the model's schema support is not the problem and
    saying it is sends people to change models when they should be looking at
    the length of their tool output.
    """
    if finish_reason == "length":
        detail = (
            "The reply was cut off before it finished (finish_reason='length'), so the\n"
            "JSON was incomplete. That is a size problem, not a formatting one.\n"
            "\n"
            "What to do:\n"
            "  1. Trim what your tools return. Every tool result is re-sent on every\n"
            "     later turn of a run, so one large return is paid for repeatedly and\n"
            "     eventually crowds out the reply.\n"
            "  2. Delegate to sub-agents so each context stays small -- see\n"
            "     allow_sub_agents and secondary_model.\n"
            "  3. Lower max_turns, or use a model with a larger output limit.\n"
        )
    else:
        detail = (
            f"The provider accepted the request{' with schema enforcement' if used_native else ''},\n"
            "but the reply could not be parsed as the required envelope even after\n"
            "re-prompting.\n"
            "\n"
            "What to do:\n"
            "  1. Raise max_parse_retries if this is intermittent.\n"
            "  2. If it happens every time, the model is a poor fit -- try a Tier 1\n"
            f"     model. Provider tiers: {DOCS_URL}\n"
        )

    return StructuredOutputError(
        f"The model {model!r} did not return a usable response after every retry.\n"
        "\n"
        "Minion needs a strict JSON object each turn -- a thought plus the tools to\n"
        "call next.\n"
        "\n"
        f"{detail}"
        "\n"
        f"Last parse failure:\n{cause}"
    )


def prompt_schema_section() -> str:
    """The system-prompt section that stands in for schema enforcement.

    Used when the provider won't enforce the schema itself. It restates the
    envelope as an explicit contract with a worked example, because models that
    lack schema support are exactly the models that need showing rather than
    telling.
    """
    schema = json.dumps(MinionOutput.model_json_schema(), indent=2)
    return (
        "\n\n## Output Format (STRICT)\n"
        "Reply with a single JSON object and nothing else. No prose before or after,\n"
        "no markdown code fences.\n\n"
        "It must match this JSON schema exactly:\n\n"
        f"{schema}\n\n"
        "Concretely, every reply looks like this -- note that `args` is a LIST of\n"
        "{key, value} pairs, and both are strings:\n\n"
        '{\n'
        '  "next_thought": "Let me look up the population of Tokyo.",\n'
        '  "next_tools": [\n'
        '    {"tool_name": "get_population", "args": [{"key": "city", "value": "Tokyo"}]}\n'
        '  ]\n'
        '}\n\n'
        "Do NOT emit a bare tool call. The `next_thought` / `next_tools` wrapper is\n"
        "required on every single reply, including the one that calls `_finish`."
    )


_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def _strip_fences(text: str) -> str:
    return _FENCE.sub("", text.strip()).strip()


def _first_json_object(text: str) -> str | None:
    """Extract the first balanced {...} run, ignoring braces inside strings.

    Models without schema enforcement like to wrap the object in a sentence
    ("Here's my response: {...}"), so a plain `json.loads` of the whole reply
    fails on output that is otherwise perfectly good.
    """
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


def parse_output(content: str) -> MinionOutput:
    """Parse a model reply into a `MinionOutput`, tolerating common wrappers.

    Raises `ValueError` with a message written to be shown *to the model* on a
    retry, so it says what was wrong rather than quoting a Python traceback.
    """
    if not content or not content.strip():
        raise ValueError("Your reply was empty. Reply with the JSON object.")

    candidates = []
    stripped = _strip_fences(content)
    candidates.append(stripped)
    extracted = _first_json_object(stripped)
    if extracted and extracted != stripped:
        candidates.append(extracted)

    last_error: Exception | None = None
    for candidate in candidates:
        try:
            return MinionOutput.model_validate_json(candidate)
        except Exception as e:
            last_error = e

    raise ValueError(
        "Your reply was not a valid MinionOutput object. "
        "Reply with ONLY a JSON object with the keys `next_thought` (a string) and "
        "`next_tools` (a list of {\"tool_name\": str, \"args\": [{\"key\": str, "
        "\"value\": str}]}). No prose, no code fences.\n"
        f"Problem: {last_error}"
    )
