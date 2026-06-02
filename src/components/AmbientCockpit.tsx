import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Mic, MicOff, Square, Flag, Radio, X } from 'lucide-react';
import { useCapture } from '../store/capture-react';
import { CaptureController } from '../capture/controller';

// Self-contained ambient capture panel, mounted as a fixed overlay in main.tsx
// (no App.tsx coupling). Record / stop / mute-killswitch / flag + live transcript.
export default function AmbientCockpit() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = useCapture((s) => s.status);
  const segments = useCapture((s) => s.segments);
  const ctrlRef = useRef<CaptureController | null>(null);

  const recording = status !== 'idle';
  const muted = status === 'muted';

  async function start() {
    setError(null);
    try {
      const engine = ((await window.quill.getStore<string>('sttEngine')) ?? 'sidecar') as
        | 'sidecar'
        | 'deepgram';
      const deepgramKey = (await window.quill.getStore<string>('deepgramKey')) ?? undefined;
      const captureSystemAudio = (await window.quill.getStore<boolean>('captureSystemAudio')) ?? true;
      const deviceId = (await window.quill.getStore<string>('deviceId')) ?? 'desktop';
      const ctrl = new CaptureController({
        engine,
        deepgramKey,
        captureSystemAudio,
        deviceId,
        newId: () => nanoid(),
        now: () => Date.now()
      });
      await ctrl.start();
      ctrlRef.current = ctrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stop() {
    await ctrlRef.current?.stop();
    ctrlRef.current = null;
  }

  return (
    <>
      <button
        aria-label="Toggle ambient cockpit"
        onClick={() => setOpen((o) => !o)}
        className="no-drag fixed bottom-3 right-3 z-50 flex h-9 items-center gap-1.5 rounded-full bg-[#dcb05a] px-3 text-xs font-medium text-black shadow-lg"
      >
        <Radio size={14} /> {recording ? 'Live' : 'Quill'}
      </button>

      {open && (
        <div className="no-drag fixed bottom-14 right-3 z-50 flex w-80 flex-col gap-2 rounded-lg border border-white/10 bg-[#13100d] p-3 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#dcb05a]">Ambient cockpit</span>
            <button
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-white/40 hover:text-white/80"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!recording ? (
              <button
                onClick={start}
                className="flex items-center gap-1.5 rounded bg-[#dcb05a] px-2.5 py-1 text-xs font-medium text-black"
              >
                <Mic size={14} /> Record
              </button>
            ) : (
              <>
                <button
                  onClick={stop}
                  className="flex items-center gap-1.5 rounded bg-red-500/80 px-2.5 py-1 text-xs font-medium text-white"
                >
                  <Square size={12} /> Stop
                </button>
                <button
                  onClick={() => ctrlRef.current?.toggleMute()}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-white ${muted ? 'bg-white/25' : 'bg-white/10'}`}
                >
                  {muted ? <MicOff size={14} /> : <Mic size={14} />} {muted ? 'Muted' : 'Mute'}
                </button>
                <button
                  onClick={() => ctrlRef.current?.flag()}
                  className="flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-xs text-white"
                >
                  <Flag size={13} /> Flag
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="rounded bg-red-500/10 p-1.5 text-[11px] text-red-300">{error}</div>
          )}

          <div className="max-h-64 overflow-auto rounded bg-black/30 p-2 text-xs leading-relaxed">
            {segments.length === 0 ? (
              <span className="text-white/30">Transcript will appear here…</span>
            ) : (
              segments.map((s) => (
                <div key={s.id} className={s.final ? 'text-white/90' : 'text-white/50'}>
                  <span className="text-[#dcb05a]/70">{s.speaker}:</span> {s.text}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
