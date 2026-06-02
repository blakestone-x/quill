import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Mic, MicOff, Square, Flag, Radio, X, Settings } from 'lucide-react';
import { useCapture } from '../store/capture-react';
import { captureStore } from '../store/capture';
import { CaptureController } from '../capture/controller';
import type { ConsentMode } from '../core/domain';

type Engine = 'sidecar' | 'deepgram';

// Self-contained ambient capture panel, mounted as a fixed overlay in main.tsx
// (no App.tsx coupling). Record / stop / mute-killswitch / flag + live transcript,
// with inline config (engine, key, system audio, consent posture).
export default function AmbientCockpit() {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine>('sidecar');
  const [deepgramKey, setDeepgramKey] = useState('');
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);

  const status = useCapture((s) => s.status);
  const segments = useCapture((s) => s.segments);
  const consentMode = useCapture((s) => s.consentMode);
  const ctrlRef = useRef<CaptureController | null>(null);

  const recording = status !== 'idle';
  const muted = status === 'muted';

  useEffect(() => {
    if (typeof window === 'undefined' || !window.quill) return;
    void (async () => {
      const e = await window.quill.getStore<Engine>('sttEngine');
      const k = await window.quill.getStore<string>('deepgramKey');
      const sys = await window.quill.getStore<boolean>('captureSystemAudio');
      if (e) setEngine(e);
      if (typeof k === 'string') setDeepgramKey(k);
      if (typeof sys === 'boolean') setCaptureSystemAudio(sys);
    })();
  }, []);

  // Floating-bar command relay (capture runs here; the bar is a remote).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.quill?.bar) return;
    return window.quill.bar.onCommand((type) => {
      const ctrl = ctrlRef.current;
      if (type === 'mute') ctrl?.toggleMute();
      else if (type === 'flag') ctrl?.flag();
      else if (type === 'stop')
        void ctrl?.stop().then(() => {
          ctrlRef.current = null;
        });
      else if (type === 'return') void window.quill.bar.close();
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.quill?.bar) return;
    const finals = segments.filter((s) => s.final);
    void window.quill.bar.sendState({
      status,
      lastLine: finals.length ? finals[finals.length - 1].text : ''
    });
  }, [status, segments]);

  function persist(key: string, value: unknown) {
    if (typeof window !== 'undefined' && window.quill) void window.quill.setStore(key, value);
  }

  async function deviceId(): Promise<string> {
    if (typeof window === 'undefined' || !window.quill) return 'desktop';
    let id = await window.quill.getStore<string>('deviceId');
    if (!id) {
      id = `desktop-${nanoid(6)}`;
      persist('deviceId', id);
    }
    return id;
  }

  async function start() {
    setError(null);
    try {
      const coordinatorUrl = (await window.quill.getStore<string>('coordinatorUrl')) ?? undefined;
      const ctrl = new CaptureController({
        engine,
        deepgramKey: deepgramKey || undefined,
        captureSystemAudio,
        deviceId: await deviceId(),
        newId: () => nanoid(),
        now: () => Date.now(),
        coordinatorUrl,
        onStolen: () => {
          void stop();
        }
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

  function setConsent(m: ConsentMode) {
    captureStore.getState().setConsentMode(m);
  }

  return (
    <>
      <button
        aria-label="Toggle ambient cockpit"
        onClick={() => setOpen((o) => !o)}
        className="no-drag fixed bottom-3 right-3 z-50 flex h-9 items-center gap-1.5 rounded-full bg-[#dcb05a] px-3 text-xs font-medium text-black shadow-lg"
      >
        <Radio size={14} /> {recording ? (muted ? 'Muted' : 'Live') : 'Quill'}
      </button>

      {open && (
        <div className="no-drag fixed bottom-14 right-3 z-50 flex w-80 flex-col gap-2 rounded-lg border border-white/10 bg-[#13100d] p-3 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#dcb05a]">Ambient cockpit</span>
            <div className="flex items-center gap-2">
              <button
                aria-label="Settings"
                onClick={() => setShowSettings((s) => !s)}
                className="text-white/40 hover:text-white/80"
              >
                <Settings size={13} />
              </button>
              <button
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white/80"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="flex flex-col gap-1.5 rounded bg-black/30 p-2 text-[11px] text-white/70">
              <label className="flex items-center justify-between gap-2">
                Engine
                <select
                  value={engine}
                  onChange={(e) => {
                    const v = e.target.value as Engine;
                    setEngine(v);
                    persist('sttEngine', v);
                  }}
                  className="rounded bg-white/10 px-1 py-0.5 text-white"
                >
                  <option value="sidecar">Local sidecar</option>
                  <option value="deepgram">Deepgram (cloud)</option>
                </select>
              </label>
              {engine === 'deepgram' && (
                <label className="flex items-center justify-between gap-2">
                  Key
                  <input
                    type="password"
                    value={deepgramKey}
                    onChange={(e) => {
                      setDeepgramKey(e.target.value);
                      persist('deepgramKey', e.target.value);
                    }}
                    className="w-36 rounded bg-white/10 px-1 py-0.5 text-white"
                  />
                </label>
              )}
              <label className="flex items-center justify-between gap-2">
                Capture system audio
                <input
                  type="checkbox"
                  checked={captureSystemAudio}
                  onChange={(e) => {
                    setCaptureSystemAudio(e.target.checked);
                    persist('captureSystemAudio', e.target.checked);
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                Consent
                <select
                  value={consentMode}
                  onChange={(e) => setConsent(e.target.value as ConsentMode)}
                  className="rounded bg-white/10 px-1 py-0.5 text-white"
                >
                  <option value="work-restricted">Work-restricted</option>
                  <option value="disclosed">Disclosed</option>
                  <option value="personal">Personal</option>
                </select>
              </label>
            </div>
          )}

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
                <button
                  onClick={() => void window.quill.bar.popout()}
                  className="flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-xs text-white"
                  aria-label="Pop out bar"
                >
                  <Radio size={13} /> Bar
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
