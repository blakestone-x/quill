import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Note } from '../types';
import { searchNotes, type SearchHit } from '../lib/search';

interface Props {
  notes: Note[];
  onPick: (hit: SearchHit) => void;
  onClose: () => void;
}

export default function SearchOverlay({ notes, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => searchNotes(notes, query), [notes, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    const item = listRef.current?.children[selected] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, hits.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[selected]) {
        onPick(hits[selected]);
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40 no-drag"
      onMouseDown={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] bg-ink-800 border border-ink-600 rounded-md shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-700">
          <Search size={14} className="text-paper-200/60" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search all notes…"
            className="flex-1 bg-transparent text-paper-50 outline-none text-sm placeholder:text-paper-200/40"
          />
          <span className="text-[10px] font-mono text-paper-200/50">
            {query ? `${hits.length} hit${hits.length === 1 ? '' : 's'}` : 'esc to close'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-paper-200/60 hover:text-paper-50 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto"
          onKeyDown={onKeyDown}
        >
          {query && hits.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-paper-200/50 font-mono">
              no matches
            </div>
          )}
          {hits.map((hit, i) => (
            <button
              key={`${hit.noteId}-${hit.position}-${hit.field}`}
              type="button"
              onClick={() => {
                onPick(hit);
                onClose();
              }}
              onMouseEnter={() => setSelected(i)}
              className={
                'w-full text-left px-3 py-2 border-b border-ink-700/50 transition-colors block ' +
                (i === selected ? 'bg-ink-700' : 'hover:bg-ink-700/50')
              }
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-paper-50 font-medium truncate">{hit.noteTitle}</span>
                <span className="text-[10px] font-mono text-paper-200/60 ml-2 flex-shrink-0">
                  {hit.field === 'title' ? 'title' : `@${hit.position}`}
                </span>
              </div>
              <div className="text-[12px] text-paper-200 font-mono leading-snug truncate">
                {renderSnippet(hit)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderSnippet(hit: SearchHit) {
  const { snippet, matchStart, matchLength } = hit;
  const before = snippet.slice(0, matchStart);
  const match = snippet.slice(matchStart, matchStart + matchLength);
  const after = snippet.slice(matchStart + matchLength);
  return (
    <>
      {before}
      <span className="bg-amber-500/40 text-paper-50 px-0.5 rounded-sm">{match}</span>
      {after}
    </>
  );
}
