// Retrieval helpers (M3): chunk transcripts for embedding, and fuse keyword +
// vector result rankings. Pure + portable; the actual BM25/vector queries run
// against pgvector on the VPS (or the local cache), then RRF merges them here.

import type { TranscriptSegment } from './domain';

export interface Chunk {
  id: string;
  sessionId: string;
  speaker: string;
  startedAt: number;
  endedAt: number;
  text: string;
}

export interface ChunkOptions {
  /** approximate size budget per chunk in characters (~4 chars/token) */
  maxChars?: number;
  idFor?: (sessionId: string, index: number) => string;
}

/**
 * Speaker-turn-atomic chunking: merge consecutive finals from the same speaker
 * up to a size budget. A speaker change (or session change) always starts a new
 * chunk. Partials are ignored — only committed text is indexed.
 */
export function chunkSegments(segments: TranscriptSegment[], opts: ChunkOptions = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 1200;
  const idFor = opts.idFor ?? ((sessionId, i) => `${sessionId}:${i}`);
  const finals = segments.filter((s) => s.final);

  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  let idx = 0;

  for (const s of finals) {
    const canMerge =
      cur !== null &&
      cur.speaker === s.speaker &&
      cur.sessionId === s.sessionId &&
      cur.text.length + 1 + s.text.length <= maxChars;

    if (cur && canMerge) {
      cur.text += ' ' + s.text;
      cur.endedAt = s.endedAt;
    } else {
      if (cur) chunks.push(cur);
      cur = {
        id: idFor(s.sessionId, idx++),
        sessionId: s.sessionId,
        speaker: s.speaker,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        text: s.text
      };
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export interface FusedHit {
  id: string;
  score: number;
}

/**
 * Reciprocal Rank Fusion. Each input list is ordered best-first. An id that
 * ranks well across lists wins. k defaults to 60 (the standard constant).
 */
export function rrfMerge(rankedLists: string[][], k = 60): FusedHit[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
