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

// ─── GPU detection and model selection ────────────────────────────────────
// We auto-detect VRAM and pick the LARGEST LLM that fits cleanly on the
// GPU alongside the 770 MB embedder. Goal is full-GPU inference, never
// CPU offload. Power users can override with OLLAMA_MODEL env var.
//
//   >= 14 GB VRAM   -> gemma4         (~9.6 GB, full quality)
//    10-14 GB VRAM  -> gemma3:12b     (~8.1 GB, very close to gemma4)
//     4-10 GB VRAM  -> gemma3:4b      (~3.3 GB, solid mid-tier)
//   <  4 GB or none -> gemma3:1b      (~0.8 GB, compact / CPU fallback)
//
// gemma3:12b is the sweet spot for 10-12 GB cards (RTX 3080 / 4070 Ti):
// it fits with the embedder, runs fully on GPU, and quality lands close
// to gemma4. Way better than dropping all the way to gemma3:4b.
//
// We always use mxbai-embed-large for embeddings -- small enough to fit
// in any reasonable GPU and it's the quality sweet spot at 1024 dims.
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'mxbai-embed-large';

function detectGpuVramGB() {
  // Returns max VRAM (in GB) across any NVIDIA GPUs on the system.
  // 0 means no NVIDIA GPU detected (or nvidia-smi unavailable).
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(
      'nvidia-smi',
      ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    );
    const mibs = out.trim().split('\n')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);
    if (!mibs.length) return 0;
    const maxMiB = Math.max(...mibs);
    return Math.floor(maxMiB / 1024);  // nvidia-smi reports MiB
  } catch (e) {
    console.log('[gpu-detect] No NVIDIA GPU via nvidia-smi:', e.message);
    return 0;
  }
}

function selectLlmModel(vramGB) {
  if (vramGB >= 14) return { name: 'gemma4',     label: 'Gemma 4 E4B', sizeGB: 9.6, tier: 'high'   };
  if (vramGB >= 10) return { name: 'gemma3:12b', label: 'Gemma 3 12B', sizeGB: 8.1, tier: 'upper'  };
  if (vramGB >= 4)  return { name: 'gemma3:4b',  label: 'Gemma 3 4B',  sizeGB: 3.3, tier: 'mid'    };
  return                   { name: 'gemma3:1b',  label: 'Gemma 3 1B',  sizeGB: 0.8, tier: 'low'    };
}

const DETECTED_VRAM_GB = detectGpuVramGB();
// User override always wins. If they set OLLAMA_MODEL=something, we trust it.
const LLM_OVERRIDE = (process.env.OLLAMA_MODEL || '').trim();
const SELECTED_LLM = LLM_OVERRIDE
  ? { name: LLM_OVERRIDE, label: LLM_OVERRIDE, sizeGB: 0, tier: 'override' }
  : selectLlmModel(DETECTED_VRAM_GB);

console.log(`[gpu-detect] VRAM detected: ${DETECTED_VRAM_GB} GB -> LLM: ${SELECTED_LLM.label} (${SELECTED_LLM.name})`);

const OLLAMA_MODEL = SELECTED_LLM.name;

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

  // Tell the user which LLM we picked and why, before we start pulling.
  // This makes the VRAM-based selection visible instead of mysterious.
  let selectionMsg;
  if (LLM_OVERRIDE) {
    selectionMsg = `Using ${SELECTED_LLM.label} (set by OLLAMA_MODEL).`;
  } else if (DETECTED_VRAM_GB >= 14) {
    selectionMsg = `Detected ${DETECTED_VRAM_GB} GB GPU — using ${SELECTED_LLM.label} for full quality.`;
  } else if (DETECTED_VRAM_GB >= 10) {
    selectionMsg = `Detected ${DETECTED_VRAM_GB} GB GPU — using ${SELECTED_LLM.label} (very close to Gemma 4, fits fully on GPU).`;
  } else if (DETECTED_VRAM_GB >= 4) {
    selectionMsg = `Detected ${DETECTED_VRAM_GB} GB GPU — using ${SELECTED_LLM.label} to keep inference on GPU.`;
  } else if (DETECTED_VRAM_GB > 0) {
    selectionMsg = `Detected ${DETECTED_VRAM_GB} GB GPU — using ${SELECTED_LLM.label} (compact model for low-VRAM cards).`;
  } else {
    selectionMsg = `No NVIDIA GPU detected — using ${SELECTED_LLM.label} on CPU (slower but functional).`;
  }
  console.log(`[setup] ${selectionMsg}`);
  mainWindow?.webContents.send('setup-status', selectionMsg);

  const targets = [
    { name: OLLAMA_MODEL,       label: SELECTED_LLM.label },
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

  // Pass the auto-selected models to the Python backend so it queries
  // Ollama for the right ones. Without this the backend would default
  // to its own constants and could mismatch what main.js pulled.
  const env = {
    ...process.env,
    TENSORVAULT_USER_DIR: userDir,
    RAG_PORT: String(PORT),
    PYTHONUNBUFFERED: '1',
    OLLAMA_MODEL:       OLLAMA_MODEL,
    OLLAMA_EMBED_MODEL: OLLAMA_EMBED_MODEL,
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

function killProcessTree(proc, label) {
  // On Windows, Node's proc.kill() sends a signal only to the parent.
  // Ollama spawns model-runner child processes that can linger and keep
  // VRAM allocated. taskkill /F /T terminates the whole tree.
  if (!proc) return;
  try {
    if (process.platform === 'win32') {
      const { execFileSync } = require('child_process');
      execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)],
        { stdio: 'ignore', windowsHide: true });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (e) {
    console.warn(`[${label}] kill failed:`, e.message);
  }
}

function stopBackend() {
  isQuitting = true;
  killProcessTree(backendProcess, 'backend');
  backendProcess = null;
  killProcessTree(ollamaProcess, 'ollama');
  ollamaProcess = null;
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
