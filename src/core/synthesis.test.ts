import { describe, it, expect, vi } from 'vitest';
import { groupByKind, buildDailyBriefPrompt, summarizeDay } from './synthesis';
import type { Extraction, ExtractionKind, ExtractionStatus } from './domain';

let n = 0;
function ex(kind: ExtractionKind, summary: string, status: ExtractionStatus = 'confirmed'): Extraction {
  return {
    id: `e${n++}`,
    sessionId: 's1',
    kind,
    payload: { summary },
    confidence: 0.9,
    status,
    createdAt: 0
  };
}

describe('groupByKind', () => {
  it('buckets extractions by kind', () => {
    const g = groupByKind([ex('action_item', 'a'), ex('decision', 'd'), ex('action_item', 'a2')]);
    expect(g.action_item).toHaveLength(2);
    expect(g.decision).toHaveLength(1);
    expect(g.reminder).toHaveLength(0);
  });
});

describe('buildDailyBriefPrompt', () => {
  it('includes only confirmed items, grouped', () => {
    const prompt = buildDailyBriefPrompt([
      ex('action_item', 'Send quote', 'confirmed'),
      ex('reminder', 'Call CBRE', 'pending') // excluded
    ]);
    expect(prompt).toContain('Send quote');
    expect(prompt).not.toContain('Call CBRE');
    expect(prompt).toContain('action_item');
  });

  it('handles an empty day', () => {
    expect(buildDailyBriefPrompt([])).toContain('nothing confirmed today');
  });
});

describe('summarizeDay', () => {
  it('does not call the LLM when nothing is confirmed', async () => {
    const llm = vi.fn(async () => 'brief');
    const out = await summarizeDay([ex('action_item', 'x', 'pending')], llm);
    expect(llm).not.toHaveBeenCalled();
    expect(out).toBe('');
  });

  it('summarizes confirmed items', async () => {
    const llm = vi.fn(async () => '  Decisions: ship it.  ');
    const out = await summarizeDay([ex('decision', 'ship it', 'confirmed')], llm);
    expect(llm).toHaveBeenCalledOnce();
    expect(out).toBe('Decisions: ship it.');
  });
});
