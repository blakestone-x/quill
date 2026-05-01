// Render a session as a Quill-compatible markdown note.
//
// Quill expects markdown with YAML frontmatter, stored as one .md file per
// note in %APPDATA%/Quill/notes/{id}.md. Frontmatter keys Quill reads:
//   id, title, created, updated, kind, source, color, pinned, tags
// We add a few extra keys (companion-specific) prefixed with `conv_` — Quill's
// frontmatter parser keeps unknown keys as-is, so they round-trip safely.

const QUILL_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function quillId(seed) {
  // Quill's safeId() requires [a-zA-Z0-9_-]. Map anything else to '-'.
  const cleaned = String(seed).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
  if (cleaned && QUILL_ID_RE.test(cleaned)) return cleaned;
  // Fallback: timestamp-based id
  return 'conv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function buildQuillMarkdown(session) {
  const id = session.quillId || quillId(session.id);
  const title = session.title || session.analysis?.title || 'Conversation';
  const created = new Date(session.createdAt).toISOString();
  const updated = new Date(session.updatedAt || session.createdAt).toISOString();

  const tags = uniq([
    ...(session.tags || []),
    'conversation',
    'companion'
  ]);

  const frontmatter = {
    id,
    title,
    created,
    updated,
    kind: 'note',
    source: 'companion',
    color: '#dcb05a',
    tags,
    conv_duration_sec: Math.round((session.durationMs || 0) / 1000),
    conv_speakers: Object.values(session.transcript?.speakerMap || {}),
    conv_model: session.model || null,
    conv_session_id: session.id
  };

  const body = renderBody(session);
  return { id, frontmatter, markdown: buildMarkdown(frontmatter, body), filename: `${id}.md` };
}

function renderBody(session) {
  const a = session.analysis || {};
  const t = session.transcript || {};
  const out = [];

  out.push(`# ${session.title || a.title || 'Conversation'}`);
  out.push('');
  out.push(`> Recorded ${new Date(session.createdAt).toLocaleString()} · ${formatDur(session.durationMs)} · ${(t.speakers || []).length || 'unknown'} speakers`);
  out.push('');

  if (a.tldr) {
    out.push('## TL;DR');
    out.push('');
    out.push(a.tldr);
    out.push('');
  }

  if (a.summary) {
    out.push('## Summary');
    out.push('');
    out.push(a.summary);
    out.push('');
  }

  if (nonEmpty(a.key_points)) {
    out.push('## Key points');
    out.push('');
    for (const p of a.key_points) out.push(`- ${p}`);
    out.push('');
  }

  if (nonEmpty(a.decisions)) {
    out.push('## Decisions');
    out.push('');
    for (const d of a.decisions) {
      const by = d.by ? ` _(by ${d.by})_` : '';
      out.push(`- **${d.decision}**${by}${d.context ? ` — ${d.context}` : ''}`);
    }
    out.push('');
  }

  if (nonEmpty(a.action_items)) {
    out.push('## Action items');
    out.push('');
    for (const item of a.action_items) {
      const owner = item.owner && item.owner !== 'unassigned' ? `**${item.owner}**` : '_unassigned_';
      const due = item.due ? ` _(due ${item.due})_` : '';
      const conf = item.confidence === 'low' ? ' ⚠️' : '';
      out.push(`- [ ] ${owner} — ${item.task}${due}${conf}`);
    }
    out.push('');
  }

  if (nonEmpty(a.open_questions)) {
    out.push('## Open questions');
    out.push('');
    for (const q of a.open_questions) out.push(`- ${q}`);
    out.push('');
  }

  if (nonEmpty(a.follow_ups)) {
    out.push('## Next steps');
    out.push('');
    for (const f of a.follow_ups) out.push(`- ${f}`);
    out.push('');
  }

  if (nonEmpty(a.key_quotes)) {
    out.push('## Key quotes');
    out.push('');
    for (const q of a.key_quotes) {
      out.push(`> "${q.quote}" — **${q.speaker}**`);
      if (q.why) out.push(`> _${q.why}_`);
      out.push('');
    }
  }

  if (nonEmpty(a.outline)) {
    out.push('## Outline');
    out.push('');
    for (const sec of a.outline) {
      out.push(`### ${sec.heading}`);
      out.push('');
      for (const b of sec.bullets || []) out.push(`- ${b}`);
      out.push('');
    }
  }

  if (a.entities && Object.keys(a.entities).length > 0) {
    out.push('## Entities');
    out.push('');
    for (const [k, v] of Object.entries(a.entities)) {
      if (Array.isArray(v) && v.length > 0) out.push(`- **${cap(k)}:** ${v.join(', ')}`);
    }
    out.push('');
  }

  if (nonEmpty(a.sentiment_by_speaker)) {
    out.push('## Sentiment');
    out.push('');
    for (const s of a.sentiment_by_speaker) {
      out.push(`- **${s.speaker}** — ${s.tone}${s.notes ? `. ${s.notes}` : ''}`);
    }
    out.push('');
  }

  if (nonEmpty(a.risks)) {
    out.push('## Risks / watch-outs');
    out.push('');
    for (const r of a.risks) out.push(`- ${r}`);
    out.push('');
  }

  if (nonEmpty(t.utterances)) {
    out.push('## Transcript');
    out.push('');
    for (const u of t.utterances) {
      const who = u.speakerName || `Speaker ${u.speaker}`;
      const ts = formatTs(u.start);
      out.push(`**${who}** _(${ts})_: ${u.text}`);
      out.push('');
    }
  }

  return out.join('\n');
}

// ── Helpers ──

function buildMarkdown(meta, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    lines.push(`${k}: ${yamlValue(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body;
}

function yamlValue(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => yamlValue(x)).join(', ')}]`;
  const s = String(v);
  if (/[:#\[\]{}&*!|>%@`,]/.test(s) || s.includes('\n')) return JSON.stringify(s);
  return s;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}
function nonEmpty(v) { return Array.isArray(v) && v.length > 0; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function formatTs(ms) {
  if (!ms && ms !== 0) return '';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function formatDur(ms) {
  if (!ms) return 'unknown duration';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Trigger a download of the markdown so user can drop it into %APPDATA%/Quill/notes/
export function downloadQuillNote(session) {
  const { markdown, filename } = buildQuillMarkdown(session);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  return filename;
}

// Use the Web Share API where available so the user can AirDrop / send the
// note straight to their desktop. Falls back to download.
export async function shareQuillNote(session) {
  const { markdown, filename, frontmatter } = buildQuillMarkdown(session);
  if (navigator.canShare) {
    const file = new File([markdown], filename, { type: 'text/markdown' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: frontmatter.title, text: 'Quill conversation note' });
        return { method: 'share', filename };
      } catch (e) {
        if (e.name === 'AbortError') return { method: 'cancelled' };
      }
    }
  }
  downloadQuillNote(session);
  return { method: 'download', filename };
}
