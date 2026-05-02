from __future__ import annotations

import pytest

from codebundle_exporter.config import parse_config
from codebundle_exporter.scanner import scan_files


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


def write(path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def relative_paths(result) -> list[str]:
    return [entry.relative_path for entry in result.files]


def test_selected_file_export(tmp_path):
    write(tmp_path / "package.json", "{}")
    config = make_config(tmp_path, tmp_path / "out.md", files=["package.json"])

    result = scan_files(config)

    assert relative_paths(result) == ["package.json"]
    assert result.summary.exportedFiles == 1


def test_selected_folder_export(tmp_path):
    write(tmp_path / "src" / "app.ts", "const app = true;")
    write(tmp_path / "src" / "nested" / "util.ts", "export {};")
    config = make_config(tmp_path, tmp_path / "out.md", folders=["src"])

    result = scan_files(config)

    assert relative_paths(result) == ["src/app.ts", "src/nested/util.ts"]


def test_selected_files_and_folders_together(tmp_path):
    write(tmp_path / "README.md", "# Project")
    write(tmp_path / "src" / "app.ts", "const app = true;")
    config = make_config(tmp_path, tmp_path / "out.md", files=["README.md"], folders=["src"])

    result = scan_files(config)

    assert relative_paths(result) == ["README.md", "src/app.ts"]


def test_include_pattern_export(tmp_path):
    write(tmp_path / "src" / "app.ts", "const app = true;")
    write(tmp_path / "src" / "app.test.ts", "test();")
    write(tmp_path / "docs" / "guide.md", "# Guide")
    config = make_config(
        tmp_path,
        tmp_path / "out.md",
        mode="include",
        include=["src/**/*.ts"],
        exclude=["src/**/*.test.ts"],
    )

    result = scan_files(config)

    assert relative_paths(result) == ["src/app.ts"]
    assert result.summary.skippedExcluded == 1


def test_all_mode_export(tmp_path):
    write(tmp_path / "README.md", "# Project")
    write(tmp_path / "src" / "app.ts", "const app = true;")
    write(tmp_path / "node_modules" / "dep" / "index.js", "module.exports = {};")
    config = make_config(tmp_path, tmp_path / "out.md", mode="all")

    result = scan_files(config)

    assert relative_paths(result) == ["README.md", "src/app.ts"]
    assert result.summary.skippedExcluded == 1


def test_all_mode_skips_existing_output_file_under_project_root(tmp_path):
    write(tmp_path / "README.md", "# Project")
    write(tmp_path / "bundle.md", "old export")
    config = make_config(tmp_path, tmp_path / "bundle.md", mode="all")

    result = scan_files(config)

    assert relative_paths(result) == ["README.md"]
    assert result.summary.skippedExcluded == 1


def test_default_excludes_common_codebundle_output_names(tmp_path):
    write(tmp_path / "README.md", "# Project")
    write(tmp_path / "codebundle-output.md", "old markdown export")
    write(tmp_path / "codebundle-output.txt", "old text export")
    config = make_config(tmp_path, tmp_path / "bundle.md", mode="all")

    result = scan_files(config)

    assert relative_paths(result) == ["README.md"]
    assert result.summary.skippedExcluded == 2


def test_exclude_behavior(tmp_path):
    write(tmp_path / "src" / "app.ts", "const app = true;")
    write(tmp_path / "src" / "debug.log", "debug")
    config = make_config(tmp_path, tmp_path / "out.md", folders=["src"], exclude=["*.log"])

    result = scan_files(config)

    assert relative_paths(result) == ["src/app.ts"]
    assert result.summary.skippedExcluded == 1


def test_exclude_wins_over_selected_folder(tmp_path):
    write(tmp_path / "src" / "app.ts", "const app = true;")
    write(tmp_path / "src" / "generated" / "client.ts", "generated")
    config = make_config(
        tmp_path,
        tmp_path / "out.md",
        folders=["src"],
        exclude=["src/generated/**"],
    )

    result = scan_files(config)

    assert relative_paths(result) == ["src/app.ts"]
    assert result.summary.skippedExcluded == 1


def test_binary_skip(tmp_path):
    binary = tmp_path / "asset.bin"
    binary.write_bytes(b"\x00\x01\x02")
    config = make_config(tmp_path, tmp_path / "out.md", files=["asset.bin"])

    result = scan_files(config)

    assert result.files == []
    assert result.summary.skippedBinary == 1


def test_large_file_skip(tmp_path):
    write(tmp_path / "large.txt", "x" * 2048)
    config = make_config(tmp_path, tmp_path / "out.md", files=["large.txt"], maxFileSizeKb=1)

    result = scan_files(config)

    assert result.files == []
    assert result.summary.skippedLarge == 1


def test_missing_selected_paths_are_reported(tmp_path):
    config = make_config(tmp_path, tmp_path / "out.md", files=["missing.ts"], folders=["missing-dir"])

    result = scan_files(config)

    assert result.files == []
    assert result.summary.skippedMissing == 2


def test_selected_symlink_file_skipped_when_follow_symlinks_false(tmp_path):
    target = tmp_path / "target.txt"
    target.write_text("target\n", encoding="utf-8")
    link = tmp_path / "link.txt"
    try:
        link.symlink_to(target)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"symlink creation unavailable: {exc}")

    config = make_config(tmp_path, tmp_path / "out.md", files=["link.txt"], followSymlinks=False)

    result = scan_files(config)

    assert result.files == []
    assert result.summary.skippedInvalid == 1
