// Capture state for the ambient cockpit (recorder status, live transcript,
// flags, consent). Vanilla zustand store — no React import — so it is unit
// testable. The React hook lives in capture-react.ts.

import { createStore } from 'zustand/vanilla';
import type { CaptureSession, ConsentMode, SessionFlag, TranscriptSegment } from '../core/domain';
import { DEFAULT_CONSENT_MODE } from '../core/consent';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'muted';

export interface CaptureState {
  status: RecorderStatus;
  session: CaptureSession | null;
  segments: TranscriptSegment[];
  flags: SessionFlag[];
  consentMode: ConsentMode;
  startSession: (s: CaptureSession) => void;
  endSession: () => void;
  setStatus: (s: RecorderStatus) => void;
  /** Live partials replace the trailing partial; finals commit it (or append). */
  upsertSegment: (seg: TranscriptSegment) => void;
  addFlag: (f: SessionFlag) => void;
  setConsentMode: (m: ConsentMode) => void;
  reset: () => void;
}

const initial = {
  status: 'idle' as RecorderStatus,
  session: null as CaptureSession | null,
  segments: [] as TranscriptSegment[],
  flags: [] as SessionFlag[],
  consentMode: DEFAULT_CONSENT_MODE
};

export const captureStore = createStore<CaptureState>()((set) => ({
  ...initial,
  startSession: (s) => set({ session: s, status: 'recording', segments: [], flags: [] }),
  endSession: () => set({ status: 'idle' }),
  setStatus: (status) => set({ status }),
  upsertSegment: (seg) =>
    set((st) => {
      const segs = st.segments.slice();
      const last = segs.length - 1;
      if (last >= 0 && !segs[last].final) segs[last] = seg;
      else segs.push(seg);
      return { segments: segs };
    }),
  addFlag: (f) => set((st) => ({ flags: [...st.flags, f] })),
  setConsentMode: (consentMode) => set({ consentMode }),
  reset: () => set({ ...initial })
}));
