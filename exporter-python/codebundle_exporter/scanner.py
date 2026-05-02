"""Project file scanning."""

from __future__ import annotations

from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path

from .config import ExportConfig, assert_relative_inside
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
    candidates = _candidate_paths(config, summary)
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


def _candidate_paths(config: ExportConfig, summary: ScanSummary) -> list[Path]:
    if config.mode == "selected":
        return _selected_candidates(config, summary)
    if config.mode == "include":
        return _include_candidates(config)
    return _all_candidates(config)


def _selected_candidates(config: ExportConfig, summary: ScanSummary) -> list[Path]:
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
        candidates.extend(_walk_directory(path, config.follow_symlinks))
    return candidates


def _include_candidates(config: ExportConfig) -> list[Path]:
    candidates: list[Path] = []
    for pattern in config.include:
        if Path(pattern).is_absolute() or ".." in Path(pattern).parts:
            raise InvalidConfigError(f"include pattern escapes projectRoot: {pattern}")
        candidates.extend(path for path in config.project_root.glob(pattern) if path.is_file())
    return candidates


def _all_candidates(config: ExportConfig) -> list[Path]:
    return _walk_directory(config.project_root, config.follow_symlinks)


def _walk_directory(root: Path, follow_symlinks: bool) -> list[Path]:
    paths: list[Path] = []
    for child in root.rglob("*"):
        if child.is_symlink() and not follow_symlinks:
            continue
        if child.is_file():
            paths.append(child)
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
            patterns.append(f"{stripped.rstrip('/')}/**")
        else:
            patterns.append(stripped.lstrip("/"))
    return config.exclude + tuple(patterns)


def is_excluded(relative_path: str, patterns: tuple[str, ...]) -> bool:
    rel = relative_path.strip("/")
    for pattern in patterns:
        normalized = pattern.strip("/")
        variants = (normalized,)
        if "**/" in normalized:
            variants = (normalized, normalized.replace("**/", ""))
        if any(fnmatch(rel, variant) for variant in variants):
            return True
        if normalized.endswith("/**"):
            prefix = normalized[:-3].strip("/")
            if rel == prefix or rel.startswith(f"{prefix}/"):
                return True
        if "/" not in normalized and fnmatch(Path(rel).name, normalized):
            return True
    return False
