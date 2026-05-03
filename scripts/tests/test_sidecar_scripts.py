from __future__ import annotations

import importlib.util
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def load_script(name: str):
    path = REPO_ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace("-", "_").removesuffix(".py"), path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_build_command_uses_sidecar_wrapper_entrypoint() -> None:
    build_script = load_script("build-python-sidecar.py")
    exporter_dir = REPO_ROOT / "exporter-python"
    entrypoint_path = REPO_ROOT / "scripts" / "codebundle-sidecar-entry.py"

    command = build_script.build_pyinstaller_command(
        python_executable=Path("/usr/bin/python3"),
        exporter_dir=exporter_dir,
        entrypoint_path=entrypoint_path,
        sidecar_dir=REPO_ROOT / "resources" / "sidecars" / "current",
    )

    assert command[-1] == str(entrypoint_path)
    assert str(exporter_dir / "codebundle_exporter" / "main.py") not in command
    assert "--collect-submodules" in command
    assert command[command.index("--collect-submodules") + 1] == "codebundle_exporter"
    assert "--paths" in command
    assert command[command.index("--paths") + 1] == str(exporter_dir)


def test_verify_sidecar_help_passes_when_command_exits_zero() -> None:
    verify_script = load_script("verify-python-sidecar.py")

    def run_command(args, **kwargs):
        assert args == ["/tmp/codebundle-exporter", "--help"]
        assert kwargs["timeout"] == verify_script.SIDECAR_HELP_TIMEOUT_SECONDS
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="usage: codebundle-exporter", stderr="")

    result = verify_script.verify_sidecar_starts(Path("/tmp/codebundle-exporter"), run_command=run_command)

    assert result == 0


def test_verify_sidecar_help_fails_when_command_exits_nonzero() -> None:
    verify_script = load_script("verify-python-sidecar.py")

    def run_command(args, **kwargs):
        return subprocess.CompletedProcess(args=args, returncode=1, stdout="", stderr="ModuleNotFoundError")

    result = verify_script.verify_sidecar_starts(Path("/tmp/codebundle-exporter"), run_command=run_command)

    assert result == 1


def test_verify_sidecar_help_fails_on_timeout() -> None:
    verify_script = load_script("verify-python-sidecar.py")

    def run_command(args, **kwargs):
        raise subprocess.TimeoutExpired(args, timeout=kwargs["timeout"], output="", stderr="hung")

    result = verify_script.verify_sidecar_starts(Path("/tmp/codebundle-exporter"), run_command=run_command)

    assert result == 1
