// Provider abstraction seam.
//
// Speech-to-text, embeddings, and diarization sit behind interfaces so that a
// local vs cloud implementation is a config switch, not a rewrite (build
// directive M0). Concrete implementations register themselves in M1 (STT +
// diarization) and M3 (embeddings). This file ships the seam only.

import type { SpeakerLabel } from './domain';

export type ProviderLocation = 'local' | 'cloud';

/** A finalized or partial transcript chunk emitted by a Transcriber. */
export interface TranscriptChunk {
  text: string;
  startedAt: number;
  endedAt: number;
  speaker?: SpeakerLabel;
  /** true = committed final; false = live partial hypothesis */
  final: boolean;
  /** model confidence 0..1 if available */
  confidence?: number;
}

export interface TranscriberConfig {
  location: ProviderLocation;
  /** engine id, e.g. 'whisperlivekit' | 'moonshine' | 'deepgram' */
  engine: string;
  language?: string;
  /** request speaker labels */
  diarize?: boolean;
}

/**
 * Streaming speech-to-text. Audio is fed as Float32 PCM frames and MUST be
 * discarded after transcription — never retained, never written to disk
 * (build directive constraints 1 & 4).
 */
export interface Transcriber {
  readonly config: TranscriberConfig;
  /** Begin a streaming session; chunks arrive via the callback. */
  start(onChunk: (chunk: TranscriptChunk) => void): Promise<void>;
  /** Push one frame of mono PCM audio (Float32, 16 kHz). */
  pushAudio(frame: Float32Array): void;
  /** Flush, finalize the pending hypothesis, and release the engine. */
  stop(): Promise<void>;
}

export interface EmbedderConfig {
  location: ProviderLocation;
  model: string; // e.g. 'nomic-embed-text-v1.5'
  dimensions: number;
}

export interface Embedder {
  readonly config: EmbedderConfig;
  embed(texts: string[]): Promise<number[][]>;
}

export interface DiarizerConfig {
  location: ProviderLocation;
  engine: string; // e.g. 'two-channel' | 'sherpa-onnx' | 'diart'
}

export interface DiarizationTurn {
  startedAt: number;
  endedAt: number;
  speaker: SpeakerLabel;
}

export interface Diarizer {
  readonly config: DiarizerConfig;
  label(input: Float32Array, startedAt: number): Promise<DiarizationTurn[]>;
}

export interface ProviderRegistry {
  transcriber(config: TranscriberConfig): Transcriber;
  embedder(config: EmbedderConfig): Embedder;
  diarizer(config: DiarizerConfig): Diarizer;
}

type TranscriberFactory = (config: TranscriberConfig) => Transcriber;
type EmbedderFactory = (config: EmbedderConfig) => Embedder;
type DiarizerFactory = (config: DiarizerConfig) => Diarizer;

/** Config-driven registry. Implementations register a factory per engine/model. */
class DefaultRegistry implements ProviderRegistry {
  private transcribers = new Map<string, TranscriberFactory>();
  private embedders = new Map<string, EmbedderFactory>();
  private diarizers = new Map<string, DiarizerFactory>();

  registerTranscriber(engine: string, factory: TranscriberFactory): void {
    this.transcribers.set(engine, factory);
  }
  registerEmbedder(model: string, factory: EmbedderFactory): void {
    this.embedders.set(model, factory);
  }
  registerDiarizer(engine: string, factory: DiarizerFactory): void {
    this.diarizers.set(engine, factory);
  }

  transcriber(config: TranscriberConfig): Transcriber {
    const f = this.transcribers.get(config.engine);
    if (!f) throw new Error(`No transcriber registered for engine "${config.engine}"`);
    return f(config);
  }
  embedder(config: EmbedderConfig): Embedder {
    const f = this.embedders.get(config.model);
    if (!f) throw new Error(`No embedder registered for model "${config.model}"`);
    return f(config);
  }
  diarizer(config: DiarizerConfig): Diarizer {
    const f = this.diarizers.get(config.engine);
    if (!f) throw new Error(`No diarizer registered for engine "${config.engine}"`);
    return f(config);
  }
}

/** App-wide registry singleton. M1/M3 implementations register against this. */
export const providers = new DefaultRegistry();
