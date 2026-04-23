import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { UpdaterStatus } from '../../electron/preload';

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window.quill?.onUpdaterStatus !== 'function') return;
    const off = window.quill.onUpdaterStatus((s) => {
      setStatus(s);
      if (s.kind === 'available' || s.kind === 'ready') setDismissed(false);
    });
    return off;
  }, []);

  if (!status || dismissed) return null;
  if (status.kind === 'error') return null;

  const text =
    status.kind === 'available'
      ? `Update ${status.version} available — downloading…`
      : status.kind === 'downloading'
      ? `Downloading update… ${status.percent}%`
      : `Update ${status.version} ready`;

  const ready = status.kind === 'ready';

  return (
    <div className="no-drag h-7 bg-amber-500 text-ink-950 flex items-center justify-between px-3 text-xs font-medium">
      <div className="flex items-center gap-2">
        <RefreshCw size={12} className={ready ? '' : 'animate-spin'} />
        <span>{text}</span>
      </div>
      <div className="flex items-center gap-2">
        {ready && (
          <button
            type="button"
            onClick={() => window.quill.restartToUpdate()}
            className="px-2 py-0.5 bg-ink-950 text-amber-400 rounded hover:bg-ink-800 transition-colors"
          >
            Restart
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="hover:opacity-70 transition-opacity"
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
