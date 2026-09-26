import hashlib
from pathlib import Path

CHUNK_SIZE = 1024 * 1024


def sha256_of_file(path: Path) -> str:
    """Hash the stored original's bytes exactly as they are on disk."""
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()
