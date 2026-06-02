// Capture controller — the single API the UI calls. Ties AmbientCapture + the
// chosen Transcriber + the capture store + the local DB together.
//
// BUILD-OK: depends on browser media + window.quill at runtime. Logic is thin
// and id/clock are injected so behavior is deterministic where it matters.

import { AmbientCapture } from './audio';
import { DeepgramTranscriber, SidecarTranscriber } from './transcribers';
import { captureStore } from '../store/capture';
import { CoordinatorClient } from '../sync/coordinator-client';
import type { Transcriber, TranscriberConfig, TranscriptChunk } from '../core/providers';
import type { CaptureSession, SessionFlag, TranscriptSegment } from '../core/domain';

export interface CaptureControllerOptions {
  engine: 'sidecar' | 'deepgram';
  deepgramKey?: string;
  sidecarUrl?: string;
  captureSystemAudio?: boolean;
  deviceId: string;
  newId: () => string;
  now: () => number;
  /** write through to window.quill.db (default true) */
  persist?: boolean;
  onLevel?: (rms: number) => void;
  onSpeaking?: (speaking: boolean) => void;
  /** VPS coordinator URL for single-recorder coordination + sync (optional) */
  coordinatorUrl?: string;
  /** another device claimed the recorder — stop local capture */
  onStolen?: () => void;
}

export class CaptureController {
  private capture: AmbientCapture | null = null;
  private client: CoordinatorClient | null = null;
  private sessionId = '';
  private seq = 0;

  constructor(private readonly opts: CaptureControllerOptions) {}

  async start(): Promise<void> {
    const session: CaptureSession = {
      id: this.opts.newId(),
      deviceId: this.opts.deviceId,
      deviceKind: 'desktop',
      startedAt: this.opts.now(),
      endedAt: null,
      consentMode: captureStore.getState().consentMode
    };
    this.sessionId = session.id;
    this.seq = 0;
    captureStore.getState().startSession(session);
    if (this.persist) void window.quill.db.createSession(session);

    if (this.opts.coordinatorUrl) {
      this.client = new CoordinatorClient({
        url: this.opts.coordinatorUrl,
        deviceId: this.opts.deviceId,
        deviceKind: 'desktop',
        onStolen: () => this.opts.onStolen?.()
      });
      try {
        await this.client.connect();
        this.client.claimRecord();
      } catch {
        this.client = null; // coordinator optional — capture still works locally
      }
    }

    this.capture = new AmbientCapture({
      transcriber: this.makeTranscriber(),
      captureSystemAudio: this.opts.captureSystemAudio,
      onChunk: (c) => this.onChunk(c),
      onLevel: this.opts.onLevel,
      onSpeaking: this.opts.onSpeaking
    });
    await this.capture.start();
  }

  toggleMute(): boolean {
    if (!this.capture) return false;
    const next = !this.capture.isMuted();
    this.capture.setMuted(next);
    captureStore.getState().setStatus(next ? 'muted' : 'recording');
    return next;
  }

  flag(note = ''): SessionFlag {
    const f: SessionFlag = { id: this.opts.newId(), sessionId: this.sessionId, at: this.opts.now(), note };
    captureStore.getState().addFlag(f);
    if (this.persist) void window.quill.db.addFlag(f);
    return f;
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.releaseRecord();
      this.client.close();
      this.client = null;
    }
    if (this.capture) {
      await this.capture.stop();
      this.capture = null;
    }
    if (this.sessionId) {
      captureStore.getState().endSession();
      if (this.persist) void window.quill.db.endSession(this.sessionId, this.opts.now());
    }
  }

  private get persist(): boolean {
    return this.opts.persist !== false;
  }

  private makeTranscriber(): Transcriber {
    const config: TranscriberConfig = {
      location: this.opts.engine === 'sidecar' ? 'local' : 'cloud',
      engine: this.opts.engine,
      diarize: true
    };
    if (this.opts.engine === 'deepgram') {
      if (!this.opts.deepgramKey) throw new Error('Deepgram API key required for cloud transcription');
      return new DeepgramTranscriber(config, this.opts.deepgramKey);
    }
    return new SidecarTranscriber(config, this.opts.sidecarUrl);
  }

  private onChunk(c: TranscriptChunk): void {
    const seg: TranscriptSegment = {
      id: `${this.sessionId}:${this.seq}`,
      sessionId: this.sessionId,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      speaker: c.speaker ?? 'me',
      text: c.text,
      sourceDevice: this.opts.deviceId,
      final: c.final,
      synced: false
    };
    captureStore.getState().upsertSegment(seg);
    if (c.final) {
      if (this.persist) void window.quill.db.addSegment(seg);
      this.client?.sendSegment(this.sessionId, seg);
      this.seq++;
    }
  }
}
