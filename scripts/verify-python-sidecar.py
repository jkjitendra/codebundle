#!/usr/bin/env python3
"""Verify that the packaged CodeBundle Python sidecar exists."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


SIDECAR_HELP_TIMEOUT_SECONDS = 10


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sidecar_path = expected_sidecar_path(repo_root, sys.platform)

    if not sidecar_path.exists():
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

    return verify_sidecar_starts(sidecar_path)


def expected_sidecar_path(repo_root: Path, platform: str) -> Path:
    sidecar_name = "codebundle-exporter.exe" if platform.startswith("win") else "codebundle-exporter"
    return repo_root / "resources" / "sidecars" / "current" / sidecar_name


def print_missing_sidecar(sidecar_path: Path) -> None:
    print(
        f"CodeBundle exporter sidecar was not found: {sidecar_path}\n\n"
        "Build the sidecar before packaging:\n"
        "  cd apps/desktop\n"
        "  npm run sidecar:build",
        file=sys.stderr,
    )


def verify_sidecar_starts(
    sidecar_path: Path,
    *,
    timeout_seconds: int = SIDECAR_HELP_TIMEOUT_SECONDS,
    run_command=subprocess.run,
) -> int:
    try:
        completed = run_command(
            [str(sidecar_path), "--help"],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        print(
            f"CodeBundle exporter sidecar timed out while running --help: {sidecar_path}\n\n"
            f"Timeout: {timeout_seconds} seconds\n"
            f"stdout:\n{exc.stdout or ''}\n"
            f"stderr:\n{exc.stderr or ''}",
            file=sys.stderr,
        )
        return 1

    if completed.returncode != 0:
        print(
            f"CodeBundle exporter sidecar failed to start with --help: {sidecar_path}\n\n"
            f"Exit code: {completed.returncode}\n"
            f"stdout:\n{completed.stdout}\n"
            f"stderr:\n{completed.stderr}",
            file=sys.stderr,
        )
        return 1

    print(f"Verified CodeBundle exporter sidecar starts successfully: {sidecar_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
