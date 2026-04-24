import {
  Columns2,
  Database,
  LayoutGrid,
  Minus,
  Pin,
  Rows2,
  Search,
  Sparkles,
  Square,
  Upload,
  X
} from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { Layout } from '../types';

interface Props {
  pinned: boolean;
  onTogglePin: () => void;
  layout: Layout;
  onToggleLayout: (target: Layout) => void;
  agentOpen: boolean;
  onToggleAgent: () => void;
  onSearch: () => void;
  onPushSession: () => void;
  onPushTemplate: () => void;
  cartographAvailable: boolean;
}

export default function TitleBar({
  pinned,
  onTogglePin,
  layout,
  onToggleLayout,
  agentOpen,
  onToggleAgent,
  onSearch,
  onPushSession,
  onPushTemplate,
  cartographAvailable
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = () => setMenuOpen(false);
    setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

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
        <ToolButton onClick={onSearch} title="Search all notes + agent (Ctrl+F)">
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

        {cartographAvailable && (
          <div className="relative">
            <ToolButton
              onClick={() => setMenuOpen((v) => !v)}
              title="Push current note to Cartograph"
              active={menuOpen}
            >
              <Database size={14} />
            </ToolButton>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-40 w-52 bg-ink-800 border border-ink-600 rounded-md shadow-2xl p-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onPushSession();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-paper-100 hover:bg-ink-700 transition-colors text-left"
                >
                  <Upload size={12} className="text-amber-400" />
                  <span className="flex-1">
                    Push as session
                    <span className="block text-[9px] text-paper-300">→ memory/working</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onPushTemplate();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-paper-100 hover:bg-ink-700 transition-colors text-left"
                >
                  <Upload size={12} className="text-amber-400" />
                  <span className="flex-1">
                    Save as template
                    <span className="block text-[9px] text-paper-300">→ memory/procedural</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <ToolButton active={agentOpen} onClick={onToggleAgent} title="Agent panel (Ctrl+K)">
          <Sparkles size={14} />
        </ToolButton>
        <ToolButton
          active={pinned}
          onClick={onTogglePin}
          title={pinned ? 'Unpin (Ctrl+P)' : 'Pin to top (Ctrl+P)'}
        >
          <Pin size={14} className={clsx('transition-transform duration-200', pinned && 'rotate-45')} />
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
        active ? 'text-amber-400 bg-ink-800' : 'text-paper-200 hover:text-paper-50 hover:bg-ink-800'
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
