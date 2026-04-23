import {
  Minus,
  Pin,
  Search,
  Sparkles,
  Square,
  X,
  Columns2,
  Rows2,
  LayoutGrid
} from 'lucide-react';
import clsx from 'clsx';
import type { Layout } from '../types';

interface Props {
  pinned: boolean;
  onTogglePin: () => void;
  layout: Layout;
  onToggleLayout: (target: Layout) => void;
  agentOpen: boolean;
  onToggleAgent: () => void;
  onSearch: () => void;
}

export default function TitleBar({
  pinned,
  onTogglePin,
  layout,
  onToggleLayout,
  agentOpen,
  onToggleAgent,
  onSearch
}: Props) {
  return (
    <div className="drag-region h-9 bg-ink-950 border-b border-ink-700 flex items-center justify-between select-none">
      <div className="pl-3 flex items-center gap-2">
        <div
          className={clsx(
            'w-2 h-2 rounded-full transition-colors',
            pinned ? 'bg-amber-400' : 'bg-amber-600/60'
          )}
        />
        <span className="text-[11px] font-mono text-paper-200 tracking-[0.18em]">QUILL</span>
      </div>

      <div className="no-drag flex items-center">
        <ToolButton onClick={onSearch} title="Search all notes (Ctrl+F)">
          <Search size={14} />
        </ToolButton>

        <div className="w-px h-4 bg-ink-700 mx-1" />

        <ToolButton
          active={layout === 'v'}
          onClick={() => onToggleLayout('v')}
          title="Vertical split (Ctrl+\)"
        >
          <Columns2 size={14} />
        </ToolButton>
        <ToolButton
          active={layout === 'h'}
          onClick={() => onToggleLayout('h')}
          title="Horizontal split (Ctrl+-)"
        >
          <Rows2 size={14} />
        </ToolButton>
        <ToolButton
          active={layout === 'grid'}
          onClick={() => onToggleLayout('grid')}
          title="2x2 grid (Ctrl+G)"
        >
          <LayoutGrid size={14} />
        </ToolButton>

        <div className="w-px h-4 bg-ink-700 mx-1" />

        <ToolButton active={agentOpen} onClick={onToggleAgent} title="Agent panel (Ctrl+K)">
          <Sparkles size={14} />
        </ToolButton>
        <ToolButton
          active={pinned}
          onClick={onTogglePin}
          title={pinned ? 'Unpin (Ctrl+P)' : 'Pin to top (Ctrl+P)'}
        >
          <Pin
            size={14}
            className={clsx('transition-transform duration-200', pinned && 'rotate-45')}
          />
        </ToolButton>

        <div className="w-px h-4 bg-ink-700 mx-1" />

        <WindowButton onClick={() => window.quill.minimize()} title="Minimize">
          <Minus size={14} />
        </WindowButton>
        <WindowButton onClick={() => window.quill.maximizeToggle()} title="Maximize">
          <Square size={11} />
        </WindowButton>
        <WindowButton onClick={() => window.quill.close()} title="Close" danger>
          <X size={14} />
        </WindowButton>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'h-7 w-7 mx-[1px] flex items-center justify-center rounded transition-colors',
        active
          ? 'text-amber-400 bg-ink-800'
          : 'text-paper-200 hover:text-paper-50 hover:bg-ink-800'
      )}
    >
      {children}
    </button>
  );
}

function WindowButton({
  onClick,
  title,
  children,
  danger
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'h-9 w-11 flex items-center justify-center text-paper-200 transition-colors',
        danger ? 'hover:bg-red-600 hover:text-white' : 'hover:bg-ink-800'
      )}
    >
      {children}
    </button>
  );
}
