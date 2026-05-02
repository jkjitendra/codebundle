"""Output writers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import ExportConfig
from .reader import read_text_file
from .scanner import FileEntry


@dataclass(frozen=True)
class ExportedFile:
    relative_path: str
    content: str


def write_export(config: ExportConfig, files: list[FileEntry]) -> Path:
    exported = [ExportedFile(item.relative_path, read_text_file(item.path)) for item in files]
    if config.format == "markdown":
        output = render_markdown(config.project_root, exported)
    else:
        output = render_text(config.project_root, exported)

    config.output_file.parent.mkdir(parents=True, exist_ok=True)
    config.output_file.write_text(output, encoding="utf-8")
    return config.output_file


def render_markdown(project_root: Path, files: list[ExportedFile]) -> str:
    lines: list[str] = [
        "# CodeBundle Export",
        "",
        f"Project Root: `{project_root}`",
        "",
        f"Total Files: {len(files)}",
        "",
        "---",
        "",
    ]
    for index, file in enumerate(files, start=1):
        lines.extend(
            [
                f"## File {index}: `{file.relative_path}`",
                "",
                f"{_markdown_fence(file.content)}text",
                file.content.rstrip("\n"),
                _markdown_fence(file.content),
                "",
                "---",
                "",
            ]
        )
    return "\n".join(lines)


def _markdown_fence(content: str) -> str:
    longest_run = 0
    current_run = 0
    for char in content:
        if char == "`":
            current_run += 1
            longest_run = max(longest_run, current_run)
        else:
            current_run = 0
    return "`" * max(3, longest_run + 1)


def render_text(project_root: Path, files: list[ExportedFile]) -> str:
    lines: list[str] = [
        "CodeBundle Export",
        "",
        f"Project Root: {project_root}",
        "",
        f"Total Files: {len(files)}",
        "",
        "---",
        "",
    ]
    for index, file in enumerate(files, start=1):
        lines.extend(
            [
                f"File {index} Path",
                file.relative_path,
                "",
                file.content.rstrip("\n"),
                "",
                "---",
                "",
            ]
        )
    return "\n".join(lines)
