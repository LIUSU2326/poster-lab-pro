@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

echo Starting NEXUS local server...
echo.
echo Open this URL:
echo   http://localhost:4173
echo.
echo Keep this window open while using AI features.
echo Press Ctrl+C to stop the server.
echo.

node server.mjs
