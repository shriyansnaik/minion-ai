# Demo tools — for reference only. Copy and adapt these when building your own tools.
# Minion AI does not maintain these as production utilities.

import os


def read_file(file_path: str, encoding: str = "utf-8") -> str:
    """Reads the contents of a file and returns them as a string.

    Args:
        file_path: Path to the file to be read.
        encoding: Character encoding to use when decoding the file.
            Defaults to 'utf-8'.

    Returns:
        The full contents of the file as a string, or an error message
        string if the file can't be found, read, or decoded.
    """
    try:
        with open(file_path, "r", encoding=encoding) as f:
            return f.read()
    except FileNotFoundError:
        return f"File not found: {file_path}"
    except PermissionError:
        return f"Permission denied: {file_path}"
    except UnicodeDecodeError:
        return f"Could not decode file with encoding '{encoding}': {file_path}"


def list_files(directory: str) -> list[str] | str:
    """Lists all file paths within a directory, excluding hidden and private entries.

    Skips files and directories whose names start with '.' or '_'.

    Args:
        directory: Path to the directory to list files from.

    Returns:
        A list of absolute file paths found in the directory, or an error
        message string if the directory doesn't exist or isn't a directory.
    """
    if not os.path.exists(directory):
        return f"Directory not found: {directory}"
    if not os.path.isdir(directory):
        return f"Path is not a directory: {directory}"

    return [
        os.path.join(directory, entry)
        for entry in os.listdir(directory)
        if not entry.startswith((".", "_"))
        and os.path.isfile(os.path.join(directory, entry))
    ]
