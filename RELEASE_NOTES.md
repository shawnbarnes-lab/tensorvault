# TensorVault v0.1.0 — Early Access

Private business knowledge assistant by [TensorSpace LLC](https://tensorspace.net).
Your documents indexed locally, answered by a local LLM, exported as PDF or DOCX. No cloud, no API keys, no telemetry.

## What's in this release

- **Document indexing**: PDF, DOCX, TXT, MD, CSV, RTF
- **Semantic search** (BGE-large embeddings + MiniLM reranker)
- **Grounded AI answers** with inline citations, powered by Gemma 3n E4B (~7.5 GB, bundled in the installer)
- **PDF and DOCX export** of any answer with citations
- **Voice input** via Whisper (downloads on first use)
- **Runs offline** after initial setup
- **Installer is unsigned** for v0.1.0 — Windows SmartScreen will prompt once ("More info → Run anyway"). Signed builds are tracked for v0.1.1.

## What's NOT in v0.1.0 (planned for v0.2)

- **OCR for scanned PDFs** (Tesseract not bundled — text-based PDFs work fine)
- **Voice output / read-aloud** (Piper TTS not bundled — voice input still works)
- **Signed installer** (SignPath Foundation application in progress)

## System Requirements

| Component | Minimum | Recommended |
| --- | --- | --- |
| OS | Windows 10/11 64-bit | Windows 11 |
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16 GB |
| GPU | None (CPU fallback, slow) | NVIDIA 4+ GB VRAM |
| Disk | 10 GB free | 15 GB free |
| Internet | **Required on first launch** (see below) | Required on first launch |

**GPU note**: Without an NVIDIA GPU, the LLM runs on CPU. It works, but inference is ~5-10x slower than on a GPU. For a smooth experience, an RTX 3060 / RTX 4060 or better is recommended.

## First-launch internet requirement (read this)

The installer bundles the LLM and core app, but **two smaller models still download from HuggingFace on the first launch**:

- BGE-large embedding model (~1.3 GB)
- MiniLM cross-encoder reranker (~130 MB)

These are cached after the first download, so subsequent launches are fully offline.

**What you'll see on first launch:**
- The app opens and shows "Starting AI engine..." for **3-10 minutes** depending on your connection.
- During this time, the embedding models download in the background.
- Once the status changes to "Ready", you can add documents and ask questions.
- **You must be connected to the internet for this first launch.** After it completes, the app runs offline.

Bundling these models into the installer is planned for v0.2.

## Installation

1. Download `TensorVault-Setup-0.1.0.exe` (the only file below).
2. Run the installer.
3. **Expect a SmartScreen prompt** — click "More info" → "Run anyway". (v0.1.0 ships unsigned; signed builds in v0.1.1.)
4. Launch TensorVault from the Start Menu or desktop shortcut.
5. **Wait 3-10 minutes** on first launch for the embedding models to download. The status bar will say "Starting AI engine..." until ready.
6. Click **My Docs** to add your business documents.
7. Click **Ask** to ask questions across your documents.

## Where your data lives

- **Indexed documents**: `%APPDATA%\TensorVault\user_docs\`
- **LLM cache**: bundled in the install directory (no separate download)
- **Embedding model cache**: `%USERPROFILE%\.cache\huggingface\` (downloaded on first run, see above)
- **Nothing ever leaves your computer.**

## License

MIT. Source code: https://github.com/shawnbarnes-lab/tensorvault

Published by [TensorSpace LLC](https://tensorspace.net).
