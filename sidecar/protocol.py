"""Sidecar wire protocol. Stdlib only, so it imports and tests without the ML deps.

The desktop parses these frames with parseSidecarFrame() in
src/core/transcript-frames.ts. Keep the two in sync.
"""
from __future__ import annotations

import json
from typing import Optional

SAMPLE_RATE = 16000  # mono Float32 LE expected from the desktop


def build_frame(
    text: str,
    start_ms: int,
    end_ms: int,
    final: bool,
    speaker: Optional[str] = None,
    confidence: Optional[float] = None,
) -> dict:
    """A normalized transcript frame. Audio is never included — text only."""
    frame: dict = {
        "text": text,
        "startedAt": int(start_ms),
        "endedAt": int(end_ms),
        "final": bool(final),
    }
    if speaker is not None:
        frame["speaker"] = speaker
    if confidence is not None:
        frame["confidence"] = float(confidence)
    return frame


def encode_frame(*args, **kwargs) -> str:
    return json.dumps(build_frame(*args, **kwargs))
