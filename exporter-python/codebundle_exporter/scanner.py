"""Project file scanning."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path

from .config import ExportConfig, assert_relative_inside, normalize_exclude_pattern
from .errors import InvalidConfigError
from .reader import is_probably_binary


@dataclass
class ScanSummary:
    exportedFiles: int = 0
    skippedBinary: int = 0
    skippedLarge: int = 0
    skippedExcluded: int = 0
    skippedMissing: int = 0
    skippedInvalid: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "exportedFiles": self.exportedFiles,
            "skippedBinary": self.skippedBinary,
            "skippedLarge": self.skippedLarge,
            "skippedExcluded": self.skippedExcluded,
            "skippedMissing": self.skippedMissing,
            "skippedInvalid": self.skippedInvalid,
        }


@dataclass(frozen=True)
class FileEntry:
    path: Path
    relative_path: str


@dataclass
class ScanResult:
    files: list[FileEntry] = field(default_factory=list)
    summary: ScanSummary = field(default_factory=ScanSummary)


def scan_files(config: ExportConfig) -> ScanResult:
    summary = ScanSummary()
    excludes = _effective_excludes(config)
    candidates = _candidate_paths(config, excludes, summary)
    seen: set[Path] = set()
    entries: list[FileEntry] = []

    for candidate in candidates:
        entry = _evaluate_file(config, excludes, candidate, summary)
        if not entry:
            continue
        identity = entry.path.resolve(strict=False)
        if identity in seen:
            continue
        seen.add(identity)
        entries.append(entry)

    entries.sort(key=lambda item: item.relative_path)
    summary.exportedFiles = len(entries)
    return ScanResult(files=entries, summary=summary)


def _candidate_paths(config: ExportConfig, excludes: tuple[str, ...], summary: ScanSummary) -> list[Path]:
    if config.mode == "selected":
        return _selected_candidates(config, excludes, summary)
    if config.mode == "include":
        return _include_candidates(config, excludes, summary)
    return _all_candidates(config, excludes, summary)


def _selected_candidates(config: ExportConfig, excludes: tuple[str, ...], summary: ScanSummary) -> list[Path]:
    candidates: list[Path] = []
    for relative in config.files:
        path = assert_relative_inside(config.project_root, relative, "files")
        if not path.exists():
            summary.skippedMissing += 1
            continue
        if path.is_dir():
            summary.skippedInvalid += 1
            continue
        candidates.append(path)

    for relative in config.folders:
        path = assert_relative_inside(config.project_root, relative, "folders")
        if not path.exists():
            summary.skippedMissing += 1
            continue
        if not path.is_dir():
            summary.skippedInvalid += 1
            continue
        relative_posix = path.relative_to(config.project_root).as_posix()
        if is_excluded(relative_posix, excludes):
            summary.skippedExcluded += 1
            continue
        candidates.extend(_walk_directory(config.project_root, path, config.follow_symlinks, excludes, summary))
    return candidates


def _include_candidates(config: ExportConfig, excludes: tuple[str, ...], summary: ScanSummary) -> list[Path]:
    candidates: list[Path] = []
    include_patterns: list[str] = []

    for raw_pattern in config.include:
        normalized_pattern = _normalize_relative_path(raw_pattern)

        if Path(raw_pattern).expanduser().is_absolute() or ".." in Path(normalized_pattern).parts:
            raise InvalidConfigError(f"include pattern escapes projectRoot: {raw_pattern}")

        include_patterns.append(normalized_pattern)

    for path in _walk_directory(config.project_root, config.project_root, config.follow_symlinks, excludes, summary):
        relative_posix = path.relative_to(config.project_root).as_posix()
        if any(_matches_include_pattern(relative_posix, pattern) for pattern in include_patterns):
            candidates.append(path)

    return candidates


def _all_candidates(config: ExportConfig, excludes: tuple[str, ...], summary: ScanSummary) -> list[Path]:
    return _walk_directory(config.project_root, config.project_root, config.follow_symlinks, excludes, summary)


def _walk_directory(
    project_root: Path,
    root: Path,
    follow_symlinks: bool,
    excludes: tuple[str, ...],
    summary: ScanSummary,
) -> list[Path]:
    paths: list[Path] = []
    for current_root, dirnames, filenames in os.walk(root, topdown=True, followlinks=follow_symlinks):
        current_path = Path(current_root)
        allowed_dirnames: list[str] = []
        for dirname in dirnames:
            directory_path = current_path / dirname
            if directory_path.is_symlink() and not follow_symlinks:
                continue
            try:
                relative_posix = directory_path.relative_to(project_root).as_posix()
            except ValueError:
                summary.skippedInvalid += 1
                continue
            if is_excluded(relative_posix, excludes):
                summary.skippedExcluded += 1
                continue
            allowed_dirnames.append(dirname)
        dirnames[:] = allowed_dirnames

        for filename in filenames:
            paths.append(current_path / filename)
    return paths


def _evaluate_file(
    config: ExportConfig, excludes: tuple[str, ...], path: Path, summary: ScanSummary
) -> FileEntry | None:
    if path.is_symlink() and not config.follow_symlinks:
        summary.skippedInvalid += 1
        return None

    try:
        original_relative = path.relative_to(config.project_root)
    except ValueError:
        summary.skippedInvalid += 1
        return None
    relative_posix = original_relative.as_posix()

    resolved = path.resolve(strict=False)
    try:
        resolved.relative_to(config.project_root)
    except ValueError:
        summary.skippedInvalid += 1
        return None

    if resolved == config.output_file.resolve(strict=False):
        summary.skippedExcluded += 1
        return None

    if is_excluded(relative_posix, excludes):
        summary.skippedExcluded += 1
        return None

    try:
        size = resolved.stat().st_size
    except OSError:
        summary.skippedInvalid += 1
        return None

    if size > config.max_file_size_bytes:
        summary.skippedLarge += 1
        return None

    if config.skip_binary_files and is_probably_binary(resolved):
        summary.skippedBinary += 1
        return None

    return FileEntry(path=resolved, relative_path=relative_posix)


def _effective_excludes(config: ExportConfig) -> tuple[str, ...]:
    if not config.respect_git_ignore:
        return config.exclude
    gitignore = config.project_root / ".gitignore"
    if not gitignore.exists():
        return config.exclude
    patterns: list[str] = []
    try:
        lines = gitignore.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return config.exclude
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("!"):
            continue
        if stripped.endswith("/"):
            patterns.append(normalize_exclude_pattern(f"{stripped.rstrip('/')}/**", config.project_root))
        else:
            patterns.append(normalize_exclude_pattern(stripped, config.project_root))
    return config.exclude + tuple(patterns)


def is_excluded(relative_path: str, patterns: tuple[str, ...]) -> bool:
    rel = _normalize_relative_path(relative_path)
    parts = tuple(part for part in rel.split("/") if part)
    for pattern in patterns:
        normalized = _normalize_relative_path(pattern)
        if not normalized:
            continue
        variants = (normalized,)
        if "**/" in normalized:
            variants = (normalized, normalized.replace("**/", ""))
        for variant in variants:
            if _matches_normalized_pattern(rel, parts, variant):
                return True
    return False


def _matches_normalized_pattern(relative_path: str, parts: tuple[str, ...], pattern: str) -> bool:
    if pattern.endswith("/**") and _matches_subtree(relative_path, parts, pattern[:-3].strip("/")):
        return True
    if "/" not in pattern and any(fnmatch(part, pattern) for part in parts):
        return True
    if fnmatch(relative_path, pattern):
        return True
    if "/" in pattern and not _has_glob(pattern):
        return relative_path == pattern or relative_path.startswith(f"{pattern}/")
    return False


def _matches_include_pattern(relative_path: str, pattern: str) -> bool:
    variants = (pattern,)
    if "**/" in pattern:
        variants = (pattern, pattern.replace("**/", ""))
    return any(fnmatch(relative_path, variant) for variant in variants)


def _matches_subtree(relative_path: str, parts: tuple[str, ...], prefix: str) -> bool:
    if not prefix:
        return False
    if "/" not in prefix:
        return any(fnmatch(part, prefix) for part in parts)
    return relative_path == prefix or relative_path.startswith(f"{prefix}/")


def _has_glob(pattern: str) -> bool:
    return "*" in pattern or "?" in pattern or "[" in pattern


def _normalize_relative_path(value: str) -> str:
    return value.strip().replace("\\", "/").lstrip("/").rstrip("/")
