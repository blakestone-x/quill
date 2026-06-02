// Transcriber implementations (renderer). Local sidecar (default, private) and
// Deepgram (cloud opt-in). Both reuse the tested frame parsers. Audio frames are
// pushed in; text chunks come out — audio is never stored.

import type { Transcriber, TranscriberConfig, TranscriptChunk } from '../core/providers';
import { parseDeepgramFrame, parseSidecarFrame } from '../core/transcript-frames';

/** Clamp + convert Float32 [-1,1] PCM to little-endian Int16 (linear16). */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

function decodeJson(data: unknown): unknown {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** Local STT sidecar (Float32 PCM @16k). Default engine — audio stays on device. */
export class SidecarTranscriber implements Transcriber {
  private ws: WebSocket | null = null;
  private onChunk: ((c: TranscriptChunk) => void) | null = null;

  constructor(
    public readonly config: TranscriberConfig,
    private readonly url = 'ws://127.0.0.1:8765/ws'
  ) {}

  start(onChunk: (c: TranscriptChunk) => void): Promise<void> {
    this.onChunk = onChunk;
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('sidecar connection failed'));
      ws.onmessage = (ev) => {
        const frame = parseSidecarFrame(decodeJson(ev.data));
        if (frame && this.onChunk) this.onChunk(frame);
      };
      this.ws = ws;
    });
  }

  pushAudio(frame: Float32Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(frame.buffer);
  }

  async stop(): Promise<void> {
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'stop' }));
    this.ws.close();
    this.ws = null;
  }
}

/** Deepgram streaming (cloud opt-in; linear16). Sends audio off-device. */
export class DeepgramTranscriber implements Transcriber {
  private ws: WebSocket | null = null;
  private onChunk: ((c: TranscriptChunk) => void) | null = null;

  constructor(
    public readonly config: TranscriberConfig,
    private readonly apiKey: string
  ) {}

  start(onChunk: (c: TranscriptChunk) => void): Promise<void> {
    this.onChunk = onChunk;
    const params = new URLSearchParams({
      encoding: 'linear16',
      sample_rate: '16000',
      model: 'nova-3',
      interim_results: 'true'
    });
    if (this.config.diarize) params.set('diarize', 'true');
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, ['token', this.apiKey]);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('deepgram connection failed'));
      ws.onmessage = (ev) => {
        const frame = parseDeepgramFrame(decodeJson(ev.data));
        if (frame && this.onChunk) this.onChunk(frame);
      };
      this.ws = ws;
    });
  }

  pushAudio(frame: Float32Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(floatTo16BitPCM(frame).buffer);
    }
  }

  async stop(): Promise<void> {
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    this.ws.close();
    this.ws = null;
  }
}
