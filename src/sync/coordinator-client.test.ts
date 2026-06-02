import { describe, it, expect, vi } from 'vitest';
import { handleServerMessage } from './coordinator-client';

describe('handleServerMessage', () => {
  it('dispatches RECORD_STOLEN with the stealing device id', () => {
    const onStolen = vi.fn();
    handleServerMessage(JSON.stringify({ type: 'RECORD_STOLEN', byDeviceId: 'phone-1' }), { onStolen });
    expect(onStolen).toHaveBeenCalledWith('phone-1');
  });

  it('dispatches RECORD_GRANTED with expiresAt', () => {
    const onGranted = vi.fn();
    handleServerMessage(JSON.stringify({ type: 'RECORD_GRANTED', expiresAt: 1234 }), { onGranted });
    expect(onGranted).toHaveBeenCalledWith(1234);
  });

  it('dispatches SEGMENT only when a segment is present', () => {
    const onSegment = vi.fn();
    handleServerMessage(
      JSON.stringify({ type: 'SEGMENT', deviceId: 'd', sessionId: 's', segment: { id: '1', text: 'hi' } }),
      { onSegment }
    );
    expect(onSegment).toHaveBeenCalledOnce();
    handleServerMessage(JSON.stringify({ type: 'SEGMENT', deviceId: 'd' }), { onSegment });
    expect(onSegment).toHaveBeenCalledOnce(); // not called again
  });

  it('dispatches COMMAND', () => {
    const onCommand = vi.fn();
    handleServerMessage(
      JSON.stringify({ type: 'COMMAND', deviceId: 'p', target: 'desktop', intent: 'note', payload: {} }),
      { onCommand }
    );
    expect(onCommand).toHaveBeenCalledOnce();
  });

  it('ignores malformed or unknown frames', () => {
    const h = { onStolen: vi.fn(), onSegment: vi.fn() };
    handleServerMessage('not json', h);
    handleServerMessage(JSON.stringify({ type: 'NOPE' }), h);
    handleServerMessage(JSON.stringify({ no: 'type' }), h);
    expect(h.onStolen).not.toHaveBeenCalled();
    expect(h.onSegment).not.toHaveBeenCalled();
  });
});
