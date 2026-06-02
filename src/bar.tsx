import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Mic, MicOff, Square, Flag, Maximize2 } from 'lucide-react';
import './index.css';

// The floating bar — a tiny always-on-top remote. Capture runs in the main
// window; the bar relays commands and shows live status (build directive M2).
function Bar() {
  const [status, setStatus] = useState('idle');
  const [last, setLast] = useState('');

  useEffect(() => {
    if (!window.quill?.bar) return;
    return window.quill.bar.onState((s) => {
      setStatus(s.status);
      if (typeof s.lastLine === 'string') setLast(s.lastLine);
    });
  }, []);

  const muted = status === 'muted';
  const send = (type: string) => window.quill?.bar?.command(type);

  return (
    <div className="drag-region flex h-[52px] w-full items-center gap-2 rounded-lg bg-[#13100d]/95 px-3 text-white">
      <span className="text-xs font-semibold text-[#dcb05a]">Quill</span>
      <span
        className={`h-2 w-2 rounded-full ${status !== 'idle' && !muted ? 'bg-red-500' : 'bg-white/30'}`}
      />
      <button className="no-drag text-white/80 hover:text-white" aria-label="Mute" onClick={() => send('mute')}>
        {muted ? <MicOff size={15} /> : <Mic size={15} />}
      </button>
      <button className="no-drag text-white/80 hover:text-white" aria-label="Flag" onClick={() => send('flag')}>
        <Flag size={14} />
      </button>
      <button className="no-drag text-white/80 hover:text-white" aria-label="Stop" onClick={() => send('stop')}>
        <Square size={13} />
      </button>
      <span className="no-drag flex-1 truncate text-[11px] text-white/50">{last}</span>
      <button
        className="no-drag text-white/80 hover:text-white"
        aria-label="Return to Quill"
        onClick={() => send('return')}
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}

const el = document.getElementById('bar');
if (el) createRoot(el).render(<Bar />);
