from __future__ import annotations

import pytest

from codebundle_exporter.config import parse_config
from codebundle_exporter.errors import InvalidConfigError


def base_config(project_root, output_file) -> dict[str, object]:
    return {
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


def test_path_traversal_rejection_for_files(tmp_path):
    config = base_config(tmp_path, tmp_path / "out.md")
    config["files"] = ["../../secret.txt"]

    with pytest.raises(InvalidConfigError, match="escapes projectRoot"):
        parse_config(config)


def test_path_traversal_rejection_for_folders(tmp_path):
    config = base_config(tmp_path, tmp_path / "out.md")
    config["folders"] = ["../../secret-folder"]

    with pytest.raises(InvalidConfigError, match="escapes projectRoot"):
        parse_config(config)


def test_required_project_root(tmp_path):
    config = base_config(tmp_path, tmp_path / "out.md")
    del config["projectRoot"]

    with pytest.raises(InvalidConfigError, match="projectRoot is required"):
        parse_config(config)


def test_format_validation(tmp_path):
    config = base_config(tmp_path, tmp_path / "out.md")
    config["format"] = "html"

    with pytest.raises(InvalidConfigError, match="format must be markdown or text"):
        parse_config(config)


def test_mode_validation(tmp_path):
    config = base_config(tmp_path, tmp_path / "out.md")
    config["mode"] = "recent"

    with pytest.raises(InvalidConfigError, match="mode must be selected, include, or all"):
        parse_config(config)
