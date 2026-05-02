"""Structured errors for the CodeBundle exporter."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ErrorPayload:
    code: str
    message: str
    details: str | None = None

    def to_dict(self) -> dict[str, object]:
        data: dict[str, object] = {"code": self.code, "message": self.message}
        if self.details:
            data["details"] = self.details
        return data


class CodeBundleError(Exception):
    """Base exception that can be converted to stdout JSON."""

    code = "CODEBUNDLE_ERROR"
    message = "CodeBundle failed."

    def __init__(self, details: str | None = None) -> None:
        super().__init__(details or self.message)
        self.details = details

    def to_payload(self) -> ErrorPayload:
        return ErrorPayload(code=self.code, message=self.message, details=self.details)


class InvalidConfigError(CodeBundleError):
    code = "INVALID_CONFIG"
    message = "The config file is invalid."


class InvalidArgsError(CodeBundleError):
    code = "INVALID_ARGS"
    message = "The CLI arguments are invalid."


class ExportFailedError(CodeBundleError):
    code = "EXPORT_FAILED"
    message = "The export failed."
