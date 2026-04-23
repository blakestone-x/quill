import { useState } from 'react';
import { Plus, Eye, Pencil } from 'lucide-react';
import clsx from 'clsx';
import type { Note, DragPayload, PaneMode } from '../types';
import TabContextMenu from './TabContextMenu';

type DropSlot = { targetNoteId: string; side: 'before' | 'after' } | 'end' | null;

interface Props {
  paneId: string;
  tabs: Note[];
  activeNoteId: string | null;
  mode: PaneMode;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onColor: (id: string, color: string | undefined) => void;
  onReorder: (fromNoteId: string, toNoteId: string | null, side: 'before' | 'after' | 'end') => void;
  onMoveBetweenPanes: (payload: DragPayload, toNoteId: string | null, side: 'before' | 'after' | 'end') => void;
  onToggleMode: () => void;
}

export default function TabBar({
  paneId,
  tabs,
  activeNoteId,
  mode,
  onSelect,
  onCreate,
  onDelete,
  onColor,
  onReorder,
  onMoveBetweenPanes,
  onToggleMode
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  const [dropSlot, setDropSlot] = useState<DropSlot>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    const payload: DragPayload = { noteId, fromPaneId: paneId };
    e.dataTransfer.setData('application/x-quill-tab', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(noteId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropSlot(null);
  };

  const handleTabDragOver = (e: React.DragEvent, noteId: string) => {
    if (!e.dataTransfer.types.includes('application/x-quill-tab')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDropSlot({ targetNoteId: noteId, side });
  };

  const handleTrailingDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-quill-tab')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropSlot('end');
  };

  const handleDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-quill-tab');
    if (!raw) return;
    e.preventDefault();
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }
    const slot = dropSlot;
    setDropSlot(null);
    setDraggingId(null);

    if (payload.fromPaneId === paneId) {
      if (slot === 'end') {
        onReorder(payload.noteId, null, 'end');
      } else if (slot) {
        onReorder(payload.noteId, slot.targetNoteId, slot.side);
      }
    } else {
      if (slot === 'end' || !slot) {
        onMoveBetweenPanes(payload, null, 'end');
      } else {
        onMoveBetweenPanes(payload, slot.targetNoteId, slot.side);
      }
    }
  };

  return (
    <div
      className="h-9 bg-ink-800 border-b border-ink-700 flex items-stretch overflow-x-auto overflow-y-hidden no-drag relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-quill-tab') && !dropSlot) {
          e.preventDefault();
          setDropSlot('end');
        }
      }}
      onDrop={handleDrop}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropSlot(null);
      }}
    >
      {tabs.map((note) => {
        const active = note.id === activeNoteId;
        const dragging = note.id === draggingId;
        const showIndicatorBefore =
          dropSlot && dropSlot !== 'end' && dropSlot.targetNoteId === note.id && dropSlot.side === 'before';
        const showIndicatorAfter =
          dropSlot && dropSlot !== 'end' && dropSlot.targetNoteId === note.id && dropSlot.side === 'after';
        return (
          <div key={note.id} className="flex items-stretch relative">
            {showIndicatorBefore && <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-amber-400" />}
            <button
              type="button"
              draggable
              onDragStart={(e) => handleDragStart(e, note.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleTabDragOver(e, note.id)}
              onDrop={handleDrop}
              onClick={() => onSelect(note.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, noteId: note.id });
              }}
              style={note.color ? { boxShadow: `inset 3px 0 0 ${note.color}` } : undefined}
              className={clsx(
                'group flex items-center gap-2 pl-3 pr-2 border-r border-ink-700 text-xs whitespace-nowrap transition-colors relative',
                active ? 'bg-ink-900 text-paper-50' : 'text-paper-200 hover:bg-ink-700 hover:text-paper-100',
                dragging && 'opacity-40'
              )}
            >
              {note.color && !active && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: note.color }}
                />
              )}
              <span className="max-w-[160px] truncate">{note.title || 'Untitled'}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(note.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onDelete(note.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity text-[14px] leading-none px-1"
                title="Close tab"
              >
                ×
              </span>
              {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-400" />}
            </button>
            {showIndicatorAfter && <div className="absolute right-0 top-1 bottom-1 w-[2px] bg-amber-400" />}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        className="px-3 text-paper-200 hover:text-paper-50 hover:bg-ink-700 flex items-center transition-colors"
        title="New tab (Ctrl+N)"
      >
        <Plus size={14} />
      </button>
      <div
        className="flex-1 relative"
        onDragOver={handleTrailingDragOver}
        onDrop={handleDrop}
      >
        {dropSlot === 'end' && tabs.length > 0 && (
          <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-amber-400" />
        )}
      </div>
      <button
        type="button"
        onClick={onToggleMode}
        title={mode === 'edit' ? 'Preview (markdown)' : 'Edit'}
        className={clsx(
          'px-3 text-xs flex items-center gap-1 transition-colors border-l border-ink-700',
          mode === 'preview' ? 'text-amber-400 bg-ink-900' : 'text-paper-200 hover:text-paper-50 hover:bg-ink-700'
        )}
      >
        {mode === 'edit' ? <Eye size={13} /> : <Pencil size={13} />}
      </button>

      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          currentColor={tabs.find((t) => t.id === menu.noteId)?.color}
          onPick={(color) => onColor(menu.noteId, color)}
          onDelete={() => onDelete(menu.noteId)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
