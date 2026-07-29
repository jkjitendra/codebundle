import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAC_CERTIFICATE_KEYS = ["CSC_LINK", "CSC_KEY_PASSWORD"];
const WINDOWS_CERTIFICATE_KEYS = ["WINDOWS_CSC_LINK", "WINDOWS_CSC_KEY_PASSWORD"];
const APPLE_ID_KEYS = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];

export function isSigningRequired(environment = process.env) {
  return environment.REQUIRE_CODE_SIGNING === "true";
}

export function hasValues(environment, keys) {
  return keys.every((key) => typeof environment[key] === "string" && environment[key].length > 0);
}

export function macNotarizationMethod(environment = process.env) {
  if (hasValues(environment, APPLE_ID_KEYS)) return "apple-id";
  return null;
}

export function signingReadiness(platform, environment = process.env) {
  const normalized = platform.toLowerCase();
  if (normalized === "macos" || normalized === "darwin") {
    const certificateReady = hasValues(environment, MAC_CERTIFICATE_KEYS);
    const notarization = macNotarizationMethod(environment);
    return {
      platform: "macos",
      ready: certificateReady && notarization !== null,
      certificateReady,
      notarization,
      message: certificateReady && notarization !== null
        ? "Signing credentials detected: signed release path enabled."
        : "Signing credentials missing: building unsigned beta artifact."
    };
  }

  if (normalized === "windows" || normalized === "win32") {
    const certificateReady = hasValues(environment, WINDOWS_CERTIFICATE_KEYS);
    return {
      platform: "windows",
      ready: certificateReady,
      certificateReady,
      notarization: null,
      message: certificateReady
        ? "Signing credentials detected: signed release path enabled."
        : "Signing credentials missing: building unsigned beta artifact."
    };
  }

  return {
    platform: "linux",
    ready: true,
    certificateReady: false,
    notarization: null,
    message: "Linux signing is not configured: building the normal unsigned artifact."
  };
}

function readOption(argv, option, fallback) {
  const index = argv.indexOf(option);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function main() {
  const platform = readOption(process.argv, "--platform", process.platform);
  const readiness = signingReadiness(platform);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(readiness)}\n`);
  } else {
    console.log(readiness.message);
  }
  if (isSigningRequired() && readiness.platform !== "linux" && !readiness.ready) {
    console.error("REQUIRE_CODE_SIGNING=true, but complete signing credentials are not configured.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
