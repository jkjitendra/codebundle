#!/usr/bin/env python3
"""Verify that the packaged CodeBundle Python sidecar exists."""

from __future__ import annotations

import os
import sys
from pathlib import Path


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

    print(f"Verified CodeBundle exporter sidecar: {sidecar_path}")
    return 0


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


if __name__ == "__main__":
    raise SystemExit(main())
