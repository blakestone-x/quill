import { describe, it, expect } from 'vitest';
import { computeRms } from './audio';

describe('computeRms', () => {
  it('is zero for silence', () => {
    expect(computeRms(new Float32Array([0, 0, 0, 0]))).toBe(0);
  });

  it('equals the amplitude for a full-scale square wave', () => {
    expect(computeRms(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(1);
  });

  it('matches the RMS of a constant signal', () => {
    expect(computeRms(new Float32Array([0.5, 0.5, 0.5]))).toBeCloseTo(0.5);
  });

  it('handles an empty frame without dividing by zero', () => {
    expect(computeRms(new Float32Array([]))).toBe(0);
  });
});
