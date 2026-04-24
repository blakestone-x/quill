import { buildMarkdown, parseMarkdown } from './frontmatter';
import type { ChatMessage } from './agent';
import type { Note } from '../types';

export async function loadAllNotes(): Promise<Note[]> {
  const ids = await window.quill.listNotes();
  const notes: Note[] = [];
  for (const id of ids) {
    const note = await readNote(id);
    if (note) notes.push(note);
  }
  notes.sort((a, b) => b.updatedAt - a.updatedAt);
  return notes;
}

export async function readNote(id: string): Promise<Note | null> {
  const raw = await window.quill.readNote(id);
  if (raw === null) return null;
  const { meta, body } = parseMarkdown(raw);
  const created = toMillis(meta['created']);
  const updated = toMillis(meta['updated']);
  return {
    id,
    title: String(meta['title'] ?? 'Untitled'),
    content: body,
    createdAt: created,
    updatedAt: updated,
    color: typeof meta['color'] === 'string' ? (meta['color'] as string) : undefined,
    pinned: meta['pinned'] === true,
    kind: typeof meta['kind'] === 'string' ? (meta['kind'] as 'note' | 'template') : 'note',
    tags: Array.isArray(meta['tags']) ? (meta['tags'] as string[]) : []
  };
}

export async function writeNote(note: Note): Promise<void> {
  const meta: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    created: new Date(note.createdAt).toISOString(),
    updated: new Date(note.updatedAt).toISOString(),
    kind: note.kind ?? 'note',
    source: 'quill'
  };
  if (note.color) meta.color = note.color;
  if (note.pinned) meta.pinned = true;
  if (note.tags && note.tags.length > 0) meta.tags = note.tags;
  await window.quill.writeNote(note.id, buildMarkdown(meta, note.content));
}

export async function deleteNote(id: string): Promise<void> {
  await window.quill.deleteNote(id);
}

export async function readAgentLog(noteId: string): Promise<ChatMessage[]> {
  const raw = await window.quill.readAgentLog(noteId);
  if (!raw) return [];
  const { body } = parseMarkdown(raw);
  return parseAgentLog(body);
}

export async function writeAgentLog(
  noteId: string,
  noteTitle: string,
  messages: ChatMessage[]
): Promise<void> {
  const meta: Record<string, unknown> = {
    note_id: noteId,
    note_title: noteTitle,
    source: 'quill',
    kind: 'agent_log',
    updated: new Date().toISOString()
  };
  const body = serializeAgentLog(messages);
  await window.quill.writeAgentLog(noteId, buildMarkdown(meta, body));
}

const MSG_HEADING = /^## (.+?) — (user|agent)(?:\s*\(([^)]+)\))?$/;

export function parseAgentLog(body: string): ChatMessage[] {
  const lines = body.split('\n');
  const messages: ChatMessage[] = [];
  let current: { role: 'user' | 'assistant'; content: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(MSG_HEADING);
    if (m) {
      if (current) messages.push({ role: current.role, content: current.content.join('\n').trim() });
      current = { role: m[2] === 'user' ? 'user' : 'assistant', content: [] };
    } else if (current) {
      current.content.push(line);
    }
  }
  if (current) messages.push({ role: current.role, content: current.content.join('\n').trim() });
  return messages.filter((m) => m.content.length > 0);
}

export function serializeAgentLog(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    const stamp = new Date().toISOString();
    const header = m.role === 'user' ? `## ${stamp} — user` : `## ${stamp} — agent`;
    parts.push(header, '', m.content, '');
  }
  return parts.join('\n');
}

function toMillis(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const d = Date.parse(v);
    if (!isNaN(d)) return d;
  }
  return Date.now();
}
