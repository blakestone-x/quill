# quill STT sidecar

Local, private speech-to-text for the Quill desktop app. The desktop streams raw
PCM over a WebSocket; this server transcribes it and streams back text frames.
**Audio is held in memory for seconds, then discarded — only text is emitted.**

## Setup (your machine — needs Python 3.10+)

```bash
cd projects/active/quill/sidecar
python -m venv .venv
. .venv/Scripts/activate        # Windows; use source .venv/bin/activate on *nix
pip install -r requirements.txt
python server.py                # ws://127.0.0.1:8765/ws  (GET /health for a check)
```

First run downloads the model (`distil-large-v3` by default). On a CPU-only box,
set `QUILL_STT_MODEL=base.en` or `distil-medium.en` for speed.

## Env vars

| var | default | notes |
|---|---|---|
| `QUILL_STT_MODEL` | `distil-large-v3` | any faster-whisper model id |
| `QUILL_STT_DEVICE` | `auto` | `cuda` / `cpu` |
| `QUILL_STT_COMPUTE` | `auto` | e.g. `int8`, `float16` |
| `QUILL_STT_CHUNK_SECONDS` | `3.0` | window size before a transcribe pass |
| `PORT` | `8765` | |

## Protocol

- Client → server: **binary** messages of Float32 LE PCM, mono, 16 kHz; **text**
  control messages `{"type":"flush"}` / `{"type":"stop"}`.
- Server → client: SidecarFrame JSON `{ text, startedAt, endedAt, final, speaker?, confidence? }`
  (see `protocol.py`; the desktop parses it with `parseSidecarFrame` in
  `src/core/transcript-frames.ts`).

## Status

Self-contained reference **v1**: bounded ~3 s windows with a 0.5 s overlap tail and
prior-text prompting (no growing-buffer anti-pattern). For production-grade
streaming + diarization the research recommends **WhisperLiveKit** — swap the
`_transcribe_and_emit` step for a WhisperLiveKit client and keep emitting the same
protocol. `python test_protocol.py` checks the wire format without the ML deps.
