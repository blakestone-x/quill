import { describe, it, expect } from 'vitest';
import { chunkSegments, rrfMerge } from './retrieval';
import type { TranscriptSegment } from './domain';

let n = 0;
function seg(speaker: string, text: string, final = true, sessionId = 's1'): TranscriptSegment {
  const at = n++;
  return {
    id: `seg${at}`,
    sessionId,
    startedAt: at,
    endedAt: at + 1,
    speaker,
    text,
    sourceDevice: 'desktop',
    final,
    synced: false
  };
}

describe('chunkSegments', () => {
  it('merges consecutive same-speaker finals and splits on speaker change', () => {
    const chunks = chunkSegments([
      seg('me', 'hello'),
      seg('me', 'there'),
      seg('them', 'hi'),
      seg('me', 'ok')
    ]);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ speaker: 'me', text: 'hello there' });
    expect(chunks[1]).toMatchObject({ speaker: 'them', text: 'hi' });
    expect(chunks[2]).toMatchObject({ speaker: 'me', text: 'ok' });
  });

  it('splits same-speaker text when the size budget is exceeded', () => {
    const chunks = chunkSegments([seg('me', 'hello'), seg('me', 'there')], { maxChars: 8 });
    expect(chunks).toHaveLength(2);
  });

  it('ignores partial segments', () => {
    const chunks = chunkSegments([seg('me', 'partial', false), seg('me', 'final', true)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('final');
  });
});

describe('rrfMerge', () => {
  it('ranks an item that places high in both lists first', () => {
    const fused = rrfMerge([
      ['a', 'b', 'c'],
      ['a', 'c', 'b']
    ]);
    expect(fused[0].id).toBe('a');
    expect(fused.map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('deduplicates ids across lists', () => {
    const fused = rrfMerge([
      ['x', 'y'],
      ['y', 'x']
    ]);
    expect(fused).toHaveLength(2);
  });

  it('includes ids that appear in only one list', () => {
    const fused = rrfMerge([['a', 'b'], ['c']]);
    expect(fused.map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
  });
});
