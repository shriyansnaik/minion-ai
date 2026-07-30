import os
import sys


def main():
    args = sys.argv[1:]
    if not args or args[0] == "serve":
        _cmd_serve(args[1:] if args else [])
    else:
        print(f"minion: unknown command '{args[0]}'")
        print("Usage: minion serve [--port PORT] [--db-path PATH]")
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
