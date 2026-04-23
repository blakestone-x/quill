import { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const isDev = !app.isPackaged;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
let mainWindow: BrowserWindow | null = null;

const dataPath = join(app.getPath('userData'), 'quill-data.json');
let data: Record<string, unknown> = loadData();

function loadData(): Record<string, unknown> {
  try {
    if (existsSync(dataPath)) {
      return JSON.parse(readFileSync(dataPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load data:', e);
  }
  return {};
}

let saveTimer: NodeJS.Timeout | null = null;
function queueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(dataPath), { recursive: true });
      writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }, 200);
}

function createWindow() {
  const bounds = (data['windowBounds'] as { x?: number; y?: number; width?: number; height?: number }) ?? {};

  mainWindow = new BrowserWindow({
    width: bounds.width ?? 920,
    height: bounds.height ?? 680,
    x: bounds.x,
    y: bounds.y,
    minWidth: 440,
    minHeight: 300,
    frame: false,
    backgroundColor: '#13100d',
    title: 'Quill',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    const b = mainWindow.getBounds();
    data['windowBounds'] = b;
    queueSave();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() ?? '';
    if (url !== currentUrl) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize-toggle', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:set-always-on-top', (_e, flag: boolean) => {
  mainWindow?.setAlwaysOnTop(flag, 'screen-saver');
  return !!mainWindow?.isAlwaysOnTop();
});
ipcMain.handle('window:is-always-on-top', () => !!mainWindow?.isAlwaysOnTop());

// Key-value store
ipcMain.handle('store:get', (_e, key: string) => data[key]);
ipcMain.handle('store:set', (_e, key: string, value: unknown) => {
  data[key] = value;
  queueSave();
  return value;
});
ipcMain.handle('store:delete', (_e, key: string) => {
  delete data[key];
  queueSave();
});

ipcMain.handle('shell:open-external', (_e, url: string) => {
  if (typeof url !== 'string') return;
  if (!/^https?:\/\//i.test(url)) return;
  shell.openExternal(url);
});

ipcMain.handle('updater:check', async () => {
  if (isDev) return { ok: false, reason: 'dev' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo.version ?? null };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('updater:restart', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  const registered = globalShortcut.register('CommandOrControl+Shift+Q', toggleMainWindow);
  if (!registered) {
    console.warn('Failed to register global shortcut Ctrl+Shift+Q');
  }

  if (!isDev) {
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('updater:status', {
        kind: 'available',
        version: info.version
      });
    });
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('updater:status', {
        kind: 'downloading',
        percent: Math.round(progress.percent)
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('updater:status', {
        kind: 'ready',
        version: info.version
      });
    });
    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('updater:status', {
        kind: 'error',
        message: err.message
      });
    });
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => undefined);
    }, 4000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
