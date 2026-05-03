#!/usr/bin/env python3
"""Build the CodeBundle Python exporter as a PyInstaller sidecar."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


SIDECAR_BASE_NAME = "codebundle-exporter"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build or clean the CodeBundle Python exporter sidecar.")
    parser.add_argument("--clean", action="store_true", help="Remove generated sidecar/build outputs.")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    exporter_dir = repo_root / "exporter-python"
    package_dir = exporter_dir / "codebundle_exporter"
    entrypoint_path = repo_root / "scripts" / "codebundle-sidecar-entry.py"
    sidecar_dir = repo_root / "resources" / "sidecars" / "current"

    if args.clean:
        clean_outputs(exporter_dir, sidecar_dir)
        return 0

    if not package_dir.is_dir():
        print(f"CodeBundle exporter package was not found: {package_dir}", file=sys.stderr)
        return 1

    if not entrypoint_path.is_file():
        print(f"CodeBundle sidecar entrypoint was not found: {entrypoint_path}", file=sys.stderr)
        return 1

    if not pyinstaller_available():
        print(
            "PyInstaller is required to build the sidecar. Install it with: "
            f"{sys.executable} -m pip install pyinstaller",
            file=sys.stderr,
        )
        return 1

    sidecar_dir.mkdir(parents=True, exist_ok=True)
    sidecar_name = f"{SIDECAR_BASE_NAME}.exe" if sys.platform.startswith("win") else SIDECAR_BASE_NAME
    sidecar_path = sidecar_dir / sidecar_name

    command = build_pyinstaller_command(
        python_executable=Path(sys.executable),
        exporter_dir=exporter_dir,
        entrypoint_path=entrypoint_path,
        sidecar_dir=sidecar_dir,
    )

    print("Building CodeBundle Python sidecar...")
    print(" ".join(command))
    completed = subprocess.run(command, cwd=repo_root, check=False)
    if completed.returncode != 0:
        return completed.returncode

    if not sidecar_path.exists():
        print(f"Expected sidecar was not created: {sidecar_path}", file=sys.stderr)
        return 1

    print(f"Built sidecar: {sidecar_path}")
    return 0


def build_pyinstaller_command(
    *,
    python_executable: Path,
    exporter_dir: Path,
    entrypoint_path: Path,
    sidecar_dir: Path,
) -> list[str]:
    return [
        str(python_executable),
        "-m",
        "PyInstaller",
        "--clean",
        "--onefile",
        "--name",
        SIDECAR_BASE_NAME,
        "--distpath",
        str(sidecar_dir),
        "--workpath",
        str(exporter_dir / "build" / "pyinstaller"),
        "--specpath",
        str(exporter_dir),
        "--paths",
        str(exporter_dir),
        "--collect-submodules",
        "codebundle_exporter",
        str(entrypoint_path),
    ]


def pyinstaller_available() -> bool:
    completed = subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--version"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return completed.returncode == 0


def clean_outputs(exporter_dir: Path, sidecar_dir: Path) -> None:
    for path in [
        exporter_dir / "build",
        exporter_dir / "dist",
        exporter_dir / f"{SIDECAR_BASE_NAME}.spec",
    ]:
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()

    sidecar_dir.mkdir(parents=True, exist_ok=True)
    for path in sidecar_dir.iterdir():
        if path.name == ".gitkeep":
            continue
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    print("Cleaned CodeBundle sidecar outputs.")


if __name__ == "__main__":
    raise SystemExit(main())
