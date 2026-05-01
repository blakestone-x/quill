// Audio capture for Quill Companion.
//
// Picks the best supported MIME type per platform (Safari needs mp4/m4a),
// streams chunks into one Blob, exposes an FFT-based level meter, holds a
// Wake Lock so the screen doesn't sleep mid-conversation, and supports
// pause / resume.

const PREFERRED_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg'
];

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function fileExtFor(mime) {
  if (!mime) return 'bin';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'bin';
}

export class Recorder {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.mime = '';
    this.audioCtx = null;
    this.analyser = null;
    this.levelData = null;
    this.wakeLock = null;
    this.startTime = 0;
    this.pausedTotal = 0;
    this.pauseStarted = 0;
    this.state = 'idle'; // idle | recording | paused | stopped
    this.onLevel = null;
  }

  async start() {
    if (this.state !== 'idle') throw new Error('recorder busy');
    const mime = pickMime();
    if (mime === null) throw new Error('MediaRecorder not supported on this browser');

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000
      }
    });

    this.mime = mime;
    this.chunks = [];

    const opts = mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : {};
    this.mediaRecorder = new MediaRecorder(this.stream, opts);
    this.mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    });

    // 1-second timeslices keep memory bounded and survive crashes better.
    this.mediaRecorder.start(1000);
    this.startTime = performance.now();
    this.pausedTotal = 0;
    this.state = 'recording';

    this._setupMeter();
    this._acquireWakeLock();
  }

  pause() {
    if (this.state !== 'recording') return;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.pause();
    this.pauseStarted = performance.now();
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') this.mediaRecorder.resume();
    this.pausedTotal += performance.now() - this.pauseStarted;
    this.state = 'recording';
  }

  async stop() {
    if (this.state === 'idle' || this.state === 'stopped') return null;
    if (this.state === 'paused') this.pausedTotal += performance.now() - this.pauseStarted;

    const done = new Promise((resolve) => {
      this.mediaRecorder.addEventListener(
        'stop',
        () => {
          const blob = new Blob(this.chunks, { type: this.mime || 'application/octet-stream' });
          resolve(blob);
        },
        { once: true }
      );
    });
    this.mediaRecorder.stop();
    const blob = await done;

    this._teardown();
    this.state = 'stopped';
    return { blob, mime: this.mime, durationMs: this.elapsed() };
  }

  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch {}
    }
    this._teardown();
    this.state = 'idle';
  }

  elapsed() {
    if (this.state === 'idle') return 0;
    const now = this.state === 'paused' ? this.pauseStarted : performance.now();
    return Math.max(0, now - this.startTime - this.pausedTotal);
  }

  _setupMeter() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.4;
      src.connect(this.analyser);
      this.levelData = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(this.levelData);
        let peak = 0;
        for (let i = 0; i < this.levelData.length; i++) {
          const v = Math.abs(this.levelData[i] - 128);
          if (v > peak) peak = v;
        }
        if (this.onLevel) this.onLevel(peak / 128, this.levelData);
        if (this.state === 'recording' || this.state === 'paused') requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      console.warn('meter setup failed', e);
    }
  }

  async _acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      // user denied or page hidden — not fatal
    }
  }

  _teardown() {
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch {}
      this.wakeLock = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
      this.analyser = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
  }
}

export function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
