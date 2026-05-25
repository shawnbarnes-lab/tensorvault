; TensorVault NSIS custom installer script
; Included by electron-builder via package.json nsis.include

!macro customInstall
  ; Estimated install size for Add/Remove Programs.
  ; Backend + Ollama + bundled Gemma 3n E2B model + tools ~= 6 GB
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "EstimatedSize" 6291456
!macroend

!macro customUnInstall
  ; Clean up bundled binaries on uninstall.
  ; User documents in AppData\Roaming\TensorVault are preserved by design.
  RMDir /r "$INSTDIR\resources\backend"
!macroend
