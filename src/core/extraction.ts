// Transcript -> structured value. Layer 2 of the intelligence pipeline (M3).
//
// Pure logic with the LLM call INJECTED, so it runs identically on desktop and
// mobile and is fully unit-testable. Layer 1 (live ASR + diarization) never
// touches this; only finalized, salient segments do.

import type { ExtractionKind, TranscriptSegment } from './domain';

// ── Salience filter ─────────────────────────────────────────────────────────
// A cheap, deterministic pre-screen that drops small talk BEFORE any LLM call.
// (Cost + noise control — most ambient speech is not worth extracting.)

const TASK_VERBS = [
  'remind',
  'schedule',
  'send',
  'call',
  'email',
  'follow up',
  'followup',
  'book',
  'order',
  'pay',
  'confirm',
  'cancel',
  'review',
  'submit',
  'sign',
  'approve',
  'assign',
  'deliver',
  'ship',
  'quote',
  'dispatch'
];

const DECISION_WORDS = [
  'decide',
  'decided',
  'agreed',
  'we will',
  "let's",
  'plan to',
  'going to',
  'need to',
  'have to'
];

const TIME_REF =
  /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|next month|\d{1,2}(:\d{2})?\s?(am|pm)|\d{1,2}\/\d{1,2})\b/i;

// Two or more consecutive capitalized words — a likely entity (person, company).
const PROPER_NOUN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;

export function isSalient(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  const lower = t.toLowerCase();
  if (TASK_VERBS.some((v) => lower.includes(v))) return true;
  if (DECISION_WORDS.some((v) => lower.includes(v))) return true;
  if (TIME_REF.test(t)) return true;
  if (PROPER_NOUN.test(t) && /\?|\bneed\b|\bmust\b|\bshould\b/.test(lower)) return true;
  return false;
}

export function filterSalient(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.filter((s) => s.final && isSalient(s.text));
}

// ── Extraction contract ─────────────────────────────────────────────────────

export interface ExtractionResult {
  kind: ExtractionKind;
  payload: Record<string, unknown>;
  confidence: number;
  segmentRef?: string;
}

/** JSON Schema the LLM is asked to satisfy (structured output). */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    extractions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['action_item', 'calendar_event', 'decision', 'reminder', 'knowledge_write']
          },
          summary: { type: 'string' },
          owner: { type: 'string' },
          due: { type: 'string' },
          confidence: { type: 'number' }
        },
        required: ['kind', 'summary', 'confidence']
      }
    }
  },
  required: ['extractions']
} as const;

export type LlmComplete = (prompt: string) => Promise<string>;

export function buildExtractionPrompt(segments: TranscriptSegment[]): string {
  const lines = segments.map((s) => `[${s.speaker}] ${s.text}`).join('\n');
  return [
    'Extract action items, calendar events, decisions, reminders, and knowledge notes',
    'from this meeting transcript excerpt. Return ONLY JSON of the form',
    '{ "extractions": [ { "kind", "summary", "owner"?, "due"?, "confidence" (0..1) } ] }.',
    'kind is one of: action_item, calendar_event, decision, reminder, knowledge_write.',
    'Be conservative — omit small talk. If nothing is worth extracting, return {"extractions":[]}.',
    '',
    'TRANSCRIPT:',
    lines
  ].join('\n');
}

/** Tolerant parser: LLMs wrap JSON in prose or code fences; grab the object. */
export function parseExtractions(raw: string): ExtractionResult[] {
  const json = extractJsonObject(raw);
  if (!json) return [];
  try {
    const obj = JSON.parse(json) as { extractions?: unknown };
    if (!obj || !Array.isArray(obj.extractions)) return [];
    const out: ExtractionResult[] = [];
    for (const e of obj.extractions) {
      if (!e || typeof e !== 'object') continue;
      const rec = e as Record<string, unknown>;
      const kind = rec.kind;
      if (!isExtractionKind(kind)) continue;
      const confidence = typeof rec.confidence === 'number' ? clamp01(rec.confidence) : 0.5;
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (k !== 'kind' && k !== 'confidence') payload[k] = v;
      }
      out.push({ kind, payload, confidence });
    }
    return out;
  } catch {
    return [];
  }
}

/** Full Layer-2 pass: drop noise, call the LLM only if anything survives. */
export async function extractFromSegments(
  segments: TranscriptSegment[],
  llm: LlmComplete
): Promise<ExtractionResult[]> {
  const salient = filterSalient(segments);
  if (salient.length === 0) return [];
  const raw = await llm(buildExtractionPrompt(salient));
  return parseExtractions(raw);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isExtractionKind(v: unknown): v is ExtractionKind {
  return (
    v === 'action_item' ||
    v === 'calendar_event' ||
    v === 'decision' ||
    v === 'reminder' ||
    v === 'knowledge_write'
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return raw.slice(start, end + 1);
}
