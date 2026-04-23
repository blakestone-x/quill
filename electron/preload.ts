import { contextBridge, ipcRenderer } from 'electron';

export type UpdaterStatus =
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

const api = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  close: () => ipcRenderer.invoke('window:close'),
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:set-always-on-top', flag) as Promise<boolean>,
  isAlwaysOnTop: () => ipcRenderer.invoke('window:is-always-on-top') as Promise<boolean>,
  getStore: <T = unknown>(key: string) => ipcRenderer.invoke('store:get', key) as Promise<T | undefined>,
  setStore: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  deleteStore: (key: string) => ipcRenderer.invoke('store:delete', key),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
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
