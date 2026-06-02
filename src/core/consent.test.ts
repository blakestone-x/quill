import { describe, it, expect } from 'vitest';
import { evaluateConsent, DEFAULT_CONSENT_MODE } from './consent';

describe('evaluateConsent', () => {
  it('allows single-party capture with no gate', () => {
    const d = evaluateConsent({
      mode: 'work-restricted',
      multiParty: false,
      partyAcknowledged: false,
      workContext: true
    });
    expect(d.allowed).toBe(true);
    expect(d.gateRequired).toBe(false);
  });

  it('default mode is work-restricted', () => {
    expect(DEFAULT_CONSENT_MODE).toBe('work-restricted');
  });

  it('blocks multi-party work conversations until acknowledged', () => {
    const d = evaluateConsent({
      mode: 'work-restricted',
      multiParty: true,
      partyAcknowledged: false,
      workContext: true
    });
    expect(d.allowed).toBe(false);
    expect(d.gateRequired).toBe(true);
  });

  it('allows multi-party once acknowledged in work-restricted mode', () => {
    const d = evaluateConsent({
      mode: 'work-restricted',
      multiParty: true,
      partyAcknowledged: true,
      workContext: true
    });
    expect(d.allowed).toBe(true);
    expect(d.gateRequired).toBe(false);
  });

  it('requires disclosure for multi-party in disclosed mode', () => {
    const d = evaluateConsent({
      mode: 'disclosed',
      multiParty: true,
      partyAcknowledged: false,
      workContext: false
    });
    expect(d.allowed).toBe(false);
    expect(d.gateRequired).toBe(true);
  });

  it('allows multi-party in personal mode', () => {
    const d = evaluateConsent({
      mode: 'personal',
      multiParty: true,
      partyAcknowledged: false,
      workContext: false
    });
    expect(d.allowed).toBe(true);
  });
});
