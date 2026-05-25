@echo off
REM -- TensorVault - Development launcher (Windows) -------------------------
REM Starts the Python backend in a new console window, then launches Electron
REM in dev mode. Run this from the tensorvault\app directory.

set SCRIPT_DIR=%~dp0

echo TensorVault Dev Mode
echo ---------------------------------
echo   Backend : Python (conda rag env)
echo ---------------------------------

set RAG_PORT=8712
set PYTHONUNBUFFERED=1

REM Start backend in a new window so you can see its logs
start "TensorVault Backend" cmd /k "conda activate rag && python %SCRIPT_DIR%backend\service.py"

REM Give backend a moment to start, then launch Electron
timeout /t 5 /nobreak >nul

echo Starting Electron...
npx electron . --dev

REM When Electron exits, kill backend window
taskkill /fi "WINDOWTITLE eq TensorVault Backend" /t /f >nul 2>&1
