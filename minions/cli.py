import os
import sys

# ASCII only, deliberately: this text is printed to the console, and Windows
# consoles default to the cp1252 codepage.
USAGE = """minion - dashboard and trace viewer for minion-ai

Usage:
  minion serve [--port PORT] [--db-path PATH]   Start the dashboard server
  minion --version                              Print the installed version
  minion --help                                 Show this message

Options for `serve`:
  --port PORT      Port to listen on (default: 7337)
  --db-path PATH   SQLite file to read/write (default: ~/.minion/traces.db)

Running `minion` with no arguments is the same as `minion serve`.
Docs: https://github.com/shriyansnaik/minion-ai
"""

HELP_FLAGS = ("-h", "--help", "help")
VERSION_FLAGS = ("-V", "--version", "version")


def _version() -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("minion-ai")
    except PackageNotFoundError:
        return "unknown (not installed as a package)"


def main():
    args = sys.argv[1:]

    if args and args[0] in HELP_FLAGS:
        print(USAGE)
        return
    if args and args[0] in VERSION_FLAGS:
        print(f"minion-ai {_version()}")
        return

    if not args or args[0] == "serve":
        rest = args[1:] if args else []
        # `minion serve --help` should explain itself, not silently boot a server.
        if any(a in HELP_FLAGS for a in rest):
            print(USAGE)
            return
        _cmd_serve(rest)
    else:
        print(f"minion: unknown command '{args[0]}'\n")
        print(USAGE)
        sys.exit(1)


def _cmd_serve(args: list[str]):
    import uvicorn

    port = 7337
    db_path = None
    i = 0
    while i < len(args):
        if args[i] == "--port" and i + 1 < len(args):
            port = int(args[i + 1])
            i += 2
        elif args[i] == "--db-path" and i + 1 < len(args):
            db_path = args[i + 1]
            i += 2
        else:
            i += 1

    if db_path:
        os.environ["MINION_DB_PATH"] = db_path

    db_display = db_path or str(os.path.join(os.path.expanduser("~"), ".minion", "traces.db"))
    # ASCII arrows only: Windows consoles default to cp1252, which can't encode
    # "→" and would crash the command with UnicodeEncodeError before it starts.
    print(f"minion server  ->  http://localhost:{port}")
    print(f"traces DB      ->  {db_display}")

    from minions.server.app import app
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
