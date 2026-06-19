from dataclasses import dataclass
from typing import Callable
from pydantic import BaseModel


@dataclass
class Tool:
    fn: Callable
    schema: dict
    # Child-spawning tools (_spawn_sub_minion, specialist sub-minions) need the
    # parent's live trace_id injected at call time so the trace tree links up.
    # It's injected by invoke_tool, never exposed to the model in the schema.
    needs_parent_trace: bool = False


@dataclass
class RunResult:
    """Result of one Minion run. `__str__` returns the output so it still
    prints/logs like the old bare-string return, while `trace_id` hands the
    caller a handle to the run (e.g. to replay it from a turn later)."""
    output: str | None
    trace_id: str | None = None

    def __str__(self) -> str:
        return self.output if self.output is not None else ""


class ToolArg(BaseModel):
    key: str
    value: str


class ToolCall(BaseModel):
    model_config = {"extra": "forbid"}
    tool_name: str
    args: list[ToolArg]


class MinionOutput(BaseModel):
    model_config = {"extra": "forbid"}
    next_thought: str
    next_tools: list[ToolCall]

    def __str__(self) -> str:
        thought = f"Thought: {self.next_thought!r}"
        tools = "\n".join([
            f"Tool_{i+1}: {tool.tool_name!r}\nArgs: {', '.join(f'{a.key}={a.value!r}' for a in tool.args)}"
            for i, tool in enumerate(self.next_tools)
        ])
        return "\n".join([thought, tools])
