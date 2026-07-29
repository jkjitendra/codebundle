[CmdletBinding()]
param(
  [string]$ReleaseDirectory = (Join-Path $PSScriptRoot "../apps/desktop/release"),
  [switch]$RequireSigned
)

$installers = Get-ChildItem -Path $ReleaseDirectory -Filter "*.exe" -File -ErrorAction SilentlyContinue
if (-not $installers) {
  Write-Error "No Windows .exe artifacts found under $ReleaseDirectory."
  exit 1
}

$invalid = @()
foreach ($installer in $installers) {
  $signature = Get-AuthenticodeSignature -FilePath $installer.FullName
  Write-Host "$($installer.Name): $($signature.Status)"
  if ($signature.Status -ne "Valid") {
    $invalid += $installer
  }
}

if ($RequireSigned -and $invalid.Count -gt 0) {
  Write-Error "One or more required Windows signatures are not valid."
  exit 1
}

if ($invalid.Count -gt 0) {
  Write-Host "Unsigned or invalid beta signatures were detected; signing is not required for this build."
}
