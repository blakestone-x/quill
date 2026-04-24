import type { Note } from '../types';
import type { ChatMessage } from './agent';

export interface PushResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

export async function isCartographAvailable(): Promise<boolean> {
  return window.quill.cartographAvailable();
}

export async function pushNoteAsSessionLog(
  note: Note,
  agentMessages: ChatMessage[]
): Promise<PushResult> {
  const body = buildSessionLogBody(note, agentMessages);
  return window.quill.cartographPush({
    tier: 'working',
    kind: 'session_log',
    title: note.title,
    body,
    frontmatter: {
      session_id: note.id,
      note_title: note.title,
      note_created: new Date(note.createdAt).toISOString(),
      agent_turn_count: agentMessages.length,
      tags: note.tags ?? []
    }
  });
}

export async function pushNoteAsTemplate(note: Note): Promise<PushResult> {
  return window.quill.cartographPush({
    tier: 'procedural',
    kind: 'template',
    title: note.title,
    body: note.content,
    frontmatter: {
      template_id: note.id,
      status: 'reviewed',
      tags: note.tags ?? []
    }
  });
}

function buildSessionLogBody(note: Note, messages: ChatMessage[]): string {
  const sections: string[] = [];
  sections.push(`# ${note.title || 'Untitled'}`, '');
  sections.push('## Note body', '');
  sections.push(note.content || '_(empty)_', '');
  if (messages.length > 0) {
    sections.push('## Agent session', '');
    for (const m of messages) {
      sections.push(`### ${m.role === 'user' ? 'User' : 'Agent'}`, '', m.content, '');
    }
  }
  return sections.join('\n');
}
