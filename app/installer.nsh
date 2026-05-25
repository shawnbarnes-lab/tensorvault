; TensorVault NSIS custom installer script
; Included by electron-builder via package.json nsis.include

!macro customInstall
  ; Estimated install size for Add/Remove Programs (in KB).
  ; Backend + Electron + bundled Ollama binary ~= 1.5 GB. The LLM (~9.6 GB)
  ; downloads on first launch into AppData, NOT into the install dir.
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "EstimatedSize" 1572864
!macroend

!macro customUnInit
  ; If TensorVault is still running when the user runs the uninstaller,
  ; terminate the process tree first. Otherwise the running Electron
  ; parent keeps its child Ollama process alive after uninstall and
  ; gemma4 stays loaded in VRAM with no UI to stop it.
  DetailPrint "Stopping any running TensorVault and Ollama processes..."
  nsExec::Exec 'taskkill /F /T /IM TensorVault.exe'
  nsExec::Exec 'taskkill /F /T /IM ollama.exe'
  nsExec::Exec 'taskkill /F /T /IM service.exe'
  ; Give the OS a moment to release file locks on the install dir.
  Sleep 1000
!macroend

!macro customUnInstall
  ; Clean up bundled binaries on uninstall.
  ; User documents in AppData\Roaming\TensorVault are preserved by design.
  RMDir /r "$INSTDIR\resources\backend"
!macroend
