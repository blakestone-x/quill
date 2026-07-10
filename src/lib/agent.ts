import Anthropic from '@anthropic-ai/sdk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Millisecond timestamp of when the message was created. Local only. */
  ts?: number;
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
        // The API accepts role + content only; drop local-only fields like ts.
        messages: messages.map((m) => ({ role: m.role, content: m.content }))
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

export function buildSystemPrompt(noteTitle: string, noteBody: string): string {
  const base = `You are an assistant embedded in Quill, a desktop notepad. The user's active note is below. Be direct and concise; keep answers short and skimmable. Don't repeat the note back unless asked.`;

  const noteBlock = `<active_note title=${JSON.stringify(noteTitle || 'Untitled')}>
${noteBody || '(empty)'}
</active_note>`;

  return [base, noteBlock].join('\n\n');
}
