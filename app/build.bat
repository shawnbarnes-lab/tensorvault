@echo off
REM -- TensorVault — Production Build Script --------------------------------
REM
REM Prerequisites (all must be installed first):
REM   1. Node.js 20+ (https://nodejs.org)
REM   2. Miniconda with 'rag' env created from backend\environment.yml
REM   3. npm install (run once in this directory)
REM   4. PyInstaller: conda activate rag ^&^& pip install pyinstaller
REM   5. Ollama bundle: scripts\prep_ollama_bundle.bat (downloads ollama + Gemma 3n E2B)
REM
REM What this does:
REM   1. Freezes Python backend -> backend_dist\service.exe  (~800MB)
REM   2. Builds Electron installer -> dist\TensorVault-Setup-x.x.x.exe
REM
REM After building:
REM   - Sign dist\TensorVault-Setup-*.exe with Azure Trusted Signing (sign.js)
REM   - Upload to GitHub Releases

setlocal
set SCRIPT_DIR=%~dp0
set ERROR_OCCURRED=0

echo.
echo ===============================================================
echo               TensorVault — Production Build
echo ===============================================================
echo.

REM -- Pre-check: Ollama bundle ---------------------------------------------
if not exist ollama_bundle\ollama.exe (
    echo ERROR: ollama_bundle\ollama.exe not found.
    echo Run: scripts\prep_ollama_bundle.bat
    set ERROR_OCCURRED=1
    goto :error
)
if not exist ollama_bundle\models (
    echo ERROR: ollama_bundle\models not found.
    echo Run: scripts\prep_ollama_bundle.bat
    set ERROR_OCCURRED=1
    goto :error
)
echo [OK] Ollama bundle found
echo.

REM -- Step 1: Freeze Python backend ----------------------------------------
echo [1/3] Freezing Python backend with PyInstaller...
echo       (Bundles Python + all ML libraries into a single .exe)
echo       Estimated time: 5-15 minutes
echo.

call conda activate rag
if errorlevel 1 (
    echo ERROR: Could not activate conda 'rag' environment.
    echo Run: conda env create -f backend\environment.yml
    set ERROR_OCCURRED=1
    goto :error
)

pip install pyinstaller --quiet
if errorlevel 1 (
    echo ERROR: PyInstaller install failed.
    set ERROR_OCCURRED=1
    goto :error
)

REM Clean previous build
if exist backend_dist rmdir /s /q backend_dist
if exist build rmdir /s /q build

pyinstaller ^
    --onefile ^
    --console ^
    --name service ^
    --distpath backend_dist ^
    --workpath build\pyinstaller ^
    --specpath build ^
    --hidden-import flask ^
    --hidden-import flask_cors ^
    --hidden-import faiss ^
    --hidden-import pdfplumber ^
    --hidden-import docx ^
    --hidden-import fpdf ^
    --hidden-import pytesseract ^
    --hidden-import pdf2image ^
    --hidden-import fitz ^
    --hidden-import faster_whisper ^
    --hidden-import ctranslate2 ^
    --exclude-module torch ^
    --exclude-module sentence_transformers ^
    --exclude-module transformers ^
    --exclude-module sklearn ^
    --exclude-module scipy ^
    --exclude-module matplotlib ^
    --exclude-module notebook ^
    --exclude-module ipython ^
    --icon assets\icon.ico ^
    backend\service.py

if errorlevel 1 (
    echo ERROR: PyInstaller failed.
    set ERROR_OCCURRED=1
    goto :error
)

echo.
echo [1/3] [OK] Backend frozen: backend_dist\service.exe
echo.

REM -- Step 2: Install Node dependencies if needed --------------------------
echo [2/3] Installing Node dependencies...
if not exist node_modules (
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        set ERROR_OCCURRED=1
        goto :error
    )
)
echo [2/3] [OK] Node dependencies ready
echo.

REM -- Step 3: Build Electron installer -------------------------------------
echo [3/3] Building Electron installer...
echo       Output: dist\TensorVault-Setup-*.exe
echo.

call npm run dist

if errorlevel 1 (
    echo ERROR: Electron build failed.
    set ERROR_OCCURRED=1
    goto :error
)

echo.
echo ===============================================================
echo                    BUILD COMPLETE
echo ===============================================================
echo.
echo Output: dist\TensorVault-Setup-*.exe
echo.
echo Next steps:
echo   1. Sign: handled automatically by sign.js if Azure Trusted Signing
echo      env vars are set (AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT,
echo      AZURE_SIGNING_CERT_PROFILE).
echo   2. Test: install and verify on a clean Windows machine.
echo   3. Upload to GitHub Releases.
echo.
goto :end

:error
echo.
echo BUILD FAILED. See error above.
echo.
pause

:end
endlocal
