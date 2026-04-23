import Anthropic from '@anthropic-ai/sdk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export async function chat(
  apiKey: string,
  messages: ChatMessage[],
  system: string,
  model: string = DEFAULT_MODEL
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages
  });

  const parts = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text);

  return parts.join('\n').trim();
}

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
