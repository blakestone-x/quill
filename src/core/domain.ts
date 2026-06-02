// Ambient-capture domain model.
//
// PURE TYPES — no Electron / React / Node imports — so this module can be
// lifted into a shared `packages/domain` when the Android app lands (see the
// monorepo deferral in planning/quill-ambient-build-directive-2026-06-02.md).
// Everything the desktop and mobile clients agree on lives here.

export type DeviceKind = 'desktop' | 'mobile';

/** 'me' and 'them' are the baseline two-channel labels; named speakers later. */
export type SpeakerLabel = string;

/** Conservative-by-default consent posture. See core/consent.ts. */
export type ConsentMode = 'personal' | 'disclosed' | 'work-restricted';

/** One arming of capture on one device. Audio is never part of this record. */
export interface CaptureSession {
  id: string;
  deviceId: string;
  deviceKind: DeviceKind;
  startedAt: number; // epoch ms
  endedAt: number | null;
  consentMode: ConsentMode;
  locationTag?: string;
  title?: string;
}

/** A finalized (or live-partial) text segment. The audio it came from is gone. */
export interface TranscriptSegment {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  speaker: SpeakerLabel;
  text: string;
  sourceDevice: string;
  /** false = live partial hypothesis; true = committed final */
  final: boolean;
  /** false until mirrored to the VPS authority */
  synced: boolean;
}

/** A ⚑ marker or a quick-note pinned to a moment in the session. */
export interface SessionFlag {
  id: string;
  sessionId: string;
  at: number;
  note: string; // '' for a bare flag
}

export type ExtractionKind =
  | 'action_item'
  | 'calendar_event'
  | 'decision'
  | 'reminder'
  | 'knowledge_write';

export type ExtractionStatus = 'pending' | 'confirmed' | 'dismissed';

/** Structured value the agent pulls from the transcript (M3). Human-confirmed. */
export interface Extraction {
  id: string;
  sessionId: string;
  segmentRef?: string;
  kind: ExtractionKind;
  payload: Record<string, unknown>;
  confidence: number; // 0..1
  status: ExtractionStatus;
  createdAt: number;
}

/** Timestamped proof that a recording was disclosed. Legal posture (M2/M8). */
export interface ConsentLogEntry {
  id: string;
  sessionId: string;
  at: number;
  mode: ConsentMode;
  partyAcknowledged: boolean;
}
