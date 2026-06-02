// Portable SQLite schema for the ambient store. Plain SQLite DDL so the same
// statements run under better-sqlite3 (desktop) and op-sqlite (mobile). Lives in
// core/ because both clients share it (build directive data model).

export const SCHEMA_VERSION = 1;

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    device_kind TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    consent_mode TEXT NOT NULL,
    location_tag TEXT,
    title TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    source_device TEXT NOT NULL,
    final INTEGER NOT NULL DEFAULT 1,
    synced INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_segments_session ON segments(session_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_segments_unsynced ON segments(synced)`,
  `CREATE TABLE IF NOT EXISTS flags (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS extractions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    segment_ref TEXT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    confidence REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_extractions_session ON extractions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_extractions_status ON extractions(status)`,
  `CREATE TABLE IF NOT EXISTS consent_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    mode TEXT NOT NULL,
    party_acknowledged INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
];
