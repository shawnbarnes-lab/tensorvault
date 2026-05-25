; TensorVault — Inno Setup Script
; Packages the electron-builder win-unpacked output into a Windows installer.

#define MyAppName "TensorVault"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "TensorSpace LLC"
#define MyAppURL "https://github.com/shawnbarnes-lab/tensorvault"
#define MyAppExeName "TensorVault.exe"

[Setup]
AppId={{D4C6B1E2-3F5A-4B7D-9E8C-1A2B3C4D5E6F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=assets\LICENSE.txt
OutputDir=dist
OutputBaseFilename=TensorVault-Setup-{#MyAppVersion}
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
; Compression — lzma2/max gives a smaller installer at the cost of build time.
; The bundled Ollama model dominates installer size; lzma2/max squeezes it well.
Compression=lzma2/max
SolidCompression=yes
LZMANumBlockThreads=2
DiskSpanning=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
; Install size: ~10 GB (app + bundled Gemma 3n E4B model + tools)
ExtraDiskSpaceRequired=10737418240
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
WizardStyle=modern
WizardSizePercent=120

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
