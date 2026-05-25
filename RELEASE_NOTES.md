# TensorVault v0.1.0 — Early Access

Private business knowledge assistant by [TensorSpace LLC](https://tensorspace.net).
Your documents indexed locally, answered by a local LLM, exported as PDF or DOCX. No cloud, no API keys, no telemetry.

## What's in this release

- **Document indexing**: PDF, DOCX, TXT, MD, CSV, RTF
- **Semantic search** (BGE-large embeddings + MiniLM reranker)
- **Grounded AI answers** with inline citations, powered by Gemma 4 E4B (pulled on first launch via bundled Ollama)
- **PDF and DOCX export** of any answer with citations
- **Voice input** via Whisper (downloads on first use)
- **Runs offline** after first-launch setup
- **Installer is unsigned** for v0.1.0 — Windows SmartScreen will prompt once ("More info → Run anyway"). Signed builds via SignPath Foundation are tracked for v0.1.1.

## What's NOT in v0.1.0 (planned for v0.2)

- **OCR for scanned PDFs** (Tesseract not bundled — text-based PDFs work fine)
- **Voice output / read-aloud** (Piper TTS not bundled — voice input still works)
- **Signed installer** (SignPath Foundation application in progress)
- **Natural-language "create a docx with X" command** — for v0.1.0 you click the Export buttons manually after an AI answer

## System Requirements

| Component | Minimum | Recommended |
| --- | --- | --- |
| OS | Windows 10/11 64-bit | Windows 11 |
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16 GB |
| GPU | None (CPU fallback, slow) | NVIDIA 4+ GB VRAM |
| Disk | 12 GB free | 15 GB free |
| Internet | **Required on first launch** (see below) | Required on first launch |

**GPU note**: Without an NVIDIA GPU, the LLM runs on CPU. It works, but inference is ~5-10x slower than on a GPU. For a smooth experience, an RTX 3060 / RTX 4060 or better is recommended.

## First-launch internet requirement (read this)

The installer is ~1.5 GB. On first launch, TensorVault downloads three things automatically:

| What | Size | Source |
| --- | --- | --- |
| Gemma 4 E4B LLM | ~9.6 GB | Ollama registry (via bundled Ollama) |
| BGE-large embedding model | ~1.3 GB | HuggingFace |
| MiniLM cross-encoder reranker | ~130 MB | HuggingFace |

**Total first-launch download: ~11 GB.** This takes 10-30 minutes depending on connection speed. Once complete, the app runs fully offline.

**Why not bundle everything in the installer?** NSIS (Windows installer format) has a 2 GB single-file limit. The Gemma model alone is too big to bundle directly. A 10+ GB installer would also be a slow one-time download anyway. Modern LLM apps (LM Studio, Jan, etc.) all use this pattern.

## Installation

1. Download `TensorVault-Setup-0.1.0.exe` (the only file below, ~1.5 GB).
2. Run the installer.
3. **Expect a SmartScreen prompt** — click "More info" → "Run anyway". (v0.1.0 ships unsigned; signed builds in v0.1.1.)
4. Launch TensorVault from the Start Menu or desktop shortcut.
5. **Wait 10-30 minutes** on first launch while the LLM and embedding models download. The status bar will say "Pulling gemma4..." then "Starting AI engine..." until ready.
6. Click **My Docs** to add your business documents.
7. Click **Ask** to ask questions across your documents.

## Where your data lives

- **Indexed documents**: `%APPDATA%\TensorVault\user_docs\`
- **LLM cache (Gemma 4)**: `%APPDATA%\TensorVault\ollama_models\` (or the bundled one if running first time)
- **Embedding model cache**: `%USERPROFILE%\.cache\huggingface\`
- **Nothing ever leaves your computer** after the first-launch downloads complete.

## License

MIT. Source code: https://github.com/shawnbarnes-lab/tensorvault

Published by [TensorSpace LLC](https://tensorspace.net).
