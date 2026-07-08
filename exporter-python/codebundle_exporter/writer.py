"""Output writers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import ExportConfig, GitInfo
from .reader import read_text_file
from .scanner import FileEntry


@dataclass(frozen=True)
class ExportedFile:
    relative_path: str
    content: str


def write_export(config: ExportConfig, files: list[FileEntry]) -> Path:
    exported = [ExportedFile(item.relative_path, read_text_file(item.path)) for item in files]
    if config.format == "markdown":
        output = render_markdown(config.project_root, exported, git_info=config.git)
    else:
        output = render_text(config.project_root, exported, git_info=config.git)

    config.output_file.parent.mkdir(parents=True, exist_ok=True)
    config.output_file.write_text(output, encoding="utf-8")
    return config.output_file


def render_markdown(
    project_root: Path,
    files: list[ExportedFile],
    *,
    git_info: GitInfo | None = None,
) -> str:
    lines: list[str] = [
        "# CodeBundle Export",
        "",
        f"Project Root: `{project_root}`",
        "",
        f"Total Files: {len(files)}",
        "",
    ]

    # Insert Git section when the project is a Git repository.
    git_lines = _render_git_section_markdown(git_info)
    lines.extend(git_lines)

    lines.extend(["---", ""])

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


def _render_git_section_markdown(git_info: GitInfo | None) -> list[str]:
    """Return Markdown Git section lines (including trailing empty line), or empty list."""
    if git_info is None or not git_info.is_git_repository:
        return []

    lines: list[str] = ["## Git", ""]

    branch_label = _format_branch_label(git_info)
    if branch_label:
        lines.append(f"- Branch: {branch_label}")

    if git_info.short_commit:
        lines.append(f"- Commit: {git_info.short_commit}")

    working_tree = _format_working_tree(git_info)
    if working_tree:
        lines.append(f"- Working tree: {working_tree}")

    lines.append("")
    return lines


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


def render_text(
    project_root: Path,
    files: list[ExportedFile],
    *,
    git_info: GitInfo | None = None,
) -> str:
    lines: list[str] = [
        "CodeBundle Export",
        "",
        f"Project Root: {project_root}",
        "",
        f"Total Files: {len(files)}",
        "",
    ]

    # Insert Git section when the project is a Git repository.
    git_lines = _render_git_section_text(git_info)
    lines.extend(git_lines)

    lines.extend(["---", ""])

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


def _render_git_section_text(git_info: GitInfo | None) -> list[str]:
    """Return plain text Git section lines (including trailing empty line), or empty list."""
    if git_info is None or not git_info.is_git_repository:
        return []

    lines: list[str] = ["Git", ""]

    branch_label = _format_branch_label(git_info)
    if branch_label:
        lines.append(f"Branch: {branch_label}")

    if git_info.short_commit:
        lines.append(f"Commit: {git_info.short_commit}")

    working_tree = _format_working_tree(git_info)
    if working_tree:
        lines.append(f"Working tree: {working_tree}")

    lines.append("")
    return lines


def _format_branch_label(git_info: GitInfo) -> str | None:
    """Return 'detached HEAD' for detached state, branch name otherwise, or None."""
    if git_info.is_detached_head:
        return "detached HEAD"
    return git_info.branch


def _format_working_tree(git_info: GitInfo) -> str | None:
    """Return 'modified' or 'clean', or None if has_tracked_changes is not meaningful."""
    if git_info.has_tracked_changes is None:
        return None
    return "modified" if git_info.has_tracked_changes else "clean"
