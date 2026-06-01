param(
  [switch]$ResetKey
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = Split-Path -Parent (Split-Path -Parent $Root)
$StateDir = Join-Path $WorkspaceRoot ".deepseek-litellm"
$VenvDir = Join-Path $StateDir ".venv"
$BundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

function Get-Python {
  if (Test-Path $BundledPython) { return $BundledPython }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "No Python found. Codex bundled Python was not found at $BundledPython."
}

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

$existingKey = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
if ($ResetKey -or [string]::IsNullOrWhiteSpace($existingKey)) {
  $plain = Read-PlainSecret "Paste your DeepSeek API key"
  if ([string]::IsNullOrWhiteSpace($plain)) {
    throw "DeepSeek API key was empty."
  }
  [Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", $plain, "User")
  $env:DEEPSEEK_API_KEY = $plain
  Write-Host "Saved DEEPSEEK_API_KEY to your Windows user environment."
} else {
  $env:DEEPSEEK_API_KEY = $existingKey
  Write-Host "DEEPSEEK_API_KEY already exists. Use -ResetKey to replace it."
}

$python = Get-Python
if (-not (Test-Path (Join-Path $VenvDir "Scripts\python.exe"))) {
  Write-Host "Creating local LiteLLM virtual environment..."
  & $python -m venv $VenvDir
}

$venvPython = Join-Path $VenvDir "Scripts\python.exe"
Write-Host "Installing/updating LiteLLM proxy in workspace venv..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install --upgrade "litellm[proxy]"

Write-Host ""
Write-Host "Setup complete."
Write-Host "Next:"
Write-Host "  1. Run .\tools\deepseek-codex\start-deepseek-proxy.ps1"
Write-Host "  2. Run .\tools\deepseek-codex\switch-codex-deepseek.ps1"
Write-Host "  3. Restart Codex Desktop"
