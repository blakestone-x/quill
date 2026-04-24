import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import TitleBar from './components/TitleBar';
import SplitLayout from './components/SplitLayout';
import AgentPanel from './components/AgentPanel';
import SearchOverlay from './components/SearchOverlay';
import UpdateBanner from './components/UpdateBanner';
import type {
  DragPayload,
  DropEdge,
  Layout,
  Note,
  Pane,
  PaneMode,
  SplitMode
} from './types';
import type { ChatMessage } from './lib/agent';
import * as storage from './lib/storage';
import { pushNoteAsSessionLog, pushNoteAsTemplate, pushNoteLive, unlinkLive } from './lib/cartograph';

const WELCOME = `Welcome to Quill v1.1.

Every note is stored as a standalone .md file in %APPDATA%\\Quill\\notes.

New in v1.1:
  · **Title works.** Click the title field up top and type — it stays focused whether you're on the start screen or an active note.
  · **Live Cartograph sync.** Database icon → pick "Live as session" or "Live as template" to make this note auto-save into Cartograph on every change. Amber dot on the tab means live-sync is on.
  · **Agent gets wider context.** When you ask the agent something, Quill auto-injects your CLAUDE.md (global + workspace), Claude's memory index, and up to 5 relevant Cartograph working-tier excerpts into the system prompt. The agent cites which source it used. A small "+N" badge in the agent panel header shows how many external sources were pulled.

Quick tour:
  · Pin (top bar) keeps Quill floating. Ctrl+Shift+Q summons from anywhere.
  · Three layouts: vertical, horizontal, 2x2 grid. Drag tabs to edges to split.
  · Right-click a tab for colors + pin. Pinned tabs stick left.
  · Inline math: type "150+200+50=" and it resolves to "= 400".
  · Ctrl+F searches notes and agent history together.

Shortcuts:
  Ctrl+N new note   Ctrl+W close   Ctrl+\\ vsplit   Ctrl+- hsplit   Ctrl+G grid
  Ctrl+F search     Ctrl+K agent   Ctrl+P pin       Ctrl+Shift+Q summon

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
  const [titleFocusSignals, setTitleFocusSignals] = useState<Record<string, number>>({});
  const [agentHistory, setAgentHistory] = useState<Record<string, ChatMessage[]>>({});
  const [cartographAvailable, setCartographAvailable] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadedRef = useRef(false);
  const layoutRef = useRef(layout);
  const notesRef = useRef(notes);
  const agentHistoryRef = useRef(agentHistory);
  const writeQueueRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const agentLogWriteQueueRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const liveSyncQueueRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    agentHistoryRef.current = agentHistory;
  }, [agentHistory]);

  useEffect(() => {
    (async () => {
      const [settings, pinState, cartoAvail] = await Promise.all([
        window.quill.allSettings(),
        window.quill.isAlwaysOnTop(),
        window.quill.cartographAvailable()
      ]);
      setCartographAvailable(cartoAvail);

      const loadedNotes = await storage.loadAllNotes();
      const loadedAgentHistory: Record<string, ChatMessage[]> = {};
      for (const n of loadedNotes) {
        const log = await storage.readAgentLog(n.id);
        if (log.length > 0) loadedAgentHistory[n.id] = log;
      }

      let initialNotes = loadedNotes;
      let initialPanes: Pane[] = [];

      const savedPanes = settings['panes'] as Pane[] | undefined;
      const savedLayout = settings['layout'] as Layout | undefined;
      const savedSplit = settings['splitMode'] as SplitMode | undefined;
      const savedV = settings['vRatio'] as number | undefined;
      const savedH = settings['hRatio'] as number | undefined;
      const savedAgentWidth = settings['agentWidth'] as number | undefined;

      if (loadedNotes.length === 0) {
        const welcomeNote: Note = {
          id: nanoid(10),
          title: 'Welcome',
          content: WELCOME,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          kind: 'note'
        };
        await storage.writeNote(welcomeNote);
        initialNotes = [welcomeNote];
        initialPanes = [
          { id: nanoid(), noteIds: [welcomeNote.id], activeNoteId: welcomeNote.id, mode: 'edit' }
        ];
      } else if (savedPanes && savedPanes.length > 0) {
        initialPanes = migratePanes(savedPanes, loadedNotes);
      } else {
        initialPanes = [
          {
            id: nanoid(),
            noteIds: loadedNotes.map((n) => n.id),
            activeNoteId: loadedNotes[0].id,
            mode: 'edit'
          }
        ];
      }

      const resolvedLayout = migrateLayout(savedLayout, savedSplit, initialPanes.length);

      setNotes(initialNotes);
      setPanes(initialPanes);
      setAgentHistory(loadedAgentHistory);
      setLayout(resolvedLayout);
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
      window.quill.setStore('panes', panes);
      window.quill.setStore('layout', layout);
      window.quill.setStore('vRatio', vRatio);
      window.quill.setStore('hRatio', hRatio);
      window.quill.setStore('agentWidth', agentWidth);
    }, 250);
    return () => clearTimeout(t);
  }, [panes, layout, vRatio, hRatio, agentWidth]);

  const queueWriteNote = useCallback((note: Note) => {
    const queue = writeQueueRef.current;
    const existing = queue.get(note.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      storage.writeNote(note).catch((e) => console.error('writeNote failed', e));
      queue.delete(note.id);
    }, 300);
    queue.set(note.id, timer);
  }, []);

  const queueWriteAgentLog = useCallback(
    (noteId: string, noteTitle: string, messages: ChatMessage[]) => {
      const queue = agentLogWriteQueueRef.current;
      const existing = queue.get(noteId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        storage.writeAgentLog(noteId, noteTitle, messages).catch((e) =>
          console.error('writeAgentLog failed', e)
        );
        queue.delete(noteId);
      }, 400);
      queue.set(noteId, timer);
    },
    []
  );

  const queueLiveSync = useCallback((noteId: string) => {
    const queue = liveSyncQueueRef.current;
    const existing = queue.get(noteId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      const note = notesRef.current.find((n) => n.id === noteId);
      if (!note) return;
      if (!note.cartographSync || note.cartographSync === 'off') return;
      const history = agentHistoryRef.current[noteId] ?? [];
      await pushNoteLive(note, history).catch((e) => console.error('live sync failed', e));
      queue.delete(noteId);
    }, 1200);
    queue.set(noteId, timer);
  }, []);

  const createNote = useCallback(
    (paneId?: string) => {
      const note: Note = {
        id: nanoid(10),
        title: '',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        kind: 'note'
      };
      setNotes((prev) => {
        queueWriteNote(note);
        return [...prev, note];
      });
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
    },
    [queueWriteNote]
  );

  const updateNote = useCallback(
    (id: string, updates: Partial<Note>) => {
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
        );
        const updated = next.find((n) => n.id === id);
        if (updated) {
          queueWriteNote(updated);
          if (updated.cartographSync && updated.cartographSync !== 'off') queueLiveSync(id);
        }
        return next;
      });
    },
    [queueWriteNote, queueLiveSync]
  );

  const colorNote = useCallback(
    (id: string, color: string | undefined) => {
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, color } : n));
        const updated = next.find((n) => n.id === id);
        if (updated) queueWriteNote(updated);
        return next;
      });
    },
    [queueWriteNote]
  );

  const togglePinNote = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
        const updated = next.find((n) => n.id === id);
        if (updated) queueWriteNote(updated);
        return next;
      });
    },
    [queueWriteNote]
  );

  const setLiveSync = useCallback(
    (mode: 'off' | 'session' | 'template') => {
      const first = panes[0];
      const noteId = first?.activeNoteId;
      if (!noteId) return;
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.id === noteId ? { ...n, cartographSync: mode } : n
        );
        const updated = next.find((n) => n.id === noteId);
        if (updated) queueWriteNote(updated);
        return next;
      });
      if (mode === 'off') {
        unlinkLive(noteId).catch(() => undefined);
        flashToast('Cartograph live-sync disabled for this note');
      } else {
        queueLiveSync(noteId);
        flashToast(`Live-syncing as ${mode} → Cartograph`);
      }
    },
    [panes, queueWriteNote, queueLiveSync]
  );

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
            id: nanoid(10),
            title: '',
            content: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            kind: 'note'
          };
          storage.writeNote(replacement).catch(() => undefined);
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
    storage.deleteNote(noteId).catch(() => undefined);
    unlinkLive(noteId).catch(() => undefined);
    setAgentHistory((prev) => {
      if (!prev[noteId]) return prev;
      const { [noteId]: _, ...rest } = prev;
      return rest;
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
      if (!existsElsewhere) deleteNoteGlobal(noteId);
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
    (
      paneId: string,
      fromNoteId: string,
      toNoteId: string | null,
      side: 'before' | 'after' | 'end'
    ) => {
      setPanes((prev) =>
        prev.map((p) => {
          if (p.id !== paneId) return p;
          const filtered = p.noteIds.filter((id) => id !== fromNoteId);
          let insertAt: number;
          if (side === 'end' || toNoteId === null) insertAt = filtered.length;
          else {
            const targetIdx = filtered.indexOf(toNoteId);
            insertAt =
              targetIdx === -1 ? filtered.length : side === 'before' ? targetIdx : targetIdx + 1;
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
    (
      payload: DragPayload,
      toPaneId: string,
      toNoteId: string | null,
      side: 'before' | 'after' | 'end'
    ) => {
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

  const applyLayout = useCallback((target: Layout) => {
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

      const kept = currentPanes.slice(0, max);
      const dropped = currentPanes.slice(max);
      const covered = new Set(kept.flatMap((p) => p.noteIds));
      const orphans: string[] = [];
      for (const p of dropped)
        for (const id of p.noteIds) if (!covered.has(id) && !orphans.includes(id)) orphans.push(id);
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
  }, []);

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

        if (nextLayout !== currentLayout) queueMicrotask(() => setLayout(nextLayout));
        return nextPanes;
      });
    },
    []
  );

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

  const updateAgentMessages = useCallback(
    (noteId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setAgentHistory((prev) => {
        const current = prev[noteId] ?? [];
        const next = updater(current);
        const note = notesRef.current.find((n) => n.id === noteId);
        queueWriteAgentLog(noteId, note?.title ?? 'Untitled', next);
        if (note?.cartographSync && note.cartographSync !== 'off') queueLiveSync(noteId);
        return { ...prev, [noteId]: next };
      });
    },
    [queueWriteAgentLog, queueLiveSync]
  );

  const clearAgentMessages = useCallback(
    (noteId: string) => {
      setAgentHistory((prev) => {
        const { [noteId]: _, ...rest } = prev;
        return rest;
      });
      const note = notesRef.current.find((n) => n.id === noteId);
      queueWriteAgentLog(noteId, note?.title ?? 'Untitled', []);
    },
    [queueWriteAgentLog]
  );

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const pushSession = useCallback(async () => {
    const first = panes[0];
    const noteId = first?.activeNoteId;
    if (!noteId) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const result = await pushNoteAsSessionLog(note, agentHistory[note.id] ?? []);
    flashToast(result.ok ? `Pushed to Cartograph working tier` : `Push failed: ${result.reason}`);
  }, [panes, notes, agentHistory]);

  const pushTemplate = useCallback(async () => {
    const first = panes[0];
    const noteId = first?.activeNoteId;
    if (!noteId) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const result = await pushNoteAsTemplate(note);
    flashToast(result.ok ? `Saved template to procedural tier` : `Save failed: ${result.reason}`);
  }, [panes, notes]);

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
  const activeMessages = activeNote ? agentHistory[activeNote.id] ?? [] : [];
  const activeLiveSync = activeNote?.cartographSync ?? 'off';

  const selectAnyNote = useCallback((noteId: string) => {
    setPanes((prev) => {
      if (prev.length === 0) return prev;
      const first = prev[0];
      const noteIds = first.noteIds.includes(noteId) ? first.noteIds : [...first.noteIds, noteId];
      return prev.map((p, i) => (i === 0 ? { ...p, noteIds, activeNoteId: noteId } : p));
    });
  }, []);

  if (!loaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-ink-900 text-paper-200 text-sm font-mono">
        loading notes…
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
        onPushSession={pushSession}
        onPushTemplate={pushTemplate}
        onSetLiveSync={setLiveSync}
        liveSyncMode={activeLiveSync}
        cartographAvailable={cartographAvailable}
      />
      <div className="flex-1 flex overflow-hidden relative">
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
            onTogglePinNote={togglePinNote}
            onReorderInPane={reorderInPane}
            onMoveBetweenPanes={moveBetweenPanes}
            onSetPaneMode={setPaneMode}
            onDropOnEdge={dropOnEdge}
            onSearch={() => setSearchOpen(true)}
            scrollSignals={scrollSignals}
            titleFocusSignals={titleFocusSignals}
            cartographAvailable={cartographAvailable}
          />
        </div>
        {agentOpen && activeNote && (
          <AgentPanel
            width={agentWidth}
            onResize={setAgentWidth}
            context={activeNote.content}
            contextTitle={activeNote.title}
            contextTags={activeNote.tags ?? []}
            messages={activeMessages}
            onChangeMessages={(updater) => updateAgentMessages(activeNote.id, updater)}
            onClearMessages={() => clearAgentMessages(activeNote.id)}
            onClose={toggleAgent}
          />
        )}
      </div>

      {searchOpen && (
        <SearchOverlay
          notes={notes}
          agentLogs={agentHistory}
          onPick={(hit) => {
            if (hit.field === 'agent') {
              selectAnyNote(hit.noteId);
              setAgentOpen(true);
            } else {
              jumpToHit(hit.noteId, hit.position);
            }
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2 bg-ink-800 border border-amber-500/50 rounded-md text-sm text-paper-100 shadow-2xl no-drag">
          {toast}
        </div>
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
