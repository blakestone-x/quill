// Quill Companion — main app state machine.

import { Recorder, fmtTime, fileExtFor } from './lib/recorder.js';
import { transcribe, applySpeakerNames, transcriptToText } from './lib/transcribe.js';
import { analyze } from './lib/analyze.js';
import {
  saveSession,
  getSession,
  listSessions,
  deleteSession,
  saveAudio,
  getAudio,
  purgeAll,
  storageEstimate
} from './lib/storage.js';
import { buildQuillMarkdown, downloadQuillNote, shareQuillNote, quillId } from './lib/quill.js';
import { sendRecap, buildRecap } from './lib/email.js';
import { Activator } from './lib/activator.js';
import { loadSettings, saveSettings, patchSettings, speakerHintList, tagList } from './lib/settings.js';

// ── State ──
const state = {
  screen: 'record', // record | processing | review | sessions | settings
  recorder: new Recorder(),
  ticker: null,
  currentSession: null,
  activator: null
};
let settings = loadSettings();

// ── DOM cache ──
const $ = (id) => document.getElementById(id);
const screens = {
  record: document.querySelector('[data-screen="record"]'),
  processing: document.querySelector('[data-screen="processing"]'),
  review: document.querySelector('[data-screen="review"]'),
  sessions: document.querySelector('[data-screen="sessions"]'),
  settings: document.querySelector('[data-screen="settings"]')
};

// ── Boot ──
init().catch((e) => {
  console.error('init failed', e);
  toast(e.message || String(e), 'error');
});

async function init() {
  // Service worker — installable + offline shell
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('SW register failed', e);
    }
  }

  bindRecord();
  bindReview();
  bindNav();
  bindSettings();

  // Meter canvas
  setupMeter();

  // Activators
  setupActivator();

  // Sessions list / settings storage info
  await refreshStorageInfo();

  // Deep link handling
  handleDeepLink();
}

// ── Screen helpers ──
function showScreen(name) {
  state.screen = name;
  for (const [k, el] of Object.entries(screens)) {
    if (k === name) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }
  if (name === 'sessions') renderSessions();
  if (name === 'settings') renderSettings();
}

// ── Toast ──
let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.removeAttribute('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.setAttribute('hidden', ''), 3500);
}

// ── Record screen ──
function bindRecord() {
  $('record-btn').addEventListener('click', () => toggleRecord());
  $('pause-btn').addEventListener('click', () => togglePause());
  $('cancel-btn').addEventListener('click', () => cancelRecording());
}

async function toggleRecord() {
  const r = state.recorder;
  if (r.state === 'idle' || r.state === 'stopped') {
    if (r.state === 'stopped') state.recorder = new Recorder();
    await startRecording();
  } else {
    await stopRecordingAndProcess();
  }
}

async function startRecording() {
  try {
    state.recorder = new Recorder();
    state.recorder.onLevel = (peak) => drawMeter(peak);
    await state.recorder.start();
    $('status-dot').className = 'status-dot recording';
    $('status-label').textContent = 'Recording';
    $('record-btn').classList.add('recording');
    $('record-btn').setAttribute('aria-label', 'Stop recording');
    $('pause-btn').hidden = false;
    $('pause-btn').textContent = 'Pause';
    $('cancel-btn').hidden = false;
    $('record-hint').textContent = 'Tap the button to stop and analyze.';
    startTimer();
    if (settings.actHaptic && navigator.vibrate) navigator.vibrate(30);
  } catch (e) {
    toast('Mic permission denied or unsupported: ' + (e.message || e), 'error');
  }
}

function togglePause() {
  const r = state.recorder;
  if (r.state === 'recording') {
    r.pause();
    $('status-dot').className = 'status-dot paused';
    $('status-label').textContent = 'Paused';
    $('pause-btn').textContent = 'Resume';
  } else if (r.state === 'paused') {
    r.resume();
    $('status-dot').className = 'status-dot recording';
    $('status-label').textContent = 'Recording';
    $('pause-btn').textContent = 'Pause';
  }
}

function cancelRecording() {
  state.recorder.cancel();
  stopTimer();
  resetRecordUI();
}

async function stopRecordingAndProcess() {
  stopTimer();
  let result;
  try {
    result = await state.recorder.stop();
  } catch (e) {
    toast('Stop failed: ' + (e.message || e), 'error');
    resetRecordUI();
    return;
  }
  resetRecordUI();
  if (!result || !result.blob || result.blob.size === 0) {
    toast('Empty recording — nothing to analyze', 'error');
    return;
  }
  await processRecording(result);
}

function resetRecordUI() {
  $('status-dot').className = 'status-dot';
  $('status-label').textContent = 'Ready';
  $('timer').textContent = '00:00';
  $('record-btn').classList.remove('recording');
  $('record-btn').setAttribute('aria-label', 'Start recording');
  $('pause-btn').hidden = true;
  $('cancel-btn').hidden = true;
  $('record-hint').textContent = 'Tap to record. Triple-tap anywhere to start hands-free.';
  drawMeter(0);
}

function startTimer() {
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = setInterval(() => {
    $('timer').textContent = fmtTime(state.recorder.elapsed());
  }, 250);
}
function stopTimer() {
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = null;
}

// ── Meter ──
let meterCtx = null;
function setupMeter() {
  const c = $('meter');
  meterCtx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.clientWidth * dpr;
  c.height = c.clientHeight * dpr;
  meterCtx.scale(dpr, dpr);
  drawMeter(0);
}
const meterHist = new Array(64).fill(0);
function drawMeter(level) {
  if (!meterCtx) return;
  meterHist.shift();
  meterHist.push(level);
  const w = $('meter').clientWidth;
  const h = $('meter').clientHeight;
  meterCtx.clearRect(0, 0, w, h);
  const barW = w / meterHist.length;
  for (let i = 0; i < meterHist.length; i++) {
    const v = meterHist[i];
    const bh = Math.max(2, v * h * 0.95);
    const x = i * barW;
    const y = (h - bh) / 2;
    meterCtx.fillStyle = v > 0.6 ? '#d97a8a' : v > 0.3 ? '#dcb05a' : '#4fb3a9';
    meterCtx.fillRect(x + 1, y, barW - 2, bh);
  }
}

// ── Processing ──
async function processRecording({ blob, mime, durationMs }) {
  const id = quillId('conv-' + Date.now());
  const session = {
    id,
    quillId: id,
    title: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    durationMs,
    mime,
    transcript: null,
    analysis: null,
    model: null,
    tags: tagList(settings),
    sizeBytes: blob.size
  };
  state.currentSession = session;

  showScreen('processing');
  setProcessing('Saving audio…', 0.05, '');
  try {
    await saveAudio(id, blob, mime);
  } catch (e) {
    toast('Audio save failed: ' + e.message, 'error');
  }

  // Transcribe (skips gracefully if no key — user can still keep audio).
  if (!settings.assemblyaiKey) {
    setProcessing('No AssemblyAI key — saving audio only', 1, 'Add an AssemblyAI key in Settings to transcribe.');
    session.title = 'Untranscribed conversation';
    await saveSession(session);
    setTimeout(() => {
      state.currentSession = session;
      renderReview();
      showScreen('review');
    }, 800);
    return;
  }

  try {
    setProcessing('Uploading audio…', 0.15, `${(blob.size / 1024 / 1024).toFixed(1)} MB`);
    const transcript = await transcribe(blob, {
      apiKey: settings.assemblyaiKey,
      speakerHints: speakerHintList(settings),
      onProgress: ({ step, detail, pct }) => {
        const labels = {
          upload: 'Uploading audio…',
          queue: 'Queuing transcription…',
          transcribe: 'Transcribing + diarizing…'
        };
        setProcessing(labels[step] || step, pct ?? 0.4, detail || '');
      }
    });
    const named = applySpeakerNames(transcript, speakerHintList(settings));
    session.transcript = named;

    if (settings.anthropicKey) {
      setProcessing('Analyzing with Claude…', 0.85, settings.claudeModel);
      const transcriptText = transcriptToText(named);
      const { analysis, model } = await analyze(transcriptText, {
        apiKey: settings.anthropicKey,
        model: settings.claudeModel,
        speakerHints: speakerHintList(settings),
        durationSec: Math.round(durationMs / 1000),
        when: new Date().toISOString()
      });
      session.analysis = analysis;
      session.model = model;
      session.title = analysis.title || 'Conversation';
    } else {
      setProcessing('No Anthropic key — skipping analysis', 1, 'Add a key in Settings to summarize.');
      session.title = 'Untitled conversation';
    }

    session.updatedAt = Date.now();
    await saveSession(session);

    if (session.analysis && settings.emailAuto && settings.emailMethod !== 'off') {
      setProcessing('Sending recap email…', 0.95, settings.emailTo || '');
      try {
        await sendRecap(session, settings);
        toast('Recap emailed', 'success');
      } catch (e) {
        toast('Email failed: ' + e.message, 'error');
      }
    }

    state.currentSession = session;
    renderReview();
    showScreen('review');
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 'error');
    // Save what we have so the audio isn't lost
    await saveSession(session).catch(() => {});
    state.currentSession = session;
    renderReview();
    showScreen('review');
  }
}

function setProcessing(label, pct, detail) {
  $('processing-step').textContent = label;
  $('processing-bar').style.width = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;
  $('processing-detail').textContent = detail || '';
}
$('processing-cancel').addEventListener('click', () => {
  // Cancellation in flight is best-effort; we just bail back to record.
  showScreen('record');
});

// ── Review ──
function bindReview() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      const which = tab.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach((p) =>
        p.classList.toggle('active', p.dataset.panel === which)
      );
    });
  });
  $('review-title').addEventListener('input', async (e) => {
    if (!state.currentSession) return;
    state.currentSession.title = e.target.value;
    state.currentSession.updatedAt = Date.now();
    await saveSession(state.currentSession);
  });
  $('export-btn').addEventListener('click', async () => {
    if (!state.currentSession) return;
    const result = await shareQuillNote(state.currentSession);
    if (result.method === 'share') toast('Shared. Drop into %APPDATA%\\Quill\\notes\\', 'success');
    else if (result.method === 'download') toast(`Downloaded ${result.filename} — copy to %APPDATA%\\Quill\\notes\\`, 'success');
  });
  $('email-btn').addEventListener('click', async () => {
    if (!state.currentSession) return;
    if (settings.emailMethod === 'off') {
      toast('Email is off — set delivery method in Settings', 'error');
      return;
    }
    if (!settings.emailTo) {
      toast('No recipient set in Settings', 'error');
      return;
    }
    try {
      const r = await sendRecap(state.currentSession, settings);
      toast(r.method === 'mailto' ? 'Mail composer opened' : 'Recap sent', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  $('rename-speakers-btn').addEventListener('click', renameSpeakers);
}

function renderReview() {
  const session = state.currentSession;
  if (!session) return;
  $('review-title').value = session.title || '';
  const speakers = session.transcript?.speakers || [];
  $('review-meta').textContent = [
    new Date(session.createdAt).toLocaleString(),
    formatDur(session.durationMs),
    speakers.length ? `${speakers.length} speaker${speakers.length > 1 ? 's' : ''}` : 'no transcript',
    session.model ? `· ${session.model}` : ''
  ].filter(Boolean).join(' · ');

  renderSummary();
  renderActions();
  renderTranscript();
  renderRaw();
}

function renderSummary() {
  const a = state.currentSession?.analysis;
  const el = $('panel-summary');
  if (!a) {
    el.innerHTML = `<p style="color:var(--ink-faint)">No analysis yet. Add an Anthropic API key in Settings and re-run.</p>`;
    return;
  }
  const html = [];
  if (a.tldr) html.push(`<h3>TL;DR</h3><p>${esc(a.tldr)}</p>`);
  if (a.summary) html.push(`<h3>Summary</h3><p>${esc(a.summary)}</p>`);
  if (nonEmpty(a.key_points)) {
    html.push('<h3>Key points</h3><ul>');
    for (const p of a.key_points) html.push(`<li>${esc(p)}</li>`);
    html.push('</ul>');
  }
  if (nonEmpty(a.decisions)) {
    html.push('<h3>Decisions</h3><ul>');
    for (const d of a.decisions) {
      const by = d.by ? ` <em>(by ${esc(d.by)})</em>` : '';
      html.push(`<li><strong>${esc(d.decision)}</strong>${by}${d.context ? ` — ${esc(d.context)}` : ''}</li>`);
    }
    html.push('</ul>');
  }
  if (nonEmpty(a.key_quotes)) {
    html.push('<h3>Key quotes</h3>');
    for (const q of a.key_quotes) {
      html.push(`<blockquote style="border-left:3px solid var(--amber); margin:8px 0; padding:4px 12px; color:var(--ink-dim)">"${esc(q.quote)}"<br><small>— ${esc(q.speaker)}${q.why ? ` · ${esc(q.why)}` : ''}</small></blockquote>`);
    }
  }
  if (nonEmpty(a.topics)) html.push(`<h3>Topics</h3><p>${a.topics.map(esc).join(' · ')}</p>`);
  el.innerHTML = html.join('\n');
}

function renderActions() {
  const a = state.currentSession?.analysis;
  const el = $('panel-actions');
  if (!a) { el.innerHTML = '<p style="color:var(--ink-faint)">No analysis.</p>'; return; }
  const html = [];
  if (nonEmpty(a.action_items)) {
    html.push('<h3>Action items</h3>');
    for (const i of a.action_items) {
      const owner = i.owner && i.owner !== 'unassigned' ? esc(i.owner) : 'unassigned';
      const due = i.due ? `<span class="due">due ${esc(i.due)}</span>` : '<span class="due"></span>';
      html.push(`<div class="action-item"><span class="owner">${owner}</span><span class="task">${esc(i.task)}</span>${due}</div>`);
    }
  } else {
    html.push('<p style="color:var(--ink-faint)">No action items detected.</p>');
  }
  if (nonEmpty(a.follow_ups)) {
    html.push('<h3>Next steps</h3><ul>');
    for (const f of a.follow_ups) html.push(`<li>${esc(f)}</li>`);
    html.push('</ul>');
  }
  if (nonEmpty(a.open_questions)) {
    html.push('<h3>Open questions</h3><ul>');
    for (const q of a.open_questions) html.push(`<li>${esc(q)}</li>`);
    html.push('</ul>');
  }
  if (nonEmpty(a.risks)) {
    html.push('<h3>Risks</h3><ul>');
    for (const r of a.risks) html.push(`<li>${esc(r)}</li>`);
    html.push('</ul>');
  }
  el.innerHTML = html.join('\n');
}

function renderTranscript() {
  const t = state.currentSession?.transcript;
  const el = $('panel-transcript');
  if (!t || !t.utterances?.length) {
    el.innerHTML = '<p style="color:var(--ink-faint)">No transcript.</p>';
    return;
  }
  const html = [];
  for (const u of t.utterances) {
    const who = u.speakerName || `Speaker ${u.speaker}`;
    html.push(`<div class="utterance"><div class="who">${esc(who)}<span class="ts">${formatTs(u.start)}</span></div><div class="what">${esc(u.text)}</div></div>`);
  }
  el.innerHTML = html.join('\n');
}

function renderRaw() {
  const session = state.currentSession;
  const el = $('panel-raw');
  if (!session) { el.textContent = ''; return; }
  const { markdown } = buildQuillMarkdown(session);
  el.textContent = markdown;
}

async function renameSpeakers() {
  const session = state.currentSession;
  if (!session?.transcript?.speakers?.length) {
    toast('No speakers to rename', 'error');
    return;
  }
  const map = { ...(session.transcript.speakerMap || {}) };
  for (const id of session.transcript.speakers) {
    const current = map[id] || `Speaker ${id}`;
    const next = prompt(`Name for ${current}?`, current === `Speaker ${id}` ? '' : current);
    if (next === null) return;
    if (next.trim()) map[id] = next.trim();
  }
  session.transcript.speakerMap = map;
  session.transcript.utterances = session.transcript.utterances.map((u) => ({
    ...u,
    speakerName: map[u.speaker] || `Speaker ${u.speaker}`
  }));
  session.updatedAt = Date.now();
  await saveSession(session);
  renderReview();
}

// ── Sessions ──
async function renderSessions() {
  const el = $('sessions-list');
  const sessions = await listSessions();
  if (sessions.length === 0) {
    el.innerHTML = '<div class="empty-state">No conversations yet. Tap the record button to start.</div>';
    return;
  }
  el.innerHTML = '';
  for (const s of sessions) {
    const card = document.createElement('div');
    card.className = 'session-card';
    const speakers = s.transcript?.speakers?.length || 0;
    card.innerHTML = `
      <div>
        <div class="session-title">${esc(s.title || 'Untitled')}</div>
        <div class="session-meta">${new Date(s.createdAt).toLocaleString()} · ${formatDur(s.durationMs)}${speakers ? ` · ${speakers} speakers` : ''}</div>
      </div>
      <div class="session-actions">
        <button class="btn btn-ghost" data-act="open">Open</button>
        <button class="btn btn-ghost" data-act="export">Export</button>
        <button class="btn btn-ghost" data-act="delete">×</button>
      </div>`;
    card.querySelector('[data-act="open"]').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      state.currentSession = await getSession(s.id);
      renderReview();
      showScreen('review');
    });
    card.querySelector('[data-act="export"]').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const full = await getSession(s.id);
      shareQuillNote(full);
    });
    card.querySelector('[data-act="delete"]').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm(`Delete "${s.title || 'Untitled'}"?`)) return;
      await deleteSession(s.id);
      renderSessions();
    });
    card.addEventListener('click', async () => {
      state.currentSession = await getSession(s.id);
      renderReview();
      showScreen('review');
    });
    el.appendChild(card);
  }
}

// ── Settings ──
function bindSettings() {
  const fields = [
    ['key-assemblyai', 'assemblyaiKey'],
    ['key-anthropic', 'anthropicKey'],
    ['email-to', 'emailTo'],
    ['email-method', 'emailMethod'],
    ['key-resend', 'resendKey'],
    ['email-from', 'emailFrom'],
    ['email-webhook', 'emailWebhook'],
    ['claude-model', 'claudeModel'],
    ['speaker-hints', 'speakerHints'],
    ['default-tags', 'defaultTags']
  ];
  for (const [id, key] of fields) {
    $(id).addEventListener('change', (e) => {
      settings = patchSettings({ [key]: e.target.value });
      reactToSettingChange(key);
    });
    $(id).addEventListener('input', (e) => {
      settings = patchSettings({ [key]: e.target.value });
      reactToSettingChange(key);
    });
  }
  const checkboxes = [
    ['email-auto', 'emailAuto'],
    ['act-tap', 'actTap'],
    ['act-shake', 'actShake'],
    ['act-volume', 'actVolume'],
    ['act-deeplink-autostart', 'actDeeplinkAutostart'],
    ['act-haptic', 'actHaptic']
  ];
  for (const [id, key] of checkboxes) {
    $(id).addEventListener('change', (e) => {
      settings = patchSettings({ [key]: e.target.checked });
      reactToSettingChange(key);
    });
  }
  $('purge-btn').addEventListener('click', async () => {
    if (!confirm('Delete every recorded session and audio file? Cannot be undone.')) return;
    await purgeAll();
    toast('All sessions purged', 'success');
    refreshStorageInfo();
  });
}

function renderSettings() {
  // Reflect saved values into the inputs.
  $('key-assemblyai').value = settings.assemblyaiKey;
  $('key-anthropic').value = settings.anthropicKey;
  $('email-to').value = settings.emailTo;
  $('email-method').value = settings.emailMethod;
  $('key-resend').value = settings.resendKey;
  $('email-from').value = settings.emailFrom;
  $('email-webhook').value = settings.emailWebhook;
  $('claude-model').value = settings.claudeModel;
  $('speaker-hints').value = settings.speakerHints;
  $('default-tags').value = settings.defaultTags;
  $('email-auto').checked = !!settings.emailAuto;
  $('act-tap').checked = !!settings.actTap;
  $('act-shake').checked = !!settings.actShake;
  $('act-volume').checked = !!settings.actVolume;
  $('act-deeplink-autostart').checked = !!settings.actDeeplinkAutostart;
  $('act-haptic').checked = !!settings.actHaptic;

  // Reveal method-specific fields
  document.querySelectorAll('[data-method-show]').forEach((el) => {
    el.style.display = el.dataset.methodShow === settings.emailMethod ? '' : 'none';
  });

  // Show the deep link the user can wire into Shortcuts/Tasker
  $('deep-link-display').textContent = `${location.origin}${location.pathname}?action=start`;

  refreshStorageInfo();
}

function reactToSettingChange(key) {
  if (key.startsWith('act')) setupActivator();
  if (key === 'emailMethod') {
    document.querySelectorAll('[data-method-show]').forEach((el) => {
      el.style.display = el.dataset.methodShow === settings.emailMethod ? '' : 'none';
    });
  }
}

async function refreshStorageInfo() {
  const detail = $('storage-detail');
  if (!detail) return;
  const sessions = await listSessions();
  let bytes = 0;
  for (const s of sessions) bytes += s.sizeBytes || 0;
  let extra = '';
  const est = await storageEstimate();
  if (est) {
    extra = ` · device quota ${(est.usage / 1024 / 1024).toFixed(1)} / ${(est.quota / 1024 / 1024).toFixed(0)} MB`;
  }
  detail.textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${(bytes / 1024 / 1024).toFixed(1)} MB audio${extra}`;
}

// ── Nav ──
function bindNav() {
  $('nav-sessions').addEventListener('click', () => showScreen(state.screen === 'sessions' ? 'record' : 'sessions'));
  $('nav-settings').addEventListener('click', () => showScreen(state.screen === 'settings' ? 'record' : 'settings'));
}

// ── Activators ──
function setupActivator() {
  if (state.activator) state.activator.uninstall();
  state.activator = new Activator({
    settings,
    onTrigger: (reason) => {
      if (state.screen !== 'record') showScreen('record');
      if (state.recorder.state === 'idle' || state.recorder.state === 'stopped') {
        startRecording();
        toast(`Recording started (${reason})`, 'success');
      }
    },
    hapticOn: settings.actHaptic
  });
  state.activator.install();
}

function handleDeepLink() {
  const url = new URL(location.href);
  const action = url.searchParams.get('action');
  if (action === 'start' || action === 'record') {
    if (settings.actDeeplinkAutostart) {
      // Wait for the next tick so init UI renders first
      setTimeout(() => {
        if (state.recorder.state === 'idle') startRecording();
      }, 200);
    }
  } else if (action === 'sessions') {
    showScreen('sessions');
  } else if (action === 'settings') {
    showScreen('settings');
  }
}

// ── Tiny utils ──
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function nonEmpty(v) { return Array.isArray(v) && v.length > 0; }
function formatTs(ms) {
  if (!ms && ms !== 0) return '';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function formatDur(ms) {
  if (!ms) return 'unknown';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
