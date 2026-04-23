import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { TAB_COLORS } from '../types';

interface Props {
  x: number;
  y: number;
  currentColor?: string;
  onPick: (color: string | undefined) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function TabContextMenu({ x, y, currentColor, onPick, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = 224;
  const height = 92;
  const adjX = Math.min(x, viewportWidth - width - 8);
  const adjY = Math.min(y, viewportHeight - height - 8);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-ink-800 border border-ink-600 rounded-md shadow-2xl p-2 no-drag"
      style={{ left: adjX, top: adjY, width }}
    >
      <div className="flex items-center gap-1 px-1 py-0.5">
        {TAB_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => {
              onPick(c.value);
              onClose();
            }}
            title={c.label}
            className="w-6 h-6 rounded-full border transition-transform hover:scale-110"
            style={{
              background: c.value,
              borderColor: currentColor === c.value ? '#ebe2cd' : 'transparent',
              borderWidth: currentColor === c.value ? 2 : 1
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            onPick(undefined);
            onClose();
          }}
          title="Clear color"
          className="w-6 h-6 rounded-full border border-ink-600 flex items-center justify-center text-paper-200/70 hover:text-paper-50 hover:bg-ink-700"
        >
          <span className="text-[10px] font-mono">—</span>
        </button>
      </div>
      <div className="border-t border-ink-700 my-1" />
      <button
        type="button"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-paper-100 hover:bg-red-600 hover:text-white transition-colors"
      >
        <Trash2 size={12} />
        Close tab
      </button>
    </div>
  );
}
