#!/usr/bin/env bash
set -euo pipefail

release_directory="${1:-apps/desktop/release}"
app_path="$(find "$release_directory" -type d -name 'CodeBundle.app' -print -quit)"

if [[ -z "$app_path" ]]; then
  echo "No CodeBundle.app found under $release_directory." >&2
  exit 1
fi

sidecar_path="$app_path/Contents/Resources/sidecars/codebundle-exporter"
if [[ ! -f "$sidecar_path" ]]; then
  echo "Bundled exporter sidecar is missing from $app_path." >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
codesign --verify --strict --verbose=2 "$sidecar_path"
spctl --assess --type execute --verbose "$app_path"
xcrun stapler validate "$app_path"
echo "Verified signed and stapled CodeBundle app: $app_path"
