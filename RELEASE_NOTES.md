# TensorVault v0.1.0 — Early Access

Private business knowledge assistant by [TensorSpace LLC](https://tensorspace.net).
Your documents indexed locally, answered by a local LLM, exported as PDF or DOCX. No cloud, no API keys, no telemetry.

## What's in this release

- **Document indexing**: PDF, DOCX, TXT, MD, CSV, RTF
- **Semantic search** with GPU-accelerated embeddings (mxbai-embed-large via Ollama)
- **Grounded AI answers** with inline citations, powered by Gemma 4 via Ollama. Both LLM and embedder run on your NVIDIA GPU when available, automatically fall back to CPU otherwise.
- **Business-tuned system prompt** that handles common asks: lookup, summarize, compare, draft, extract.
- **PDF and DOCX export** of any answer with citations
- **Voice input** via Whisper (downloads on first use, auto-detects CUDA)
- **Runs offline** after first-launch model downloads
- **Installer is unsigned** for v0.1.0 — Windows SmartScreen will prompt once ("More info → Run anyway"). Signed builds via SignPath Foundation are tracked for v0.1.1.

## What's NOT in v0.1.0 (planned for v0.2)

- **OCR for scanned PDFs** (Tesseract not bundled — text-based PDFs work fine)
- **Voice output / read-aloud** (Piper TTS not bundled — voice input still works)
- **Signed installer**
- **Natural-language "create a docx with X" command** — for v0.1.0 you click the Export buttons manually after an AI answer
- **Reranker** (the previous cross-encoder was dropped to stay under GitHub's 2 GB asset cap; v0.2 may add LLM-based reranking via Ollama)

## System Requirements (READ BEFORE DOWNLOADING)

| Component | Minimum | Recommended | Optimal |
| --- | --- | --- | --- |
| OS | Windows 10/11 64-bit | Windows 11 64-bit | Windows 11 64-bit |
| CPU | 4 cores | 8+ cores | 8+ cores |
| RAM | 8 GB | 16 GB | 32 GB |
| GPU | NVIDIA 4 GB VRAM | NVIDIA 8 GB VRAM | NVIDIA 12 GB VRAM (RTX 3060 12GB+) |
| Disk | 15 GB free SSD | 25 GB free SSD | 25 GB free SSD |
| Internet | Required on first launch (~10 GB model download) | same | same |

**Asymmetric GPU/RAM fallback.** TensorVault uses Ollama for both the LLM and embeddings. Ollama automatically splits the model between GPU VRAM and system RAM based on what is available — a 4 GB card uses all 4 GB and runs the rest on CPU. **Same Gemma 4 model runs on every machine.** Smaller GPUs just see slower inference because layers offload to CPU. At Optimal (12 GB VRAM), the entire LLM lives on the GPU and inference feels real-time.

The README is attached to this release as a separate file for full documentation.

You can override the model with `OLLAMA_MODEL=<name>` env var if you want a different one.

## First-launch internet requirement

The installer is ~1.7 GB. On first launch, TensorVault downloads two models automatically via Ollama:

| What | Size | Purpose |
| --- | --- | --- |
| Gemma 4 (LLM) | ~9.6 GB | Generates the AI answers |
| mxbai-embed-large (embedder) | ~770 MB | Indexes and searches your documents |

**Total first-launch download: ~10.3 GB.** Takes 10-30 minutes depending on connection speed. After that, the app runs fully offline — no more downloads.

**Why not bundle the models?** A 10+ GB installer pushes past GitHub's 2 GB single-file release cap and would be a slow one-time download anyway. Modern LLM apps (LM Studio, Jan, etc.) all use this pattern.

## Installation

1. Download `TensorVault-Setup-0.1.0.exe` (the only file below).
2. Run the installer.
3. **Expect a SmartScreen prompt** — click "More info" → "Run anyway". (v0.1.0 ships unsigned.)
4. Launch TensorVault from the Start Menu or desktop shortcut.
5. **Wait 10-30 minutes** on first launch while the LLM and embedding models download. The status bar shows live download progress.
6. Click **My Docs** to add your business documents.
7. Click **Ask** to ask questions across your documents.

## Where your data lives

- **Indexed documents**: `%APPDATA%\TensorVault\user_docs\`
- **Ollama model cache** (LLM + embedder): `%APPDATA%\TensorVault\ollama_models\`
- **Nothing ever leaves your computer** after the first-launch downloads complete.

## License

MIT. Source code: https://github.com/shawnbarnes-lab/tensorvault

Published by [TensorSpace LLC](https://tensorspace.net).
