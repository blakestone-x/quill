// Voice-command intent router (M4). Pure grammar: a captured command utterance
// (after the "Hey Quill" wake word) maps to a structured intent. The wake-word +
// STT layer is injected; this is the testable brain that decides what to do and
// whether to confirm before a side effect.

export type VoiceIntentType =
  | 'note'
  | 'reminder'
  | 'schedule'
  | 'message'
  | 'flag'
  | 'stop'
  | 'unknown';

export interface VoiceIntent {
  type: VoiceIntentType;
  text: string;
  target?: string;
  /** side-effecting intents read back a confirmation before acting */
  needsConfirmation: boolean;
}

function mk(type: VoiceIntentType, text: string, needsConfirmation: boolean, target?: string): VoiceIntent {
  return target ? { type, text, target, needsConfirmation } : { type, text, needsConfirmation };
}

export function parseIntent(utterance: string): VoiceIntent {
  const u = utterance.trim();
  if (u.length === 0) return mk('unknown', '', true);
  const wordCount = u.split(/\s+/).length;

  // flag / stop are terse commands — require a short utterance so ordinary
  // speech ("Mark from CBRE called about the quote", "done deal we ship Friday")
  // doesn't trip them.
  if (wordCount <= 3 && /^(?:flag|mark|bookmark)\b/i.test(u)) return mk('flag', '', false);
  if (wordCount <= 2 && /^(?:stop|end|done)\b/i.test(u)) return mk('stop', '', false);

  let m = u.match(/^send (?:a )?message to (\w+)[\s:,-]*(.*)$/i);
  if (m) return mk('message', m[2].trim(), true, m[1]);

  m = u.match(/^remind me (?:to )?(.*)$/i);
  if (m) return mk('reminder', m[1].trim(), true);

  m = u.match(/^schedule (?:a |an )?(.*)$/i);
  if (m) return mk('schedule', m[1].trim(), true);

  // bare "note" needs a word boundary (so "noted"/"notebook" don't match) and a body.
  m = u.match(/^(?:take (?:a )?(?:priority )?note|priority note|note)\b[\s:,-]+(.*)$/i);
  if (m) return mk('note', m[1].trim(), false);

  return mk('unknown', u, true);
}

function truncate(s: string, n = 8): string {
  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= n ? s : words.slice(0, n).join(' ') + '…';
}

/** Spoken read-back before a side-effecting action. */
export function confirmationLine(intent: VoiceIntent): string {
  switch (intent.type) {
    case 'message':
      return `Send to ${intent.target ?? 'someone'}: "${truncate(intent.text)}" — confirm?`;
    case 'reminder':
      return `Remind you to ${truncate(intent.text)} — confirm?`;
    case 'schedule':
      return `Schedule ${truncate(intent.text)} — confirm?`;
    default:
      return `"${truncate(intent.text)}" — confirm?`;
  }
}
