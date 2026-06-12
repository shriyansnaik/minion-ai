import os


def read_file(file_path: str, encoding: str = "utf-8") -> str:
    """Reads the contents of a file and returns them as a string.

    Args:
        file_path: Path to the file to be read.
        encoding: Character encoding to use when decoding the file.
            Defaults to 'utf-8'.

    Returns:
        The full contents of the file as a string.

    Raises:
        FileNotFoundError: If the file does not exist at the given path.
        PermissionError: If the process lacks read access to the file.
        UnicodeDecodeError: If the file cannot be decoded with the given encoding.
    """
    with open(file_path, "r", encoding=encoding) as f:
        return f.read()


def list_files(directory: str) -> list[str]:
    """Lists all file paths within a directory, excluding hidden and private entries.

    Skips files and directories whose names start with '.' or '_'.

    Args:
        directory: Path to the directory to list files from.

    Returns:
        A list of absolute file paths found in the directory.

    Raises:
        FileNotFoundError: If the directory does not exist.
        NotADirectoryError: If the given path is not a directory.
    """
    if not os.path.exists(directory):
        raise FileNotFoundError(f"Directory not found: {directory}")
    if not os.path.isdir(directory):
        raise NotADirectoryError(f"Path is not a directory: {directory}")

    return [
        os.path.join(directory, entry)
        for entry in os.listdir(directory)
        if not entry.startswith((".", "_"))
        and os.path.isfile(os.path.join(directory, entry))
    ]
