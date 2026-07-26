#!/usr/bin/env python3
"""Smoke-test the packaged CodeBundle Python sidecar with a real export."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable


SIDECAR_SMOKE_TIMEOUT_SECONDS = 30
MAX_STDERR_BYTES = 4 * 1024
README_CONTENT = "# Sidecar smoke test\n"
APP_CONTENT = "print('codebundle sidecar smoke test')\n"
RunCommand = Callable[..., subprocess.CompletedProcess[str]]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sidecar_path = expected_sidecar_path(repo_root, sys.platform)

    if not sidecar_path.is_file():
        print_missing_sidecar(sidecar_path)
        return 1

    if not sys.platform.startswith("win") and not os.access(sidecar_path, os.X_OK):
        print(
            f"CodeBundle exporter sidecar is not executable: {sidecar_path}\n\n"
            "Build the sidecar before packaging:\n"
            "  cd apps/desktop\n"
            "  npm run sidecar:build",
            file=sys.stderr,
        )
        return 1

    return verify_sidecar_export(sidecar_path)


def expected_sidecar_path(repo_root: Path, platform: str) -> Path:
    sidecar_name = "codebundle-exporter.exe" if platform.startswith("win") else "codebundle-exporter"
    return repo_root / "resources" / "sidecars" / "current" / sidecar_name


def smoke_config(project_root: Path, output_file: Path) -> dict[str, object]:
    return {
        "version": 1,
        "projectRoot": str(project_root),
        "outputFile": str(output_file),
        "format": "markdown",
        "mode": "selected",
        "files": ["README.md", "src/app.py"],
        "folders": [],
        "include": [],
        "exclude": [],
        "maxFileSizeKb": 500,
        "skipBinaryFiles": True,
        "respectGitIgnore": True,
        "followSymlinks": False,
    }


def print_missing_sidecar(sidecar_path: Path) -> None:
    print(
        f"CodeBundle exporter sidecar was not found: {sidecar_path}\n\n"
        "Build the sidecar before packaging:\n"
        "  cd apps/desktop\n"
        "  npm run sidecar:build",
        file=sys.stderr,
    )


def verify_sidecar_export(
    sidecar_path: Path,
    *,
    timeout_seconds: int = SIDECAR_SMOKE_TIMEOUT_SECONDS,
    run_command: RunCommand = subprocess.run,
) -> int:
    try:
        with tempfile.TemporaryDirectory(prefix="codebundle-sidecar-verify-") as temp_dir:
            temp_path = Path(temp_dir)
            project_root = temp_path / "temp-project"
            project_root.mkdir()
            (project_root / "README.md").write_text(README_CONTENT, encoding="utf-8")
            source_dir = project_root / "src"
            source_dir.mkdir()
            (source_dir / "app.py").write_text(APP_CONTENT, encoding="utf-8")

            output_file = temp_path / "temp-output.md"
            config_path = temp_path / "temp-config.json"
            config_path.write_text(json.dumps(smoke_config(project_root, output_file)), encoding="utf-8")

            completed = run_command(
                [str(sidecar_path), "--config", str(config_path)],
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
            validate_smoke_result(completed, output_file)
    except subprocess.TimeoutExpired:
        print(
            f"CodeBundle exporter sidecar timed out during the smoke export after {timeout_seconds} seconds.",
            file=sys.stderr,
        )
        return 1
    except (OSError, ValueError) as exc:
        # Do not print sidecar stdout/stderr: exporter output could include paths
        # or diagnostics from a selected project in a future failure mode.
        print(f"CodeBundle exporter sidecar smoke export failed: {exc}", file=sys.stderr)
        return 1

    print(f"Verified CodeBundle exporter sidecar smoke export: {sidecar_path}")
    return 0


def validate_smoke_result(completed: subprocess.CompletedProcess[str], output_file: Path) -> None:
    stderr_size = len(completed.stderr.encode("utf-8"))
    if stderr_size > MAX_STDERR_BYTES:
        raise ValueError(f"stderr exceeded the {MAX_STDERR_BYTES}-byte safety limit")
    if completed.returncode != 0:
        raise ValueError(f"sidecar exited with code {completed.returncode} (stderr: {stderr_size} bytes)")

    payload = parse_single_json_object(completed.stdout)
    if payload.get("success") is not True:
        raise ValueError("sidecar JSON result did not report success: true")
    if payload.get("outputFile") != str(output_file.resolve(strict=False)):
        raise ValueError("sidecar JSON result did not report the expected output file")
    if not output_file.is_file():
        raise ValueError("sidecar did not create the smoke export output file")

    output = output_file.read_text(encoding="utf-8")
    expected_fragments = (
        "## File 1: `README.md`",
        README_CONTENT.rstrip(),
        "## File 2: `src/app.py`",
        APP_CONTENT.rstrip(),
    )
    if not all(fragment in output for fragment in expected_fragments):
        raise ValueError("smoke export output did not include the expected selected files and content")


def parse_single_json_object(stdout: str) -> dict[str, Any]:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise ValueError("stdout was not exactly one JSON object") from exc
    if not isinstance(payload, dict):
        raise ValueError("stdout JSON was not an object")
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
