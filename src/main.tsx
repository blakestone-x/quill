import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Fallback stub for non-Electron environments (local browser testing only).
// Harmless in Electron since window.quill is already populated by preload.
if (typeof window !== 'undefined' && typeof (window as any).quill === 'undefined') {
  const mem = new Map<string, unknown>();
  const notes = new Map<string, string>();
  const agentLogs = new Map<string, string>();
  (window as any).quill = {
    getStore: async (k: string) => mem.get(k),
    setStore: async (k: string, v: unknown) => {
      mem.set(k, v);
      return v;
    },
    deleteStore: async (k: string) => {
      mem.delete(k);
    },
    allSettings: async () => Object.fromEntries(mem.entries()),
    listNotes: async () => [...notes.keys()],
    readNote: async (id: string) => notes.get(id) ?? null,
    writeNote: async (id: string, content: string) => {
      notes.set(id, content);
      return true;
    },
    deleteNote: async (id: string) => {
      notes.delete(id);
      agentLogs.delete(id);
      return true;
    },
    readAgentLog: async (id: string) => agentLogs.get(id) ?? null,
    writeAgentLog: async (id: string, content: string) => {
      agentLogs.set(id, content);
      return true;
    },
    cartographAvailable: async () => false,
    cartographRoot: async () => '',
    cartographPush: async () => ({ ok: false as const, reason: 'stub' }),
    cartographPushLive: async () => ({ ok: false as const, reason: 'stub' }),
    cartographUnlinkLive: async () => ({ ok: true as const }),
    gatherContext: async () => ({ ok: true as const, context: '', sources: [] }),
    minimize: async () => undefined,
    maximizeToggle: async () => undefined,
    close: async () => undefined,
    setAlwaysOnTop: async () => false,
    isAlwaysOnTop: async () => false,
    openExternal: async (url: string) => {
      window.open(url, '_blank');
    },
    revealUserData: async () => undefined,
    checkForUpdate: async () => ({ ok: false as const, reason: 'stub' }),
    restartToUpdate: async () => undefined,
    onUpdaterStatus: () => () => undefined
  } as unknown as typeof window.quill;
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
