"""CLI entrypoint for the CodeBundle exporter."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "codebundle_exporter"

from .config import load_config
from .errors import CodeBundleError, ErrorPayload, ExportFailedError, InvalidArgsError
from .scanner import scan_files
from .writer import write_export


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InvalidArgsError(message)


def build_parser() -> argparse.ArgumentParser:
    parser = JsonArgumentParser(description="Export project files into a CodeBundle artifact.")
    parser.add_argument("--config", required=True, help="Path to a CodeBundle JSON config file.")
    return parser


def run(config_path: Path) -> dict[str, object]:
    config = load_config(config_path)
    result = scan_files(config)
    output_file = write_export(config, result.files)
    return {
        "success": True,
        "outputFile": str(output_file),
        "summary": result.summary.to_dict(),
    }


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
        payload = run(Path(args.config))
        print(json.dumps(payload, separators=(",", ":")))
        return 0
    except CodeBundleError as exc:
        print(json.dumps(_failure(exc.to_payload()), separators=(",", ":")))
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        wrapped = ExportFailedError(str(exc))
        print(json.dumps(_failure(wrapped.to_payload()), separators=(",", ":")))
        print(str(exc), file=sys.stderr)
        return 1


def _failure(error: ErrorPayload) -> dict[str, object]:
    return {"success": False, "error": error.to_dict()}


if __name__ == "__main__":
    raise SystemExit(main())
