import { describe, it, expect, beforeEach } from 'vitest';
import { captureStore } from './capture';
import type { TranscriptSegment } from '../core/domain';

function seg(id: string, text: string, final: boolean): TranscriptSegment {
  return {
    id,
    sessionId: 'sess1',
    startedAt: 0,
    endedAt: 1,
    speaker: 'me',
    text,
    sourceDevice: 'desktop',
    final,
    synced: false
  };
}

beforeEach(() => captureStore.getState().reset());

describe('captureStore', () => {
  it('starts a session and flips to recording', () => {
    captureStore.getState().startSession({
      id: 'sess1',
      deviceId: 'd',
      deviceKind: 'desktop',
      startedAt: 0,
      endedAt: null,
      consentMode: 'work-restricted'
    });
    expect(captureStore.getState().status).toBe('recording');
    expect(captureStore.getState().session?.id).toBe('sess1');
  });

  it('replaces a trailing partial, then commits it on final', () => {
    const s = captureStore.getState();
    s.upsertSegment(seg('a', 'hel', false));
    s.upsertSegment(seg('a', 'hello', false)); // replaces partial
    expect(captureStore.getState().segments).toHaveLength(1);
    s.upsertSegment(seg('a', 'hello there', true)); // commits (replaces partial)
    expect(captureStore.getState().segments).toHaveLength(1);
    expect(captureStore.getState().segments[0].final).toBe(true);
    s.upsertSegment(seg('b', 'next', false)); // new partial appends after a final
    expect(captureStore.getState().segments).toHaveLength(2);
  });

  it('keys on id and never overwrites a committed final with a late partial (regression)', () => {
    const s = captureStore.getState();
    s.upsertSegment(seg('a', 'hello there', true)); // commit final
    s.upsertSegment(seg('a', 'hel', false)); // late partial, same id, must NOT clobber
    expect(captureStore.getState().segments).toHaveLength(1);
    expect(captureStore.getState().segments[0].text).toBe('hello there');
    expect(captureStore.getState().segments[0].final).toBe(true);
  });

  it('records flags and resets cleanly', () => {
    const s = captureStore.getState();
    s.addFlag({ id: 'f1', sessionId: 'sess1', at: 100, note: 'important' });
    expect(captureStore.getState().flags).toHaveLength(1);
    captureStore.getState().reset();
    expect(captureStore.getState().flags).toHaveLength(0);
    expect(captureStore.getState().status).toBe('idle');
  });
});
