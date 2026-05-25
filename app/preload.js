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

  // Backwards-compatible stubs (TensorVault has no Wikipedia data dir to
  // download, so these resolve as if everything is already ready).
  getDataDir:        () => ipcRenderer.invoke('get-user-dir'),
  openDataFolder:    () => ipcRenderer.invoke('open-user-folder'),
  checkDataReady:    async () => true,
  onSetupProgress:   (_cb) => { /* no-op: nothing to download */ },
  onSetupError:      (_cb) => { /* no-op: setup errors flow through setup-status */ },
};

// Expose under both names for backwards compatibility with prior renderer code.
contextBridge.exposeInMainWorld('tensorvault', api);
contextBridge.exposeInMainWorld('survivalai', api);
