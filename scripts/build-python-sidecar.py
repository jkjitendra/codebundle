#!/usr/bin/env python3
"""Build the CodeBundle Python exporter as a PyInstaller sidecar."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


SIDECAR_BASE_NAME = "codebundle-exporter"
# The exporter has no dependencies on these optional Python ecosystems. Keeping
# this list conservative avoids bundling common developer-only modules without
# changing the exporter runtime contract.
PYINSTALLER_EXCLUDES = (
    "IPython",
    "ensurepip",
    "jupyter",
    "matplotlib",
    "notebook",
    "numpy",
    "pandas",
    "pip",
    "pytest",
    "setuptools",
    "tkinter",
    "wheel",
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build or clean the CodeBundle Python exporter sidecar.")
    parser.add_argument("--clean", action="store_true", help="Remove generated sidecar and PyInstaller outputs.")
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
        print(f"CodeBundle exporter source package was not found: {package_dir}", file=sys.stderr)
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

    # A build must never accidentally pass by reusing a prior platform's binary.
    clean_outputs(exporter_dir, sidecar_dir, announce=False)
    sidecar_path = sidecar_dir / sidecar_executable_name(sys.platform)
    build_path = exporter_dir / "build" / "pyinstaller"

    command = build_pyinstaller_command(
        python_executable=Path(sys.executable),
        exporter_dir=exporter_dir,
        entrypoint_path=entrypoint_path,
        sidecar_dir=sidecar_dir,
    )

    print("Building CodeBundle Python sidecar...")
    completed = subprocess.run(command, cwd=repo_root, check=False, env=build_environment(exporter_dir))
    if completed.returncode != 0:
        print("PyInstaller failed to build the CodeBundle sidecar.", file=sys.stderr)
        return completed.returncode

    if not sidecar_path.is_file():
        print(f"Expected sidecar was not created: {sidecar_path}", file=sys.stderr)
        return 1

    print_build_summary(sidecar_path=sidecar_path, build_path=build_path, dist_path=sidecar_dir)
    return 0


def sidecar_executable_name(platform: str) -> str:
    return f"{SIDECAR_BASE_NAME}.exe" if platform.startswith("win") else SIDECAR_BASE_NAME


def build_pyinstaller_command(
    *,
    python_executable: Path,
    exporter_dir: Path,
    entrypoint_path: Path,
    sidecar_dir: Path,
) -> list[str]:
    command = [
        str(python_executable),
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        "--log-level",
        "WARN",
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
    ]
    for module in PYINSTALLER_EXCLUDES:
        command.extend(["--exclude-module", module])
    command.append(str(entrypoint_path))
    return command


def pyinstaller_available() -> bool:
    completed = subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--version"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return completed.returncode == 0


def build_environment(exporter_dir: Path) -> dict[str, str]:
    """Keep PyInstaller's platform cache inside the generated build output."""
    environment = os.environ.copy()
    environment.setdefault("PYINSTALLER_CONFIG_DIR", str(exporter_dir / "build" / "pyinstaller-cache"))
    return environment


def print_build_summary(*, sidecar_path: Path, build_path: Path, dist_path: Path) -> None:
    size_mb = sidecar_path.stat().st_size / (1024 * 1024)
    print("CodeBundle Python sidecar build complete.")
    print(f"Platform: {sys.platform}")
    print(f"Python: {sys.executable}")
    print(f"Output: {sidecar_path}")
    print(f"Size: {size_mb:.1f} MB")
    print(f"Build path: {build_path}")
    print(f"Dist path: {dist_path}")


def clean_outputs(exporter_dir: Path, sidecar_dir: Path, *, announce: bool = True) -> None:
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
    if announce:
        print("Cleaned CodeBundle sidecar outputs.")


if __name__ == "__main__":
    raise SystemExit(main())
