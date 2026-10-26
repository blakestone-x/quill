import { contextBridge, ipcRenderer } from 'electron';

export type UpdaterStatus =
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

export interface KnowledgeBasePushPayload {
  tier: 'working' | 'episodic' | 'semantic' | 'procedural';
  kind: 'session_log' | 'template' | 'reference' | 'decision';
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
}

export interface KnowledgeBaseLivePayload {
  noteId: string;
  tier: 'working' | 'procedural';
  kind: 'session_log' | 'template';
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
}

const api = {
  // window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  close: () => ipcRenderer.invoke('window:close'),
  setAlwaysOnTop: (flag: boolean) =>
    ipcRenderer.invoke('window:set-always-on-top', flag) as Promise<boolean>,
  isAlwaysOnTop: () => ipcRenderer.invoke('window:is-always-on-top') as Promise<boolean>,

  // settings key/value (replaces legacy store)
  getStore: <T = unknown>(key: string) => ipcRenderer.invoke('settings:get', key) as Promise<T | undefined>,
  setStore: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  deleteStore: (key: string) => ipcRenderer.invoke('settings:delete', key),
  allSettings: () => ipcRenderer.invoke('settings:all') as Promise<Record<string, unknown>>,

  // notes
  listNotes: () => ipcRenderer.invoke('notes:list') as Promise<string[]>,
  readNote: (id: string) => ipcRenderer.invoke('notes:read', id) as Promise<string | null>,
  writeNote: (id: string, content: string) =>
    ipcRenderer.invoke('notes:write', id, content) as Promise<boolean>,
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id) as Promise<boolean>,

  // agent log
  readAgentLog: (id: string) => ipcRenderer.invoke('agent-log:read', id) as Promise<string | null>,
  writeAgentLog: (id: string, content: string) =>
    ipcRenderer.invoke('agent-log:write', id, content) as Promise<boolean>,

  // knowledge base
  knowledgeBaseAvailable: () => ipcRenderer.invoke('kb:available') as Promise<boolean>,
  knowledgeBaseRoot: () => ipcRenderer.invoke('kb:root') as Promise<string>,
  knowledgeBasePush: (payload: KnowledgeBasePushPayload) =>
    ipcRenderer.invoke('kb:push', payload) as Promise<{ ok: boolean; path?: string; reason?: string }>,
  knowledgeBasePushLive: (payload: KnowledgeBaseLivePayload) =>
    ipcRenderer.invoke('kb:push-live', payload) as Promise<{ ok: boolean; path?: string; reason?: string }>,
  knowledgeBaseUnlinkLive: (noteId: string) =>
    ipcRenderer.invoke('kb:unlink-live', noteId) as Promise<{ ok: boolean; reason?: string }>,

  // shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  revealUserData: () => ipcRenderer.invoke('shell:reveal-user-data'),

  // updater
  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  restartToUpdate: () => ipcRenderer.invoke('updater:restart'),
  onUpdaterStatus: (cb: (status: UpdaterStatus) => void): (() => void) => {
    const handler = (_e: unknown, status: UpdaterStatus) => cb(status);
    ipcRenderer.on('updater:status', handler);
    return () => {
      ipcRenderer.removeListener('updater:status', handler);
    };
  }
};

contextBridge.exposeInMainWorld('quill', api);

export type QuillAPI = typeof api;
