// Consent + killswitch policy.
//
// The legal posture from the research dossier, encoded as pure functions. The
// verified finding: text-only capture does NOT escape two-party-consent law,
// and Blake's work/dispatch context re-activates full exposure. So the gate is
// load-bearing, and the default is conservative (build directive M0/M2).

import type { ConsentMode } from './domain';

export const DEFAULT_CONSENT_MODE: ConsentMode = 'work-restricted';

export interface ConsentContext {
  mode: ConsentMode;
  /** more than one human speaker expected/detected in this session */
  multiParty: boolean;
  /** the other party has explicitly acknowledged the recording */
  partyAcknowledged: boolean;
  /** the session is flagged as work/professional context */
  workContext: boolean;
}

export interface ConsentDecision {
  /** capture may proceed right now */
  allowed: boolean;
  /** a consent gate must be shown and satisfied before capture proceeds */
  gateRequired: boolean;
  reason: string;
}

/**
 * Decide whether capture may proceed.
 *  - personal: solo capture; always allowed.
 *  - disclosed: multi-party allowed once the other party acknowledges.
 *  - work-restricted (DEFAULT): multi-party work conversations require an
 *    explicit, acknowledged consent gate before any capture begins.
 */
export function evaluateConsent(ctx: ConsentContext): ConsentDecision {
  if (!ctx.multiParty) {
    return { allowed: true, gateRequired: false, reason: 'Single-party capture.' };
  }
  switch (ctx.mode) {
    case 'personal':
      return { allowed: true, gateRequired: false, reason: 'Personal mode.' };
    case 'disclosed':
      return ctx.partyAcknowledged
        ? { allowed: true, gateRequired: false, reason: 'Multi-party disclosed and acknowledged.' }
        : { allowed: false, gateRequired: true, reason: 'Disclosure required before multi-party capture.' };
    case 'work-restricted':
    default:
      if (ctx.workContext && !ctx.partyAcknowledged) {
        return { allowed: false, gateRequired: true, reason: 'Work conversation requires an explicit consent gate.' };
      }
      return ctx.partyAcknowledged
        ? { allowed: true, gateRequired: false, reason: 'Multi-party consent acknowledged.' }
        : { allowed: false, gateRequired: true, reason: 'Consent gate required for multi-party capture.' };
  }
}
