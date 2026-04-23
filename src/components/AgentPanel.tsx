import { useEffect, useRef, useState } from 'react';
import { Key, Send, Sparkles, StopCircle, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { streamChat, DEFAULT_MODEL, type ChatMessage } from '../lib/agent';

interface Props {
  context: string;
  contextTitle: string;
  width: number;
  onResize: (w: number) => void;
  onClose: () => void;
}

export default function AgentPanel({ context, contextTitle, width, onResize, onClose }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const k = await window.quill.getStore<string>('apiKey');
      if (k) setApiKey(k);
      setKeyLoaded(true);
    })();
  }, []);

  useEffect(() => {
    const onUp = () => {
      draggingRef.current = false;
    };
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const w = window.innerWidth - e.clientX;
      onResize(Math.max(280, Math.min(720, w)));
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [onResize]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const saveKey = async (k: string) => {
    const trimmed = k.trim();
    setApiKey(trimmed);
    if (trimmed) {
      await window.quill.setStore('apiKey', trimmed);
    } else {
      await window.quill.deleteStore('apiKey');
      setMessages([]);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || !apiKey || busy) return;
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    const priorMessages = [...messages, userMsg];
    setMessages([...priorMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const system = buildSystemPrompt(contextTitle, context);

    await streamChat(apiKey, priorMessages, system, {
      signal: controller.signal,
      onDelta: (text) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + text };
          }
          return next;
        });
      },
      onDone: () => {
        setBusy(false);
        abortRef.current = null;
      },
      onError: (e) => {
        setError(e.message);
        setBusy(false);
        setMessages((prev) => prev.filter((_, i) => i !== prev.length - 1 || prev[i].content));
        abortRef.current = null;
      }
    });
  };

  if (!keyLoaded) return null;

  return (
    <div
      className="border-l border-ink-700 bg-ink-800 flex flex-shrink-0"
      style={{ width }}
    >
      <div
        onMouseDown={() => {
          draggingRef.current = true;
        }}
        className="w-[3px] cursor-col-resize bg-ink-700 hover:bg-amber-500 active:bg-amber-400 transition-colors no-drag"
      />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-9 border-b border-ink-700 flex items-center justify-between px-3 no-drag">
          <div className="flex items-center gap-2 text-[11px]">
            <Sparkles size={12} className={clsx('transition-colors', busy ? 'text-amber-400 animate-pulse' : 'text-amber-400')} />
            <span className="font-mono text-paper-200 tracking-[0.18em]">AGENT</span>
            <span className="text-paper-300 font-mono text-[10px]">{DEFAULT_MODEL}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-paper-200 hover:text-paper-50 transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {!apiKey ? (
          <ApiKeyPrompt onSave={saveKey} />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-[13px] min-h-0">
              {messages.length === 0 && (
                <div className="text-paper-200/60 text-xs leading-relaxed">
                  Ask about{' '}
                  <span className="text-amber-400">"{contextTitle || 'this note'}"</span> —
                  summarize, extract action items, draft a follow-up, spot contradictions.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className="space-y-1">
                  <div
                    className={clsx(
                      'text-[10px] font-mono tracking-[0.18em]',
                      m.role === 'user' ? 'text-amber-400' : 'text-paper-300'
                    )}
                  >
                    {m.role === 'user' ? 'YOU' : 'AGENT'}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-paper-100">
                    {m.content}
                    {busy && i === messages.length - 1 && m.role === 'assistant' && (
                      <span className="inline-block w-1.5 h-3.5 bg-amber-400 ml-0.5 align-middle animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
              {error && (
                <div className="text-red-400 text-xs font-mono whitespace-pre-wrap">{error}</div>
              )}
            </div>

            <div className="border-t border-ink-700 p-2 flex gap-2 no-drag">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about this note…"
                rows={2}
                disabled={busy}
                className="flex-1 bg-ink-900 border border-ink-700 rounded px-2 py-1.5 text-[13px] text-paper-100 resize-none outline-none focus:border-amber-500 transition-colors font-sans disabled:opacity-50"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={cancel}
                  className="px-3 h-[38px] self-end bg-red-600 text-white rounded hover:bg-red-500 transition-colors flex items-center justify-center"
                  title="Stop"
                >
                  <StopCircle size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={send}
                  disabled={!input.trim()}
                  className="px-3 h-[38px] self-end bg-amber-500 text-ink-950 rounded hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  title="Send (Enter)"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
            <div className="px-3 py-2 border-t border-ink-700 flex items-center justify-between no-drag">
              <button
                type="button"
                onClick={() => setMessages([])}
                className="flex items-center gap-1 text-[10px] text-paper-200/60 hover:text-paper-100 transition-colors font-mono"
                title="Clear conversation"
              >
                <Trash2 size={10} /> clear
              </button>
              <button
                type="button"
                onClick={() => saveKey('')}
                className="text-[10px] text-paper-200/60 hover:text-paper-100 transition-colors font-mono"
              >
                remove key
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function buildSystemPrompt(title: string, content: string): string {
  return `You are an assistant embedded in Quill, a notepad used for taking notes on multiple people at once.

The user is currently on a note titled "${title || 'Untitled'}". Here is the full content of that note:

<note>
${content || '(empty)'}
</note>

Answer questions about it, suggest improvements, summarize, extract action items, or draft follow-ups. Be direct and concise — match the terseness of a dispatcher's notes. Don't repeat the note back to them unless explicitly asked.`;
}

function ApiKeyPrompt({ onSave }: { onSave: (k: string) => void }) {
  const [key, setKey] = useState('');
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center no-drag">
      <Key size={22} className="text-amber-400 mb-3" />
      <div className="text-sm text-paper-50 mb-1">Anthropic API key</div>
      <div className="text-[11px] text-paper-200/60 mb-4 leading-relaxed max-w-[220px]">
        Stored in <span className="font-mono text-paper-200">%APPDATA%\Quill</span>. Get one at
        console.anthropic.com → API keys.
      </div>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && key.trim()) onSave(key.trim());
        }}
        placeholder="sk-ant-…"
        className="w-full max-w-[240px] bg-ink-900 border border-ink-700 rounded px-3 py-2 text-sm text-paper-100 outline-none focus:border-amber-500 transition-colors font-mono"
      />
      <button
        type="button"
        onClick={() => key.trim() && onSave(key.trim())}
        disabled={!key.trim()}
        className="mt-3 px-4 py-1.5 bg-amber-500 text-ink-950 rounded text-sm font-medium hover:bg-amber-400 disabled:opacity-40 transition-colors"
      >
        Save
      </button>
    </div>
  );
}
