from __future__ import annotations

import json
import subprocess
import sys

from codebundle_exporter.config import parse_config
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
