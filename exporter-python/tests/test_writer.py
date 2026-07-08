from __future__ import annotations

import json
import subprocess
import sys

from codebundle_exporter.config import GitInfo, parse_config
from codebundle_exporter.scanner import FileEntry
from codebundle_exporter.writer import ExportedFile, render_markdown, render_text, write_export


def make_config(project_root, output_file, **overrides):
    config = {
        "version": 1,
        "projectRoot": str(project_root),
        "outputFile": str(output_file),
        "format": "markdown",
        "mode": "selected",
        "files": [],
        "folders": [],
        "include": [],
        "exclude": [],
        "maxFileSizeKb": 500,
        "skipBinaryFiles": True,
        "respectGitIgnore": True,
        "followSymlinks": False,
    }
    config.update(overrides)
    return parse_config(config)


def make_git_info(**kwargs) -> GitInfo:
    defaults = {
        "is_git_repository": True,
        "git_available": True,
        "branch": "main",
        "short_commit": "abc1234",
        "is_detached_head": False,
        "has_tracked_changes": False,
    }
    defaults.update(kwargs)
    return GitInfo(**defaults)


def test_markdown_output(tmp_path):
    output = render_markdown(tmp_path, [ExportedFile("src/app.ts", "const app = true;\n")])

    assert output.startswith("# CodeBundle Export")
    assert f"Project Root: `{tmp_path}`" in output
    assert "Total Files: 1" in output
    assert "## File 1: `src/app.ts`" in output
    assert "```text\nconst app = true;\n```" in output


def test_markdown_output_uses_longer_fence_when_content_contains_backticks(tmp_path):
    output = render_markdown(tmp_path, [ExportedFile("notes.md", "before\n```\nafter\n")])

    assert "````text\nbefore\n```\nafter\n````" in output


def test_text_output(tmp_path):
    output = render_text(tmp_path, [ExportedFile("package.json", "{}\n")])

    assert output.startswith("CodeBundle Export")
    assert f"Project Root: {tmp_path}" in output
    assert "Total Files: 1" in output
    assert "File 1 Path\npackage.json\n\n{}" in output


def test_write_export_creates_markdown_file(tmp_path):
    source = tmp_path / "src" / "app.ts"
    source.parent.mkdir(parents=True)
    source.write_text("const app = true;\n", encoding="utf-8")
    config = make_config(tmp_path, tmp_path / "export" / "out.md", format="markdown")

    output_file = write_export(config, [FileEntry(source, "src/app.ts")])

    assert output_file.exists()
    assert "## File 1: `src/app.ts`" in output_file.read_text(encoding="utf-8")


def test_stdout_success_json(tmp_path):
    source = tmp_path / "package.json"
    source.write_text("{}\n", encoding="utf-8")
    config_path = tmp_path / "config.json"
    output_file = tmp_path / "out.md"
    config_path.write_text(
        json.dumps(
            {
                "version": 1,
                "projectRoot": str(tmp_path),
                "outputFile": str(output_file),
                "format": "markdown",
                "mode": "selected",
                "files": ["package.json"],
                "folders": [],
                "include": [],
                "exclude": [],
                "maxFileSizeKb": 500,
                "skipBinaryFiles": True,
                "respectGitIgnore": True,
                "followSymlinks": False,
            }
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [sys.executable, "-m", "codebundle_exporter", "--config", str(config_path)],
        check=False,
        capture_output=True,
        text=True,
    )

    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["success"] is True
    assert payload["outputFile"] == str(output_file)
    assert payload["summary"]["exportedFiles"] == 1


def test_stdout_failure_json(tmp_path):
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "version": 1,
                "outputFile": str(tmp_path / "out.md"),
                "format": "markdown",
                "mode": "selected",
            }
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [sys.executable, "-m", "codebundle_exporter", "--config", str(config_path)],
        check=False,
        capture_output=True,
        text=True,
    )

    payload = json.loads(result.stdout)
    assert result.returncode != 0
    assert payload["success"] is False
    assert payload["error"]["code"] == "INVALID_CONFIG"
    assert payload["error"]["details"] == "projectRoot is required"


def test_stdout_invalid_args_json():
    result = subprocess.run(
        [sys.executable, "-m", "codebundle_exporter"],
        check=False,
        capture_output=True,
        text=True,
    )

    payload = json.loads(result.stdout)
    assert result.returncode != 0
    assert payload["success"] is False
    assert payload["error"]["code"] == "INVALID_ARGS"
    assert "config" in payload["error"]["details"]


# ---------------------------------------------------------------------------
# Git section tests
# ---------------------------------------------------------------------------


def test_markdown_includes_git_section_when_git_present(tmp_path):
    git = make_git_info(branch="main", short_commit="abc1234", has_tracked_changes=False)
    output = render_markdown(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "## Git" in output
    assert "- Branch: main" in output
    assert "- Commit: abc1234" in output
    assert "- Working tree: clean" in output


def test_markdown_omits_git_section_when_git_is_none(tmp_path):
    output = render_markdown(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=None)

    assert "## Git" not in output


def test_markdown_omits_git_section_for_non_git_repo(tmp_path):
    git = GitInfo(is_git_repository=False, git_available=True)
    output = render_markdown(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "## Git" not in output


def test_markdown_git_section_shows_modified_when_dirty(tmp_path):
    git = make_git_info(has_tracked_changes=True)
    output = render_markdown(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "- Working tree: modified" in output


def test_markdown_git_section_omits_working_tree_when_status_missing(tmp_path):
    git = make_git_info(has_tracked_changes=None)
    output = render_markdown(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "- Working tree:" not in output


def test_markdown_git_section_detached_head(tmp_path):
    git = make_git_info(is_detached_head=True, branch=None, short_commit="cafebab")
    output = render_markdown(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "- Branch: detached HEAD" in output
    assert "undefined" not in output


def test_text_includes_git_section_when_git_present(tmp_path):
    git = make_git_info(branch="main", short_commit="abc1234", has_tracked_changes=False)
    output = render_text(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "\nGit\n" in output
    assert "Branch: main" in output
    assert "Commit: abc1234" in output
    assert "Working tree: clean" in output
    # Text format must NOT use Markdown bullet points
    assert "- Branch:" not in output


def test_text_omits_git_section_when_git_is_none(tmp_path):
    output = render_text(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=None)

    assert "\nGit\n" not in output


def test_text_git_section_detached_head(tmp_path):
    git = make_git_info(is_detached_head=True, branch=None, short_commit="cafebab")
    output = render_text(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "Branch: detached HEAD" in output


def test_text_git_section_modified(tmp_path):
    git = make_git_info(has_tracked_changes=True)
    output = render_text(tmp_path, [ExportedFile("src/app.ts", "x\n")], git_info=git)

    assert "Working tree: modified" in output


def test_parse_config_keeps_git_working_tree_status_optional(tmp_path):
    config = make_config(
        tmp_path,
        tmp_path / "out.md",
        git={
            "isGitRepository": True,
            "gitAvailable": True,
            "branch": "main",
            "shortCommit": "abc1234",
        },
    )

    assert config.git is not None
    assert config.git.has_tracked_changes is None


def test_write_export_includes_git_section_in_markdown_output(tmp_path):
    source = tmp_path / "src" / "app.ts"
    source.parent.mkdir(parents=True)
    source.write_text("const x = 1;\n", encoding="utf-8")

    config_data = {
        "version": 1,
        "projectRoot": str(tmp_path),
        "outputFile": str(tmp_path / "out.md"),
        "format": "markdown",
        "mode": "selected",
        "files": ["src/app.ts"],
        "folders": [],
        "include": [],
        "exclude": [],
        "maxFileSizeKb": 500,
        "skipBinaryFiles": True,
        "respectGitIgnore": True,
        "followSymlinks": False,
        "git": {
            "isGitRepository": True,
            "gitAvailable": True,
            "branch": "main",
            "shortCommit": "abc1234",
            "isDetachedHead": False,
            "hasTrackedChanges": False,
        },
    }
    config = parse_config(config_data)
    output_file = write_export(config, [FileEntry(source, "src/app.ts")])

    content = output_file.read_text(encoding="utf-8")
    assert "## Git" in content
    assert "- Branch: main" in content


def test_older_config_without_git_field_still_works(tmp_path):
    """Backward compat: configs without a git key must parse and export successfully."""
    source = tmp_path / "app.py"
    source.write_text("print('ok')\n", encoding="utf-8")

    config_data = {
        "version": 1,
        "projectRoot": str(tmp_path),
        "outputFile": str(tmp_path / "out.md"),
        "format": "markdown",
        "mode": "selected",
        "files": ["app.py"],
        "folders": [],
        "include": [],
        "exclude": [],
        "maxFileSizeKb": 500,
        "skipBinaryFiles": True,
        "respectGitIgnore": True,
        "followSymlinks": False,
        # No "git" key — simulates an older config
    }
    config = parse_config(config_data)
    assert config.git is None

    output_file = write_export(config, [FileEntry(source, "app.py")])
    content = output_file.read_text(encoding="utf-8")

    assert "## File 1:" in content
    assert "## Git" not in content
