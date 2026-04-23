import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Fallback stub for non-Electron environments (local browser testing).
// Harmless in Electron since window.quill is already populated by preload.
if (typeof window !== 'undefined' && typeof (window as any).quill === 'undefined') {
  const mem = new Map<string, unknown>();
  (window as any).quill = {
    getStore: async (k: string) => mem.get(k),
    setStore: async (k: string, v: unknown) => {
      mem.set(k, v);
      return v;
    },
    deleteStore: async (k: string) => {
      mem.delete(k);
    },
    minimize: async () => undefined,
    maximizeToggle: async () => undefined,
    close: async () => undefined,
    setAlwaysOnTop: async () => false,
    isAlwaysOnTop: async () => false,
    openExternal: async (url: string) => {
      window.open(url, '_blank');
    },
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
