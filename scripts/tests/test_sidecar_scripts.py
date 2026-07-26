from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

import pytest


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
    assert "--onefile" in command
    assert "--noconfirm" in command
    assert command[command.index("--log-level") + 1] == "WARN"
    excluded_modules = [command[index + 1] for index, value in enumerate(command) if value == "--exclude-module"]
    assert excluded_modules == list(build_script.PYINSTALLER_EXCLUDES)


def test_sidecar_executable_name_is_platform_specific() -> None:
    build_script = load_script("build-python-sidecar.py")

    assert build_script.sidecar_executable_name("darwin") == "codebundle-exporter"
    assert build_script.sidecar_executable_name("linux") == "codebundle-exporter"
    assert build_script.sidecar_executable_name("win32") == "codebundle-exporter.exe"


def test_build_environment_keeps_pyinstaller_cache_in_generated_build_output(monkeypatch) -> None:
    build_script = load_script("build-python-sidecar.py")
    monkeypatch.delenv("PYINSTALLER_CONFIG_DIR", raising=False)

    environment = build_script.build_environment(REPO_ROOT / "exporter-python")

    assert environment["PYINSTALLER_CONFIG_DIR"] == str(REPO_ROOT / "exporter-python" / "build" / "pyinstaller-cache")


def test_verify_sidecar_smoke_export_passes_and_cleans_temp_files() -> None:
    verify_script = load_script("verify-python-sidecar.py")
    temp_paths: list[Path] = []

    def run_command(args, **kwargs):
        assert args[0] == "/tmp/codebundle-exporter"
        assert args[1] == "--config"
        assert kwargs["timeout"] == verify_script.SIDECAR_SMOKE_TIMEOUT_SECONDS
        config_path = Path(args[2])
        temp_paths.append(config_path.parent)
        config = json.loads(config_path.read_text(encoding="utf-8"))
        assert config["files"] == ["README.md", "src/app.py"]
        output_file = Path(config["outputFile"])
        output_file.write_text(
            "## File 1: `README.md`\n# Sidecar smoke test\n## File 2: `src/app.py`\nprint('codebundle sidecar smoke test')\n",
            encoding="utf-8",
        )
        payload = {"success": True, "outputFile": str(output_file.resolve(strict=False))}
        return subprocess.CompletedProcess(args=args, returncode=0, stdout=json.dumps(payload), stderr="")

    result = verify_script.verify_sidecar_export(Path("/tmp/codebundle-exporter"), run_command=run_command)

    assert result == 0
    assert len(temp_paths) == 1
    assert not temp_paths[0].exists()


def test_verify_sidecar_smoke_export_fails_when_command_exits_nonzero() -> None:
    verify_script = load_script("verify-python-sidecar.py")

    def run_command(args, **kwargs):
        return subprocess.CompletedProcess(args=args, returncode=1, stdout="", stderr="ModuleNotFoundError")

    result = verify_script.verify_sidecar_export(Path("/tmp/codebundle-exporter"), run_command=run_command)

    assert result == 1


def test_verify_sidecar_smoke_export_fails_on_timeout() -> None:
    verify_script = load_script("verify-python-sidecar.py")

    def run_command(args, **kwargs):
        raise subprocess.TimeoutExpired(args, timeout=kwargs["timeout"], output="", stderr="hung")

    result = verify_script.verify_sidecar_export(Path("/tmp/codebundle-exporter"), run_command=run_command)

    assert result == 1


def test_parse_single_json_object_rejects_invalid_or_multiple_stdout_values() -> None:
    verify_script = load_script("verify-python-sidecar.py")

    assert verify_script.parse_single_json_object('{"success":true}') == {"success": True}
    with pytest.raises(ValueError, match="exactly one JSON object"):
        verify_script.parse_single_json_object('{"success":true}\nnot-json')
    with pytest.raises(ValueError, match="not an object"):
        verify_script.parse_single_json_object("[]")
