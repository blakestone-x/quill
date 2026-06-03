// Desktop audio capture (renderer). Mic + system loopback -> Web Audio mix ->
// energy-VAD gate -> Transcriber. Audio is streamed in frames and never stored;
// silence is not sent (cost/compute), and the killswitch hard-mutes.
//
// BUILD-OK: typechecks + bundles. The Web Audio graph + getDisplayMedia loopback
// need runtime tuning on the real machine (frame size, RMS threshold).

import { CapturePipeline } from '../core/capture-pipeline';
import type { Transcriber, TranscriptChunk } from '../core/providers';

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SIZE = 2048; // ScriptProcessor buffer @16k ≈ 128 ms
const SILENCE_RMS = 0.012; // energy gate (tune at runtime)

export interface AmbientCaptureOptions {
  transcriber: Transcriber;
  onChunk: (c: TranscriptChunk) => void;
  onLevel?: (rms: number) => void;
  onSpeaking?: (speaking: boolean) => void;
  captureSystemAudio?: boolean;
}

export function computeRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}

export class AmbientCapture {
  private ctx: AudioContext | null = null;
  private streams: MediaStream[] = [];
  private node: ScriptProcessorNode | null = null;
  private readonly pipeline: CapturePipeline;
  private muted = false;

  constructor(private readonly opts: AmbientCaptureOptions) {
    // The pipeline drives the UI speaking state + the send gate; server-side STT
    // produces the actual segments, so the chunk callback is intentionally empty.
    this.pipeline = new CapturePipeline(() => undefined);
  }

  async start(): Promise<void> {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false
      });
      this.streams.push(mic);

      let sys: MediaStream | null = null;
      if (this.opts.captureSystemAudio) {
        try {
          // Windows loopback: getDisplayMedia rejects audio-only, so request video
          // then immediately drop the video track.
          const disp = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
          disp.getVideoTracks().forEach((t) => t.stop());
          sys = disp;
          this.streams.push(disp);
        } catch {
          sys = null; // denied or unsupported -> mic only
        }
      }

      const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      this.ctx = ctx;
      const merger = ctx.createGain();
      ctx.createMediaStreamSource(mic).connect(merger);
      if (sys) ctx.createMediaStreamSource(sys).connect(merger);

      const node = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
      node.onaudioprocess = (e: AudioProcessingEvent) => this.onAudio(e.inputBuffer.getChannelData(0));
      merger.connect(node);
      // A ScriptProcessor only fires when connected downstream — but routing the
      // captured mic+loopback to ctx.destination (speakers) would create a feedback
      // howl. Sink it at zero gain instead.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      node.connect(sink);
      sink.connect(ctx.destination);
      this.node = node;

      await this.opts.transcriber.start(this.opts.onChunk);
    } catch (e) {
      // A failed start (e.g. sidecar not running) must not leave the mic hot or
      // the context/loopback open.
      await this.stop();
      throw e;
    }
  }

  private onAudio(input: Float32Array): void {
    const frame = new Float32Array(input); // copy — the input buffer is reused
    const rms = computeRms(frame);
    const atMs = (this.ctx?.currentTime ?? 0) * 1000;
    const wasSpeaking = this.pipeline.isSpeaking();
    this.pipeline.pushFrame({ at: atMs, speechProb: rms > SILENCE_RMS ? 0.9 : 0.1 });
    const speaking = this.pipeline.isSpeaking();

    if (this.opts.onLevel) this.opts.onLevel(rms);
    if (this.opts.onSpeaking && speaking !== wasSpeaking) this.opts.onSpeaking(speaking);

    if (!this.muted && speaking) this.opts.transcriber.pushAudio(frame);
  }

  /** Killswitch — instant hard mute (still captures levels, sends nothing). */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async stop(): Promise<void> {
    this.pipeline.flush();
    try {
      await this.opts.transcriber.stop();
    } catch {
      // ignore
    }
    if (this.node) {
      this.node.disconnect();
      this.node.onaudioprocess = null;
      this.node = null;
    }
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
    for (const s of this.streams) s.getTracks().forEach((t) => t.stop());
    this.streams = [];
  }
}
