// Auto-recap email delivery.
//
// Three methods:
//   - resend:  https://api.resend.com  (CORS-enabled transactional API).
//   - webhook: POST a JSON payload to a user-supplied URL (Make / Zapier / n8n).
//   - mailto:  open the OS mail composer with subject + body prefilled
//              (manual tap; no API key required).
//
// All paths produce the same recap content from the analysis JSON.

export function buildRecap(session) {
  const a = session.analysis || {};
  const title = session.title || a.title || 'Conversation recap';
  const subject = `Recap — ${title}`;
  const lines = [];
  lines.push(`Recap — ${title}`);
  lines.push(`Recorded ${new Date(session.createdAt).toLocaleString()} · ${formatDur(session.durationMs)}`);
  lines.push('');
  if (a.tldr) { lines.push('TL;DR'); lines.push(a.tldr); lines.push(''); }
  if (a.summary) { lines.push('Summary'); lines.push(a.summary); lines.push(''); }
  if (nonEmpty(a.key_points)) {
    lines.push('Key points');
    for (const p of a.key_points) lines.push(`• ${p}`);
    lines.push('');
  }
  if (nonEmpty(a.decisions)) {
    lines.push('Decisions');
    for (const d of a.decisions) lines.push(`• ${d.decision}${d.by ? ` (by ${d.by})` : ''}`);
    lines.push('');
  }
  if (nonEmpty(a.action_items)) {
    lines.push('Action items');
    for (const i of a.action_items) {
      const owner = i.owner && i.owner !== 'unassigned' ? i.owner : '—';
      const due = i.due ? `  [due ${i.due}]` : '';
      lines.push(`• [${owner}] ${i.task}${due}`);
    }
    lines.push('');
  }
  if (nonEmpty(a.follow_ups)) {
    lines.push('Next steps');
    for (const f of a.follow_ups) lines.push(`• ${f}`);
    lines.push('');
  }
  if (nonEmpty(a.open_questions)) {
    lines.push('Open questions');
    for (const q of a.open_questions) lines.push(`• ${q}`);
    lines.push('');
  }
  lines.push('—');
  lines.push('Sent by Quill Companion');

  const text = lines.join('\n');
  const html = textToHtml(text);
  return { subject, text, html };
}

export async function sendRecap(session, settings) {
  const method = settings.emailMethod || 'off';
  if (method === 'off') return { ok: false, reason: 'email disabled' };

  const to = (settings.emailTo || '').trim();
  if (!to) throw new Error('No recipient email configured');

  const recap = buildRecap(session);

  if (method === 'resend') {
    return sendViaResend(to, recap, settings);
  }
  if (method === 'webhook') {
    return sendViaWebhook(to, recap, session, settings);
  }
  if (method === 'mailto') {
    return openMailto(to, recap);
  }
  throw new Error(`Unknown email method: ${method}`);
}

async function sendViaResend(to, recap, settings) {
  const apiKey = settings.resendKey;
  const from = settings.emailFrom;
  if (!apiKey) throw new Error('Resend API key not set');
  if (!from) throw new Error('Verified Resend "from" address not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: recap.subject,
      text: recap.text,
      html: recap.html
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return { ok: true, id: data.id, method: 'resend' };
}

async function sendViaWebhook(to, recap, session, settings) {
  const url = settings.emailWebhook;
  if (!url) throw new Error('Webhook URL not set');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      to,
      subject: recap.subject,
      text: recap.text,
      html: recap.html,
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        durationMs: session.durationMs,
        analysis: session.analysis
      }
    })
  });
  if (!res.ok) throw new Error(`Webhook ${res.status}`);
  return { ok: true, method: 'webhook' };
}

function openMailto(to, recap) {
  const params = new URLSearchParams({
    subject: recap.subject,
    body: recap.text
  });
  // mailto's subject and body must be encoded with %20, not '+'
  const href = `mailto:${encodeURIComponent(to)}?` + params.toString().replace(/\+/g, '%20');
  // Most browsers honor a programmatic location change for mailto:.
  window.location.href = href;
  return { ok: true, method: 'mailto' };
}

function textToHtml(text) {
  const escape = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const blocks = text.split(/\n\n+/).map((b) => {
    const escaped = escape(b);
    if (b.split('\n').every((l) => /^[•\-]/.test(l) || l === '')) {
      const items = b.split('\n').filter(Boolean).map((l) => `<li>${escape(l.replace(/^[•\-]\s*/, ''))}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#222;max-width:640px">${blocks.join('')}</div>`;
}

function nonEmpty(v) { return Array.isArray(v) && v.length > 0; }
function formatDur(ms) {
  if (!ms) return 'unknown duration';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
