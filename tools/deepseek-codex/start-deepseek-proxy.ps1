$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $Root)
$StateDir = Join-Path $WorkspaceRoot ".deepseek-litellm"
$VenvPython = Join-Path $StateDir ".venv\Scripts\python.exe"
$Config = Join-Path $Root "litellm_config.yaml"

if (-not (Test-Path $VenvPython)) {
  throw "LiteLLM venv not found. Run .\tools\deepseek-codex\setup-deepseek-codex.ps1 first."
}

$key = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
if ([string]::IsNullOrWhiteSpace($key)) {
  throw "DEEPSEEK_API_KEY is missing. Run .\tools\deepseek-codex\setup-deepseek-codex.ps1 first."
}
$env:DEEPSEEK_API_KEY = $key

Write-Host "Starting LiteLLM DeepSeek proxy on http://127.0.0.1:4000/v1"
Write-Host "Keep this window open while using Codex with DeepSeek."
& $VenvPython -m litellm --config $Config --host 127.0.0.1 --port 4000
