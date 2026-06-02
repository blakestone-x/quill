// Daily synthesis (M3): turn the day's CONFIRMED extractions into a brief.
// Runs over confirmed items only (not the raw transcript) so the prompt stays
// small and cheap. LLM injected -> testable. Pure otherwise.

import type { Extraction, ExtractionKind } from './domain';
import type { LlmComplete } from './extraction';

const KINDS: ExtractionKind[] = [
  'decision',
  'action_item',
  'reminder',
  'calendar_event',
  'knowledge_write'
];

export function groupByKind(extractions: Extraction[]): Record<ExtractionKind, Extraction[]> {
  const groups = {
    action_item: [],
    calendar_event: [],
    decision: [],
    reminder: [],
    knowledge_write: []
  } as Record<ExtractionKind, Extraction[]>;
  for (const e of extractions) {
    if (groups[e.kind]) groups[e.kind].push(e);
  }
  return groups;
}

function summaryOf(e: Extraction): string {
  const s = e.payload['summary'];
  return typeof s === 'string' ? s : JSON.stringify(e.payload);
}

export function buildDailyBriefPrompt(extractions: Extraction[]): string {
  const confirmed = extractions.filter((e) => e.status === 'confirmed');
  const groups = groupByKind(confirmed);
  const sections: string[] = [];
  for (const kind of KINDS) {
    const items = groups[kind];
    if (items.length === 0) continue;
    sections.push(`${kind}:\n` + items.map((e) => `  - ${summaryOf(e)}`).join('\n'));
  }
  return [
    'Write a concise end-of-day brief from these confirmed items. Lead with',
    'decisions and action items, group by theme, keep it scannable, no preamble.',
    '',
    sections.join('\n\n') || '(nothing confirmed today)'
  ].join('\n');
}

export async function summarizeDay(extractions: Extraction[], llm: LlmComplete): Promise<string> {
  const confirmed = extractions.filter((e) => e.status === 'confirmed');
  if (confirmed.length === 0) return '';
  return (await llm(buildDailyBriefPrompt(extractions))).trim();
}
