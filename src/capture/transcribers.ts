// Transcriber implementations (renderer). Local sidecar (default, private) and
// Deepgram (cloud opt-in). Both reuse the tested frame parsers, and both
// AUTO-RECONNECT if the engine drops mid-session (e.g. the sidecar restarts) so
// recording recovers on its own instead of silently dying. Audio is never stored.

import type { Transcriber, TranscriberConfig, TranscriptChunk } from '../core/providers';
import { parseDeepgramFrame, parseSidecarFrame } from '../core/transcript-frames';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'failed';

const MAX_RETRIES = 12;

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

/**
 * Shared reconnecting WS transcriber. Subclasses supply the URL/protocols, the
 * outbound audio encoding, and the inbound frame parser. The first connect
 * rejects (so a dead engine surfaces an error); a drop AFTER a successful open
 * triggers bounded backoff reconnects.
 */
abstract class ReconnectingTranscriber implements Transcriber {
  protected ws: WebSocket | null = null;
  private onChunk: ((c: TranscriptChunk) => void) | null = null;
  private stopped = false;
  private everOpened = false;
  private retries = 0;

  constructor(
    public readonly config: TranscriberConfig,
    protected readonly onStatus?: (s: ConnectionStatus) => void
  ) {}

  protected abstract open(): WebSocket;
  protected abstract parse(data: unknown): TranscriptChunk | null;
  protected abstract encode(frame: Float32Array): ArrayBufferLike;
  protected closeFrame(): string | null {
    return null;
  }

  start(onChunk: (c: TranscriptChunk) => void): Promise<void> {
    this.stopped = false;
    this.everOpened = false;
    this.retries = 0;
    this.onChunk = onChunk;
    return this.connect();
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = this.open();
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        this.everOpened = true;
        this.retries = 0;
        this.onStatus?.('connected');
        resolve();
      };
      ws.onerror = () => reject(new Error('transcriber connection failed'));
      ws.onmessage = (ev) => {
        const chunk = this.parse(decodeJson(ev.data));
        if (chunk && this.onChunk) this.onChunk(chunk);
      };
      ws.onclose = () => {
        this.ws = null;
        if (!this.stopped && this.everOpened) this.scheduleReconnect();
      };
      this.ws = ws;
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.retries >= MAX_RETRIES) {
      this.onStatus?.('failed');
      return;
    }
    this.retries++;
    this.onStatus?.('reconnecting');
    const delay = Math.min(5000, 400 * this.retries);
    setTimeout(() => {
      if (this.stopped) return;
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  pushAudio(frame: Float32Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(this.encode(frame));
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (!this.ws) return;
    const cf = this.closeFrame();
    if (cf && this.ws.readyState === WebSocket.OPEN) this.ws.send(cf);
    this.ws.close();
    this.ws = null;
  }
}

/** Local STT sidecar (Float32 PCM @16k). Default engine — audio stays on device. */
export class SidecarTranscriber extends ReconnectingTranscriber {
  constructor(
    config: TranscriberConfig,
    private readonly url = 'ws://127.0.0.1:8765/ws',
    onStatus?: (s: ConnectionStatus) => void
  ) {
    super(config, onStatus);
  }
  protected open(): WebSocket {
    return new WebSocket(this.url);
  }
  protected parse(data: unknown): TranscriptChunk | null {
    return parseSidecarFrame(data);
  }
  protected encode(frame: Float32Array): ArrayBufferLike {
    return frame.buffer;
  }
  protected override closeFrame(): string {
    return JSON.stringify({ type: 'stop' });
  }
}

/** Deepgram streaming (cloud opt-in; linear16). Sends audio off-device. */
export class DeepgramTranscriber extends ReconnectingTranscriber {
  constructor(
    config: TranscriberConfig,
    private readonly apiKey: string,
    onStatus?: (s: ConnectionStatus) => void
  ) {
    super(config, onStatus);
  }
  protected open(): WebSocket {
    const params = new URLSearchParams({
      encoding: 'linear16',
      sample_rate: '16000',
      model: 'nova-3',
      interim_results: 'true'
    });
    if (this.config.diarize) params.set('diarize', 'true');
    return new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['token', this.apiKey]);
  }
  protected parse(data: unknown): TranscriptChunk | null {
    return parseDeepgramFrame(data);
  }
  protected encode(frame: Float32Array): ArrayBufferLike {
    return floatTo16BitPCM(frame).buffer;
  }
  protected override closeFrame(): string {
    return JSON.stringify({ type: 'CloseStream' });
  }
}
