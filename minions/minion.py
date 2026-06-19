import inspect
import json
import litellm
import docstring_parser
from typing import Callable, Literal

from .models import Tool, ToolArg, ToolCall, MinionOutput

litellm.drop_params = True

MINION_BASE_PROMPT = """#Role
You are Minion, a powerful AI agent. Given user input, produce the best possible output using your available tools.

====================================================
# Tools You Have

{tool_schemas}
====================================================

## Sub Minions (Delegating huge tasks)
If the above tools include `_spawn_sub_minion`, use it to delegate large tasks.

**Trigger rules (apply these before starting work):**
- Task involves reading or processing **3+ independent files/URLs/items** → delegate to sub minions
- Split items evenly: e.g. 12 files → 3 sub minions × 4 files each
- Each sub minion gets: the same instructions + its specific subset of items
- You synthesize their results; you do NOT read the files yourself

Only skip delegation if items are fewer than 3, or one item's output feeds another.

## Thoughts
Keep thoughts concise — enough for the human to follow your reasoning. Do not name tools directly; describe your intent instead. Talk in language like, "Let me now do xyz...", "I will now ...", "Next let me...", etc. 

## Tool Arguments
All tool args must be valid JSON. Escape double quotes where needed.

## Multiple Tools
Call independent tools simultaneously; only sequence tools when one depends on another's output.

## Output Format
Every response must include `next_thought` and `next_tools`.
When you have sufficient information to answer, call `_finish` with your answer in `final_response`."""


class Minion:

    def __init__(
        self,
        model: str,
        reasoning_effort: str = None,
        secondary_model: str = None,
        secondary_model_reasoning_effort: str = None,
        system_prompt: str = None,
        tools: list | None = [],
        allow_sub_agents: bool = False,
        max_turns: int = 10,
        project: str = None,
        _parent_trace_id: str = None,
    ):
        self.model = model
        self.reasoning_effort = reasoning_effort
        self.secondary_model = secondary_model
        self.secondary_model_reasoning_effort = secondary_model_reasoning_effort
        self.system_prompt = system_prompt
        self.tools = tools
        self.parsed_tools = [self._parse_tool(tool) for tool in tools]
        self.allow_sub_agents = allow_sub_agents
        self.max_turns = max_turns
        self.project = project
        self._parent_trace_id = _parent_trace_id
        self._current_trace_id = None
        self.tracer = None

        self.raw_model_responses = []

        if allow_sub_agents:
            if not secondary_model:
                print("No secondary model setup, sub agents will use the main model")
                self.secondary_model = model
            if not secondary_model_reasoning_effort:
                print("No secondary model reasoning settings found, sub agents will use the main models reasoning settings")
                self.secondary_model_reasoning_effort = reasoning_effort
            self.parsed_tools.append(self._parse_tool(self._spawn_sub_minion))

        self.parsed_tools.append(self._parse_tool(self._finish))

        self.conversation = []
        self.instructions = None

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

    def _finish(self, final_response: str) -> str:
        """Call this when you have completed the user's request.

        Args:
            final_response: The message shown directly to the user. Must be phrased as a direct answer or summary of the completed request.

        Returns:
            The final_response string, passed through unchanged.
        """
        return final_response

    def _spawn_sub_minion(self, input: str, tool_list: list[str] = []) -> str:
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
            tools = [tool.fn for tool in self.parsed_tools if tool.schema["tool_name"] in tool_list]

        sub_minion = Minion(
            model=self.secondary_model,
            reasoning_effort=self.secondary_model_reasoning_effort,
            tools=tools,
            allow_sub_agents=False,
            _parent_trace_id=self._current_trace_id,
        )
        sub_output = sub_minion(input)
        return sub_output

    def _add_to_conversation(
        self,
        message: MinionOutput | str,
        message_type: Literal["system", "user", "thought", "tool", "tool_output"] = None,
    ):
        if isinstance(message, MinionOutput):
            self.conversation.append({"message_type": "thought", "content": message.next_thought})

            for tool in message.next_tools:
                args = ", ".join(f"{a.key}={a.value!r}" for a in tool.args)
                self.conversation.append({
                    "message_type": "tool",
                    "content": f"Tool('{tool.tool_name}' called with Args({args}))",
                })
        else:
            self.conversation.append({
                "message_type": message_type or "tool_output",
                "content": message,
            })

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

    def invoke_tool(self, tool_name: str, args: dict) -> str:
        matches = [t for t in self.parsed_tools if t.schema["tool_name"] == tool_name]
        if not matches:
            raise ValueError(f"Tool '{tool_name}' not found")
        tool = matches[0]
        coerced = {
            k: self._coerce_arg(v, tool.schema["parameters"].get(k, {}).get("type", "string"))
            for k, v in args.items()
        }
        return tool.fn(**coerced)
    
    def _format_conversation(self) -> str:
          formatted_conversation = str(self.conversation)
          divider = "\n\n=============================================\n\n"
          ending = "Above is a series of your previous thoughts, tools and their outputs. Please generate the next_thought and next_tools:"

          return "".join([formatted_conversation, divider, ending])

    def __call__(self, input: str, tags: list = None, metadata: dict = None) -> str:
        from .tracing import RunTracer

        self.tracer = RunTracer(project=self.project, parent_trace_id=self._parent_trace_id)

        self._add_to_conversation(message=input, message_type="user")

        tool_schemas = "\n".join([str(tool.schema) for tool in self.parsed_tools])
        self.instructions = MINION_BASE_PROMPT.format(tool_schemas=tool_schemas)
        if self.system_prompt:
            self.instructions += f"\n\n## Special Instructions from User\n{self.system_prompt}"

        self.tracer.start(
            model=self.model,
            input=input,
            system_prompt=self.system_prompt,
            tool_names=[t.schema["tool_name"] for t in self.parsed_tools],
            tags=tags,
            metadata=metadata,
        )
        self._current_trace_id = self.tracer.trace_id

        try:
            for turn_number in range(self.max_turns):
                messages = [
                    {"role": "system", "content": self.instructions},
                    {"role": "user", "content": self._format_conversation()},
                ]

                with self.tracer.time_turn():
                    response = litellm.completion(
                        model=self.model,
                        messages=messages,
                        response_format=MinionOutput,
                        reasoning_effort=self.reasoning_effort,
                    )
                self.raw_model_responses.append(response)

                output = MinionOutput.model_validate_json(response.choices[0].message.content)
                print(output, end="\n\n")
                self._add_to_conversation(message=output)

                finished = False
                final_output = None

                for tool in output.next_tools:
                    args = {a.key: a.value for a in tool.args}
                    with self.tracer.time_tool():
                        tool_output = self.invoke_tool(tool_name=tool.tool_name, args=args)
                    self.tracer.record_tool_call(tool.tool_name, args, tool_output)
                    self._add_to_conversation(message=tool_output)

                    if tool.tool_name == "_finish":
                        finished = True
                        final_output = tool_output
                        break

                self.tracer.record_turn(turn_number, output.next_thought, response.usage)

                if finished:
                    self.tracer.finish(final_output)
                    return final_output

        except Exception as e:
            self.tracer.fail(e)
            raise

        self.tracer.fail(f"Exceeded max_turns ({self.max_turns}) without calling _finish.")
        print(f"OOPS!! {self.max_turns} turns were not enough")
