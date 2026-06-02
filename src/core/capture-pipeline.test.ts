import { describe, it, expect } from 'vitest';
import { CapturePipeline, type ChunkWindow } from './capture-pipeline';

// Feed frames every `step` ms with a given speech probability.
function feed(p: CapturePipeline, fromAt: number, count: number, prob: number, step = 100): number {
  let at = fromAt;
  for (let i = 0; i < count; i++) {
    p.pushFrame({ at, speechProb: prob });
    at += step;
  }
  return at;
}

describe('CapturePipeline', () => {
  it('emits one chunk on a speech burst followed by silence', () => {
    const chunks: ChunkWindow[] = [];
    const p = new CapturePipeline((w) => chunks.push(w), { silenceMs: 500, preRollMs: 200, maxChunkMs: 6000 });

    // speech 1000..2000, last speech frame at 2000
    let at = feed(p, 1000, 11, 0.9); // frames at 1000..2000
    // silence until gap >= 500ms
    feed(p, at, 6, 0.1); // 2100..2600

    expect(chunks).toHaveLength(1);
    expect(chunks[0].reason).toBe('silence');
    expect(chunks[0].startedAt).toBe(800); // 1000 - 200 pre-roll
    expect(chunks[0].endedAt).toBe(2000); // trailing silence trimmed
  });

  it('does not split on a sub-threshold silence gap', () => {
    const chunks: ChunkWindow[] = [];
    const p = new CapturePipeline((w) => chunks.push(w), { silenceMs: 500 });
    let at = feed(p, 1000, 5, 0.9); // 1000..1400
    at = feed(p, at, 3, 0.1); // 1500..1700 (300ms gap < 500)
    feed(p, at, 5, 0.9); // resume speech
    expect(chunks).toHaveLength(0); // still one ongoing segment
  });

  it('force-cuts a very long utterance at maxChunkMs', () => {
    const chunks: ChunkWindow[] = [];
    const p = new CapturePipeline((w) => chunks.push(w), { maxChunkMs: 3000, preRollMs: 0 });
    // continuous speech for 7s
    feed(p, 0, 71, 0.9); // 0..7000
    p.flush();
    // expect at least two maxlen cuts plus a final flush
    const maxlen = chunks.filter((c) => c.reason === 'maxlen');
    expect(maxlen.length).toBeGreaterThanOrEqual(2);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('flush emits a pending open segment', () => {
    const chunks: ChunkWindow[] = [];
    const p = new CapturePipeline((w) => chunks.push(w), { silenceMs: 500 });
    feed(p, 1000, 5, 0.9); // speaking, no trailing silence
    expect(chunks).toHaveLength(0);
    p.flush();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].endedAt).toBe(1400);
  });
});
