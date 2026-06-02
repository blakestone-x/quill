import { useStore } from 'zustand';
import { captureStore, type CaptureState } from './capture';

/** React binding for the capture store. Keeps the store itself React-free. */
export function useCapture<T>(selector: (s: CaptureState) => T): T {
  return useStore(captureStore, selector);
}
