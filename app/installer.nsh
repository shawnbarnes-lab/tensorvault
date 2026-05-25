; TensorVault NSIS custom installer script
; Included by electron-builder via package.json nsis.include

!macro customInstall
  ; Estimated install size for Add/Remove Programs (in KB).
  ; Backend + Electron + bundled Ollama binary ~= 1.5 GB. The LLM (~9.6 GB)
  ; downloads on first launch into AppData, NOT into the install dir.
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "EstimatedSize" 1572864
!macroend

!macro customUnInstall
  ; Clean up bundled binaries on uninstall.
  ; User documents in AppData\Roaming\TensorVault are preserved by design.
  RMDir /r "$INSTDIR\resources\backend"
!macroend
