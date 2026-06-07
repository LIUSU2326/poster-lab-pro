$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3000
$baseUrl = "http://127.0.0.1:$port"
$healthUrl = "$baseUrl/api/workspaces/workspace-pizza-kitchen"
$logDir = Join-Path $root "output"
$buildOutLog = Join-Path $logDir "desktop-build.out.log"
$buildErrLog = Join-Path $logDir "desktop-build.err.log"
$nextOutLog = Join-Path $logDir "desktop-next-start.out.log"
$nextErrLog = Join-Path $logDir "desktop-next-start.err.log"
$standaloneServer = Join-Path $root ".next\standalone\server.js"

function Show-PosterLabError($message) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $message,
    "Poster Lab Pro",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Set-PosterLabRuntimeEnvironment {
  $userData = Join-Path $env:APPDATA "Poster Lab Pro"
  $runtimeDir = Join-Path $userData "runtime"
  $uploadDir = Join-Path $userData "uploads"
  New-Item -ItemType Directory -Force -Path $runtimeDir, $uploadDir | Out-Null
  $env:POSTER_LAB_RUNTIME_DIR = $runtimeDir
  $env:POSTER_LAB_UPLOAD_DIR = $uploadDir
  $env:POSTER_LAB_LOCAL_VAULT_KEY = "poster-lab-local-vault:$userData"
}

function Test-PosterLabReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Get-LatestSourceWriteTime {
  $latest = [DateTime]::MinValue
  $files = @("package.json", "next.config.mjs", "tsconfig.json", "styles.css")
  foreach ($file in $files) {
    $path = Join-Path $root $file
    if (Test-Path $path) {
      $item = Get-Item $path
      if ($item.LastWriteTime -gt $latest) { $latest = $item.LastWriteTime }
    }
  }

  foreach ($dir in @("app", "src")) {
    $path = Join-Path $root $dir
    if (-not (Test-Path $path)) { continue }
    Get-ChildItem -Path $path -Recurse -File |
      Where-Object { $_.FullName -notmatch "\\node_modules\\" } |
      ForEach-Object {
        if ($_.LastWriteTime -gt $latest) { $latest = $_.LastWriteTime }
      }
  }

  return $latest
}

function Test-PosterLabBuildFresh {
  $buildIdPath = Join-Path $root ".next\BUILD_ID"
  if (-not (Test-Path $buildIdPath)) { return $false }
  if (-not (Test-Path $standaloneServer)) { return $false }
  $buildTime = (Get-Item $buildIdPath).LastWriteTime
  return $buildTime -ge (Get-LatestSourceWriteTime)
}

function Sync-PosterLabStandaloneAssets {
  $staticSource = Join-Path $root ".next\static"
  $staticTarget = Join-Path $root ".next\standalone\.next\static"
  if (-not (Test-Path $staticSource)) { return }
  Remove-Item -LiteralPath $staticTarget -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $staticTarget) | Out-Null
  Copy-Item -LiteralPath $staticSource -Destination $staticTarget -Recurse -Force

  $publicSource = Join-Path $root "public"
  $publicTarget = Join-Path $root ".next\standalone\public"
  if (Test-Path $publicSource) {
    Remove-Item -LiteralPath $publicTarget -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -LiteralPath $publicSource -Destination $publicTarget -Recurse -Force
  }
}

function Invoke-PosterLabBuild {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Remove-Item -LiteralPath $buildOutLog, $buildErrLog -Force -ErrorAction SilentlyContinue
  $build = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "build:next") `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $buildOutLog `
    -RedirectStandardError $buildErrLog `
    -Wait `
    -PassThru
  if ($build.ExitCode -ne 0) {
    Show-PosterLabError "Poster Lab Pro production build failed. Check output\desktop-build.err.log in the project folder."
    exit 1
  }
  Sync-PosterLabStandaloneAssets
}

function Stop-PosterLabElectron {
  $escapedRoot = [regex]::Escape($root)
  Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -eq "electron.exe" -and $_.CommandLine -match $escapedRoot) -or
      ($_.Name -eq "node.exe" -and $_.CommandLine -match $escapedRoot -and $_.CommandLine -match "electron[\\/]cli\.js") -or
      ($_.Name -eq "node.exe" -and $_.CommandLine -match $escapedRoot -and $_.CommandLine -match "desktop:dev")
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Test-PosterLabDevService {
  $escapedRoot = [regex]::Escape($root)
  $match = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -match $escapedRoot -and (
        ($_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next" -and $_.CommandLine -match "\sdev(\s|$)") -or
        ($_.CommandLine -match "npm-cli\.js" -and $_.CommandLine -match "run\s+dev:next")
      )
    } |
    Select-Object -First 1
  return $null -ne $match
}

function Test-PosterLabStandaloneService {
  $escapedRoot = [regex]::Escape($root)
  $match = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -match $escapedRoot -and
      $_.CommandLine -match "\.next[\\/]standalone[\\/]server\.js"
    } |
    Select-Object -First 1
  return $null -ne $match
}

function Stop-PosterLabNextService {
  $escapedRoot = [regex]::Escape($root)
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -match $escapedRoot -and (
        $_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next" -or
        $_.CommandLine -match "next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js" -or
        $_.CommandLine -match "\.next[\\/]standalone[\\/]server\.js" -or
        ($_.CommandLine -match "npm-cli\.js" -and $_.CommandLine -match "run\s+(dev:next|start:next)")
      )
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Start-PosterLabProductionService {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Remove-Item -LiteralPath $nextOutLog, $nextErrLog -Force -ErrorAction SilentlyContinue
  $node = (Get-Command node.exe).Source
  $env:HOSTNAME = "127.0.0.1"
  $env:PORT = "$port"
  if (-not (Test-Path $standaloneServer)) {
    Show-PosterLabError "Poster Lab Pro standalone server is missing. Check output\desktop-build.err.log in the project folder."
    exit 1
  }
  Start-Process -FilePath $node `
    -ArgumentList @($standaloneServer) `
    -WorkingDirectory (Split-Path -Parent $standaloneServer) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $nextOutLog `
    -RedirectStandardError $nextErrLog | Out-Null
}

Set-Location $root
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-PosterLabRuntimeEnvironment

$buildUpdated = $false
if (-not (Test-PosterLabBuildFresh)) {
  Invoke-PosterLabBuild
  $buildUpdated = $true
} else {
  Sync-PosterLabStandaloneAssets
}

$serviceReady = Test-PosterLabReady
if ($buildUpdated -or -not $serviceReady -or (Test-PosterLabDevService) -or -not (Test-PosterLabStandaloneService)) {
  Stop-PosterLabNextService
  Start-Sleep -Seconds 2
  Start-PosterLabProductionService
}

$ready = $false
for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
  if (Test-PosterLabReady) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Show-PosterLabError "Poster Lab Pro local production service did not start. Check output\desktop-next-start.err.log in the project folder."
  exit 1
}

Stop-PosterLabElectron

$env:POSTER_LAB_DESKTOP_URL = $baseUrl
$env:POSTER_LAB_NEXT_PORT = "$port"
$electronPath = Join-Path $root "node_modules\electron\dist\electron.exe"
Start-Process -FilePath $electronPath -ArgumentList @(".") -WorkingDirectory $root
