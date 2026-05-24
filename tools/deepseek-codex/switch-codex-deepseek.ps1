param(
  [ValidateSet("deepseek-v4-pro", "deepseek-v4-flash")]
  [string]$Model = "deepseek-v4-pro"
)

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

function Set-TopLevelKey([string]$Text, [string]$Key, [string]$Value) {
  $line = "$Key = `"$Value`""
  if ($Text -match "(?m)^$([regex]::Escape($Key))\s*=") {
    return [regex]::Replace($Text, "(?m)^$([regex]::Escape($Key))\s*=.*$", $line, 1)
  }
  return "$line`r`n$Text"
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

if (-not (Test-Path $ConfigPath)) {
  throw "Codex config not found at $ConfigPath"
}

$text = Get-Content -Raw -Path $ConfigPath
Copy-Item $ConfigPath "$ConfigPath.bak-deepseek-$(Get-Date -Format yyyyMMdd-HHmmss)"

if (-not (Test-Path $Profile) -and $text -notmatch '(?m)^model\s*=\s*"deepseek-v4-') {
  $official = [ordered]@{
    model = if ($text -match '(?m)^model\s*=\s*"([^"]+)"') { $Matches[1] } else { "gpt-5.5" }
    model_provider = if ($text -match '(?m)^model_provider\s*=\s*"([^"]+)"') { $Matches[1] } else { $null }
    model_reasoning_effort = if ($text -match '(?m)^model_reasoning_effort\s*=\s*"([^"]+)"') { $Matches[1] } else { $null }
  }
  $official | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $Profile
}

$text = Remove-ProviderBlock $text
$text = Set-TopLevelKey $text "model" $Model
$text = Set-TopLevelKey $text "model_provider" "litellm_deepseek"
$text = Set-TopLevelKey $text "model_reasoning_effort" "medium"
$text = $text.TrimEnd() + @"

[model_providers.litellm_deepseek]
name = "LiteLLM DeepSeek"
base_url = "http://127.0.0.1:4000/v1"
wire_api = "responses"

"@

Set-Content -Encoding UTF8 -Path $ConfigPath -Value $text

Write-Host "Codex switched to $Model via LiteLLM DeepSeek."
Write-Host "Start the proxy first, then restart Codex Desktop."
Write-Host "To restore official OpenAI config, run .\tools\deepseek-codex\switch-codex-official.ps1"
