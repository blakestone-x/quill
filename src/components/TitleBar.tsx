import {
  Circle,
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
  onSetLiveSync: (mode: 'off' | 'session' | 'template') => void;
  liveSyncMode: 'off' | 'session' | 'template';
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
  onSetLiveSync,
  liveSyncMode,
  cartographAvailable
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = () => setMenuOpen(false);
    setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const syncActive = liveSyncMode !== 'off';

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
              title={syncActive ? `Cartograph: live-syncing as ${liveSyncMode}` : 'Cartograph'}
              active={menuOpen || syncActive}
            >
              <Database size={14} />
              {syncActive && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
            </ToolButton>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-40 w-64 bg-ink-800 border border-ink-600 rounded-md shadow-2xl p-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-[10px] font-mono tracking-[0.18em] text-paper-300 border-b border-ink-700/60 mb-1">
                  LIVE SYNC (this note)
                </div>
                <RadioRow
                  active={liveSyncMode === 'off'}
                  label="Off"
                  hint="Local only"
                  onClick={() => {
                    onSetLiveSync('off');
                    setMenuOpen(false);
                  }}
                />
                <RadioRow
                  active={liveSyncMode === 'session'}
                  label="Live as session"
                  hint="→ memory/working"
                  onClick={() => {
                    onSetLiveSync('session');
                    setMenuOpen(false);
                  }}
                />
                <RadioRow
                  active={liveSyncMode === 'template'}
                  label="Live as template"
                  hint="→ memory/procedural"
                  onClick={() => {
                    onSetLiveSync('template');
                    setMenuOpen(false);
                  }}
                />

                <div className="px-2 py-1 mt-1 text-[10px] font-mono tracking-[0.18em] text-paper-300 border-t border-ink-700/60 pt-2">
                  ONE-SHOT PUSH
                </div>
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
                    <span className="block text-[9px] text-paper-300">
                      timestamped → working
                    </span>
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
                    Push as template
                    <span className="block text-[9px] text-paper-300">
                      timestamped → procedural
                    </span>
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

function RadioRow({
  active,
  label,
  hint,
  onClick
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left',
        active ? 'bg-amber-500/15 text-amber-300' : 'text-paper-100 hover:bg-ink-700'
      )}
    >
      <Circle
        size={10}
        className={active ? 'fill-amber-400 text-amber-400' : 'text-paper-300'}
      />
      <span className="flex-1">
        {label}
        <span className="block text-[9px] text-paper-300">{hint}</span>
      </span>
    </button>
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
        'h-7 w-7 mx-[1px] flex items-center justify-center rounded transition-colors relative',
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
