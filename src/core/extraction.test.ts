import { describe, it, expect, vi } from 'vitest';
import {
  isSalient,
  filterSalient,
  parseExtractions,
  extractFromSegments
} from './extraction';
import type { TranscriptSegment } from './domain';

function seg(text: string, partial = false): TranscriptSegment {
  return {
    id: Math.random().toString(36).slice(2),
    sessionId: 's1',
    startedAt: 0,
    endedAt: 1,
    speaker: 'me',
    text,
    sourceDevice: 'desktop',
    final: !partial,
    synced: false
  };
}

describe('isSalient', () => {
  it('keeps task / time / decision utterances', () => {
    expect(isSalient('Remind me to call CBRE tomorrow')).toBe(true);
    expect(isSalient("Let's schedule the install for Tuesday")).toBe(true);
    expect(isSalient('We agreed to ship the quote by Friday')).toBe(true);
  });

  it('drops small talk and too-short fragments', () => {
    expect(isSalient('uh yeah ok sure')).toBe(false);
    expect(isSalient('haha')).toBe(false);
    expect(isSalient('that was a good lunch')).toBe(false);
  });
});

describe('filterSalient', () => {
  it('drops partials and non-salient segments', () => {
    const segments = [
      seg('Remind me to email Aaron', false),
      seg('Remind me to email Aaron', true), // partial, same text — excluded
      seg('mm hmm')
    ];
    const out = filterSalient(segments);
    expect(out).toHaveLength(1);
    expect(out[0].final).toBe(true);
  });
});

describe('parseExtractions', () => {
  it('parses JSON embedded in prose / code fences', () => {
    const raw =
      'Sure! Here is the JSON:\n```json\n{"extractions":[{"kind":"reminder","summary":"Call CBRE","confidence":0.9}]}\n```';
    const out = parseExtractions(raw);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('reminder');
    expect(out[0].payload.summary).toBe('Call CBRE');
    expect(out[0].confidence).toBeCloseTo(0.9);
  });

  it('skips unknown kinds and clamps confidence', () => {
    const raw =
      '{"extractions":[{"kind":"bogus","summary":"x","confidence":2},{"kind":"decision","summary":"go","confidence":5}]}';
    const out = parseExtractions(raw);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('decision');
    expect(out[0].confidence).toBe(1);
  });

  it('returns [] on malformed output', () => {
    expect(parseExtractions('no json here')).toEqual([]);
    expect(parseExtractions('{ broken')).toEqual([]);
  });
});

describe('extractFromSegments', () => {
  it('does not call the LLM when nothing is salient', async () => {
    const llm = vi.fn(async () => '{"extractions":[]}');
    const out = await extractFromSegments([seg('uh huh'), seg('ok cool')], llm);
    expect(llm).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it('calls the LLM with salient segments and returns parsed results', async () => {
    const llm = vi.fn(
      async () => '{"extractions":[{"kind":"action_item","summary":"Send quote","confidence":0.8}]}'
    );
    const out = await extractFromSegments([seg('Send the quote to CBRE tomorrow')], llm);
    expect(llm).toHaveBeenCalledOnce();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('action_item');
  });
});
