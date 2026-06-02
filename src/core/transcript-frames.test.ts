import { describe, it, expect } from 'vitest';
import { parseSidecarFrame, parseDeepgramFrame } from './transcript-frames';

describe('parseSidecarFrame', () => {
  it('maps a valid frame', () => {
    const c = parseSidecarFrame({
      text: 'hello there',
      startedAt: 1000,
      endedAt: 2000,
      final: true,
      speaker: 'me',
      confidence: 0.9
    });
    expect(c).toMatchObject({ text: 'hello there', startedAt: 1000, endedAt: 2000, final: true, speaker: 'me' });
    expect(c?.confidence).toBeCloseTo(0.9);
  });

  it('treats missing final as partial', () => {
    const c = parseSidecarFrame({ text: 'hi', startedAt: 0, endedAt: 1 });
    expect(c?.final).toBe(false);
  });

  it('rejects empty or malformed frames', () => {
    expect(parseSidecarFrame({ text: '', startedAt: 0, endedAt: 1 })).toBeNull();
    expect(parseSidecarFrame({ startedAt: 0, endedAt: 1 })).toBeNull();
    expect(parseSidecarFrame(null)).toBeNull();
  });
});

describe('parseDeepgramFrame', () => {
  it('maps a Results frame and converts seconds to ms', () => {
    const c = parseDeepgramFrame({
      channel: { alternatives: [{ transcript: 'send the quote', confidence: 0.95, words: [{ speaker: 1 }] }] },
      start: 1.2,
      duration: 0.8,
      is_final: true
    });
    expect(c?.text).toBe('send the quote');
    expect(c?.startedAt).toBe(1200);
    expect(c?.endedAt).toBe(2000);
    expect(c?.final).toBe(true);
    expect(c?.speaker).toBe('speaker_1');
  });

  it('drops empty interim transcripts', () => {
    expect(
      parseDeepgramFrame({ channel: { alternatives: [{ transcript: '' }] }, start: 0, duration: 0, is_final: false })
    ).toBeNull();
  });

  it('returns null when alternatives are missing', () => {
    expect(parseDeepgramFrame({ channel: {} })).toBeNull();
    expect(parseDeepgramFrame({})).toBeNull();
  });
});
