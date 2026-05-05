import Anthropic from '@anthropic-ai/sdk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

export async function streamChat(
  apiKey: string,
  messages: ChatMessage[],
  system: string,
  handlers: StreamHandlers,
  model: string = DEFAULT_MODEL
): Promise<void> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 2048,
        system,
        messages
      },
      { signal: handlers.signal }
    );

    stream.on('text', (delta: string) => handlers.onDelta(delta));

    await stream.finalMessage();
    handlers.onDone?.();
  } catch (e) {
    if (handlers.signal?.aborted) {
      handlers.onDone?.();
      return;
    }
    const err = e instanceof Error ? e : new Error(String(e));
    handlers.onError?.(err);
  }
}

export interface ContextBundle {
  noteTitle: string;
  noteBody: string;
  extra: string;
  sources: string[];
}

export async function gatherAgentContext(
  noteTitle: string,
  noteBody: string,
  tags: string[] = []
): Promise<ContextBundle> {
  try {
    const result = await window.quill.gatherContext({ title: noteTitle, tags, body: noteBody });
    return {
      noteTitle,
      noteBody,
      extra: result?.context ?? '',
      sources: result?.sources ?? []
    };
  } catch {
    return { noteTitle, noteBody, extra: '', sources: [] };
  }
}

export function buildSystemPrompt(bundle: ContextBundle): string {
  const base = `You are an assistant embedded in Quill, a notepad used for multi-person note-taking. You have access to the user's active note and, when relevant, supplementary context from Cartograph (their personal memory system) and their CLAUDE.md files (their Claude Code instructions). Be direct and concise — match the terseness of a dispatcher's notes. Don't repeat the note back unless asked. When you use external context, briefly cite which source (e.g. "from CLAUDE.md" or "from cartograph working tier").`;

  const noteBlock = `<active_note title=${JSON.stringify(bundle.noteTitle || 'Untitled')}>
${bundle.noteBody || '(empty)'}
</active_note>`;

  const parts = [base, noteBlock];
  if (bundle.extra) {
    parts.push(
      `<external_context>\nThe following context was auto-gathered based on the note title/tags. Use it when relevant — ignore if not.\n\n${bundle.extra}\n</external_context>`
    );
  }
  return parts.join('\n\n');
}
