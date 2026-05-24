$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $Root)
$StateDir = Join-Path $WorkspaceRoot ".deepseek-litellm"
$Profile = Join-Path $StateDir "official-profile.json"
$CodexDir = Join-Path $env:USERPROFILE ".codex"
$ConfigPath = Join-Path $CodexDir "config.toml"

function Remove-ProviderBlock([string]$Text) {
  return [regex]::Replace($Text, "(?ms)^\[model_providers\.litellm_deepseek\]\r?\n.*?(?=^\[|\z)", "")
}

function Remove-TopLevelKey([string]$Text, [string]$Key) {
  return [regex]::Replace($Text, "(?m)^$([regex]::Escape($Key))\s*=.*\r?\n?", "")
}

function Set-TopLevelKey([string]$Text, [string]$Key, [AllowNull()][string]$Value) {
  $text = Remove-TopLevelKey $Text $Key
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace($Value)) { return $text }
  return "$Key = `"$Value`"`r`n$text"
}

if (-not (Test-Path $ConfigPath)) {
  throw "Codex config not found at $ConfigPath"
}

$text = Get-Content -Raw -Path $ConfigPath
Copy-Item $ConfigPath "$ConfigPath.bak-official-$(Get-Date -Format yyyyMMdd-HHmmss)"
$text = Remove-ProviderBlock $text

if (Test-Path $Profile) {
  $official = Get-Content -Raw -Path $Profile | ConvertFrom-Json
  $text = Set-TopLevelKey $text "model" $official.model
  $text = Set-TopLevelKey $text "model_provider" $official.model_provider
  $text = Set-TopLevelKey $text "model_reasoning_effort" $official.model_reasoning_effort
} else {
  $text = Set-TopLevelKey $text "model" "gpt-5.5"
  $text = Remove-TopLevelKey $text "model_provider"
}

Set-Content -Encoding UTF8 -Path $ConfigPath -Value ($text.TrimEnd() + "`r`n")

Write-Host "Codex restored to the saved official OpenAI config."
Write-Host "Restart Codex Desktop to apply it."
