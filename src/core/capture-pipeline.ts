// VAD-gated capture pipeline — the ephemeral-audio brain (M1).
//
// Pure state machine: it consumes Voice Activity Detection results (one per
// audio frame) and emits "transcribe this window" events on natural speech
// boundaries. It holds NO audio — the caller keeps a short rolling PCM buffer,
// runs STT when a ChunkWindow fires, then discards that audio. This is what
// makes "few-second batches, audio discarded within seconds" a first-class
// behavior rather than an afterthought (build directive constraints 1-3).

export interface VadFrame {
  /** frame timestamp, ms (monotonic) */
  at: number;
  /** speech probability 0..1 from Silero/ten-VAD */
  speechProb: number;
}

export interface ChunkWindow {
  startedAt: number;
  endedAt: number;
  /** why the chunk closed: a real end-of-speech pause, or a forced max-length cut */
  reason: 'silence' | 'maxlen';
}

export interface PipelineConfig {
  /** speech if prob >= this */
  speechThreshold?: number;
  /** end-of-speech after this much continuous silence (ms) */
  silenceMs?: number;
  /** rewind the chunk start by this much to catch word onsets (ms) */
  preRollMs?: number;
  /** force-close a chunk that runs longer than this (ms) */
  maxChunkMs?: number;
}

export class CapturePipeline {
  private readonly speechThreshold: number;
  private readonly silenceMs: number;
  private readonly preRollMs: number;
  private readonly maxChunkMs: number;

  private speaking = false;
  private segStart = 0;
  private lastSpeechAt = 0;

  constructor(
    private readonly onChunk: (w: ChunkWindow) => void,
    cfg: PipelineConfig = {}
  ) {
    this.speechThreshold = cfg.speechThreshold ?? 0.5;
    this.silenceMs = cfg.silenceMs ?? 500;
    this.preRollMs = cfg.preRollMs ?? 200;
    this.maxChunkMs = cfg.maxChunkMs ?? 6000;
  }

  pushFrame(frame: VadFrame): void {
    const isSpeech = frame.speechProb >= this.speechThreshold;

    if (isSpeech) {
      if (!this.speaking) {
        this.speaking = true;
        this.segStart = Math.max(0, frame.at - this.preRollMs);
      }
      this.lastSpeechAt = frame.at;

      // A very long utterance is force-cut; the caller carries text-prompt
      // context across the seam (no audio overlap needed here).
      if (frame.at - this.segStart >= this.maxChunkMs) {
        this.promote(frame.at, 'maxlen');
        this.speaking = true;
        this.segStart = frame.at;
        this.lastSpeechAt = frame.at;
      }
      return;
    }

    // silence frame
    if (this.speaking && frame.at - this.lastSpeechAt >= this.silenceMs) {
      this.promote(this.lastSpeechAt, 'silence');
      this.speaking = false;
    }
  }

  /** Flush any open segment when capture stops or is muted. */
  flush(): void {
    if (this.speaking) {
      this.promote(this.lastSpeechAt, 'silence');
      this.speaking = false;
    }
  }

  /** True while inside an active speech segment. */
  isSpeaking(): boolean {
    return this.speaking;
  }

  private promote(end: number, reason: ChunkWindow['reason']): void {
    // Never emit a zero/negative-length window (can happen if speech ends exactly
    // at a maxlen force-cut) — the caller would hand empty audio to STT.
    if (end > this.segStart) this.onChunk({ startedAt: this.segStart, endedAt: end, reason });
  }
}
