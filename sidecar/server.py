"""Quill local STT sidecar — FastAPI WebSocket server.

The desktop streams Float32 LE PCM (mono, 16 kHz) over the WebSocket. This server
runs VAD-gated faster-whisper on bounded ~3 s windows (NOT a growing buffer — that
is the slow anti-pattern the research flagged), emits SidecarFrame JSON, and keeps
only a short overlap tail. Audio lives in memory for seconds, then is discarded.

This is a self-contained reference v1. For production-grade streaming the research
recommends WhisperLiveKit; swap the transcribe step for a WhisperLiveKit client and
keep emitting the same protocol (protocol.py).
"""
from __future__ import annotations

import asyncio
import json
import os

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from faster_whisper import WhisperModel

from protocol import SAMPLE_RATE, build_frame

MODEL_NAME = os.environ.get("QUILL_STT_MODEL", "distil-large-v3")
DEVICE = os.environ.get("QUILL_STT_DEVICE", "auto")
COMPUTE = os.environ.get("QUILL_STT_COMPUTE", "auto")
CHUNK_SECONDS = float(os.environ.get("QUILL_STT_CHUNK_SECONDS", "3.0"))
OVERLAP_SECONDS = float(os.environ.get("QUILL_STT_OVERLAP_SECONDS", "0.5"))

app = FastAPI()
_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE)
    return _model


def pcm_to_np(buf: bytes) -> np.ndarray:
    return np.frombuffer(buf, dtype="<f4").astype(np.float32)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    audio = np.zeros(0, dtype=np.float32)
    base_ms = 0
    prev_text = ""
    chunk_samples = int(CHUNK_SECONDS * SAMPLE_RATE)
    try:
        while True:
            msg = await ws.receive()
            if msg.get("bytes") is not None:
                audio = np.concatenate([audio, pcm_to_np(msg["bytes"])])
                if len(audio) >= chunk_samples:
                    base_ms, prev_text, audio = await _transcribe_and_emit(ws, audio, base_ms, prev_text)
            elif msg.get("text") is not None:
                try:
                    ctrl = json.loads(msg["text"])
                except Exception:
                    ctrl = {}
                if ctrl.get("type") in ("flush", "stop") and len(audio) > 0:
                    base_ms, prev_text, audio = await _transcribe_and_emit(ws, audio, base_ms, prev_text)
                if ctrl.get("type") == "stop":
                    break
    except WebSocketDisconnect:
        pass


async def _transcribe_and_emit(ws: WebSocket, audio: np.ndarray, base_ms: int, prev_text: str):
    model = get_model()
    loop = asyncio.get_event_loop()
    segments = await loop.run_in_executor(
        None,
        lambda: list(model.transcribe(audio, vad_filter=True, initial_prompt=prev_text or None)[0]),
    )
    last_end_s = 0.0
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        await ws.send_json(
            build_frame(text, base_ms + int(seg.start * 1000), base_ms + int(seg.end * 1000), final=True)
        )
        prev_text = text
        last_end_s = max(last_end_s, float(seg.end))

    keep = int(OVERLAP_SECONDS * SAMPLE_RATE)
    base_ms += int(last_end_s * 1000)
    audio = audio[-keep:] if len(audio) > keep else np.zeros(0, dtype=np.float32)
    return base_ms, prev_text, audio


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8765")))
