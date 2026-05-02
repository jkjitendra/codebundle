"""File reading helpers."""

from __future__ import annotations

from pathlib import Path


def is_probably_binary(path: Path, sample_size: int = 8192) -> bool:
    try:
        sample = path.read_bytes()[:sample_size]
    except OSError:
        return True
    if b"\x00" in sample:
        return True
    if not sample:
        return False
    text_control_bytes = {7, 8, 9, 10, 12, 13, 27}
    control_count = sum(1 for byte in sample if byte < 32 and byte not in text_control_bytes)
    if control_count / len(sample) > 0.30:
        return True
    return False


def read_text_file(path: Path) -> str:
    data = path.read_bytes()
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("utf-8", errors="replace")
