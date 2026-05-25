@echo off
REM -- Prep Ollama bundle for TensorVault build -----------------------------
REM Downloads ollama.exe and copies the gemma3n:e4b model into ollama_bundle/
REM so electron-builder can include them in the installer.
REM
REM Run BEFORE: build.bat
REM This script will:
REM   1. Download ollama.exe (if missing)
REM   2. Pull gemma3n:e4b via the system Ollama (or bundled one)
REM   3. Copy the model files into ollama_bundle\models\

setlocal
set BUNDLE_DIR=%~dp0..\ollama_bundle
set OLLAMA_VERSION=0.6.2
set MODEL_NAME=gemma3n:e4b

echo.
echo ===============================================================
echo            TensorVault — Ollama Bundle Prep
echo ===============================================================
echo.

REM -- Step 1: Create bundle directory --------------------------------------
if not exist "%BUNDLE_DIR%" mkdir "%BUNDLE_DIR%"
if not exist "%BUNDLE_DIR%\models" mkdir "%BUNDLE_DIR%\models"

REM -- Step 2: Download Ollama for Windows ----------------------------------
echo [1/3] Downloading ollama.exe (v%OLLAMA_VERSION%)...
if not exist "%BUNDLE_DIR%\ollama.exe" (
    curl -L -o "%BUNDLE_DIR%\ollama.exe" "https://github.com/ollama/ollama/releases/download/v%OLLAMA_VERSION%/ollama-windows-amd64.exe"
    if errorlevel 1 (
        echo ERROR: Failed to download ollama.exe
        exit /b 1
    )
    echo       [OK] Downloaded ollama.exe
) else (
    echo       [OK] ollama.exe already exists
)

REM -- Step 3: Pull the model -----------------------------------------------
echo [2/3] Pulling %MODEL_NAME% model (this may take a few minutes)...
where ollama >nul 2>nul
if errorlevel 1 (
    REM No system ollama; use the bundled one we just downloaded
    set OLLAMA_CMD="%BUNDLE_DIR%\ollama.exe"
    REM Start the bundled ollama server briefly in the background
    start "" /b "%BUNDLE_DIR%\ollama.exe" serve
    timeout /t 3 /nobreak >nul
) else (
    set OLLAMA_CMD=ollama
)

%OLLAMA_CMD% pull %MODEL_NAME%
if errorlevel 1 (
    echo ERROR: Failed to pull %MODEL_NAME%.
    echo Try running this manually: ollama pull %MODEL_NAME%
    exit /b 1
)
echo       [OK] %MODEL_NAME% pulled

REM -- Step 4: Copy model files into the bundle -----------------------------
echo [3/3] Copying %MODEL_NAME% model files into ollama_bundle\models...

REM Ollama stores models in %USERPROFILE%\.ollama\models by default
set OLLAMA_MODELS_SRC=%USERPROFILE%\.ollama\models
if not exist "%OLLAMA_MODELS_SRC%" (
    echo ERROR: Ollama models directory not found at %OLLAMA_MODELS_SRC%
    exit /b 1
)

xcopy /E /I /Y "%OLLAMA_MODELS_SRC%" "%BUNDLE_DIR%\models" >nul
if errorlevel 1 (
    echo ERROR: Failed to copy model files
    exit /b 1
)
echo       [OK] Model files copied

REM -- Summary ---------------------------------------------------------------
echo.
echo ===============================================================
echo                       Bundle ready
echo ===============================================================
echo.
echo   ollama_bundle\
echo     ollama.exe       — Ollama server
echo     models\          — %MODEL_NAME% model (~3 GB)
echo.
echo   Next: run build.bat to build the installer
echo.

endlocal
