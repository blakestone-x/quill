import { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const userDataDir = app.getPath('userData');
const notesDir = join(userDataDir, 'notes');
const agentLogDir = join(userDataDir, 'agent-log');
const settingsPath = join(userDataDir, 'settings.json');
const legacyDataPath = join(userDataDir, 'quill-data.json');
const legacyBackupPath = join(userDataDir, 'quill-data.json.pre-v1.backup');

mkdirSync(notesDir, { recursive: true });
mkdirSync(agentLogDir, { recursive: true });

interface Settings {
  schemaVersion?: number;
  panes?: unknown;
  layout?: unknown;
  vRatio?: number;
  hRatio?: number;
  agentWidth?: number;
  apiKey?: string;
  windowBounds?: { x?: number; y?: number; width?: number; height?: number };
  cartographPath?: string | null;
  pinnedWindow?: boolean;
  [k: string]: unknown;
}

let settings: Settings = loadSettings();

function loadSettings(): Settings {
  try {
    if (existsSync(settingsPath)) return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { schemaVersion: 1 };
}

let saveTimer: NodeJS.Timeout | null = null;
function queueSaveSettings() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }, 200);
}

function safeId(id: string): string {
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
}

function notePath(id: string): string | null {
  const s = safeId(id);
  return s ? join(notesDir, `${s}.md`) : null;
}

function agentLogPath(id: string): string | null {
  const s = safeId(id);
  return s ? join(agentLogDir, `${s}.md`) : null;
}

// One-time migration from legacy quill-data.json to v1 layout.
function migrateFromLegacyIfNeeded() {
  if (!existsSync(legacyDataPath)) return;
  // If notes dir already has .md files, assume migration already happened.
  try {
    const existing = readdirSync(notesDir).filter((f) => f.endsWith('.md'));
    if (existing.length > 0) return;
  } catch {
    // ignore
  }

  let legacy: Record<string, unknown>;
  try {
    legacy = JSON.parse(readFileSync(legacyDataPath, 'utf-8'));
  } catch (e) {
    console.error('Failed to read legacy data for migration:', e);
    return;
  }

  const notes = Array.isArray(legacy['notes']) ? (legacy['notes'] as Array<Record<string, unknown>>) : [];
  for (const n of notes) {
    const id = typeof n['id'] === 'string' ? n['id'] : null;
    if (!id || !safeId(id)) continue;
    const front: Record<string, unknown> = {
      id,
      title: n['title'] ?? 'Untitled',
      created: iso(n['createdAt']),
      updated: iso(n['updatedAt'])
    };
    if (n['color']) front['color'] = n['color'];
    if (n['pinned']) front['pinned'] = true;
    front['source'] = 'quill';
    front['kind'] = 'note';
    const body = typeof n['content'] === 'string' ? n['content'] : '';
    const p = notePath(id);
    if (p) writeFileSync(p, buildMarkdown(front, body));
  }

  // Move the rest into settings
  const copyKeys = ['panes', 'layout', 'splitMode', 'vRatio', 'hRatio', 'agentWidth', 'apiKey', 'windowBounds'];
  for (const k of copyKeys) {
    if (k in legacy) (settings as Record<string, unknown>)[k] = legacy[k];
  }
  settings.schemaVersion = 1;
  queueSaveSettings();

  try {
    renameSync(legacyDataPath, legacyBackupPath);
  } catch (e) {
    console.error('Failed to rename legacy file:', e);
  }
}

function iso(v: unknown): string {
  if (typeof v === 'number') return new Date(v).toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}

function buildMarkdown(front: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(front)) {
    if (v === undefined || v === null) continue;
    lines.push(`${k}: ${yamlValue(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body;
}

function yamlValue(v: unknown): string {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => yamlValue(x)).join(', ')}]`;
  const s = String(v);
  if (/[:#\[\]{}&*!|>%@`,]/.test(s) || s.includes('\n')) return JSON.stringify(s);
  return s;
}

function cartographRoot(): string {
  const configured = settings.cartographPath;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  const candidate = join(homedir(), 'Claude Workspace', 'cartograph');
  return candidate;
}

function cartographAvailable(): boolean {
  const root = cartographRoot();
  return existsSync(root) && existsSync(join(root, 'memory'));
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

function createWindow() {
  const bounds = settings.windowBounds ?? {};

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
    settings.windowBounds = mainWindow.getBounds();
    queueSaveSettings();
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

// ── Window IPC ──
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

// ── Settings IPC (key/value) ──
ipcMain.handle('settings:get', (_e, key: string) => settings[key]);
ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
  settings[key] = value;
  queueSaveSettings();
  return value;
});
ipcMain.handle('settings:delete', (_e, key: string) => {
  delete settings[key];
  queueSaveSettings();
});
ipcMain.handle('settings:all', () => ({ ...settings }));

// ── Notes IPC ──
ipcMain.handle('notes:list', () => {
  if (!existsSync(notesDir)) return [];
  return readdirSync(notesDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
});

ipcMain.handle('notes:read', (_e, id: string) => {
  const p = notePath(id);
  if (!p || !existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
});

ipcMain.handle('notes:write', (_e, id: string, content: string) => {
  const p = notePath(id);
  if (!p) return false;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return true;
});

ipcMain.handle('notes:delete', (_e, id: string) => {
  const p = notePath(id);
  if (p && existsSync(p)) unlinkSync(p);
  const ap = agentLogPath(id);
  if (ap && existsSync(ap)) unlinkSync(ap);
  return true;
});

// ── Agent log IPC ──
ipcMain.handle('agent-log:read', (_e, id: string) => {
  const p = agentLogPath(id);
  if (!p || !existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
});

ipcMain.handle('agent-log:write', (_e, id: string, content: string) => {
  const p = agentLogPath(id);
  if (!p) return false;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return true;
});

// ── Cartograph IPC ──
ipcMain.handle('cartograph:available', () => cartographAvailable());
ipcMain.handle('cartograph:root', () => cartographRoot());

ipcMain.handle(
  'cartograph:push',
  (
    _e,
    payload: {
      tier: 'working' | 'episodic' | 'semantic' | 'procedural';
      kind: 'session_log' | 'template' | 'reference' | 'decision';
      title: string;
      body: string;
      frontmatter?: Record<string, unknown>;
    }
  ) => {
    if (!cartographAvailable()) {
      return { ok: false, reason: 'Cartograph not found at ' + cartographRoot() };
    }
    try {
      const root = cartographRoot();
      const tierDir = join(root, 'memory', payload.tier);
      mkdirSync(tierDir, { recursive: true });
      const slug = slugify(payload.title);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${stamp}-quill-${slug}.md`;
      const filepath = join(tierDir, filename);
      const front: Record<string, unknown> = {
        source: 'quill',
        kind: payload.kind,
        tier: payload.tier,
        created: new Date().toISOString(),
        ...(payload.frontmatter ?? {})
      };
      writeFileSync(filepath, buildMarkdown(front, payload.body));
      return { ok: true, path: filepath };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }
);

ipcMain.handle(
  'cartograph:push-live',
  (
    _e,
    payload: {
      noteId: string;
      tier: 'working' | 'procedural';
      kind: 'session_log' | 'template';
      title: string;
      body: string;
      frontmatter?: Record<string, unknown>;
    }
  ) => {
    if (!cartographAvailable()) {
      return { ok: false, reason: 'Cartograph not found at ' + cartographRoot() };
    }
    if (!safeId(payload.noteId)) return { ok: false, reason: 'bad id' };
    try {
      const root = cartographRoot();
      const tierDir = join(root, 'memory', payload.tier);
      mkdirSync(tierDir, { recursive: true });
      const prefix = payload.kind === 'template' ? 'quill-template' : 'quill-live';
      const filepath = join(tierDir, `${prefix}-${payload.noteId}.md`);
      const front: Record<string, unknown> = {
        source: 'quill',
        kind: payload.kind,
        tier: payload.tier,
        sync: 'live',
        updated: new Date().toISOString(),
        ...(payload.frontmatter ?? {})
      };
      writeFileSync(filepath, buildMarkdown(front, payload.body));
      return { ok: true, path: filepath };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }
);

ipcMain.handle('cartograph:unlink-live', (_e, noteId: string) => {
  if (!safeId(noteId)) return { ok: false };
  if (!cartographAvailable()) return { ok: true };
  try {
    const root = cartographRoot();
    for (const tier of ['working', 'procedural']) {
      for (const prefix of ['quill-live', 'quill-template']) {
        const p = join(root, 'memory', tier, `${prefix}-${noteId}.md`);
        if (existsSync(p)) unlinkSync(p);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
});

// ── Context gather for the agent ──
// Pulls CLAUDE.md (global + workspace) + recent Cartograph working-tier excerpts
// matching keywords from the active note's title/tags. Size-capped.

const GLOBAL_CLAUDE_MD = join(homedir(), '.claude', 'CLAUDE.md');
const WORKSPACE_CLAUDE_MD = join(homedir(), 'Claude Workspace', 'CLAUDE.md');
const MEMORY_DIR = join(
  homedir(),
  '.claude',
  'projects',
  'C--Users-BlakeStone-Claude-Workspace',
  'memory'
);

ipcMain.handle(
  'context:gather',
  (
    _e,
    payload: { title: string; tags?: string[]; body?: string; maxChars?: number }
  ): { ok: true; context: string; sources: string[] } => {
    const maxChars = payload.maxChars ?? 12000;
    const sources: string[] = [];
    const chunks: string[] = [];

    const addFile = (label: string, path: string, cap = 4000) => {
      try {
        if (!existsSync(path)) return;
        const raw = readFileSync(path, 'utf-8');
        const trimmed = raw.length > cap ? raw.slice(0, cap) + '\n…[truncated]' : raw;
        chunks.push(`<${label}>\n${trimmed}\n</${label}>`);
        sources.push(path);
      } catch {
        // ignore
      }
    };

    addFile('global_claude_md', GLOBAL_CLAUDE_MD, 5000);
    addFile('workspace_claude_md', WORKSPACE_CLAUDE_MD, 3000);

    // Claude memory index
    addFile('claude_memory_index', join(MEMORY_DIR, 'MEMORY.md'), 2000);

    // Cartograph excerpts — keyword match on note title and tags
    if (cartographAvailable()) {
      const keywords = new Set<string>();
      for (const token of payload.title.split(/\s+/)) {
        const t = token.trim().toLowerCase();
        if (t.length >= 4) keywords.add(t);
      }
      for (const tag of payload.tags ?? []) {
        const t = tag.trim().toLowerCase();
        if (t.length >= 3) keywords.add(t);
      }
      if (keywords.size > 0) {
        const workingDir = join(cartographRoot(), 'memory', 'working');
        try {
          const files = readdirSync(workingDir)
            .filter((f) => f.endsWith('.md'))
            .map((f) => ({ name: f, path: join(workingDir, f) }))
            .sort((a, b) => b.name.localeCompare(a.name)) // newest first by timestamp prefix
            .slice(0, 200); // bound the scan

          const matches: { path: string; snippet: string }[] = [];
          for (const f of files) {
            if (matches.length >= 5) break;
            try {
              const content = readFileSync(f.path, 'utf-8').toLowerCase();
              for (const kw of keywords) {
                const idx = content.indexOf(kw);
                if (idx !== -1) {
                  const start = Math.max(0, idx - 200);
                  const end = Math.min(content.length, idx + 400);
                  const snippet = readFileSync(f.path, 'utf-8').slice(start, end);
                  matches.push({ path: f.path, snippet });
                  break;
                }
              }
            } catch {
              // ignore
            }
          }
          if (matches.length > 0) {
            const body = matches
              .map(
                (m) =>
                  `### ${m.path.split(/[\\/]/).slice(-2).join('/')}\n${m.snippet}`
              )
              .join('\n\n');
            chunks.push(`<cartograph_excerpts>\n${body}\n</cartograph_excerpts>`);
            for (const m of matches) sources.push(m.path);
          }
        } catch {
          // ignore
        }
      }
    }

    let combined = chunks.join('\n\n');
    if (combined.length > maxChars) combined = combined.slice(0, maxChars) + '\n…[context truncated]';
    return { ok: true, context: combined, sources };
  }
);

// ── Shell IPC ──
ipcMain.handle('shell:open-external', (_e, url: string) => {
  if (typeof url !== 'string') return;
  if (!/^https?:\/\//i.test(url)) return;
  shell.openExternal(url);
});

ipcMain.handle('shell:reveal-user-data', () => {
  shell.openPath(userDataDir);
});

// ── Updater IPC ──
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
  migrateFromLegacyIfNeeded();
  createWindow();

  const registered = globalShortcut.register('CommandOrControl+Shift+Q', toggleMainWindow);
  if (!registered) console.warn('Failed to register global shortcut Ctrl+Shift+Q');

  if (!isDev) {
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('updater:status', { kind: 'available', version: info.version });
    });
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('updater:status', {
        kind: 'downloading',
        percent: Math.round(progress.percent)
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('updater:status', { kind: 'ready', version: info.version });
    });
    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('updater:status', { kind: 'error', message: err.message });
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
