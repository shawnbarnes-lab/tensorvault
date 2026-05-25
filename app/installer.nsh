; TensorVault NSIS custom installer script
; Included by electron-builder via package.json nsis.include

!macro customInit
  ; Mirror customUnInit: if TensorVault is still running (e.g. user is
  ; installing an update without closing the app), terminate the process
  ; tree before electron-builder's NSIS template hits "cannot close"
  ; and prompts the user.
  DetailPrint "Stopping any running TensorVault and Ollama processes..."
  nsExec::Exec 'taskkill /F /T /IM TensorVault.exe'
  nsExec::Exec 'taskkill /F /T /IM ollama.exe'
  nsExec::Exec 'taskkill /F /T /IM service.exe'
  Sleep 1000
!macroend

!macro customInstall
  ; Estimated install size for Add/Remove Programs (in KB).
  ; Backend + Electron + bundled Ollama binary ~= 1.5 GB. The LLM (~9.6 GB)
  ; downloads on first launch into AppData, NOT into the install dir.
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "EstimatedSize" 1572864
!macroend

!macro customUnInit
  ; Pre-uninstall cleanup: same taskkill logic as customInit.
  DetailPrint "Stopping any running TensorVault and Ollama processes..."
  nsExec::Exec 'taskkill /F /T /IM TensorVault.exe'
  nsExec::Exec 'taskkill /F /T /IM ollama.exe'
  nsExec::Exec 'taskkill /F /T /IM service.exe'
  Sleep 1000
!macroend

!macro customUnInstall
  ; Clean up bundled binaries on uninstall.
  ; User documents in AppData\Roaming\TensorVault are preserved by design.
  RMDir /r "$INSTDIR\resources\backend"
!macroend
