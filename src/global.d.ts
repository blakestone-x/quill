import type { QuillAPI } from '../electron/preload';

declare global {
  interface Window {
    quill: QuillAPI;
  }
}

export {};
