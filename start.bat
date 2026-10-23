@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install Node.js 18+ from https://nodejs.org
  pause
  exit /b 1
)
if "%PORT%"=="" set PORT=8088
start "" http://localhost:%PORT%
node server\index.mjs
pause
