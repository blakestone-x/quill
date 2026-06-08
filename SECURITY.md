# Security Policy

Quill is a local desktop app. Notes are stored on your own machine
(`%APPDATA%/Quill` on Windows) and nothing is transmitted off-device except the
content you explicitly send to the agent panel, which goes to Anthropic under
your own API key.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/blakestone-x/quill/security/advisories/new)
rather than opening a public issue. Include a description, affected version, and
a minimal reproduction if you have one. Expect an initial response within a week.

## Scope

In scope:

- Leakage of the user's Anthropic API key (e.g. into logs or persisted state
  beyond the local config it is meant to live in).
- Renderer-process code gaining Node/filesystem access it should not have (an
  Electron context-isolation or preload-bridge weakness).
- Note content leaving the device by any path other than the user-initiated agent
  request.

Out of scope:

- Content you send to the agent panel yourself; it goes to Anthropic under your
  key and their terms.
- Physical/local access to an unlocked machine where the notes already live in
  plaintext.

## Supported versions

Quill ships fixes against the latest published release only. Run the current
release for security fixes.
