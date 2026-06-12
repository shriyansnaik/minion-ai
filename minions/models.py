from dataclasses import dataclass
from typing import Callable
from pydantic import BaseModel


@dataclass
class Tool:
    fn: Callable
    schema: dict


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
