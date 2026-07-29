import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const METADATA_BY_PLATFORM = {
  darwin: "latest-mac.yml",
  macos: "latest-mac.yml",
  win32: "latest.yml",
  windows: "latest.yml",
  linux: "latest-linux.yml"
};

export function updaterMetadataName(platform) {
  const metadata = METADATA_BY_PLATFORM[platform.toLowerCase()];
  if (!metadata) throw new Error(`Unsupported release-artifact platform: ${platform}`);
  return metadata;
}

export async function missingUpdaterMetadata(releaseDirectory, platform) {
  const metadataPath = join(releaseDirectory, updaterMetadataName(platform));
  try {
    await access(metadataPath);
    return [];
  } catch {
    return [metadataPath];
  }
}

function readOption(argv, option, fallback) {
  const index = argv.indexOf(option);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main() {
  const platform = readOption(process.argv, "--platform", process.platform);
  const releaseDirectory = resolve(readOption(process.argv, "--release-dir", join(process.cwd(), "release")));
  const missing = await missingUpdaterMetadata(releaseDirectory, platform);
  if (missing.length > 0) {
    console.error(`Missing required updater metadata: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Verified updater metadata: ${updaterMetadataName(platform)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
