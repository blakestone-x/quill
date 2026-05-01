# Quill

A sharper notepad for taking notes on several people at once.

## Features

- **Split panes** — horizontal or vertical, resizable. Two notes side-by-side.
- **Tabs per pane** — one note per person/topic, independent tabs in each pane.
- **Always-on-top pin** — hover Quill over any app. Pin rotates + glows amber when active.
- **Inline calculator** — type `150+200+50=` and it resolves to `150+200+50= 400`. Uses `mathjs`, handles parens, `%`, `^`, decimals.
- **Agent panel** — paste your Anthropic API key once; ask questions about the active note. Stored locally, never transmitted except to Anthropic.
- **Autosave** — every keystroke, debounced, to Windows `%APPDATA%/Quill`.

## Keyboard

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New note |
| `Ctrl+W` | Close active note |
| `Ctrl+\` | Toggle vertical split |
| `Ctrl+-` | Toggle horizontal split |
| `Ctrl+P` | Toggle pin (always-on-top) |
| `Ctrl+K` | Toggle agent panel |

## Run

```bash
npm install
npm run dev         # hot-reload dev mode
```

## Build a portable .exe

```bash
npm run dist:win
```

Installer drops at `release/Quill-Setup-0.1.0.exe`. Run once, then right-click its taskbar icon → **Pin to taskbar**.

## Storage

Notes + settings + API key: `%APPDATA%\Quill\quill-data.json`. Delete to reset.

## Stack

Electron 33, Vite, React 18, TypeScript, Tailwind, mathjs, @anthropic-ai/sdk.

## Companion (phone app)

A standalone Progressive Web App lives at [`mobile/`](./mobile/README.md):
records conversations, transcribes with speaker diarization, runs Claude
analysis (summary / action items / decisions / quotes / next steps),
auto-emails a recap, and exports Quill-format `.md` notes you drop into
`%APPDATA%\Quill\notes\`. No build step — host the folder anywhere with
HTTPS and install to the home screen.

