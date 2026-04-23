import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import TitleBar from './components/TitleBar';
import SplitLayout from './components/SplitLayout';
import AgentPanel from './components/AgentPanel';
import SearchOverlay from './components/SearchOverlay';
import UpdateBanner from './components/UpdateBanner';
import type { DragPayload, DropEdge, Layout, Note, Pane, PaneMode, SplitMode } from './types';

const WELCOME = `Welcome to Quill.

Quick tour:
  · Pin (top bar) keeps Quill floating above everything. Global hotkey Ctrl+Shift+Q shows/hides from anywhere.
  · Three split icons: vertical (side-by-side), horizontal (stacked), grid (2x2).
  · Each pane has its own tabs. Drag tabs to reorder them, drag across panes, or drag to the edge of any pane to split it.
  · Right-click a tab for a color. Eye icon toggles markdown preview per pane.
  · Inline math: type "150+200+50=" and it resolves to "= 400".
  · Sparkle icon opens the agent — paste your Anthropic key once, responses stream live.

Shortcuts:
  Ctrl+N     new note             Ctrl+\\       vertical split
  Ctrl+W     close note           Ctrl+-       horizontal split
  Ctrl+P     pin window           Ctrl+G       toggle 2x2 grid
  Ctrl+F     search all notes     Ctrl+K       agent panel
  Ctrl+Shift+Q  summon from any app
  Ctrl+Shift+I  open devtools

Delete this note to start fresh.`;

const MAX_PANES: Record<Layout, number> = { single: 1, v: 2, h: 2, grid: 4 };

interface ScrollSignal {
  position: number;
  token: number;
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [panes, setPanes] = useState<Pane[]>([
    { id: nanoid(), noteIds: [], activeNoteId: null, mode: 'edit' }
  ]);
  const [layout, setLayout] = useState<Layout>('single');
  const [vRatio, setVRatio] = useState(0.5);
  const [hRatio, setHRatio] = useState(0.5);
  const [pinned, setPinned] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentWidth, setAgentWidth] = useState(340);
  const [loaded, setLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrollSignals, setScrollSignals] = useState<Record<string, ScrollSignal>>({});
  const loadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const [savedNotes, savedPanes, savedLayout, savedSplit, savedV, savedH, savedAgentWidth, pinState] =
        await Promise.all([
          window.quill.getStore<Note[]>('notes'),
          window.quill.getStore<Pane[]>('panes'),
          window.quill.getStore<Layout>('layout'),
          window.quill.getStore<SplitMode>('splitMode'),
          window.quill.getStore<number>('vRatio'),
          window.quill.getStore<number>('hRatio'),
          window.quill.getStore<number>('agentWidth'),
          window.quill.isAlwaysOnTop()
        ]);

      let initialNotes: Note[] = [];
      let initialPanes: Pane[] = [];
      let initialLayout: Layout = 'single';

      if (savedNotes && savedNotes.length > 0) {
        initialNotes = savedNotes;
        if (savedPanes && savedPanes.length > 0) {
          initialPanes = migratePanes(savedPanes, savedNotes);
        } else {
          initialPanes = [
            {
              id: nanoid(),
              noteIds: savedNotes.map((n) => n.id),
              activeNoteId: savedNotes[0].id,
              mode: 'edit'
            }
          ];
        }
        initialLayout = migrateLayout(savedLayout, savedSplit, initialPanes.length);
      } else {
        const welcomeNote: Note = {
          id: nanoid(),
          title: 'Welcome',
          content: WELCOME,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        initialNotes = [welcomeNote];
        initialPanes = [
          { id: nanoid(), noteIds: [welcomeNote.id], activeNoteId: welcomeNote.id, mode: 'edit' }
        ];
      }

      setNotes(initialNotes);
      setPanes(initialPanes);
      setLayout(initialLayout);
      if (typeof savedV === 'number') setVRatio(savedV);
      if (typeof savedH === 'number') setHRatio(savedH);
      if (typeof savedAgentWidth === 'number') setAgentWidth(savedAgentWidth);
      setPinned(pinState);
      setLoaded(true);
      loadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => {
      window.quill.setStore('notes', notes);
      window.quill.setStore('panes', panes);
      window.quill.setStore('layout', layout);
      window.quill.setStore('vRatio', vRatio);
      window.quill.setStore('hRatio', hRatio);
      window.quill.setStore('agentWidth', agentWidth);
    }, 250);
    return () => clearTimeout(t);
  }, [notes, panes, layout, vRatio, hRatio, agentWidth]);

  const createNote = useCallback((paneId?: string) => {
    const note: Note = {
      id: nanoid(),
      title: 'Untitled',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setNotes((prev) => [...prev, note]);
    setPanes((prev) => {
      if (prev.length === 0) {
        return [{ id: nanoid(), noteIds: [note.id], activeNoteId: note.id, mode: 'edit' }];
      }
      const targetId = paneId ?? prev[0].id;
      return prev.map((p) =>
        p.id === targetId
          ? { ...p, noteIds: [...p.noteIds, note.id], activeNoteId: note.id }
          : p
      );
    });
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n))
    );
  }, []);

  const colorNote = useCallback((id: string, color: string | undefined) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
  }, []);

  const deleteNoteGlobal = useCallback((noteId: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      setPanes((ps) => {
        let updated = ps.map((p) => ({
          ...p,
          noteIds: p.noteIds.filter((id) => id !== noteId),
          activeNoteId:
            p.activeNoteId === noteId
              ? p.noteIds.filter((id) => id !== noteId)[0] ?? null
              : p.activeNoteId
        }));
        if (next.length === 0) {
          const replacement: Note = {
            id: nanoid(),
            title: 'Untitled',
            content: '',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          updated = updated.map((p, i) =>
            i === 0 ? { ...p, noteIds: [replacement.id], activeNoteId: replacement.id } : p
          );
          queueMicrotask(() => setNotes([replacement]));
          return updated;
        }
        return updated;
      });
      return next;
    });
  }, []);

  const deleteFromPane = useCallback(
    (paneId: string, noteId: string) => {
      const others = panes.filter((p) => p.id !== paneId);
      const existsElsewhere = others.some((p) => p.noteIds.includes(noteId));
      setPanes((prev) =>
        prev.map((p) => {
          if (p.id !== paneId) return p;
          const newIds = p.noteIds.filter((id) => id !== noteId);
          return {
            ...p,
            noteIds: newIds,
            activeNoteId: p.activeNoteId === noteId ? newIds[0] ?? null : p.activeNoteId
          };
        })
      );
      if (!existsElsewhere) {
        deleteNoteGlobal(noteId);
      }
    },
    [panes, deleteNoteGlobal]
  );

  const selectNoteInPane = useCallback((paneId: string, noteId: string) => {
    setPanes((prev) => prev.map((p) => (p.id === paneId ? { ...p, activeNoteId: noteId } : p)));
  }, []);

  const setPaneMode = useCallback((paneId: string, mode: PaneMode) => {
    setPanes((prev) => prev.map((p) => (p.id === paneId ? { ...p, mode } : p)));
  }, []);

  const reorderInPane = useCallback(
    (paneId: string, fromNoteId: string, toNoteId: string | null, side: 'before' | 'after' | 'end') => {
      setPanes((prev) =>
        prev.map((p) => {
          if (p.id !== paneId) return p;
          const filtered = p.noteIds.filter((id) => id !== fromNoteId);
          let insertAt: number;
          if (side === 'end' || toNoteId === null) insertAt = filtered.length;
          else {
            const targetIdx = filtered.indexOf(toNoteId);
            insertAt = targetIdx === -1 ? filtered.length : side === 'before' ? targetIdx : targetIdx + 1;
          }
          const next = [...filtered];
          next.splice(insertAt, 0, fromNoteId);
          return { ...p, noteIds: next };
        })
      );
    },
    []
  );

  const moveBetweenPanes = useCallback(
    (payload: DragPayload, toPaneId: string, toNoteId: string | null, side: 'before' | 'after' | 'end') => {
      setPanes((prev) =>
        prev.map((p) => {
          if (p.id === payload.fromPaneId && p.id !== toPaneId) {
            const newIds = p.noteIds.filter((id) => id !== payload.noteId);
            return {
              ...p,
              noteIds: newIds,
              activeNoteId: p.activeNoteId === payload.noteId ? newIds[0] ?? null : p.activeNoteId
            };
          }
          if (p.id === toPaneId) {
            const filtered = p.noteIds.filter((id) => id !== payload.noteId);
            let insertAt: number;
            if (side === 'end' || toNoteId === null) insertAt = filtered.length;
            else {
              const targetIdx = filtered.indexOf(toNoteId);
              insertAt =
                targetIdx === -1 ? filtered.length : side === 'before' ? targetIdx : targetIdx + 1;
            }
            const next = [...filtered];
            next.splice(insertAt, 0, payload.noteId);
            return { ...p, noteIds: next, activeNoteId: payload.noteId };
          }
          return p;
        })
      );
    },
    []
  );

  const applyLayout = useCallback(
    (target: Layout) => {
      setPanes((currentPanes) => {
        const max = MAX_PANES[target];
        const current = currentPanes.length;
        if (current === max) return currentPanes;

        if (current < max) {
          const extra: Pane[] = [];
          for (let i = current; i < max; i++) {
            extra.push({
              id: nanoid(),
              noteIds: [...(currentPanes[0]?.noteIds ?? [])],
              activeNoteId: currentPanes[0]?.activeNoteId ?? null,
              mode: 'edit'
            });
          }
          return [...currentPanes, ...extra];
        }

        // Shrinking — keep first `max` panes but merge discarded panes' exclusive notes into pane 0.
        const kept = currentPanes.slice(0, max);
        const dropped = currentPanes.slice(max);
        const coveredElsewhere = new Set(kept.flatMap((p) => p.noteIds));
        const orphans: string[] = [];
        for (const p of dropped) {
          for (const id of p.noteIds) {
            if (!coveredElsewhere.has(id) && !orphans.includes(id)) orphans.push(id);
          }
        }
        if (orphans.length === 0) return kept;
        const firstPane = kept[0];
        kept[0] = {
          ...firstPane,
          noteIds: [...firstPane.noteIds, ...orphans],
          activeNoteId: firstPane.activeNoteId ?? orphans[0]
        };
        return kept;
      });
      setLayout(target);
    },
    []
  );

  const toggleLayout = useCallback(
    (target: Layout) => {
      if (target === 'single') {
        applyLayout('single');
        return;
      }
      setLayout((current) => {
        if (current === target) {
          applyLayout('single');
          return 'single';
        }
        applyLayout(target);
        return target;
      });
    },
    [applyLayout]
  );

  // Split a target pane by dropping a tab onto its edge.
  // Promotes the layout: single → v/h, or v/h → grid.
  const dropOnEdge = useCallback(
    (payload: DragPayload, targetPaneIdx: number, edge: DropEdge) => {
      if (edge === 'center') return;
      setPanes((prev) => {
        const working = prev.map((p) =>
          p.id === payload.fromPaneId
            ? {
                ...p,
                noteIds: p.noteIds.filter((id) => id !== payload.noteId),
                activeNoteId:
                  p.activeNoteId === payload.noteId
                    ? p.noteIds.filter((id) => id !== payload.noteId)[0] ?? null
                    : p.activeNoteId
              }
            : p
        );

        const newPane: Pane = {
          id: nanoid(),
          noteIds: [payload.noteId],
          activeNoteId: payload.noteId,
          mode: 'edit'
        };

        const currentLayout = layoutRef.current;
        let nextLayout: Layout = currentLayout;
        let nextPanes: Pane[] = working;

        if (currentLayout === 'single') {
          nextLayout = edge === 'left' || edge === 'right' ? 'v' : 'h';
          nextPanes =
            edge === 'left' || edge === 'top' ? [newPane, working[0]] : [working[0], newPane];
        } else if (currentLayout === 'v' && (edge === 'top' || edge === 'bottom')) {
          nextLayout = 'grid';
          if (targetPaneIdx === 0) {
            nextPanes =
              edge === 'top'
                ? [newPane, working[1], working[0], emptyPane()]
                : [working[0], working[1], newPane, emptyPane()];
          } else {
            nextPanes =
              edge === 'top'
                ? [working[0], newPane, emptyPane(), working[1]]
                : [working[0], working[1], emptyPane(), newPane];
          }
        } else if (currentLayout === 'h' && (edge === 'left' || edge === 'right')) {
          nextLayout = 'grid';
          if (targetPaneIdx === 0) {
            nextPanes =
              edge === 'left'
                ? [newPane, working[0], working[1], emptyPane()]
                : [working[0], newPane, working[1], emptyPane()];
          } else {
            nextPanes =
              edge === 'left'
                ? [working[0], emptyPane(), newPane, working[1]]
                : [working[0], emptyPane(), working[1], newPane];
          }
        } else {
          // Grid layout or unsupported edge — fall back to simple move.
          return working.map((p, i) =>
            i === targetPaneIdx
              ? {
                  ...p,
                  noteIds: [...p.noteIds.filter((id) => id !== payload.noteId), payload.noteId],
                  activeNoteId: payload.noteId
                }
              : p
          );
        }

        if (nextLayout !== currentLayout) {
          queueMicrotask(() => setLayout(nextLayout));
        }
        return nextPanes;
      });
    },
    []
  );

  // Ratio refs to avoid stale closures
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const togglePin = useCallback(async () => {
    const next = !pinned;
    const actual = await window.quill.setAlwaysOnTop(next);
    setPinned(actual);
  }, [pinned]);

  const toggleAgent = useCallback(() => setAgentOpen((o) => !o), []);

  const closeActiveNote = useCallback(() => {
    const first = panes[0];
    if (first?.activeNoteId) deleteFromPane(first.id, first.activeNoteId);
  }, [panes, deleteFromPane]);

  const jumpToHit = useCallback((noteId: string, position: number) => {
    setPanes((prev) => {
      let found = false;
      const next = prev.map((p) => {
        if (p.noteIds.includes(noteId) && !found) {
          found = true;
          return { ...p, activeNoteId: noteId, mode: 'edit' as PaneMode };
        }
        return p;
      });
      if (!found && next[0]) {
        next[0] = {
          ...next[0],
          noteIds: [...next[0].noteIds, noteId],
          activeNoteId: noteId,
          mode: 'edit' as PaneMode
        };
      }
      return next;
    });
    setScrollSignals((prev) => ({
      ...prev,
      [noteId]: { position, token: (prev[noteId]?.token ?? 0) + 1 }
    }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setSearchOpen(true);
        }
        return;
      }
      switch (e.key) {
        case 'n':
          e.preventDefault();
          createNote();
          break;
        case 'w':
          e.preventDefault();
          closeActiveNote();
          break;
        case 'p':
          e.preventDefault();
          togglePin();
          break;
        case 'k':
          e.preventDefault();
          toggleAgent();
          break;
        case 'f':
          e.preventDefault();
          setSearchOpen(true);
          break;
        case '\\':
          e.preventDefault();
          toggleLayout('v');
          break;
        case '-':
          e.preventDefault();
          toggleLayout('h');
          break;
        case 'g':
          e.preventDefault();
          toggleLayout('grid');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createNote, closeActiveNote, togglePin, toggleAgent, toggleLayout]);

  const activeNote = notes.find((n) => n.id === panes[0]?.activeNoteId) ?? notes[0] ?? null;

  if (!loaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-ink-900 text-paper-200 text-sm font-mono">
        loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-ink-900 text-paper-100 overflow-hidden">
      <UpdateBanner />
      <TitleBar
        pinned={pinned}
        onTogglePin={togglePin}
        layout={layout}
        onToggleLayout={toggleLayout}
        agentOpen={agentOpen}
        onToggleAgent={toggleAgent}
        onSearch={() => setSearchOpen(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <SplitLayout
            layout={layout}
            panes={panes}
            notes={notes}
            vRatio={vRatio}
            hRatio={hRatio}
            onSetVRatio={setVRatio}
            onSetHRatio={setHRatio}
            onSelectNote={selectNoteInPane}
            onUpdateNote={updateNote}
            onCreateNote={createNote}
            onDeleteNote={deleteFromPane}
            onColorNote={colorNote}
            onReorderInPane={reorderInPane}
            onMoveBetweenPanes={moveBetweenPanes}
            onSetPaneMode={setPaneMode}
            onDropOnEdge={dropOnEdge}
            scrollSignals={scrollSignals}
          />
        </div>
        {agentOpen && (
          <AgentPanel
            width={agentWidth}
            onResize={setAgentWidth}
            context={activeNote?.content ?? ''}
            contextTitle={activeNote?.title ?? ''}
            onClose={toggleAgent}
          />
        )}
      </div>

      {searchOpen && (
        <SearchOverlay
          notes={notes}
          onPick={(hit) => jumpToHit(hit.noteId, hit.position)}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}

function emptyPane(): Pane {
  return { id: nanoid(), noteIds: [], activeNoteId: null, mode: 'edit' };
}

function migrateLayout(
  savedLayout: Layout | undefined,
  savedSplit: SplitMode | undefined,
  paneCount: number
): Layout {
  if (savedLayout) {
    if (savedLayout === 'grid' && paneCount < 4) return 'single';
    if ((savedLayout === 'v' || savedLayout === 'h') && paneCount < 2) return 'single';
    return savedLayout;
  }
  if (savedSplit === 'vertical' && paneCount >= 2) return 'v';
  if (savedSplit === 'horizontal' && paneCount >= 2) return 'h';
  return 'single';
}

function migratePanes(savedPanes: Pane[], savedNotes: Note[]): Pane[] {
  const allIds = savedNotes.map((n) => n.id);
  const allIdSet = new Set(allIds);
  const anyHasNoteIds = savedPanes.some((p) => Array.isArray(p.noteIds));
  if (!anyHasNoteIds) {
    return [
      {
        id: savedPanes[0]?.id ?? nanoid(),
        noteIds: allIds,
        activeNoteId: savedPanes[0]?.activeNoteId ?? allIds[0] ?? null,
        mode: 'edit'
      }
    ];
  }
  const cleaned = savedPanes.map((p) => {
    const noteIds = (p.noteIds ?? []).filter((id) => allIdSet.has(id));
    return {
      id: p.id,
      noteIds,
      activeNoteId:
        p.activeNoteId && noteIds.includes(p.activeNoteId) ? p.activeNoteId : noteIds[0] ?? null,
      mode: p.mode ?? ('edit' as PaneMode)
    };
  });
  const covered = new Set(cleaned.flatMap((p) => p.noteIds));
  const orphans = allIds.filter((id) => !covered.has(id));
  if (orphans.length > 0 && cleaned[0]) {
    cleaned[0] = {
      ...cleaned[0],
      noteIds: [...cleaned[0].noteIds, ...orphans],
      activeNoteId: cleaned[0].activeNoteId ?? orphans[0] ?? null
    };
  }
  return cleaned;
}
