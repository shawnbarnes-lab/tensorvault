# TensorVault v0.1.0 — Early Access

Private business knowledge assistant by [TensorSpace LLC](https://tensorspace.net). Your documents indexed locally, answered by a local LLM, exported as PDF or DOCX. No cloud, no API keys, no telemetry.

---

## ⚠️ System Requirements — read before downloading

| Component | Minimum | Recommended | Optimal |
| --- | --- | --- | --- |
| OS | Windows 10/11 64-bit | Windows 11 64-bit | Windows 11 64-bit |
| CPU | 4 cores | 8+ cores | 8+ cores |
| RAM | 8 GB | 16 GB | 32 GB |
| GPU | NVIDIA 4 GB VRAM | NVIDIA 8 GB VRAM | NVIDIA 12 GB VRAM (RTX 3060 12GB+) |
| Disk | 15 GB free SSD | 25 GB free SSD | 25 GB free SSD |
| Internet | Required on first launch (~10 GB model download) | same | same |

**Asymmetric GPU/RAM fallback (the perk).** TensorVault uses Ollama for both the LLM and embeddings. Ollama automatically splits the model between GPU VRAM and system RAM based on what is available — a 4 GB card uses all 4 GB and runs the rest on CPU. **Same Gemma 4 model runs on every machine.** Smaller GPUs just see slower inference because layers offload to CPU. At Optimal (12 GB VRAM), the entire LLM lives on the GPU and inference feels real-time.

**Important:** The installer itself is ~1.7 GB. On first launch, TensorVault downloads ~10 GB of models (Gemma 4 LLM + mxbai-embed-large embedder) via Ollama. **First launch requires internet.** After that, the app runs fully offline.

---

## Installation

1. Download `TensorVault-Setup-0.1.0.exe` from the Assets below.
2. Run the installer.
3. **SmartScreen prompt** — click "More info" → "Run anyway". (v0.1.0 ships unsigned; signed builds tracked for v0.1.1 via SignPath Foundation.)
4. Launch TensorVault from the Start Menu.
5. **Wait 10-30 minutes** on first launch while the LLM + embedding models download. Status bar shows live progress.
6. Click **My Docs** to add your business documents.
7. Click **Ask** to ask questions across your documents.

`README.md` and `LICENSE` are attached as separate files below for offline reference.

---

## What's in v0.1.0

- **Document indexing**: PDF, DOCX, TXT, MD, CSV, RTF (clean text PDFs work; OCR is on the v0.2 roadmap).
- **Semantic search** with GPU-accelerated embeddings (mxbai-embed-large via Ollama, 1024-dim).
- **Grounded AI answers** with inline citations, powered by Gemma 4. Auto-falls back to CPU on low-VRAM machines.
- **Business-tuned system prompt** that handles lookup, summarize, compare, draft, and extract patterns.
- **PDF and DOCX export** of any answer with citations.
- **Voice input** via Whisper (auto-detects CUDA).
- **Fully offline** after first-launch model downloads. No telemetry. No accounts.

## What's NOT in v0.1.0 (planned for v0.2)

- **OCR for scanned PDFs** — Tesseract not bundled. Text-based PDFs work fine.
- **Voice output / read-aloud** — Piper TTS not bundled. Voice input still works.
- **Signed installer** — SignPath Foundation application in progress.
- **Reranker** — cross-encoder was dropped to stay under GitHub's 2 GB asset cap; v0.2 may add LLM-based reranking via Ollama.
- **Multi-user / shared corpus** — single-user only for now.

## Where your data lives

- **Indexed documents**: `%APPDATA%\TensorVault\user_docs\`
- **Ollama model cache**: `%APPDATA%\TensorVault\ollama_models\`
- **Nothing ever leaves your computer** after the first-launch downloads complete.

---

MIT licensed. Source: <https://github.com/shawnbarnes-lab/tensorvault>
Published by [TensorSpace LLC](https://tensorspace.net).
