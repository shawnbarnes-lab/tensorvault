const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const http = require('http');
const fs = require('fs');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const PORT = 8712;

let mainWindow = null;
let backendProcess = null;
let ollamaProcess = null;
let isQuitting = false;

// LLM model — small Gemma 3n variant, ~3 GB, runs on 4 GB VRAM or CPU.
const OLLAMA_MODEL = 'gemma3n:e2b';

// ─── Data directory (user docs only — no Wikipedia in TensorVault) ──────────
function getUserDataDir() {
  return path.join(app.getPath('userData'), 'user_docs');
}

// ─── Ollama model setup ─────────────────────────────────────────────────────
async function ensureOllamaModel() {
  const ollamaExe = getOllamaExe();
  if (!ollamaExe) return false;

  // Check if model is already pulled
  try {
    const result = await new Promise((resolve, reject) => {
      execFile(ollamaExe, ['list'], { env: getOllamaEnv() }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });
    if (result.includes(OLLAMA_MODEL.split(':')[0])) return true;
  } catch (e) { /* ollama not running yet, will pull after start */ }

  mainWindow?.webContents.send('setup-status', `Downloading AI model (${OLLAMA_MODEL})... This may take a few minutes.`);
  return new Promise((resolve) => {
    const pull = spawn(ollamaExe, ['pull', OLLAMA_MODEL], { env: getOllamaEnv() });
    pull.stdout.on('data', d => {
      const line = d.toString().trim();
      mainWindow?.webContents.send('setup-status', `Pulling ${OLLAMA_MODEL}: ${line}`);
    });
    pull.stderr.on('data', d => {
      const line = d.toString().trim();
      mainWindow?.webContents.send('setup-status', `Pulling ${OLLAMA_MODEL}: ${line}`);
    });
    pull.on('exit', (code) => resolve(code === 0));
  });
}

function getOllamaExe() {
  if (isDev) return 'ollama';
  const bundled = path.join(process.resourcesPath, 'backend', 'ollama', 'ollama.exe');
  if (fs.existsSync(bundled)) return bundled;
  return 'ollama'; // fall back to system ollama
}

function getOllamaEnv() {
  const env = { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' };
  if (!isDev) {
    // Prefer the bundled models directory if it exists (one-click install),
    // otherwise use AppData for first-run pulls.
    const bundledModels = path.join(process.resourcesPath, 'backend', 'ollama_models');
    if (fs.existsSync(bundledModels)) {
      env.OLLAMA_MODELS = bundledModels;
    } else {
      const modelsDir = path.join(app.getPath('userData'), 'ollama_models');
      fs.mkdirSync(modelsDir, { recursive: true });
      env.OLLAMA_MODELS = modelsDir;
    }
  }
  return env;
}

// ─── Backend ─────────────────────────────────────────────────────────────────
function startBackend() {
  const userDir = getUserDataDir();
  fs.mkdirSync(userDir, { recursive: true });

  const env = {
    ...process.env,
    TENSORVAULT_USER_DIR: userDir,
    RAG_PORT: String(PORT),
    PYTHONUNBUFFERED: '1',
  };

  if (isDev) {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, 'backend', 'service.py');
    backendProcess = spawn(pythonCmd, [scriptPath], { env, cwd: __dirname });
  } else {
    const exePath = path.join(process.resourcesPath, 'backend', 'service.exe');
    backendProcess = spawn(exePath, [], { env, cwd: path.dirname(exePath) });
  }

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString().trim()));
  backendProcess.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
    if (code !== 0 && !isQuitting) {
      console.log('[backend] crashed — restarting in 3s…');
      setTimeout(() => startBackend(), 3000);
    }
  });
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
function startOllama() {
  if (isDev) return; // Dev uses system Ollama
  const ollamaExe = getOllamaExe();
  if (!fs.existsSync(ollamaExe)) {
    console.error('[ollama] ollama.exe not found at', ollamaExe);
    return;
  }
  const env = getOllamaEnv();
  const ollamaLibDir = path.join(process.resourcesPath, 'backend', 'ollama', 'lib', 'ollama');
  if (fs.existsSync(ollamaLibDir)) env.OLLAMA_LIB_DIR = ollamaLibDir;

  ollamaProcess = spawn(ollamaExe, ['serve'], { env });
  ollamaProcess.stdout.on('data', d => console.log('[ollama]', d.toString().trim()));
  ollamaProcess.stderr.on('data', d => console.log('[ollama]', d.toString().trim()));
  ollamaProcess.on('exit', (code) => {
    console.log(`[ollama] exited with code ${code}`);
    ollamaProcess = null;
  });
}

function stopBackend() {
  isQuitting = true;
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (ollamaProcess) {
    ollamaProcess.kill();
    ollamaProcess = null;
  }
}

function waitForBackend(retries = 60, delayMs = 2000) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry(n);
      }).on('error', () => retry(n));
    };
    const retry = (n) => {
      if (n <= 0) return reject(new Error('Backend did not start in time'));
      setTimeout(() => attempt(n - 1), delayMs);
    };
    attempt(retries);
  });
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1419',
    title: 'TensorVault',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ─── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle('get-backend-url', () => `http://127.0.0.1:${PORT}`);
ipcMain.handle('get-user-dir', () => getUserDataDir());
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('is-dev', () => isDev);

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add documents to TensorVault',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'txt', 'docx', 'md', 'rtf', 'csv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('open-user-folder', () => {
  shell.openPath(getUserDataDir());
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();

  // Start Ollama server (bundled .exe in production)
  startOllama();

  // Ensure the LLM is pulled. If the installer bundled the model (one-click
  // path), this no-ops because Ollama already sees it in OLLAMA_MODELS dir.
  await ensureOllamaModel();

  // Start backend
  mainWindow?.webContents.send('setup-status', 'Starting AI engine...');
  startBackend();

  try {
    await waitForBackend();
    mainWindow?.webContents.send('backend-ready');
  } catch (err) {
    mainWindow?.webContents.send('backend-error', err.message);
  }
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', stopBackend);
