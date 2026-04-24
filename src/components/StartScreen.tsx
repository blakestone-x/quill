import { useMemo } from 'react';
import { Clock, Pin, Search, Upload } from 'lucide-react';
import type { Note } from '../types';

interface Props {
  allNotes: Note[];
  onSelectNote: (id: string) => void;
  onSearch: () => void;
  onCreateBlank: () => void;
  cartographAvailable: boolean;
}

export default function StartScreen({
  allNotes,
  onSelectNote,
  onSearch,
  cartographAvailable
}: Props) {
  const recent = useMemo(
    () => allNotes.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
    [allNotes]
  );
  const pinned = useMemo(
    () => allNotes.filter((n) => n.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
    [allNotes]
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-ink-900 no-drag">
      <div className="max-w-[820px] mx-auto px-8 py-10">
        <div className="mb-8 text-center">
          <div className="text-[11px] font-mono tracking-[0.24em] text-paper-300 mb-2">QUILL</div>
          <h1 className="text-2xl font-medium text-paper-50 mb-1">New note</h1>
          <p className="text-xs text-paper-200/60">
            Start typing above, or jump to a recent note below. Press Ctrl+F to search everything.
            {cartographAvailable && (
              <span className="block mt-1 text-amber-400/80">Cartograph is connected.</span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onSearch}
          className="w-full mb-8 flex items-center gap-3 px-4 py-3 bg-ink-800 border border-ink-700 hover:border-amber-500/60 rounded-md text-paper-200 hover:text-paper-50 transition-colors text-sm"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search notes and agent history…</span>
          <span className="text-[10px] font-mono text-paper-300">Ctrl+F</span>
        </button>

        {pinned.length > 0 && (
          <Section title="Pinned" icon={<Pin size={11} />} >
            <Cards notes={pinned} onSelect={onSelectNote} />
          </Section>
        )}

        {recent.length > 0 && (
          <Section title="Recent" icon={<Clock size={11} />}>
            <Cards notes={recent} onSelect={onSelectNote} />
          </Section>
        )}

        {recent.length === 0 && pinned.length === 0 && (
          <div className="text-center text-paper-200/40 text-xs font-mono py-8">
            no notes yet — start typing up top
          </div>
        )}

        <div className="mt-10 text-center text-[10px] text-paper-300/60 font-mono">
          <Upload size={10} className="inline mr-1" />
          Notes stored as .md in %APPDATA%\Quill\notes
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-1.5 mb-2 text-[10px] font-mono tracking-[0.18em] text-paper-300">
        {icon}
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Cards({ notes, onSelect }: { notes: Note[]; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onSelect(n.id)}
          className="group text-left p-3 bg-ink-800 border border-ink-700 hover:border-amber-500/40 rounded-md transition-colors"
          style={n.color ? { borderLeftWidth: 3, borderLeftColor: n.color } : undefined}
        >
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="text-xs font-medium text-paper-50 truncate">
              {n.title || 'Untitled'}
            </span>
            <span className="text-[9px] font-mono text-paper-300 flex-shrink-0">
              {formatAgo(n.updatedAt)}
            </span>
          </div>
          <div className="text-[11px] text-paper-200/70 line-clamp-2 leading-snug font-mono whitespace-pre-wrap break-words">
            {n.content.replace(/\s+/g, ' ').trim().slice(0, 140) || '(empty)'}
          </div>
        </button>
      ))}
    </div>
  );
}

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
