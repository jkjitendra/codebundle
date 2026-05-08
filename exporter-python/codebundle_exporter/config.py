"""Config loading and validation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .defaults import DEFAULT_EXCLUDES
from .errors import InvalidConfigError


VALID_FORMATS = {"markdown", "text"}
VALID_MODES = {"selected", "include", "all"}


@dataclass(frozen=True)
class ExportConfig:
    version: int
    project_root: Path
    output_file: Path
    format: str
    mode: str
    files: tuple[str, ...]
    folders: tuple[str, ...]
    include: tuple[str, ...]
    exclude: tuple[str, ...]
    max_file_size_kb: int
    skip_binary_files: bool
    respect_git_ignore: bool
    follow_symlinks: bool

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_kb * 1024


def load_config(config_path: Path) -> ExportConfig:
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise InvalidConfigError(f"config file not found: {config_path}") from exc
    except json.JSONDecodeError as exc:
        raise InvalidConfigError(f"invalid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise InvalidConfigError("config must be a JSON object")
    return parse_config(raw)


def parse_config(raw: dict[str, Any]) -> ExportConfig:
    _require(raw, "projectRoot")
    _require(raw, "outputFile")
    _require(raw, "format")
    _require(raw, "mode")

    version = raw.get("version", 1)
    if not isinstance(version, int) or version != 1:
        raise InvalidConfigError("version must be 1")

    project_root_value = raw["projectRoot"]
    output_file_value = raw["outputFile"]
    if not isinstance(project_root_value, str) or not project_root_value:
        raise InvalidConfigError("projectRoot must be a non-empty string")
    if not isinstance(output_file_value, str) or not output_file_value:
        raise InvalidConfigError("outputFile must be a non-empty string")

    project_root = Path(project_root_value).expanduser().resolve(strict=False)
    output_file = Path(output_file_value).expanduser().resolve(strict=False)
    if not Path(project_root_value).expanduser().is_absolute():
        raise InvalidConfigError("projectRoot must be an absolute path")
    if not Path(output_file_value).expanduser().is_absolute():
        raise InvalidConfigError("outputFile must be an absolute path")
    if not project_root.exists() or not project_root.is_dir():
        raise InvalidConfigError("projectRoot must be an existing directory")

    format_value = raw["format"]
    mode = raw["mode"]
    if format_value not in VALID_FORMATS:
        raise InvalidConfigError("format must be markdown or text")
    if mode not in VALID_MODES:
        raise InvalidConfigError("mode must be selected, include, or all")

    files = _string_tuple(raw.get("files", ()), "files")
    folders = _string_tuple(raw.get("folders", ()), "folders")
    include = _string_tuple(raw.get("include", ()), "include")
    raw_exclude = _string_tuple(raw.get("exclude", ()), "exclude")

    if mode == "include" and not include:
        raise InvalidConfigError("include mode requires at least one include pattern")

    max_file_size_kb = raw.get("maxFileSizeKb", 500)
    if not isinstance(max_file_size_kb, int) or max_file_size_kb <= 0:
        raise InvalidConfigError("maxFileSizeKb must be a positive integer")

    skip_binary_files = _bool(raw.get("skipBinaryFiles", True), "skipBinaryFiles")
    respect_git_ignore = _bool(raw.get("respectGitIgnore", True), "respectGitIgnore")
    follow_symlinks = _bool(raw.get("followSymlinks", False), "followSymlinks")

    for label, values in (("files", files), ("folders", folders)):
        for value in values:
            assert_relative_inside(project_root, value, label)

    return ExportConfig(
        version=version,
        project_root=project_root,
        output_file=output_file,
        format=format_value,
        mode=mode,
        files=files,
        folders=folders,
        include=include,
        exclude=normalize_exclude_patterns(tuple(DEFAULT_EXCLUDES) + raw_exclude, project_root),
        max_file_size_kb=max_file_size_kb,
        skip_binary_files=skip_binary_files,
        respect_git_ignore=respect_git_ignore,
        follow_symlinks=follow_symlinks,
    )


def assert_relative_inside(project_root: Path, relative_path: str, label: str) -> Path:
    if not relative_path or Path(relative_path).is_absolute():
        raise InvalidConfigError(f"{label} entries must be non-empty relative paths")
    candidate = project_root / relative_path
    resolved = candidate.resolve(strict=False)
    try:
        resolved.relative_to(project_root)
    except ValueError as exc:
        raise InvalidConfigError(f"{label} entry escapes projectRoot: {relative_path}") from exc
    return candidate


def normalize_exclude_patterns(patterns: tuple[str, ...], project_root: Path) -> tuple[str, ...]:
    return tuple(
        normalized
        for pattern in patterns
        if (normalized := normalize_exclude_pattern(pattern, project_root))
    )


def normalize_exclude_pattern(pattern: str, project_root: Path) -> str:
    normalized = pattern.strip().replace("\\", "/").lstrip("/").rstrip("/")
    root_name = project_root.name.strip().replace("\\", "/").strip("/")
    if root_name and normalized == root_name:
        return ""
    if root_name and normalized.startswith(f"{root_name}/"):
        normalized = normalized[len(root_name) + 1 :]
    return normalized


def _require(raw: dict[str, Any], key: str) -> None:
    if key not in raw:
        raise InvalidConfigError(f"{key} is required")


def _string_tuple(value: Any, label: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise InvalidConfigError(f"{label} must be an array")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise InvalidConfigError(f"{label} entries must be strings")
        result.append(item)
    return tuple(result)


def _bool(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        raise InvalidConfigError(f"{label} must be a boolean")
    return value
