import { contextBridge, ipcRenderer } from 'electron';
import type {
  CaptureSession,
  ConsentLogEntry,
  Extraction,
  ExtractionStatus,
  SessionFlag,
  TranscriptSegment
} from '../src/core/domain';

export type UpdaterStatus =
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

export interface CartographPushPayload {
  tier: 'working' | 'episodic' | 'semantic' | 'procedural';
  kind: 'session_log' | 'template' | 'reference' | 'decision';
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
}

export interface CartographLivePayload {
  noteId: string;
  tier: 'working' | 'procedural';
  kind: 'session_log' | 'template';
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
}

export interface GatherContextPayload {
  title: string;
  tags?: string[];
  body?: string;
  maxChars?: number;
}

export interface GatherContextResult {
  ok: true;
  context: string;
  sources: string[];
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

  // ambient store
  db: {
    createSession: (s: CaptureSession) =>
      ipcRenderer.invoke('db:session:create', s) as Promise<boolean>,
    endSession: (id: string, endedAt: number) =>
      ipcRenderer.invoke('db:session:end', id, endedAt) as Promise<boolean>,
    addSegment: (seg: TranscriptSegment) =>
      ipcRenderer.invoke('db:segment:add', seg) as Promise<boolean>,
    listSegments: (sessionId: string) =>
      ipcRenderer.invoke('db:segment:list', sessionId) as Promise<TranscriptSegment[]>,
    unsyncedSegments: (limit?: number) =>
      ipcRenderer.invoke('db:segment:unsynced', limit) as Promise<TranscriptSegment[]>,
    searchSegments: (query: string, limit?: number) =>
      ipcRenderer.invoke('db:segment:search', query, limit) as Promise<TranscriptSegment[]>,
    markSynced: (ids: string[]) =>
      ipcRenderer.invoke('db:segment:markSynced', ids) as Promise<boolean>,
    addFlag: (f: SessionFlag) => ipcRenderer.invoke('db:flag:add', f) as Promise<boolean>,
    listFlags: (sessionId: string) =>
      ipcRenderer.invoke('db:flag:list', sessionId) as Promise<SessionFlag[]>,
    addExtraction: (x: Extraction) =>
      ipcRenderer.invoke('db:extraction:add', x) as Promise<boolean>,
    listExtractions: (sessionId: string, status?: ExtractionStatus) =>
      ipcRenderer.invoke('db:extraction:list', sessionId, status) as Promise<Extraction[]>,
    setExtractionStatus: (id: string, status: ExtractionStatus) =>
      ipcRenderer.invoke('db:extraction:set-status', id, status) as Promise<boolean>,
    logConsent: (entry: ConsentLogEntry) =>
      ipcRenderer.invoke('db:consent:log', entry) as Promise<boolean>
  },

  // floating bar
  bar: {
    popout: () => ipcRenderer.invoke('bar:popout'),
    close: () => ipcRenderer.invoke('bar:close'),
    command: (type: string) => ipcRenderer.invoke('bar:command', type),
    onCommand: (cb: (type: string) => void): (() => void) => {
      const h = (_e: unknown, t: string) => cb(t);
      ipcRenderer.on('bar:command', h);
      return () => ipcRenderer.removeListener('bar:command', h);
    },
    sendState: (state: { status: string; lastLine?: string }) =>
      ipcRenderer.invoke('capture:state', state),
    onState: (cb: (s: { status: string; lastLine?: string }) => void): (() => void) => {
      const h = (_e: unknown, s: { status: string; lastLine?: string }) => cb(s);
      ipcRenderer.on('capture:state', h);
      return () => ipcRenderer.removeListener('capture:state', h);
    }
  },

  // cartograph
  cartographAvailable: () => ipcRenderer.invoke('cartograph:available') as Promise<boolean>,
  cartographRoot: () => ipcRenderer.invoke('cartograph:root') as Promise<string>,
  cartographPush: (payload: CartographPushPayload) =>
    ipcRenderer.invoke('cartograph:push', payload) as Promise<{ ok: boolean; path?: string; reason?: string }>,
  cartographPushLive: (payload: CartographLivePayload) =>
    ipcRenderer.invoke('cartograph:push-live', payload) as Promise<{ ok: boolean; path?: string; reason?: string }>,
  cartographUnlinkLive: (noteId: string) =>
    ipcRenderer.invoke('cartograph:unlink-live', noteId) as Promise<{ ok: boolean; reason?: string }>,
  gatherContext: (payload: GatherContextPayload) =>
    ipcRenderer.invoke('context:gather', payload) as Promise<GatherContextResult>,

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
