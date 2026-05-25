const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // Current API
  getBackendUrl:   () => ipcRenderer.invoke('get-backend-url'),
  getUserDir:      () => ipcRenderer.invoke('get-user-dir'),
  getVersion:      () => ipcRenderer.invoke('get-version'),
  isDev:           () => ipcRenderer.invoke('is-dev'),

  openFileDialog:  () => ipcRenderer.invoke('open-file-dialog'),
  openUserFolder:  () => ipcRenderer.invoke('open-user-folder'),

  onBackendReady:  (cb) => ipcRenderer.on('backend-ready', cb),
  onBackendError:  (cb) => ipcRenderer.on('backend-error', (_e, msg) => cb(msg)),
  onSetupStatus:   (cb) => ipcRenderer.on('setup-status', (_e, msg) => cb(msg)),

  // Setup progress (driven by Ollama HTTP API pull events in main.js).
  onSetupProgress:   (cb) => ipcRenderer.on('setup-progress', (_e, data) => cb(data)),

  // Backwards-compatible stubs (no Wikipedia data dir in TensorVault).
  getDataDir:        () => ipcRenderer.invoke('get-user-dir'),
  openDataFolder:    () => ipcRenderer.invoke('open-user-folder'),
  checkDataReady:    async () => true,
  onSetupError:      (_cb) => { /* no-op: setup errors flow through setup-status */ },
};

// Expose under both names for backwards compatibility with prior renderer code.
contextBridge.exposeInMainWorld('tensorvault', api);
contextBridge.exposeInMainWorld('survivalai', api);
