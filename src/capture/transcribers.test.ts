import { describe, it, expect } from 'vitest';
import { floatTo16BitPCM } from './transcribers';

describe('floatTo16BitPCM', () => {
  it('converts and clamps float samples to 16-bit PCM', () => {
    const out = floatTo16BitPCM(new Float32Array([0, 1, -1, 0.5, 2, -2]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767); // +1 full scale
    expect(out[2]).toBe(-32768); // -1 full scale
    expect(out[3]).toBe(Math.round(0.5 * 0x7fff));
    expect(out[4]).toBe(32767); // clamped from +2
    expect(out[5]).toBe(-32768); // clamped from -2
  });
});
