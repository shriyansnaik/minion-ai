import time
import traceback
from contextlib import contextmanager

from . import trace_db
from .config import get_config


class RunTracer:
    """Owns every tracing side effect for one Minion.__call__ run.

    The agent loop only ever talks to this object (construct it, then call
    start/time_turn/time_tool/record_tool_call/record_turn/finish/fail). Config
    lookup, project resolution, DB writes, and latency/token bookkeeping all
    live here so they stay out of the agent loop. Everything no-ops cleanly
    when tracing is disabled or trace creation fails (trace_id stays None).
    """

    def __init__(self, project: str = None, parent_trace_id: str = None):
        self.project = project
        self.parent_trace_id = parent_trace_id
        self.trace_id = None
        self._run_start = None
        self._turn_latency_ms = 0
        self._tool_latency_ms = 0
        self._total_input_tokens = 0
        self._total_output_tokens = 0
        self._pending_tool_calls = []

    def start(
        self,
        model: str,
        input: str,
        system_prompt: str,
        tool_names: list,
        tags: list = None,
        metadata: dict = None,
    ):
        self._run_start = time.monotonic()
        cfg = get_config()
        if not cfg.tracing:
            return
        project_name = self.project or cfg.project
        project_id = trace_db.ensure_project(project_name) if project_name else None
        self.trace_id = trace_db.create_run(
            model=model,
            input=input,
            parent_trace_id=self.parent_trace_id,
            project_id=project_id,
            tags=tags,
            metadata=metadata,
            system_prompt=system_prompt,
            tools=tool_names,
        )

    @contextmanager
    def time_turn(self):
        start = time.monotonic()
        yield
        self._turn_latency_ms = int((time.monotonic() - start) * 1000)

    @contextmanager
    def time_tool(self):
        start = time.monotonic()
        yield
        self._tool_latency_ms = int((time.monotonic() - start) * 1000)

    def record_tool_call(self, tool_name: str, args: dict, result) -> None:
        self._pending_tool_calls.append({
            "tool_name": tool_name,
            "args": args,
            "result": str(result),
            "latency_ms": self._tool_latency_ms,
        })

    def record_turn(self, turn_number: int, thought: str, usage) -> None:
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0
        self._total_input_tokens += input_tokens
        self._total_output_tokens += output_tokens

        tool_calls, self._pending_tool_calls = self._pending_tool_calls, []
        if self.trace_id:
            trace_db.append_turn(
                self.trace_id, turn_number, thought,
                input_tokens, output_tokens, self._turn_latency_ms, tool_calls,
            )

    def finish(self, output: str) -> None:
        if self.trace_id:
            trace_db.finish_run(
                self.trace_id, output,
                self._total_input_tokens, self._total_output_tokens,
                int((time.monotonic() - self._run_start) * 1000),
            )

    def fail(self, error: BaseException | str | None = None) -> None:
        if not self.trace_id:
            return
        message = None
        if isinstance(error, BaseException):
            message = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        elif error:
            message = str(error)
        trace_db.fail_run(self.trace_id, error=message)
