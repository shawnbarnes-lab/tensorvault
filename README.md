# TensorVault

**Private business knowledge assistant. Your documents indexed locally, answered by a local LLM, exported as PDF or DOCX. No cloud.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%2F11-0078d6.svg)](#system-requirements)
[![Status: Early Access](https://img.shields.io/badge/status-early%20access-c4703c.svg)](#status)

> Built by [TensorSpace LLC](https://tensorspace.net). Released under MIT.

---

## What it is

TensorVault is a desktop application that turns your company's documents into a private AI knowledge base. Drop in your PDFs, contracts, policies, sales playbooks, onboarding docs, RFPs - anything written down. TensorVault indexes them locally with state-of-the-art embeddings, and you can then ask natural-language questions across the whole corpus.

Every part of the stack runs on your computer. There is no cloud, no API key, no telemetry. The application can run with the internet disconnected.

When you ask a question, the answer is grounded in your documents with inline citations. You can then export the answer as a polished PDF or DOCX report with one click.

## Why it exists

Cloud AI services see everything you type. For most businesses that is a real problem: customer data, contracts, internal financials, HR records, source code. SaaS AI tools also charge per seat and per token, which adds up fast.

TensorVault is an alternative for teams who want the practical value of a RAG-powered assistant without the privacy and cost tradeoffs. You run it on your own laptop. Your documents never leave the machine.

## Features (v0.1.0)

- **Document indexing**: PDF, DOCX, TXT, MD, CSV, RTF (clean text PDFs; OCR for scanned PDFs is on the v0.2 roadmap).
- **Semantic search** with GPU-accelerated embeddings (mxbai-embed-large, 1024-dim, served via Ollama).
- **Grounded AI answers** powered by a local LLM (Gemma 4 via Ollama). Every claim cites the document and passage it came from.
- **Business-tuned system prompt**: handles lookup, summarize, compare, draft, and extract patterns.
- **Voice input** via Whisper STT (auto-detects CUDA).
- **PDF and DOCX export**: turn any AI answer into a polished, citation-ready report.
- **Fully offline after first launch.** No telemetry. No accounts. No cloud calls.

## System Requirements

| Component | Minimum | Recommended | Optimal |
| --- | --- | --- | --- |
| OS | Windows 10/11 64-bit | Windows 11 64-bit | Windows 11 64-bit |
| CPU | 4 cores | 8+ cores | 8+ cores |
| RAM | 8 GB | 16 GB | 32 GB |
| GPU | NVIDIA 4 GB VRAM | NVIDIA 8 GB VRAM | NVIDIA 12 GB VRAM (RTX 3060 12GB+) |
| Disk | 15 GB free SSD | 25 GB free SSD | 25 GB free SSD |
| Internet | Required on first launch (~10 GB model download) | same | same |

**Asymmetric GPU/RAM fallback (the perk).** TensorVault uses Ollama for both the LLM and embeddings. Ollama automatically splits the model between GPU VRAM and system RAM based on what is available — a 4 GB card uses all 4 GB and runs the rest on CPU. **The same Gemma 4 model runs on every machine.** Smaller GPUs just see slower inference because layers offload to CPU. At Optimal (12 GB VRAM), the entire LLM lives on the GPU and inference feels real-time.

**First launch downloads ~10 GB:** Gemma 4 (~9.6 GB) and mxbai-embed-large embedder (~770 MB) are pulled by Ollama. After that, the app runs fully offline.

## Install

1. Download the latest signed installer from [Releases](https://github.com/shawnbarnes-lab/tensorvault/releases) - `TensorVault-Setup-X.X.X.exe`.
2. Run the installer. One click, everything bundled.
3. Launch TensorVault from the Start menu or desktop shortcut.
4. Add documents in the **My Docs** tab. Ask questions in the **Ask** tab.

That's the whole onboarding. No accounts. No API keys. No data uploads.

## How it works

```
+--------------------+
| Your documents     |
| (PDF, DOCX, TXT)   |
+----------+---------+
           |
           v
+----------+---------+      +-------------------------+
| Text extraction    |----->| OCR fallback for        |
| (pdfplumber, etc.) |      | scanned PDFs (tesseract)|
+----------+---------+      +-------------------------+
           |
           v
+----------+---------+
| Chunking + BGE     |
| embeddings         |
+----------+---------+
           |
           v
+----------+---------+
| FAISS local index  |
| (SQLite-backed)    |
+----------+---------+
           |
           v
  Your question ---> embed ---> top-K search ---> rerank ---> Gemma 3n LLM
                                                                 |
                                                                 v
                                                       Citation-grounded answer
                                                                 |
                                                                 v
                                                       Export to PDF or DOCX
```

Everything in this diagram runs on your machine.

## Status

**v0.1.0 - Early Access.** The application works end to end: document indexing, semantic search, grounded answers, PDF/DOCX export. It is bundled and signed for Windows.

This release is offered as-is for evaluation and feedback. Suggestions, issues, and pull requests are welcome.

## Building from source

If you want to build TensorVault yourself rather than use the prebuilt installer:

```bash
# Prerequisites: Node.js 20+, Miniconda, Ollama, Git

git clone https://github.com/shawnbarnes-lab/tensorvault.git
cd tensorvault/app

# Set up Python backend environment
conda env create -f backend/environment.yml
conda activate rag

# Install Node deps
npm install

# Pull the LLM and bundle it
scripts\prep_ollama_bundle.bat

# Build the installer
build.bat

# Output: dist/TensorVault-Setup-X.X.X.exe
```

The signed installer release on GitHub is built and signed automatically via [GitHub Actions](.github/workflows/build.yml) on tag push. Azure Trusted Signing is used for the EV-class signature (optional - falls back to unsigned if Azure secrets are not configured).

## Technical stack

| Layer | Stack |
| --- | --- |
| UI | Electron 28 + custom HTML/CSS |
| LLM | Gemma 4 via Ollama (GPU when available) |
| Embeddings | mxbai-embed-large via Ollama (1024-dim, GPU) |
| Vector store | FAISS in-memory (Flat IP, cosine via L2 normalization) |
| Text store | SQLite (WAL mode) |
| STT | faster-whisper (small) — bundled, auto-detects CUDA |
| Backend | Flask (frozen to .exe via PyInstaller) |
| Installer | NSIS via electron-builder |
| Signing | Azure Trusted Signing (optional — falls back to unsigned) |

**On the v0.2 roadmap:** OCR for scanned PDFs (Tesseract bundling), Piper TTS for voice output, cross-encoder reranker, XLSX / email file support, multi-user / shared corpus.

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

TensorVault is built on excellent open-source projects: Electron, Flask, FAISS, sentence-transformers, Ollama, Gemma, faster-whisper, Piper, Tesseract, Poppler, python-docx, fpdf2, and many more. Thank you to their maintainers.

## Contact

- Website: <https://tensorspace.net>
- Maintainer: Shawn Barnes
- Repo: <https://github.com/shawnbarnes-lab/tensorvault>
