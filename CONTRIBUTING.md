# Contributing to Quill

Thanks for looking at the internals. Quill is an Electron + Vite + React app kept
deliberately small; contributions that keep it fast and well-typed are the
easiest to land.

## Getting set up

```bash
git clone https://github.com/blakestone-x/quill.git
cd quill
npm install
npm run dev        # electron-vite dev, hot reload
```

## Build scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run the app in dev mode with hot reload (`electron-vite dev`). |
| `npm run typecheck` | Type-check without emitting (`tsc --noEmit`). |
| `npm run build` | Bundle main, preload, and renderer (`electron-vite build`). |
| `npm run dist:win` | Build and package a Windows installer (`electron-builder --win`). |

`npm run typecheck` and `npm run build` are what CI runs on every push and PR.

## Coding conventions

- **TypeScript, strict.** Keep types explicit at module boundaries.
- **Three processes.** Respect the Electron main / preload / renderer split — no
  Node APIs in the renderer; bridge through preload.
- **No secrets in code.** The Anthropic API key is entered by the user at runtime
  and stored locally (`%APPDATA%/Quill`); it is never committed or transmitted
  except to Anthropic.
- **Small, focused PRs.** One concern per pull request.

## Pull requests

- [ ] `npm run typecheck` is clean.
- [ ] `npm run build` succeeds.
- [ ] Commits are scoped and the diff contains only what the change needs.

Open an issue first if you're planning something large so we can agree on the
shape before you build it.
