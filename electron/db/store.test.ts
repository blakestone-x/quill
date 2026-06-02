import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { QuillDB } from './store';
import type { CaptureSession, TranscriptSegment } from '../../src/core/domain';

function freshDb(): QuillDB {
  return new QuillDB(new Database(':memory:'));
}

const session: CaptureSession = {
  id: 'sess1',
  deviceId: 'desktop-1',
  deviceKind: 'desktop',
  startedAt: 1000,
  endedAt: null,
  consentMode: 'work-restricted'
};

function seg(id: string, text: string, synced = false): TranscriptSegment {
  return {
    id,
    sessionId: 'sess1',
    startedAt: 1000,
    endedAt: 1001,
    speaker: 'me',
    text,
    sourceDevice: 'desktop-1',
    final: true,
    synced
  };
}

describe('QuillDB', () => {
  it('round-trips a session', () => {
    const db = freshDb();
    db.createSession(session);
    db.endSession('sess1', 2000);
    const got = db.getSession('sess1');
    expect(got?.consentMode).toBe('work-restricted');
    expect(got?.endedAt).toBe(2000);
  });

  it('stores and lists segments in time order', () => {
    const db = freshDb();
    db.createSession(session);
    db.addSegment({ ...seg('a', 'first'), startedAt: 1000 });
    db.addSegment({ ...seg('b', 'second'), startedAt: 2000 });
    const list = db.listSegments('sess1');
    expect(list.map((s) => s.text)).toEqual(['first', 'second']);
    expect(list[0].final).toBe(true);
  });

  it('tracks unsynced segments and marks them synced', () => {
    const db = freshDb();
    db.createSession(session);
    db.addSegment(seg('a', 'x', false));
    db.addSegment(seg('b', 'y', false));
    expect(db.unsyncedSegments()).toHaveLength(2);
    db.markSynced(['a']);
    const remaining = db.unsyncedSegments();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('b');
  });

  it('round-trips extractions with JSON payload and status filter', () => {
    const db = freshDb();
    db.createSession(session);
    db.addExtraction({
      id: 'e1',
      sessionId: 'sess1',
      kind: 'action_item',
      payload: { summary: 'Send quote', owner: 'me' },
      confidence: 0.8,
      status: 'pending',
      createdAt: 1500
    });
    const pending = db.listExtractions('sess1', 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].payload.summary).toBe('Send quote');
    db.setExtractionStatus('e1', 'confirmed');
    expect(db.listExtractions('sess1', 'pending')).toHaveLength(0);
    expect(db.listExtractions('sess1', 'confirmed')).toHaveLength(1);
  });

  it('stores flags in order', () => {
    const db = freshDb();
    db.createSession(session);
    db.addFlag({ id: 'f2', sessionId: 'sess1', at: 2000, note: 'later' });
    db.addFlag({ id: 'f1', sessionId: 'sess1', at: 1000, note: 'early' });
    const flags = db.listFlags('sess1');
    expect(flags.map((f) => f.note)).toEqual(['early', 'later']);
  });
});
