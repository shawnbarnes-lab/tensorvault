'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let BACKEND_URL = 'http://127.0.0.1:8712';
let backendReady = false;
let isListening = false;
let recognition = null;
let selectedVoice = null;
let autoRead = false;

// Most-recent completed AI answer, used for PDF / DOCX export.
let lastAnswer = { title: '', body: '', sources: [] };

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const voiceBtn       = $('voice-btn');
const queryInput     = $('query-input');
const kSelect        = $('k-select');
const searchBtn      = $('search-btn');
const resultsArea    = $('results-area');
const listeningBar   = $('listening-bar');
const listeningLabel = $('listening-label');
const stopVoiceBtn   = $('stop-voice-btn');
const uploadZone     = $('upload-zone');
const browseBtn      = $('browse-btn');
const ingestProgress = $('ingest-progress');
const progressBar    = $('progress-bar');
const progressLabel  = $('progress-label');
const docListHeader  = $('doc-list-header');
const docList        = $('doc-list');
const docCountLabel  = $('doc-count-label');
const clearDocsBtn   = $('clear-docs-btn');
const backendDot     = $('backend-dot');
const sidebarStatus  = $('sidebar-status');

// ── Setup overlay refs ───────────────────────────────────────────────────────
const setupOverlay    = $('setup-overlay');
const setupMessage    = $('setup-message');
const setupProgressBar = $('setup-progress-bar');
const setupDetail     = $('setup-detail');

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  BACKEND_URL = await window.tensorvault.getBackendUrl();
  const version = await window.tensorvault.getVersion();
  const dataDir = await window.tensorvault.getDataDir();

  $('app-version').textContent = `v${version}`;
  $('backend-url-val').textContent = BACKEND_URL;
  $('data-dir-val').textContent = dataDir;

  // First-run setup events
  const dataReady = await window.tensorvault.checkDataReady();
  if (!dataReady && setupOverlay) {
    setupOverlay.style.display = 'flex';
  }

  window.tensorvault.onSetupStatus((msg) => {
    if (setupOverlay) setupOverlay.style.display = 'flex';
    if (setupMessage) setupMessage.textContent = msg;
    sidebarStatus.textContent = 'Setting up…';
  });

  window.tensorvault.onSetupProgress((data) => {
    if (setupProgressBar) setupProgressBar.style.width = data.pct + '%';
    if (setupDetail) setupDetail.textContent = `${data.file}: ${data.dlMB} MB / ${data.totalMB} MB (${data.pct}%)`;
  });

  window.tensorvault.onSetupError((msg) => {
    if (setupMessage) setupMessage.textContent = msg;
    if (setupMessage) setupMessage.style.color = '#ef5350';
    if (setupProgressBar) setupProgressBar.style.background = '#ef5350';
  });

  window.tensorvault.onBackendReady(() => {
    backendReady = true;
    if (setupOverlay) setupOverlay.style.display = 'none';
    setDot('ok');
    sidebarStatus.textContent = 'Ready';
    pollHealth();
    loadDocList();
  });

  window.tensorvault.onBackendError((msg) => {
    setDot('error');
    sidebarStatus.textContent = 'Error';
    setStatusChip('status-backend', '● Backend error', 'error');
    console.error('Backend error:', msg);
  });

  initVoice();
  initTabs();
  initSettings();

  // Immediate health poll
  setTimeout(pollHealth, 500);
  setInterval(pollHealth, 8000);
})();

// ── Tabs ──────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'docs') loadDocList();
    });
  });
}

// ── Search ────────────────────────────────────────────────────────────────────
searchBtn.addEventListener('click', () => doSearch(queryInput.value.trim()));
queryInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch(queryInput.value.trim());
});

async function doSearch(query) {
  if (!query) return;
  queryInput.value = query;

  resultsArea.innerHTML = `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <span>Searching ${formatNum()} your documents articles…</span>
    </div>`;

  const k = parseInt(kSelect.value, 10);

  try {
    const res = await fetch(`${BACKEND_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, k }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderResults(data, query);

    setStatusChip('status-time', `${data.search_time_ms}ms`, '');

    if (autoRead && data.results?.length) {
      const top = data.results[0];
      speak(`${top.title}. ${top.text}`);
    }

    // Stream AI answer from Gemma 4 via /ask endpoint
    streamAIAnswer(query, k);
  } catch (err) {
    resultsArea.innerHTML = `<div class="error-msg">Search failed: ${err.message}</div>`;
  }
}

// ── your documents-style rendering helpers ─────────────────────────────────────────

function inlineFmt(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(\d+)\]/g, '<span class="cite">[$1]</span>');
}

function miniMarkdown(text) {
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = text.split(/\n{2,}/);
  return blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('#### ')) return `<h4 class="wiki-h4">${inlineFmt(block.slice(5))}</h4>`;
    if (block.startsWith('### '))  return `<h4 class="wiki-h4">${inlineFmt(block.slice(4))}</h4>`;
    if (block.startsWith('## '))   return `<h3 class="wiki-h3">${inlineFmt(block.slice(3))}</h3>`;
    if (block.startsWith('# '))    return `<h2 class="wiki-h2">${inlineFmt(block.slice(2))}</h2>`;
    const lines = block.split('\n');
    if (lines.length > 0 && lines.every(l => /^[-•*]\s/.test(l.trim()) || !l.trim())) {
      return '<ul class="wiki-ul">' +
        lines.filter(l => l.trim()).map(l =>
          `<li>${inlineFmt(l.trim().replace(/^[-•*]\s+/, ''))}</li>`
        ).join('') + '</ul>';
    }
    return `<p>${inlineFmt(block.replace(/\n/g, '<br>'))}</p>`;
  }).join('');
}

function parseSourceSegments(raw) {
  const tagRe = /\[\[(\/?)([wugn])\]\]/g;
  const segments = [];
  let lastIdx = 0;
  let currentSource = null;
  let match;
  while ((match = tagRe.exec(raw)) !== null) {
    const before = raw.slice(lastIdx, match.index);
    if (before) segments.push({ text: before, source: currentSource || 'default' });
    if (match[1] === '/') currentSource = null;
    else currentSource = match[2];
    lastIdx = match.index + match[0].length;
  }
  const rest = raw.slice(lastIdx);
  if (rest) segments.push({ text: rest, source: currentSource || 'default' });
  return segments;
}

function renderWikiAnswer(raw) {
  const segments = parseSourceSegments(raw);
  if (!segments.length) return '';
  if (segments.every(s => s.source === 'default')) return miniMarkdown(raw);
  return segments.map(seg => {
    const html = miniMarkdown(seg.text);
    if (seg.source === 'default') return html;
    return `<div class="src-${seg.source}">${html}</div>`;
  }).join('');
}

const SOURCE_LEGEND = `
  <div class="source-legend">
    <span class="legend-item"><span class="legend-dot" style="background:var(--src-wiki)"></span>your documents</span>
    <span class="legend-item"><span class="legend-dot" style="background:var(--src-user)"></span>Your Docs</span>
    <span class="legend-item"><span class="legend-dot" style="background:var(--src-gemma)"></span>AI Knowledge</span>
    <span class="legend-item"><span class="legend-dot" style="background:var(--src-none)"></span>No Sources</span>
  </div>`;

async function streamAIAnswer(query, k) {
  // Hide export bar until we have a fresh complete answer
  const exportBar = $('export-bar');
  if (exportBar) exportBar.style.display = 'none';
  lastAnswer = { title: query, body: '', sources: [] };

  // Insert AI answer card at the top of results
  const aiCard = document.createElement('div');
  aiCard.className = 'result-card ai-answer-card';
  aiCard.innerHTML = `
    <div class="result-top">
      <span class="result-source-badge badge-ai">AI ANSWER</span>
      <div class="result-title">TensorVault</div>
    </div>
    <div class="ai-answer-text"><span class="spinner-inline"></span> Thinking…</div>
  `;
  resultsArea.prepend(aiCard);
  const answerEl = aiCard.querySelector('.ai-answer-text');

  try {
    const res = await fetch(`${BACKEND_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, k }),
    });

    if (!res.ok) {
      answerEl.textContent = `Error: ${res.status}`;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let answer = '';
    let renderTimer = null;

    const scheduleRender = () => {
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        answerEl.innerHTML = renderWikiAnswer(answer);
      }, 60);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.type === 'thinking') continue;
          if (d.type === 'sources') {
            lastAnswer.sources = d.sources || [];
            continue;
          }
          if (d.type === 'answer') {
            answer += d.token;
            scheduleRender();
          }
          if (d.type === 'done') continue;
          if (d.type === 'error') {
            answerEl.innerHTML = renderWikiAnswer(answer) || esc(d.message);
          }
        } catch (e) { /* skip malformed lines */ }
      }
    }

    clearTimeout(renderTimer);
    if (answer) {
      answerEl.innerHTML = renderWikiAnswer(answer) + SOURCE_LEGEND;
      // Capture state for PDF / DOCX export and reveal the export bar.
      lastAnswer.body = answer;
      const eb = $('export-bar');
      if (eb) eb.style.display = 'flex';
    } else {
      answerEl.textContent = 'No AI answer generated.';
    }
  } catch (err) {
    answerEl.textContent = `AI answer failed: ${err.message}`;
  }
}

// ── Export current answer as PDF / DOCX ──────────────────────────────────────
async function exportAnswer(format /* 'pdf' | 'docx' */) {
  if (!lastAnswer.body) return;
  try {
    const res = await fetch(`${BACKEND_URL}/export/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:   lastAnswer.title || 'TensorVault Report',
        body:    lastAnswer.body,
        sources: lastAnswer.sources,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Export failed: ${err.error || res.statusText}`);
      return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const safe = (lastAnswer.title || 'report')
      .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'report';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.${format}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  } catch (e) {
    alert(`Export failed: ${e.message}`);
  }
}

function renderResults(data, query) {
  const results = data.results || [];
  if (!results.length) {
    resultsArea.innerHTML = `<div class="welcome"><p>No results found for "<strong>${esc(query)}</strong>"</p></div>`;
    return;
  }

  resultsArea.innerHTML = '';
  results.forEach((r, i) => {
    const isUser = r.source === 'user';
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-top">
        <span class="result-source-badge ${isUser ? 'badge-user' : 'badge-wiki'}">${isUser ? 'YOUR DOC' : 'YOUR DOCUMENTS'}</span>
        <div class="result-title">${esc(r.title || 'Result')}</div>
        <div class="result-actions">
          <button class="result-icon-btn speak-btn" title="Read aloud" data-idx="${i}">
            <svg viewBox="0 0 24 24"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54,8.46a5,5,0,0,1,0,7.07"/><path d="M19.07,4.93a10,10,0,0,1,0,14.14"/></svg>
          </button>
          <button class="result-icon-btn copy-btn" title="Copy text" data-text="${esc(r.text || '')}">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5,15H4a2,2,0,0,1-2-2V4A2,2,0,0,1,4,2H13a2,2,0,0,1,2,2V5"/></svg>
          </button>
        </div>
      </div>
      <div class="result-text">${esc(r.text || '')}</div>
      <div class="result-score">rerank: ${r.rerank_score?.toFixed(4) ?? '—'}  ·  faiss: ${r.score?.toFixed(4) ?? '—'}</div>
    `;
    resultsArea.appendChild(card);
  });

  // Attach button handlers
  resultsArea.querySelectorAll('.speak-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = results[parseInt(btn.dataset.idx, 10)];
      speak(`${r.title}. ${r.text}`);
    });
  });
  resultsArea.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.text).catch(() => {});
      btn.style.color = 'var(--green)';
      setTimeout(() => btn.style.color = '', 1200);
    });
  });
}

function formatNum() {
  // Will be filled from health data; show static fallback
  return window._wikiSize ? window._wikiSize.toLocaleString() : '21,000,000+';
}

// ── Voice ─────────────────────────────────────────────────────────────────────
function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceBtn.disabled = true;
    setStatusChip('status-voice', 'Voice: unavailable', 'warn');
    return;
  }

  setStatusChip('status-voice', 'Voice: ready', '');

  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    voiceBtn.classList.add('listening');
    listeningBar.style.display = 'flex';
    setStatusChip('status-voice', 'Voice: listening', 'warn');
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    queryInput.value = transcript;
    listeningLabel.textContent = `"${transcript}"`;
    if (e.results[e.results.length - 1].isFinal) {
      stopListening();
      doSearch(transcript);
    }
  };

  recognition.onerror = (e) => {
    stopListening();
    setStatusChip('status-voice', `Voice: ${e.error}`, 'error');
  };

  recognition.onend = () => stopListening();

  voiceBtn.addEventListener('click', () => {
    if (isListening) stopListening();
    else startListening();
  });

  stopVoiceBtn.addEventListener('click', stopListening);

  // Load TTS voices
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function startListening() {
  if (!recognition || isListening) return;
  try { recognition.start(); } catch (e) { console.warn('recognition.start:', e); }
}

function stopListening() {
  isListening = false;
  voiceBtn.classList.remove('listening');
  listeningBar.style.display = 'none';
  listeningLabel.textContent = 'Listening…';
  setStatusChip('status-voice', 'Voice: ready', '');
  try { recognition?.stop(); } catch (e) {}
}

function loadVoices() {
  const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  const sel = $('voice-select');
  sel.innerHTML = '';
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.default) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    selectedVoice = speechSynthesis.getVoices().find(v => v.name === sel.value) || null;
  });
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text.slice(0, 2000));
  utt.rate = parseFloat($('voice-rate')?.value || '0.95');
  if (selectedVoice) utt.voice = selectedVoice;
  speechSynthesis.speak(utt);
}

// ── Document ingestion ────────────────────────────────────────────────────────
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', async e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) ingestFiles(files);
});

uploadZone.addEventListener('click', () => browseBtn.click());
browseBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const paths = await window.tensorvault.openFileDialog();
  if (paths.length) ingestPaths(paths);
});

async function ingestPaths(filePaths) {
  setProgress(true, 'Reading files…', 5);
  let done = 0;
  for (const fp of filePaths) {
    const name = fp.split(/[\\/]/).pop();
    setProgress(true, `Processing ${name}…`, 10 + (done / filePaths.length) * 85);
    try {
      const res = await fetch(`${BACKEND_URL}/ingest_path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
    } catch (err) {
      console.error('Ingest error:', err);
    }
    done++;
  }
  setProgress(false);
  loadDocList();
}

async function ingestFiles(files) {
  for (const file of files) {
    setProgress(true, `Processing ${file.name}…`, 30);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${BACKEND_URL}/ingest`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
    } catch (err) {
      console.error('Ingest error:', err);
    }
  }
  setProgress(false);
  loadDocList();
}

async function loadDocList() {
  try {
    const res = await fetch(`${BACKEND_URL}/docs`);
    if (!res.ok) return;
    const data = await res.json();
    const docs = data.docs || [];

    setStatusChip('status-docs', `My Docs: ${docs.length}`, '');
    docCountLabel.textContent = `${docs.length} document${docs.length !== 1 ? 's' : ''}`;
    docListHeader.style.display = docs.length ? 'flex' : 'none';

    docList.innerHTML = '';
    docs.forEach(doc => {
      const row = document.createElement('div');
      row.className = 'doc-item';
      row.innerHTML = `
        <span class="doc-item-icon">📄</span>
        <span class="doc-item-name" title="${esc(doc.path || doc.name)}">${esc(doc.name)}</span>
        <span class="doc-item-meta">${doc.chunks} chunks</span>
        <button class="doc-item-del" data-name="${esc(doc.name)}" title="Remove">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      docList.appendChild(row);
    });

    docList.querySelectorAll('.doc-item-del').forEach(btn => {
      btn.addEventListener('click', () => deleteDoc(btn.dataset.name));
    });
  } catch (e) {
    console.warn('loadDocList:', e);
  }
}

async function deleteDoc(name) {
  try {
    await fetch(`${BACKEND_URL}/docs/${encodeURIComponent(name)}`, { method: 'DELETE' });
    loadDocList();
  } catch (e) { console.warn('deleteDoc:', e); }
}

clearDocsBtn.addEventListener('click', async () => {
  if (!confirm('Remove all your documents from TensorVault? (your documents is unaffected)')) return;
  try {
    await fetch(`${BACKEND_URL}/docs`, { method: 'DELETE' });
    loadDocList();
  } catch (e) { console.warn('clearDocs:', e); }
});

function setProgress(show, label = '', pct = 0) {
  ingestProgress.style.display = show ? 'block' : 'none';
  progressLabel.textContent = label;
  progressBar.style.width = `${pct}%`;
}

// ── Settings ──────────────────────────────────────────────────────────────────
function initSettings() {
  const openDataBtn = $('open-data-btn');
  if (openDataBtn) {
    openDataBtn.addEventListener('click', () => window.tensorvault.openDataFolder());
  }

  const rateInput = $('voice-rate');
  const rateLabel = $('voice-rate-label');
  if (rateInput && rateLabel) {
    rateInput.addEventListener('input', () => {
      rateLabel.textContent = `${parseFloat(rateInput.value).toFixed(2)}×`;
    });
  }

  const autoReadToggle = $('auto-read-toggle');
  if (autoReadToggle) {
    autoReadToggle.addEventListener('change', e => { autoRead = e.target.checked; });
  }

  const testVoiceBtn = $('test-voice-btn');
  if (testVoiceBtn) {
    testVoiceBtn.addEventListener('click', () => {
      speak('TensorVault is ready.');
    });
  }

  // Export buttons (shown only after an AI answer is complete).
  const exportPdfBtn  = $('export-pdf-btn');
  const exportDocxBtn = $('export-docx-btn');
  if (exportPdfBtn)  exportPdfBtn.addEventListener('click',  () => exportAnswer('pdf'));
  if (exportDocxBtn) exportDocxBtn.addEventListener('click', () => exportAnswer('docx'));
}

// ── Health polling ─────────────────────────────────────────────────────────────
async function pollHealth() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(res.status);
    const h = await res.json();

    backendReady = true;
    setDot('ok');
    sidebarStatus.textContent = 'Ready';

    const userChunks = h.user_chunks || 0;
    const userDocs   = h.user_docs   || 0;
    setStatusChip('status-backend', '● Backend OK', 'ok');
    const docsChip = $('status-docs');
    if (docsChip) setStatusChip('status-docs', `My Docs: ${userDocs} files · ${userChunks.toLocaleString()} chunks`, 'ok');
  } catch (e) {
    if (backendReady) {
      setDot('error');
      sidebarStatus.textContent = 'Disconnected';
      setStatusChip('status-backend', '● Backend offline', 'error');
    } else {
      setDot('loading');
      sidebarStatus.textContent = 'Loading…';
      setStatusChip('status-backend', '● Starting backend…', 'warn');
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setDot(state) {
  backendDot.className = `backend-dot ${state}`;
}

function setStatusChip(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status-chip${cls ? ' ' + cls : ''}`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
