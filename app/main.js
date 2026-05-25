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

// Models Ollama pulls on first launch. The LLM is the big one (~9.6 GB);
// the embedding model is small (~670 MB for mxbai-embed-large).
const OLLAMA_MODEL       = 'gemma4';
const OLLAMA_EMBED_MODEL = 'mxbai-embed-large';
const MODELS_TO_PULL     = [OLLAMA_MODEL, OLLAMA_EMBED_MODEL];

// ─── Data directory (user docs only — no Wikipedia in TensorVault) ──────────
function getUserDataDir() {
  return path.join(app.getPath('userData'), 'user_docs');
}

// ─── Ollama model setup (uses HTTP API for clean JSON progress events) ─────
function fmtBytes(n) {
  if (!n || n <= 0) return '0 B';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB';
  return n + ' B';
}

// Wait briefly until Ollama's HTTP API is reachable (server may still be
// starting up when we get here).
async function waitForOllamaHttp(retries = 20, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    const ok = await new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 1500 }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode === 200));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

async function isModelPresent(name) {
  return await new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const tags = JSON.parse(body);
          const base = name.split(':')[0];
          resolve(Array.isArray(tags.models) && tags.models.some(m => (m.name || '').includes(base)));
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function pullOneModel(name, label) {
  // POST /api/pull, parse the line-delimited JSON stream, dispatch typed
  // progress events to the renderer. Returns a Promise that resolves true
  // on success.
  return new Promise((resolve) => {
    const payload = JSON.stringify({ name });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/pull',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let buffer = '';
      let lastPct = -1;
      res.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          const status = (ev.status || '').toLowerCase();
          const total = ev.total || 0;
          const done = ev.completed || 0;

          if (status.startsWith('pulling') && total > 0) {
            const pct = Math.min(100, Math.max(0, Math.round((done / total) * 100)));
            if (pct !== lastPct) {
              lastPct = pct;
              mainWindow?.webContents.send('setup-status',
                `Downloading ${label} (${fmtBytes(done)} / ${fmtBytes(total)})`);
              mainWindow?.webContents.send('setup-progress', {
                file:       label,
                pct,
                downloaded: fmtBytes(done),
                total:      fmtBytes(total),
              });
            }
          } else if (status.includes('verifying')) {
            mainWindow?.webContents.send('setup-status', `Verifying ${label}…`);
          } else if (status.includes('manifest')) {
            mainWindow?.webContents.send('setup-status', `Preparing ${label}…`);
          } else if (status === 'success') {
            mainWindow?.webContents.send('setup-progress', {
              file: label, pct: 100,
              downloaded: fmtBytes(done || 1), total: fmtBytes(total || 1),
            });
            mainWindow?.webContents.send('setup-status', `${label} ready.`);
          }
        }
      });
      res.on('end', () => resolve(true));
      res.on('error', () => resolve(false));
    });
    req.on('error', (err) => {
      console.error(`[ollama] pull error for ${name}:`, err.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

async function ensureOllamaModel() {
  // Pull both the LLM and the embedding model on first launch. Both go
  // through the same clean progress UI.
  if (!await waitForOllamaHttp()) {
    console.error('[ollama] HTTP API never came up — skipping model check');
    return false;
  }

  const targets = [
    { name: OLLAMA_MODEL,       label: 'AI model' },
    { name: OLLAMA_EMBED_MODEL, label: 'Embedding model' },
  ];

  for (const t of targets) {
    if (await isModelPresent(t.name)) {
      mainWindow?.webContents.send('setup-status', `${t.label} ready.`);
      continue;
    }
    await pullOneModel(t.name, t.label);
  }
  return true;
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
