import type Database from 'better-sqlite3';
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from '../../src/core/schema';
import type {
  CaptureSession,
  ConsentLogEntry,
  ConsentMode,
  DeviceKind,
  Extraction,
  ExtractionKind,
  ExtractionStatus,
  SessionFlag,
  TranscriptSegment
} from '../../src/core/domain';

// Local ambient store (desktop). Authoritative copy lives on the VPS; this is a
// fast local-first cache + offline buffer. Takes a Database instance (DI) so it
// is testable under plain Node without Electron.

interface SegmentRow {
  id: string;
  session_id: string;
  started_at: number;
  ended_at: number;
  speaker: string;
  text: string;
  source_device: string;
  final: number;
  synced: number;
}

interface FlagRow {
  id: string;
  session_id: string;
  at: number;
  note: string;
}

interface ExtractionRow {
  id: string;
  session_id: string;
  segment_ref: string | null;
  kind: string;
  payload: string;
  confidence: number;
  status: string;
  created_at: number;
}

function toSegment(r: SegmentRow): TranscriptSegment {
  return {
    id: r.id,
    sessionId: r.session_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    speaker: r.speaker,
    text: r.text,
    sourceDevice: r.source_device,
    final: r.final === 1,
    synced: r.synced === 1
  };
}

export class QuillDB {
  constructor(private readonly db: Database.Database) {
    this.migrate();
  }

  private migrate(): void {
    this.db.pragma('journal_mode = WAL');
    for (const stmt of SCHEMA_STATEMENTS) this.db.exec(stmt);
    this.db
      .prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)')
      .run('schema_version', String(SCHEMA_VERSION));
  }

  // ── sessions ──
  createSession(s: CaptureSession): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions
         (id, device_id, device_kind, started_at, ended_at, consent_mode, location_tag, title)
         VALUES (@id, @deviceId, @deviceKind, @startedAt, @endedAt, @consentMode, @locationTag, @title)`
      )
      .run({
        id: s.id,
        deviceId: s.deviceId,
        deviceKind: s.deviceKind,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        consentMode: s.consentMode,
        locationTag: s.locationTag ?? null,
        title: s.title ?? null
      });
  }

  endSession(id: string, endedAt: number): void {
    this.db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(endedAt, id);
  }

  getSession(id: string): CaptureSession | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      id: r.id as string,
      deviceId: r.device_id as string,
      deviceKind: r.device_kind as DeviceKind,
      startedAt: r.started_at as number,
      endedAt: (r.ended_at as number | null) ?? null,
      consentMode: r.consent_mode as ConsentMode,
      locationTag: (r.location_tag as string | null) ?? undefined,
      title: (r.title as string | null) ?? undefined
    };
  }

  // ── segments ──
  addSegment(seg: TranscriptSegment): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO segments
         (id, session_id, started_at, ended_at, speaker, text, source_device, final, synced)
         VALUES (@id, @sessionId, @startedAt, @endedAt, @speaker, @text, @sourceDevice, @final, @synced)`
      )
      .run({
        id: seg.id,
        sessionId: seg.sessionId,
        startedAt: seg.startedAt,
        endedAt: seg.endedAt,
        speaker: seg.speaker,
        text: seg.text,
        sourceDevice: seg.sourceDevice,
        final: seg.final ? 1 : 0,
        synced: seg.synced ? 1 : 0
      });
  }

  listSegments(sessionId: string): TranscriptSegment[] {
    const rows = this.db
      .prepare('SELECT * FROM segments WHERE session_id = ? ORDER BY started_at')
      .all(sessionId) as SegmentRow[];
    return rows.map(toSegment);
  }

  unsyncedSegments(limit = 500): TranscriptSegment[] {
    const rows = this.db
      .prepare('SELECT * FROM segments WHERE synced = 0 ORDER BY started_at LIMIT ?')
      .all(limit) as SegmentRow[];
    return rows.map(toSegment);
  }

  markSynced(ids: string[]): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare('UPDATE segments SET synced = 1 WHERE id = ?');
    const tx = this.db.transaction((list: string[]) => {
      for (const id of list) stmt.run(id);
    });
    tx(ids);
  }

  // ── flags ──
  addFlag(f: SessionFlag): void {
    this.db
      .prepare('INSERT OR REPLACE INTO flags (id, session_id, at, note) VALUES (?, ?, ?, ?)')
      .run(f.id, f.sessionId, f.at, f.note);
  }

  listFlags(sessionId: string): SessionFlag[] {
    const rows = this.db
      .prepare('SELECT * FROM flags WHERE session_id = ? ORDER BY at')
      .all(sessionId) as FlagRow[];
    return rows.map((r) => ({ id: r.id, sessionId: r.session_id, at: r.at, note: r.note }));
  }

  // ── extractions ──
  addExtraction(e: Extraction): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO extractions
         (id, session_id, segment_ref, kind, payload, confidence, status, created_at)
         VALUES (@id, @sessionId, @segmentRef, @kind, @payload, @confidence, @status, @createdAt)`
      )
      .run({
        id: e.id,
        sessionId: e.sessionId,
        segmentRef: e.segmentRef ?? null,
        kind: e.kind,
        payload: JSON.stringify(e.payload),
        confidence: e.confidence,
        status: e.status,
        createdAt: e.createdAt
      });
  }

  listExtractions(sessionId: string, status?: ExtractionStatus): Extraction[] {
    const rows = (
      status
        ? this.db
            .prepare('SELECT * FROM extractions WHERE session_id = ? AND status = ? ORDER BY created_at')
            .all(sessionId, status)
        : this.db
            .prepare('SELECT * FROM extractions WHERE session_id = ? ORDER BY created_at')
            .all(sessionId)
    ) as ExtractionRow[];
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      segmentRef: r.segment_ref ?? undefined,
      kind: r.kind as ExtractionKind,
      payload: safeParse(r.payload),
      confidence: r.confidence,
      status: r.status as ExtractionStatus,
      createdAt: r.created_at
    }));
  }

  setExtractionStatus(id: string, status: ExtractionStatus): void {
    this.db.prepare('UPDATE extractions SET status = ? WHERE id = ?').run(status, id);
  }

  // ── consent log ──
  logConsent(entry: ConsentLogEntry): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO consent_log (id, session_id, at, mode, party_acknowledged)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(entry.id, entry.sessionId, entry.at, entry.mode, entry.partyAcknowledged ? 1 : 0);
  }

  close(): void {
    this.db.close();
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
