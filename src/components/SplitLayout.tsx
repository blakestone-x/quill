import { useCallback, useEffect, useRef, useState } from 'react';
import TabBar from './TabBar';
import Editor from './Editor';
import MarkdownPreview from './MarkdownPreview';
import type {
  DragPayload,
  DropEdge,
  Layout,
  Note,
  Pane as PaneType,
  PaneMode
} from '../types';

interface Props {
  layout: Layout;
  panes: PaneType[];
  notes: Note[];
  vRatio: number;
  hRatio: number;
  onSetVRatio: (r: number) => void;
  onSetHRatio: (r: number) => void;
  onSelectNote: (paneId: string, noteId: string) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onCreateNote: (paneId: string) => void;
  onDeleteNote: (paneId: string, noteId: string) => void;
  onColorNote: (id: string, color: string | undefined) => void;
  onReorderInPane: (
    paneId: string,
    fromNoteId: string,
    toNoteId: string | null,
    side: 'before' | 'after' | 'end'
  ) => void;
  onMoveBetweenPanes: (
    payload: DragPayload,
    toPaneId: string,
    toNoteId: string | null,
    side: 'before' | 'after' | 'end'
  ) => void;
  onSetPaneMode: (paneId: string, mode: PaneMode) => void;
  onDropOnEdge: (payload: DragPayload, targetPaneIdx: number, edge: DropEdge) => void;
  scrollSignals: Record<string, { position: number; token: number }>;
}

export default function SplitLayout(props: Props) {
  const { layout, panes, notes, vRatio, hRatio, onSetVRatio, onSetHRatio } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'v' | 'h' | null>(null);

  useEffect(() => {
    const onUp = () => {
      dragRef.current = null;
    };
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (dragRef.current === 'v') {
        onSetVRatio(clamp((e.clientX - rect.left) / rect.width));
      } else {
        onSetHRatio(clamp((e.clientY - rect.top) / rect.height));
      }
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [onSetVRatio, onSetHRatio]);

  const renderPane = useCallback(
    (pane: PaneType, paneIdx: number) => <PaneCell key={pane.id} pane={pane} paneIdx={paneIdx} props={props} />,
    [props]
  );

  if (layout === 'single' || panes.length < 2) {
    return <div className="h-full">{renderPane(panes[0], 0)}</div>;
  }

  if (layout === 'v' || layout === 'h') {
    const isV = layout === 'v';
    const first = `${(isV ? vRatio : hRatio) * 100}%`;
    const second = `${(1 - (isV ? vRatio : hRatio)) * 100}%`;
    return (
      <div
        ref={containerRef}
        className="h-full w-full flex"
        style={{ flexDirection: isV ? 'row' : 'column' }}
      >
        <div style={isV ? { width: first, minWidth: 0 } : { height: first, minHeight: 0 }}>
          {renderPane(panes[0], 0)}
        </div>
        <Divider
          direction={isV ? 'v' : 'h'}
          onStart={() => {
            dragRef.current = isV ? 'v' : 'h';
          }}
        />
        <div style={isV ? { width: second, minWidth: 0 } : { height: second, minHeight: 0 }}>
          {renderPane(panes[1], 1)}
        </div>
      </div>
    );
  }

  // grid: 2x2
  const top = `${hRatio * 100}%`;
  const bottom = `${(1 - hRatio) * 100}%`;
  const left = `${vRatio * 100}%`;
  const right = `${(1 - vRatio) * 100}%`;
  return (
    <div ref={containerRef} className="h-full w-full flex flex-col">
      <div className="flex" style={{ height: top, minHeight: 0 }}>
        <div style={{ width: left, minWidth: 0 }}>{renderPane(panes[0], 0)}</div>
        <Divider
          direction="v"
          onStart={() => {
            dragRef.current = 'v';
          }}
        />
        <div style={{ width: right, minWidth: 0 }}>{renderPane(panes[1], 1)}</div>
      </div>
      <Divider
        direction="h"
        onStart={() => {
          dragRef.current = 'h';
        }}
      />
      <div className="flex" style={{ height: bottom, minHeight: 0 }}>
        <div style={{ width: left, minWidth: 0 }}>{renderPane(panes[2], 2)}</div>
        <Divider
          direction="v"
          onStart={() => {
            dragRef.current = 'v';
          }}
        />
        <div style={{ width: right, minWidth: 0 }}>{renderPane(panes[3], 3)}</div>
      </div>
    </div>
  );
}

function Divider({ direction, onStart }: { direction: 'v' | 'h'; onStart: () => void }) {
  return (
    <div
      onMouseDown={onStart}
      className={
        direction === 'v'
          ? 'w-[3px] cursor-col-resize bg-ink-700 hover:bg-amber-500 active:bg-amber-400 transition-colors flex-shrink-0'
          : 'h-[3px] cursor-row-resize bg-ink-700 hover:bg-amber-500 active:bg-amber-400 transition-colors flex-shrink-0'
      }
    />
  );
}

interface PaneCellProps {
  pane: PaneType;
  paneIdx: number;
  props: Props;
}

function PaneCell({ pane, paneIdx, props }: PaneCellProps) {
  const {
    layout,
    notes,
    scrollSignals,
    onSelectNote,
    onCreateNote,
    onDeleteNote,
    onColorNote,
    onReorderInPane,
    onMoveBetweenPanes,
    onSetPaneMode,
    onUpdateNote,
    onDropOnEdge
  } = props;
  const paneMode: PaneMode = pane.mode ?? 'edit';
  const paneNotes = pane.noteIds
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => !!n);
  const activeNote = paneNotes.find((n) => n.id === pane.activeNoteId) ?? paneNotes[0] ?? null;
  const signal = activeNote ? scrollSignals[activeNote.id] : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      <TabBar
        paneId={pane.id}
        tabs={paneNotes}
        activeNoteId={pane.activeNoteId}
        mode={paneMode}
        onSelect={(id) => onSelectNote(pane.id, id)}
        onCreate={() => onCreateNote(pane.id)}
        onDelete={(id) => onDeleteNote(pane.id, id)}
        onColor={onColorNote}
        onReorder={(from, to, side) => onReorderInPane(pane.id, from, to, side)}
        onMoveBetweenPanes={(payload, to, side) => onMoveBetweenPanes(payload, pane.id, to, side)}
        onToggleMode={() => onSetPaneMode(pane.id, paneMode === 'edit' ? 'preview' : 'edit')}
      />
      <PaneBody
        paneIdx={paneIdx}
        paneId={pane.id}
        layout={layout}
        onDropToCenter={(payload) =>
          onMoveBetweenPanes(payload, pane.id, null, 'end')
        }
        onDropOnEdge={(payload, edge) => onDropOnEdge(payload, paneIdx, edge)}
      >
        {activeNote ? (
          paneMode === 'preview' ? (
            <MarkdownPreview content={activeNote.content} />
          ) : (
            <Editor
              note={activeNote}
              onChange={(u) => onUpdateNote(activeNote.id, u)}
              scrollSignal={signal}
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-paper-200/40 text-xs font-mono p-4 text-center">
            empty pane — drag a tab here or press +
          </div>
        )}
      </PaneBody>
    </div>
  );
}

interface PaneBodyProps {
  paneIdx: number;
  paneId: string;
  layout: Layout;
  children: React.ReactNode;
  onDropToCenter: (payload: DragPayload) => void;
  onDropOnEdge: (payload: DragPayload, edge: DropEdge) => void;
}

function PaneBody({ paneIdx: _paneIdx, paneId: _paneId, layout, children, onDropToCenter, onDropOnEdge }: PaneBodyProps) {
  const [hoverEdge, setHoverEdge] = useState<DropEdge | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const canSplit = layout !== 'grid';

  const computeEdge = (e: React.DragEvent): DropEdge => {
    if (!ref.current) return 'center';
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const edgeThreshold = 0.22;
    const dTop = y;
    const dBottom = 1 - y;
    const dLeft = x;
    const dRight = 1 - x;
    const minD = Math.min(dTop, dBottom, dLeft, dRight);
    if (minD > edgeThreshold) return 'center';
    if (minD === dTop) return 'top';
    if (minD === dBottom) return 'bottom';
    if (minD === dLeft) return 'left';
    return 'right';
  };

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 flex flex-col relative"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-quill-tab')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const edge = canSplit ? computeEdge(e) : 'center';
        setHoverEdge(edge);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverEdge(null);
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-quill-tab');
        const edge = hoverEdge;
        setHoverEdge(null);
        if (!raw) return;
        e.preventDefault();
        let payload: DragPayload;
        try {
          payload = JSON.parse(raw) as DragPayload;
        } catch {
          return;
        }
        if (!edge || edge === 'center') {
          onDropToCenter(payload);
        } else {
          onDropOnEdge(payload, edge);
        }
      }}
    >
      {children}
      {hoverEdge && <DropIndicator edge={hoverEdge} />}
    </div>
  );
}

function DropIndicator({ edge }: { edge: DropEdge }) {
  const base =
    'pointer-events-none absolute bg-amber-500/20 border-2 border-amber-400/70 transition-all duration-100';
  if (edge === 'center') {
    return <div className={base + ' inset-2'} />;
  }
  const styles: Record<Exclude<DropEdge, 'center'>, string> = {
    top: 'top-0 left-0 right-0 h-1/2',
    bottom: 'bottom-0 left-0 right-0 h-1/2',
    left: 'top-0 bottom-0 left-0 w-1/2',
    right: 'top-0 bottom-0 right-0 w-1/2'
  };
  return <div className={`${base} ${styles[edge]}`} />;
}

function clamp(v: number): number {
  return Math.max(0.15, Math.min(0.85, v));
}
