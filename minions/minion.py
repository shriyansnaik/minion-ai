import inspect
import json
import logging
import time
import litellm
import docstring_parser
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from typing import Callable

from .models import Tool, ToolArg, ToolCall, MinionOutput, RunResult
from .structured_output import (
    StructuredOutputError,
    is_structured_output_error,
    native_schema_supported,
    parse_output,
    prompt_schema_section,
    unsupported_model_error,
)

litellm.drop_params = True

log = logging.getLogger("minions.minion")

STRUCTURED_OUTPUT_MODES = ("auto", "native", "prompt")

MINION_BASE_PROMPT = """#Role
You are Minion, a powerful AI agent. Given user input, produce the best possible output using your available tools.

====================================================
# Tools You Have

{tool_schemas}
===================================================={spawn_section}{specialist_section}
## Thoughts
Keep thoughts concise — enough for the human to follow your reasoning. Do not name tools directly; describe your intent instead. Talk in language like, "Let me now do xyz...", "I will now ...", "Next let me...", etc.

## Tool Arguments
All tool args must be valid JSON. Escape double quotes where needed.

## Multiple Tools
Call independent tools simultaneously; only sequence tools when one depends on another's output.

## Output Format
Every response must include `next_thought` and `next_tools`.
When you have sufficient information to answer, call `_finish` with your answer in `final_response`."""


SPAWN_SECTION = """
## Sub Minions (Delegating huge tasks)
Use `_spawn_sub_minion` to delegate large tasks.

**Trigger rules (apply these before starting work):**
- Task involves reading or processing **3+ independent files/URLs/items** → delegate to sub minions
- Split items evenly: e.g. 12 files → 3 sub minions x 4 files each
- Each sub minion gets: the same instructions + its specific subset of items
- You synthesize their results; you do NOT read the files yourself

Only skip delegation if items are fewer than 3, or one item's output feeds another.
"""


class _Run:
    """Per-call execution state for a single ``Minion.__call__``.

    Holds the tracer, the running conversation, and the rendered system
    instructions for one run. Created fresh inside ``__call__`` and discarded
    when it returns, so a ``Minion`` instance carries only immutable config.
    That keeps a Minion reusable and thread-safe: it can be run from many
    threads at once, or handed to other minions as a sub-minion, without
    concurrent runs clobbering each other's state.
    """

    def __init__(self, tracer, instructions: str):
        self.tracer = tracer
        self.instructions = instructions
        self.conversation = []

    @property
    def trace_id(self):
        return self.tracer.trace_id

    def add(self, message, message_type: str = "tool_output"):
        self.conversation.append({"message_type": message_type, "content": message})

    def add_thought(self, thought: str):
        self.add(thought, "thought")

    def add_tool_call(self, tool: ToolCall):
        args = ", ".join(f"{a.key}={a.value!r}" for a in tool.args)
        self.add(f"Tool('{tool.tool_name}' called with Args({args}))", "tool")

    def format(self) -> str:
        formatted_conversation = str(self.conversation)
        divider = "\n\n=============================================\n\n"
        ending = "Above is a series of your previous thoughts, tools and their outputs. Please generate the next_thought and next_tools:"

        return "".join([formatted_conversation, divider, ending])


class Minion:

    def __init__(
        self,
        model: str,
        reasoning_effort: str = None,
        secondary_model: str = None,
        secondary_model_reasoning_effort: str = None,
        system_prompt: str = None,
        tools: list | None = None,
        sub_minions: list["Minion"] | None = None,
        allow_sub_agents: bool = False,
        parallel_tools: bool = False,
        max_turns: int = 10,
        name: str = None,
        description: str = None,
        structured_output: str = "auto",
        max_parse_retries: int = 2,
    ):
        if structured_output not in STRUCTURED_OUTPUT_MODES:
            raise ValueError(
                f"structured_output must be one of {STRUCTURED_OUTPUT_MODES}, "
                f"got {structured_output!r}"
            )
        self.structured_output = structured_output
        self.max_parse_retries = max_parse_retries
        self.model = model
        self.reasoning_effort = reasoning_effort
        self.secondary_model = secondary_model
        self.secondary_model_reasoning_effort = secondary_model_reasoning_effort
        self.system_prompt = system_prompt
        self.tools = tools or []
        self.allow_sub_agents = allow_sub_agents
        self.parallel_tools = parallel_tools
        self.max_turns = max_turns
        # name/description are only required when this minion is registered as a
        # specialist in another minion's `sub_minions` (validated there).
        self.name = name
        self.description = description

        self.parsed_tools = [self._parse_tool(tool) for tool in self.tools]

        # Specialist sub-minions: pre-built minions the user composes explicitly.
        # Stored as templates keyed by name; each run spawns a fresh execution.
        self.sub_minions: dict[str, "Minion"] = {}
        for sm in (sub_minions or []):
            if not sm.name or not sm.description:
                raise ValueError(
                    "Every minion passed in `sub_minions` must have a `name` and `description` "
                    "so the parent can refer to it and describe it to the model."
                )
            if sm.name in self.sub_minions:
                raise ValueError(f"Duplicate sub-minion name: {sm.name!r}")
            self.sub_minions[sm.name] = sm

        if allow_sub_agents:
            if not secondary_model:
                print("No secondary model setup, sub agents will use the main model")
                self.secondary_model = model
            if not secondary_model_reasoning_effort:
                print("No secondary model reasoning settings found, sub agents will use the main models reasoning settings")
                self.secondary_model_reasoning_effort = reasoning_effort
            self.parsed_tools.append(self._parse_child_tool(self._spawn_sub_minion))

        for sm in self.sub_minions.values():
            self.parsed_tools.append(self._parse_sub_minion(sm))

        self.parsed_tools.append(self._parse_tool(self._finish))

    def _parse_tool(self, fn: Callable) -> Tool:
        sig = inspect.signature(fn)
        parsed_doc = docstring_parser.parse(inspect.getdoc(fn) or "")
        param_descriptions = {p.arg_name: p.description for p in parsed_doc.params}

        parameters = {}
        for name, param in sig.parameters.items():
            annotation = param.annotation
            parameters[name] = {
                "type": annotation.__name__ if annotation != inspect.Parameter.empty else "string",
                "description": param_descriptions.get(name, "")
            }

        return Tool(
            schema={
                "tool_name": fn.__name__,
                "description": parsed_doc.short_description or "",
                "parameters": parameters,
            },
            fn=fn,
        )

    def _parse_child_tool(self, fn: Callable) -> Tool:
        """Parse a tool that spawns a child minion. Same as `_parse_tool`, but
        marks it so `invoke_tool` injects the parent's trace_id, and hides that
        injected `parent_trace_id` param from the schema the model sees."""
        tool = self._parse_tool(fn)
        tool.schema["parameters"].pop("parent_trace_id", None)
        tool.needs_parent_trace = True
        return tool

    def _parse_sub_minion(self, template: "Minion") -> Tool:
        """Expose a pre-built specialist minion as a tool. The schema is cheap —
        just the specialist's name + description + an `input` — so the parent
        never pays tokens for the specialist's own system prompt. The specialist
        runs itself (with its own prompt/tools) when called."""
        def run(input: str, parent_trace_id: str = None) -> str:
            return template(input, parent_trace_id=parent_trace_id).output

        return Tool(
            fn=run,
            schema={
                "tool_name": template.name,
                "description": template.description,
                "parameters": {
                    "input": {
                        "type": "string",
                        "description": "Self-contained task for this specialist; it has no memory of this conversation, so include all needed context.",
                    }
                },
            },
            needs_parent_trace=True,
        )

    def _finish(self, final_response: str) -> str:
        """Call this when you have completed the user's request.

        Args:
            final_response: The message shown directly to the user. Must be phrased as a direct answer or summary of the completed request.

        Returns:
            The final_response string, passed through unchanged.
        """
        return final_response

    def _spawn_sub_minion(self, input: str, tool_list: list[str] = [], parent_trace_id: str = None) -> str:
        """Spawn an independent sub-minion to complete a task and return its answer.

        Use when a task is large, separable into parallel subtasks, or requires reading many files (eg. spawn 25 sub-minions each reading 4 files rather than reading 100 yourself — too much information can confuse you if read all at once).

        The sub-minion has no conversation memory, so `input` must be fully self-contained: include all context, constraints, and instructions needed to complete the task from scratch.

        Args:
            input: Self-contained task description with all required context.
            tool_list: Restrict to specific tools by passing the names to prevent sub minion to go rogue. If tool_list is not passed, sub minion will have all tools.

        Returns:
            The sub-minion's final answer.
        """
        if not tool_list:
            tools = self.tools
        else:
            tools = [
                tool.fn for tool in self.parsed_tools
                if tool.schema["tool_name"] in tool_list and not tool.needs_parent_trace
            ]

        worker = Minion(
            model=self.secondary_model,
            reasoning_effort=self.secondary_model_reasoning_effort,
            tools=tools,
            # Inherit the parent's specialists so a generic worker can still
            # delegate to them, but keep allow_sub_agents=False so it can't
            # spawn more generic workers (bounds runaway recursion).
            sub_minions=list(self.sub_minions.values()),
            allow_sub_agents=False,
            parallel_tools=self.parallel_tools,
        )
        return worker(input, parent_trace_id=parent_trace_id).output

    @staticmethod
    def _coerce_arg(value, type_name: str):
        """Tool args arrive as strings (ToolArg.value is str). Coerce them to the
        type declared on the tool's signature; pass the raw string through if it
        can't be parsed so a malformed value degrades instead of crashing."""
        if not isinstance(value, str):  # already structured — leave it
            return value
        try:
            if type_name == "int":
                return int(value)
            if type_name == "float":
                return float(value)
            if type_name == "bool":
                return value.strip().lower() not in ("false", "0", "", "none", "null")
            if type_name in ("list", "dict"):
                return json.loads(value)
        except (ValueError, TypeError):
            return value
        return value

    def invoke_tool(self, tool_name: str, args: dict, parent_trace_id: str = None) -> str:
        matches = [t for t in self.parsed_tools if t.schema["tool_name"] == tool_name]
        if not matches:
            raise ValueError(f"Tool '{tool_name}' not found")
        tool = matches[0]
        coerced = {
            k: self._coerce_arg(v, tool.schema["parameters"].get(k, {}).get("type", "string"))
            for k, v in args.items()
        }
        if tool.needs_parent_trace:
            coerced["parent_trace_id"] = parent_trace_id
        return tool.fn(**coerced)

    def _execute_tool(self, tool: ToolCall, parent_trace_id: str) -> dict:
        """Run one tool call, timing it on its own so parallel calls each get an
        accurate latency. Returns the call, its args, output, and latency."""
        args = {a.key: a.value for a in tool.args}
        start = time.monotonic()
        output = self.invoke_tool(tool.tool_name, args, parent_trace_id=parent_trace_id)
        latency_ms = int((time.monotonic() - start) * 1000)
        return {"tool": tool, "args": args, "output": output, "latency_ms": latency_ms}

    def _use_native_schema(self) -> bool:
        """Whether to ask the provider to enforce the schema for this run.

        `auto` trusts LiteLLM's capability table; `native` and `prompt` are the
        escape hatches for when that table is wrong in either direction.
        """
        if self.structured_output == "native":
            return True
        if self.structured_output == "prompt":
            return False
        return native_schema_supported(self.model)

    @staticmethod
    def _sum_usage(usages: list) -> SimpleNamespace:
        """Total token usage across every attempt made for one turn.

        A reparse retry is a real extra API call, so its tokens belong in the
        turn that paid for them — otherwise the fallback path silently
        under-reports cost.
        """
        return SimpleNamespace(
            prompt_tokens=sum(getattr(u, "prompt_tokens", 0) or 0 for u in usages if u),
            completion_tokens=sum(getattr(u, "completion_tokens", 0) or 0 for u in usages if u),
        )

    def _complete(self, messages: list, use_native: bool) -> tuple[MinionOutput, SimpleNamespace]:
        """Get one validated `MinionOutput` from the model.

        On the native path a single call either works or the provider rejects
        it. On the prompted path the schema is only a request, so a malformed
        reply is fed back to the model and retried a bounded number of times
        before giving up.
        """
        usages = []
        attempts = list(messages)
        last_error = None

        for attempt in range(self.max_parse_retries + 1):
            try:
                response = litellm.completion(
                    model=self.model,
                    messages=attempts,
                    reasoning_effort=self.reasoning_effort,
                    # json_object mode is a weaker guarantee than a schema, but
                    # it stops the model wrapping the object in prose.
                    # `drop_params` removes it for models that reject it outright.
                    response_format=MinionOutput if use_native else {"type": "json_object"},
                )
            except Exception as e:
                if is_structured_output_error(e):
                    raise unsupported_model_error(self.model, e) from e
                raise

            usages.append(getattr(response, "usage", None))
            content = response.choices[0].message.content

            try:
                return parse_output(content), self._sum_usage(usages)
            except ValueError as e:
                last_error = e
                if attempt == self.max_parse_retries:
                    break
                log.warning(
                    "%s returned an unparseable envelope (attempt %d/%d); re-prompting",
                    self.model, attempt + 1, self.max_parse_retries + 1,
                )
                # Show the model its own bad reply next to the complaint —
                # correcting a visible mistake works better than restating rules.
                attempts = attempts + [
                    {"role": "assistant", "content": content or ""},
                    {"role": "user", "content": str(e)},
                ]

        raise unsupported_model_error(self.model, last_error)

    def _build_instructions(self, use_native: bool = True) -> str:
        tool_schemas = "\n".join([str(tool.schema) for tool in self.parsed_tools])

        if self.sub_minions:
            listing = "\n".join(f"- `{name}`: {sm.description}" for name, sm in self.sub_minions.items())
            specialist_section = (
                "\n## Specialist Sub-Minions\n"
                "You have these pre-configured specialists available as tools, each an expert at a "
                "specific job. Delegate to one by calling it by name when a task matches its specialty. "
                "Each runs independently with no memory of this conversation, so pass a self-contained "
                "`input` with all needed context.\n\n"
                f"{listing}\n"
            )
        else:
            specialist_section = ""

        spawn_section = SPAWN_SECTION if self.allow_sub_agents else ""

        instructions = MINION_BASE_PROMPT.format(
            tool_schemas=tool_schemas,
            spawn_section=spawn_section,
            specialist_section=specialist_section,
        )
        if self.system_prompt:
            instructions += f"\n\n## Special Instructions from User\n{self.system_prompt}"
        if not use_native:
            # Nothing is enforcing the envelope server-side, so spell it out.
            instructions += prompt_schema_section()
        return instructions

    def __call__(
        self,
        input: str,
        tags: list = None,
        metadata: dict = None,
        parent_trace_id: str = None,
    ) -> RunResult:
        """Run the minion.

        `metadata` is stored as a flat string->string map: non-string scalars
        are stringified, `None` values are dropped, and nested dicts/lists are
        JSON-encoded as a string. To filter on a metadata field in the trace
        UI, use a simple non-nested string value, e.g.
        `metadata={"ticket_id": "T-123"}` filters cleanly; a nested value like
        `metadata={"context": {"a": 1}}` is still stored and viewable on the
        trace, but won't be practically filterable since it'd require typing
        the exact serialized JSON string into the filter box.
        """
        from .tracing import RunTracer

        tracer = RunTracer(parent_trace_id=parent_trace_id)
        use_native = self._use_native_schema()
        run = _Run(tracer=tracer, instructions=self._build_instructions(use_native))
        run.add(message=input, message_type="user")

        tracer.start(
            model=self.model,
            input=input,
            system_prompt=self.system_prompt,
            tool_names=[t.schema["tool_name"] for t in self.parsed_tools],
            tags=tags,
            metadata=metadata,
        )

        try:
            for turn_number in range(self.max_turns):
                messages = [
                    {"role": "system", "content": run.instructions},
                    {"role": "user", "content": run.format()},
                ]

                with tracer.time_turn():
                    try:
                        output, usage = self._complete(messages, use_native)
                    except StructuredOutputError:
                        # LiteLLM's capability table said this model enforces
                        # schemas and the provider disagreed. In `auto` that's a
                        # reason to drop to the prompted path, not to fail the
                        # run; the user asked for "whatever works".
                        if not (use_native and self.structured_output == "auto"):
                            raise
                        log.warning(
                            "%s was reported as supporting native JSON schemas but rejected "
                            "one; falling back to the prompted envelope for this run",
                            self.model,
                        )
                        use_native = False
                        run.instructions = self._build_instructions(use_native)
                        messages[0]["content"] = run.instructions
                        output, usage = self._complete(messages, use_native)

                label = self.name or self.model
                print(f"===== {label} =====")
                print(output, end="\n\n")
                run.add_thought(output.next_thought)

                # Run the turn's tools (in parallel if enabled), then record each
                # call next to its own output in the model's original order.
                if self.parallel_tools and len(output.next_tools) > 1:
                    with ThreadPoolExecutor() as pool:
                        results = list(pool.map(
                            lambda t: self._execute_tool(t, run.trace_id), output.next_tools
                        ))
                else:
                    results = [self._execute_tool(t, run.trace_id) for t in output.next_tools]

                finished = False
                final_output = None

                for r in results:
                    tool, args, tool_output = r["tool"], r["args"], r["output"]
                    run.add_tool_call(tool)
                    run.add(message=tool_output)
                    tracer.record_tool_call(tool.tool_name, args, tool_output, r["latency_ms"])

                    if tool.tool_name == "_finish":
                        finished = True
                        final_output = tool_output
                        break

                tracer.record_turn(turn_number, output.next_thought, usage)

                if finished:
                    tracer.finish(final_output)
                    return RunResult(output=final_output, trace_id=run.trace_id)

        except Exception as e:
            tracer.fail(e)
            raise

        tracer.fail(f"Exceeded max_turns ({self.max_turns}) without calling _finish.")
        print(f"OOPS!! [{self.name or self.model}] {self.max_turns} turns were not enough")
        return RunResult(output=None, trace_id=run.trace_id)
