# Quill Companion — phone app

A Progressive Web App (PWA) that you install on your phone to:

- **Record** any conversation, hands-free
- **Transcribe** with **speaker diarization** (multi-speaker labeling)
- **Analyze** with Claude — summary, decisions, action items, key quotes,
  open questions, next steps, sentiment-by-speaker, structured outline
- **Email** an auto-recap to yourself
- **Export** a Quill-compatible `.md` file you drop into the desktop Quill notes folder

Every recording stays on your phone in IndexedDB. Audio leaves only when
you transcribe (AssemblyAI), analyze (Anthropic), or email (Resend / your
own webhook). API keys live in `localStorage` on the device.

---

## 1 · Hosting (one-time, ~5 min)

A PWA needs HTTPS to access the mic and to be installable. Pick one:

### Option A — GitHub Pages (recommended)

1. From your laptop, push this branch to GitHub.
2. In repo Settings → Pages, point Pages at `claude/conversation-recorder-app-kwUIW`
   (or merge to `main`), folder `/mobile`. Wait ~1 min.
3. Visit `https://<you>.github.io/quill/mobile/` on your phone.

### Option B — Cloudflare Pages / Vercel / Netlify

Drag-and-drop the `mobile/` folder. Done.

### Option C — Local on your laptop, accessed via tunnel

```bash
cd quill/mobile
python3 -m http.server 5173
# in another terminal:
npx cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://...trycloudflare.com/` URL on the phone.

---

## 2 · Install to home screen

- **iOS Safari**: Share → **Add to Home Screen**
- **Android Chrome**: ⋮ menu → **Install app** (or **Add to Home Screen**)

The icon is the amber Quill mark. Launching from the icon runs the app
fullscreen with no browser chrome.

---

## 3 · Configure (one time)

Open the app, tap the **gear** icon. Fill in:

| Field | Where to get it |
|---|---|
| **AssemblyAI key** | https://www.assemblyai.com/app — free tier covers many hours |
| **Anthropic key** | https://console.anthropic.com — `sk-ant-…` |
| **Email recap → Send to** | `bstone@…` (your address) |
| **Email recap → Delivery method** | **Resend** = auto-send · **Webhook** = POST to Make/Zapier · **mailto** = opens mail composer (manual tap) |
| **Resend API key** + **From** | https://resend.com — must verify a sending domain first |
| **Auto-send recap when analysis finishes** | check this and forget about it |
| **Claude model** | Sonnet 4.6 default. Opus 4.7 for deepest analysis. Haiku 4.5 for speed/cost. |
| **Speaker name hints** | comma-separated, e.g. `Blake, Sam, Jamie`. Claude uses them when labeling. |

---

## 4 · Secret activators

Reality check: **a web app cannot intercept the phone's power button.** The OS
owns it. So "3 power-button presses" is an OS-level macro that opens the
app's deep-link URL — see below.

What works **inside the app** without unlocking:

| Activator | How it works |
|---|---|
| **Triple-tap** anywhere | tap-tap-tap within 800 ms on the launch screen |
| **Shake** | iOS prompts once for motion permission, then any sharp shake starts recording |
| **Volume keys** | three volume presses within 1.2 s (Android only — iOS Safari doesn't surface these) |
| **Deep link** | `…?action=start` auto-records on launch |

Toggle each in **Settings → Secret activators**.

### Wiring real power-button activation

The reliable path is an OS-level macro that opens the app's deep link. The
exact link is shown in the Settings panel — it looks like
`https://you.example.com/mobile/?action=start`.

**iOS — Action Button (15 Pro+)** or **Back Tap (Settings → Accessibility →
Touch → Back Tap)**:

1. Shortcuts app → New Shortcut → **Open URLs** → paste the deep link.
2. Save as "Record Conversation".
3. Set the Action Button (Settings → Action Button → Shortcut → Record
   Conversation), or Back Tap (Settings → Accessibility → Touch → Back Tap →
   Double Tap → Record Conversation).

Now a single Action-Button press / double-tap on the back of the phone
launches and starts recording.

**Android — Tasker / Macrodroid:**

1. New macro → trigger: Power Button → 3 presses (Macrodroid has this
   built-in; Tasker uses the *Logcat* event for the screen-off intent).
2. Action: Browse URL → paste the deep link.

---

## 5 · Daily flow

1. Power-button-press / shake / triple-tap → app records.
2. Tap the big circle (or the same trigger again) to **stop**.
3. App uploads → AssemblyAI transcribes & diarizes → Claude analyzes → if
   "Auto-send recap" is on, you get an email at `bstone@…` immediately.
4. Tap **Export to Quill** to share / download the markdown.

---

## 6 · Pulling notes into desktop Quill

The companion writes notes in the **same** YAML-frontmatter format Quill
itself writes (`source: companion` flag so they're distinguishable).

### Manual

1. On the phone, tap **Export to Quill** → share to **iMessage / AirDrop /
   Drive** to get the `.md` to your laptop.
2. On Windows: open `%APPDATA%\Quill\notes\` and drop the file in.
3. Restart Quill — the note appears.

### Future automation (do this on the desktop later)

The companion writes a stable filename (`<id>.md`) so you can wire any of
these on the laptop side:

- **Sync folder**: configure Resend's webhook (or your own) to drop the
  email's attachment into a OneDrive/Dropbox folder Quill watches, plus a
  small Quill change to symlink that folder to its `notes/` dir.
- **HTTP receiver**: add an Express endpoint to Quill's main process that
  accepts POSTs of `{ id, markdown }` and writes them to `notesDir`. The
  Webhook delivery method already POSTs the right shape.
- **Cartograph push**: Quill already has `cartograph:push` IPC. Mirror that
  from a tiny laptop daemon listening on the same port the phone hits.

Notes the companion produces all carry `source: companion` and a
`conv_session_id`, so you can filter / dedupe.

---

## 7 · What lives where

```
mobile/
├── index.html              # app shell
├── styles.css              # Quill aesthetic, dark + amber
├── app.js                  # main state machine
├── manifest.webmanifest    # PWA install metadata
├── sw.js                   # service worker (offline shell)
├── icons/icon.svg          # app icon
└── lib/
    ├── recorder.js         # MediaRecorder + level meter + wake-lock
    ├── transcribe.js       # AssemblyAI upload / submit / poll, diarization
    ├── analyze.js          # Claude /v1/messages with prompt caching
    ├── storage.js          # IndexedDB sessions + audio
    ├── quill.js            # render Quill-format markdown, share/download
    ├── email.js            # Resend / webhook / mailto recap
    ├── activator.js        # triple-tap, shake, volume keys, deep link
    └── settings.js         # localStorage-backed prefs
```

No build step. Plain ES modules. To iterate: edit a file, refresh the phone.

---

## 8 · Privacy

- API keys stored in `localStorage` only. They never leave your device
  except to authenticate calls to AssemblyAI / Anthropic / Resend.
- Audio stored in IndexedDB only. **Purge all sessions + audio** in
  Settings nukes both stores.
- Service worker caches only the app shell — never API responses.

---

## 9 · Browser support

| Browser | Records | Diarization | Install (A2HS) | Wake Lock | Volume keys | Shake |
|---|---|---|---|---|---|---|
| iOS Safari 16+ | ✅ (m4a) | ✅ | ✅ | ✅ | ❌ | ✅ (asks once) |
| Android Chrome | ✅ (webm/opus) | ✅ | ✅ | ✅ | ⚠️ best-effort | ✅ |
| Desktop Chrome / Edge | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (no motion) |

The Web Share API is used on export when available, so iOS gets a real
"Share" sheet (AirDrop included). Otherwise it falls back to a download.
