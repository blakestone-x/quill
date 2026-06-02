// STT frame parsers — normalize engine output into TranscriptChunk (M1).
//
// The local sidecar emits our own clean protocol (we control it). The Deepgram
// parser handles the documented streaming "Results" shape for the cloud opt-in.
// Both are tolerant: malformed or empty frames return null and are dropped.

import type { TranscriptChunk } from './providers';

/** Normalized frame emitted by the local STT sidecar (our protocol). */
export interface SidecarFrame {
  text: string;
  startedAt: number; // ms
  endedAt: number; // ms
  final: boolean;
  speaker?: string;
  confidence?: number;
}

export function parseSidecarFrame(input: unknown): TranscriptChunk | null {
  if (!input || typeof input !== 'object') return null;
  const f = input as Record<string, unknown>;
  if (typeof f.text !== 'string' || f.text.length === 0) return null;
  if (typeof f.startedAt !== 'number' || typeof f.endedAt !== 'number') return null;
  const chunk: TranscriptChunk = {
    text: f.text,
    startedAt: f.startedAt,
    endedAt: f.endedAt,
    final: f.final === true
  };
  if (typeof f.speaker === 'string') chunk.speaker = f.speaker;
  if (typeof f.confidence === 'number') chunk.confidence = f.confidence;
  return chunk;
}

/**
 * Deepgram streaming "Results" frame (cloud opt-in). Shape per Deepgram docs:
 * { channel: { alternatives: [{ transcript, confidence, words:[{speaker}] }] },
 *   start, duration, is_final }. Times are seconds; we convert to ms.
 */
export function parseDeepgramFrame(input: unknown): TranscriptChunk | null {
  if (!input || typeof input !== 'object') return null;
  const f = input as Record<string, any>;
  const alt = f.channel?.alternatives?.[0];
  if (!alt || typeof alt.transcript !== 'string' || alt.transcript.length === 0) return null;
  const start = typeof f.start === 'number' ? f.start : 0;
  const duration = typeof f.duration === 'number' ? f.duration : 0;
  const chunk: TranscriptChunk = {
    text: alt.transcript,
    startedAt: Math.round(start * 1000),
    endedAt: Math.round((start + duration) * 1000),
    final: f.is_final === true
  };
  if (typeof alt.confidence === 'number') chunk.confidence = alt.confidence;
  const speakerId = alt.words?.[0]?.speaker;
  if (typeof speakerId === 'number') chunk.speaker = `speaker_${speakerId}`;
  return chunk;
}
