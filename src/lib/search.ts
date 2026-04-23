import type { Note } from '../types';

export interface SearchHit {
  noteId: string;
  noteTitle: string;
  position: number;
  snippet: string;
  matchStart: number;
  matchLength: number;
  field: 'title' | 'content';
}

export function searchNotes(notes: Note[], query: string, maxResults = 50): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const needle = q.toLowerCase();
  const hits: SearchHit[] = [];

  for (const note of notes) {
    const title = note.title || 'Untitled';
    const titleIdx = title.toLowerCase().indexOf(needle);
    if (titleIdx !== -1) {
      hits.push({
        noteId: note.id,
        noteTitle: title,
        position: 0,
        snippet: title,
        matchStart: titleIdx,
        matchLength: q.length,
        field: 'title'
      });
    }

    const body = note.content.toLowerCase();
    let from = 0;
    let count = 0;
    while (count < 5) {
      const idx = body.indexOf(needle, from);
      if (idx === -1) break;
      const sniff = extractSnippet(note.content, idx, q.length);
      hits.push({
        noteId: note.id,
        noteTitle: title,
        position: idx,
        snippet: sniff.text,
        matchStart: sniff.matchStart,
        matchLength: q.length,
        field: 'content'
      });
      from = idx + q.length;
      count++;
      if (hits.length >= maxResults) return hits;
    }
  }
  return hits;
}

function extractSnippet(content: string, matchIdx: number, matchLen: number): { text: string; matchStart: number } {
  const window = 40;
  const start = Math.max(0, matchIdx - window);
  const end = Math.min(content.length, matchIdx + matchLen + window);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  const slice = content.slice(start, end).replace(/\s+/g, ' ');
  const matchStart = prefix.length + (matchIdx - start);
  return { text: prefix + slice + suffix, matchStart };
}
