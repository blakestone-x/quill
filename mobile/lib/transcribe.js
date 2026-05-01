// AssemblyAI transcription with speaker diarization.
//
// Flow:
//   1. POST raw audio bytes to /v2/upload → temporary URL.
//   2. POST /v2/transcript with { audio_url, speaker_labels: true, ... }.
//   3. Poll /v2/transcript/{id} until status === 'completed' (or 'error').
//
// AssemblyAI sends CORS headers, so this works directly from the browser.
// Docs: https://www.assemblyai.com/docs

const BASE = 'https://api.assemblyai.com/v2';

export async function transcribe(audioBlob, opts) {
  const { apiKey, speakerHints, language, onProgress } = opts;
  if (!apiKey) throw new Error('AssemblyAI API key not set');

  onProgress?.({ step: 'upload', detail: `${(audioBlob.size / 1024 / 1024).toFixed(1)} MB` });
  const audioUrl = await upload(audioBlob, apiKey);

  onProgress?.({ step: 'queue', detail: 'Submitting for transcription' });
  const id = await submit(audioUrl, apiKey, { speakerHints, language });

  onProgress?.({ step: 'transcribe', detail: 'Working…' });
  const result = await poll(id, apiKey, onProgress);

  return normalize(result);
}

async function upload(blob, apiKey) {
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/octet-stream' },
    body: blob
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text().catch(() => '')}`);
  const { upload_url } = await res.json();
  if (!upload_url) throw new Error('Upload returned no URL');
  return upload_url;
}

async function submit(audio_url, apiKey, { speakerHints, language }) {
  const body = {
    audio_url,
    speaker_labels: true,
    punctuate: true,
    format_text: true,
    disfluencies: false,
    auto_highlights: true,
    entity_detection: true,
    sentiment_analysis: true
  };
  if (language) body.language_code = language;
  if (speakerHints && speakerHints.length > 0) {
    body.speakers_expected = speakerHints.length;
  }
  const res = await fetch(`${BASE}/transcript`, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status} ${await res.text().catch(() => '')}`);
  const { id } = await res.json();
  if (!id) throw new Error('Submit returned no id');
  return id;
}

async function poll(id, apiKey, onProgress) {
  const start = Date.now();
  let delay = 1500;
  while (true) {
    const res = await fetch(`${BASE}/transcript/${id}`, { headers: { authorization: apiKey } });
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json();
    if (data.status === 'completed') return data;
    if (data.status === 'error') throw new Error(data.error || 'Transcription error');
    const seconds = Math.floor((Date.now() - start) / 1000);
    onProgress?.({
      step: 'transcribe',
      detail: `${data.status}…  (${seconds}s elapsed)`,
      pct: Math.min(0.5 + seconds / 600, 0.95)
    });
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.2, 5000);
  }
}

// AssemblyAI's payload → a tighter shape the rest of the app uses.
function normalize(data) {
  const utterances = (data.utterances || []).map((u) => ({
    speaker: u.speaker, // "A", "B", "C"… we map to names later
    start: u.start, // ms
    end: u.end,
    text: u.text,
    confidence: u.confidence
  }));
  const speakers = Array.from(new Set(utterances.map((u) => u.speaker))).sort();
  return {
    text: data.text || utterances.map((u) => u.text).join(' '),
    utterances,
    speakers,
    language: data.language_code,
    durationSec: data.audio_duration,
    highlights: (data.auto_highlights_result?.results || []).map((h) => h.text),
    entities: (data.entities || []).map((e) => ({ text: e.text, type: e.entity_type })),
    sentiment: data.sentiment_analysis_results || [],
    raw: data
  };
}

// Convert "A"/"B"/… speaker IDs to nice names from a hint list.
export function applySpeakerNames(transcript, names) {
  if (!names || names.length === 0) return transcript;
  const map = new Map();
  transcript.speakers.forEach((id, i) => {
    if (i < names.length && names[i]) map.set(id, names[i]);
  });
  const rename = (s) => map.get(s) || `Speaker ${s}`;
  return {
    ...transcript,
    utterances: transcript.utterances.map((u) => ({ ...u, speakerName: rename(u.speaker) })),
    speakerMap: Object.fromEntries(transcript.speakers.map((s) => [s, rename(s)]))
  };
}

export function transcriptToText(transcript) {
  return transcript.utterances
    .map((u) => `${u.speakerName || `Speaker ${u.speaker}`}: ${u.text}`)
    .join('\n');
}
