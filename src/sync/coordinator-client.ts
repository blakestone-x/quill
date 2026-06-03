// Desktop client for the VPS coordinator (M5). Claims the single-recorder lock,
// heartbeats, streams finalized text segments, and reacts to being stolen.
// Message dispatch is a pure function (tested); the WS transport is build-only.

import type { TranscriptSegment } from '../core/domain';

export interface RemoteSegment {
  type: 'SEGMENT';
  deviceId: string;
  sessionId: string;
  segment: {
    id: string;
    startedAt: number;
    endedAt: number;
    speaker: string;
    text: string;
    final: boolean;
  };
}

export interface RemoteCommand {
  type: 'COMMAND';
  deviceId: string;
  target: 'desktop' | 'mobile' | 'any';
  intent: string;
  payload: Record<string, unknown>;
}

export interface ServerHandlers {
  onGranted?: (expiresAt: number) => void;
  onStolen?: (byDeviceId: string) => void;
  onSegment?: (msg: RemoteSegment) => void;
  onCommand?: (msg: RemoteCommand) => void;
}

/** Pure dispatch of a server frame. Malformed input is ignored. */
export function handleServerMessage(raw: string, h: ServerHandlers): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  if (!msg || typeof msg.type !== 'string') return;
  switch (msg.type) {
    case 'RECORD_GRANTED':
      h.onGranted?.(typeof msg.expiresAt === 'number' ? msg.expiresAt : 0);
      break;
    case 'RECORD_STOLEN':
      h.onStolen?.(String(msg.byDeviceId ?? ''));
      break;
    case 'SEGMENT':
      if (msg.segment) h.onSegment?.(msg as unknown as RemoteSegment);
      break;
    case 'COMMAND':
      h.onCommand?.(msg as unknown as RemoteCommand);
      break;
    default:
      break;
  }
}

export interface CoordinatorClientOptions extends ServerHandlers {
  url: string;
  deviceId: string;
  deviceKind: 'desktop' | 'mobile';
  heartbeatMs?: number;
}

export class CoordinatorClient {
  private ws: WebSocket | null = null;
  private hb: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: CoordinatorClientOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url);
      ws.onopen = () => {
        this.rawSend({ type: 'HELLO', deviceId: this.opts.deviceId, kind: this.opts.deviceKind });
        resolve();
      };
      ws.onerror = () => reject(new Error('coordinator connection failed'));
      ws.onclose = () => this.stopHeartbeat(); // don't keep firing heartbeats into a dead socket
      ws.onmessage = (ev) => handleServerMessage(typeof ev.data === 'string' ? ev.data : '', this.opts);
      this.ws = ws;
    });
  }

  claimRecord(): void {
    this.rawSend({ type: 'CLAIM_RECORD', deviceId: this.opts.deviceId });
    this.startHeartbeat();
  }

  releaseRecord(): void {
    this.stopHeartbeat();
    this.rawSend({ type: 'RELEASE_RECORD', deviceId: this.opts.deviceId });
  }

  sendSegment(sessionId: string, seg: TranscriptSegment): void {
    this.rawSend({
      type: 'SEGMENT',
      deviceId: this.opts.deviceId,
      sessionId,
      segment: {
        id: seg.id,
        startedAt: seg.startedAt,
        endedAt: seg.endedAt,
        speaker: seg.speaker,
        text: seg.text,
        final: seg.final
      }
    });
  }

  sendCommand(target: 'desktop' | 'mobile' | 'any', intent: string, payload: Record<string, unknown>): void {
    this.rawSend({ type: 'COMMAND', deviceId: this.opts.deviceId, target, intent, payload });
  }

  close(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.hb = setInterval(
      () => this.rawSend({ type: 'HEARTBEAT', deviceId: this.opts.deviceId }),
      this.opts.heartbeatMs ?? 30000
    );
  }

  private stopHeartbeat(): void {
    if (this.hb) {
      clearInterval(this.hb);
      this.hb = null;
    }
  }

  private rawSend(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}
