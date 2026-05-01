// Claude analysis of a diarized transcript.
//
// Calls /v1/messages directly from the browser using the
// `anthropic-dangerous-direct-browser-access` header. The system prompt is
// marked with `cache_control: { type: "ephemeral" }` so repeat analyses
// against the same prompt template benefit from prompt caching.
//
// Returns a structured object — summary, decisions, action items, key quotes,
// topics, sentiment-by-speaker, follow-up questions, and a structured outline
// that gets rendered into the Quill markdown export.

const ANTHROPIC_VERSION = '2023-06-01';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are the analysis engine for Quill Companion, a phone app that records and summarizes real-world conversations.

You receive a diarized transcript (multiple speakers, labeled). Your job is to produce a high-signal, structured analysis the user can act on quickly.

# Output contract

Respond with a SINGLE JSON object inside a fenced \`\`\`json block, with NO commentary outside the fence. Schema:

{
  "title": "short, specific (≤ 8 words)",
  "tldr": "1-2 sentences capturing the gist",
  "summary": "5-12 sentences, factual, neutral",
  "key_points": ["..."],
  "decisions": [{"decision": "...", "by": "speaker name | 'group'", "context": "why"}],
  "action_items": [{"owner": "name | 'unassigned'", "task": "verb-first", "due": "ISO date or natural ('next week', '')", "confidence": "high|medium|low"}],
  "open_questions": ["..."],
  "follow_ups": ["concrete suggested next steps"],
  "key_quotes": [{"speaker": "name", "quote": "exact text", "why": "why it matters"}],
  "topics": ["..."],
  "entities": {"people": ["..."], "orgs": ["..."], "places": ["..."], "dates": ["..."]},
  "sentiment_by_speaker": [{"speaker": "name", "tone": "...", "notes": "..."}],
  "risks": ["..."],
  "outline": [{"heading": "...", "bullets": ["..."]}]
}

# Rules

- Use the speaker NAMES that appear in the transcript. Never say "Speaker A" if a real name is used.
- If a field has no content, return an empty array — do not invent.
- "action_items" must be verb-first ("Send draft to legal", not "draft").
- "key_quotes" must be exact substrings of the transcript, not paraphrases.
- Be honest about ambiguity — set confidence: low and note it in context.
- Do not include any text outside the JSON fence.`;

function buildUserMessage({ transcript, speakerHints, durationSec, when }) {
  const dur = formatDuration(durationSec);
  const hints = speakerHints && speakerHints.length > 0
    ? `Speaker hints (in best-guess order of appearance): ${speakerHints.join(', ')}.`
    : 'No speaker hints provided — use generic labels.';
  return `Conversation context:
- Recorded: ${when}
- Duration: ${dur}
- ${hints}

Transcript:
"""
${transcript}
"""

Analyze and return the JSON object per the system contract.`;
}

export async function analyze(transcriptText, opts) {
  const {
    apiKey,
    model = 'claude-sonnet-4-6',
    speakerHints = [],
    durationSec = 0,
    when = new Date().toISOString(),
    onProgress
  } = opts;
  if (!apiKey) throw new Error('Anthropic API key not set');

  onProgress?.({ step: 'analyze', detail: `Calling ${model}…` });

  const body = {
    model,
    max_tokens: 4096,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      { role: 'user', content: buildUserMessage({ transcript: transcriptText, speakerHints, durationSec, when }) }
    ]
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const analysis = parseJsonResponse(text);
  return {
    analysis,
    usage: data.usage,
    model: data.model,
    rawText: text
  };
}

function parseJsonResponse(text) {
  // Prefer the fenced ```json block; fall back to first {...} balanced segment.
  const fence = /```json\s*([\s\S]*?)```/i.exec(text) || /```\s*([\s\S]*?)```/i.exec(text);
  const candidate = fence ? fence[1] : extractFirstObject(text);
  if (!candidate) throw new Error('Claude response had no JSON');
  try {
    return JSON.parse(candidate);
  } catch (e) {
    // Try a forgiving cleanup: trim trailing commas.
    const cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  }
}

function extractFirstObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function formatDuration(sec) {
  if (!sec) return 'unknown';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
