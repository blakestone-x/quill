import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Note } from '../types';
import { findExpressionBeforeCursor, tryEvaluate } from '../lib/calculator';

interface Props {
  note: Note;
  onChange: (updates: Partial<Note>) => void;
  scrollSignal?: { position: number; token: number };
  bodyOverride?: React.ReactNode;
  focusTitleSignal?: number;
}

export default function Editor({
  note,
  onChange,
  scrollSignal,
  bodyOverride,
  focusTitleSignal
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState(false);
  const lastSignalToken = useRef<number | undefined>(undefined);
  const lastFocusToken = useRef<number | undefined>(undefined);
  const lastNoteIdRef = useRef(note.id);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 650);
    return () => clearTimeout(t);
  }, [flash]);

  // When switching to a different note that's empty, focus the title input.
  useEffect(() => {
    if (lastNoteIdRef.current === note.id) return;
    lastNoteIdRef.current = note.id;
    if (!note.title && !note.content) {
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [note.id, note.title, note.content]);

  // Explicit focus-title request (from double-click on tab, etc.)
  useEffect(() => {
    if (focusTitleSignal === undefined) return;
    if (focusTitleSignal === lastFocusToken.current) return;
    lastFocusToken.current = focusTitleSignal;
    const el = titleRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [focusTitleSignal]);

  useEffect(() => {
    if (!scrollSignal || scrollSignal.token === lastSignalToken.current) return;
    lastSignalToken.current = scrollSignal.token;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.selectionStart = scrollSignal.position;
    ta.selectionEnd = scrollSignal.position;
    const textBefore = note.content.slice(0, scrollSignal.position);
    const approxLine = textBefore.split('\n').length;
    const lineHeight = 21;
    ta.scrollTop = Math.max(0, approxLine * lineHeight - ta.clientHeight / 2);
  }, [scrollSignal, note.content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== '=') return;
      const ta = e.currentTarget;
      const cursor = ta.selectionStart;
      if (cursor !== ta.selectionEnd) return;

      const found = findExpressionBeforeCursor(ta.value, cursor);
      if (!found) return;

      const result = tryEvaluate(found.expr);
      if (result === null) return;

      e.preventDefault();
      const before = ta.value.slice(0, cursor);
      const after = ta.value.slice(cursor);
      const insertion = `= ${result}`;
      const newValue = before + insertion + after;

      onChange({ content: newValue });
      const newCursor = cursor + insertion.length;

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursor;
          textareaRef.current.selectionEnd = newCursor;
          textareaRef.current.focus();
        }
      });
      setFlash(true);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-ink-900 relative">
      <div className="px-4 py-2 border-b border-ink-800 bg-ink-900 no-drag">
        <input
          ref={titleRef}
          type="text"
          value={note.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Title this note…"
          spellCheck
          data-quill-title-for={note.id}
          className="w-full bg-transparent text-paper-50 text-sm font-medium outline-none placeholder:text-paper-200/40 tracking-tight"
        />
      </div>
      <div className="flex-1 min-h-0 relative">
        {bodyOverride ?? (
          <textarea
            ref={textareaRef}
            value={note.content}
            onChange={(e) => onChange({ content: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="Start typing. Try 4+5= inline."
            spellCheck
            className={clsx(
              'absolute inset-0 w-full h-full px-4 py-3 bg-transparent text-paper-100 resize-none outline-none font-mono text-[13px] leading-[1.6] placeholder:text-paper-200/30 transition-colors duration-500',
              flash && 'bg-amber-500/10'
            )}
          />
        )}
      </div>
      {!bodyOverride && (
        <div className="px-4 py-1 border-t border-ink-800 flex items-center justify-between text-[10px] text-paper-200/60 font-mono no-drag">
          <span>
            {note.content.length} chars · {wordCount(note.content)} words
          </span>
          <span>edited {formatTime(note.updatedAt)}</span>
        </div>
      )}
    </div>
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
