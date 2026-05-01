// Service worker for Quill Companion.
// Strategy:
//   - Precache app shell so the recorder works fully offline.
//   - Network-first for the manifest/HTML so updates land quickly.
//   - Cache-first for static assets (CSS, JS, icons).
//   - Never cache API calls (anthropic.com, assemblyai.com, resend.com, webhooks).

const VERSION = 'quill-companion-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './app.js',
  './lib/recorder.js',
  './lib/transcribe.js',
  './lib/analyze.js',
  './lib/storage.js',
  './lib/quill.js',
  './lib/email.js',
  './lib/activator.js',
  './lib/settings.js',
  './icons/icon.svg'
];

const API_HOSTS = [
  'api.anthropic.com',
  'api.assemblyai.com',
  'api.resend.com',
  'cdn.assemblyai.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept API calls.
  if (API_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  // Cross-origin (e.g., user-configured webhook domains) — pass through.
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations / HTML so updates land.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(VERSION).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(VERSION).then((c) => c.put(req, clone));
          return res;
        })
    )
  );
});
