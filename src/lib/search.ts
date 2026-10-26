import type { Note } from '../types';
import type { ChatMessage } from './agent';

export interface SearchHit {
  noteId: string;
  noteTitle: string;
  position: number;
  snippet: string;
  matchStart: number;
  matchLength: number;
  field: 'title' | 'content' | 'agent';
  agentIndex?: number;
}

export function searchEverything(
  notes: Note[],
  agentLogs: Record<string, ChatMessage[]>,
  query: string,
  maxResults = 80
): SearchHit[] {
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
    pushHitsInText(hits, note.id, title, note.content, needle, q.length, 'content');
    if (hits.length >= maxResults) return hits.slice(0, maxResults);
  }

  for (const note of notes) {
    const msgs = agentLogs[note.id] ?? [];
    msgs.forEach((m, i) => {
      pushHitsInText(hits, note.id, note.title || 'Untitled', m.content, needle, q.length, 'agent', i);
      if (hits.length >= maxResults) return;
    });
    if (hits.length >= maxResults) return hits.slice(0, maxResults);
  }

  return hits.slice(0, maxResults);
}

function pushHitsInText(
  hits: SearchHit[],
  noteId: string,
  noteTitle: string,
  text: string,
  needle: string,
  needleLen: number,
  field: 'content' | 'agent',
  agentIndex?: number
): void {
  const body = text.toLowerCase();
  let from = 0;
  let count = 0;
  while (count < 5) {
    const idx = body.indexOf(needle, from);
    if (idx === -1) break;
    const sniff = extractSnippet(text, idx, needleLen);
    hits.push({
      noteId,
      noteTitle,
      position: idx,
      snippet: sniff.text,
      matchStart: sniff.matchStart,
      matchLength: needleLen,
      field,
      agentIndex
    });
    from = idx + needleLen;
    count++;
  }
}

function extractSnippet(content: string, matchIdx: number, matchLen: number) {
  const window = 40;
  const start = Math.max(0, matchIdx - window);
  const end = Math.min(content.length, matchIdx + matchLen + window);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  const slice = content.slice(start, end).replace(/\s+/g, ' ');
  const matchStart = prefix.length + (matchIdx - start);
  return { text: prefix + slice + suffix, matchStart };
}
