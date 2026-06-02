import { describe, it, expect } from 'vitest';
import { parseIntent, confirmationLine } from './voice-intent';

describe('parseIntent', () => {
  it('parses a note (no confirmation)', () => {
    const i = parseIntent('Note call CBRE about the quote');
    expect(i.type).toBe('note');
    expect(i.text).toBe('call CBRE about the quote');
    expect(i.needsConfirmation).toBe(false);
  });

  it('parses a reminder and requires confirmation', () => {
    const i = parseIntent('remind me to email Aaron');
    expect(i.type).toBe('reminder');
    expect(i.text).toBe('email Aaron');
    expect(i.needsConfirmation).toBe(true);
  });

  it('parses a message with a target', () => {
    const i = parseIntent('send message to Aaron the quote is ready');
    expect(i.type).toBe('message');
    expect(i.target).toBe('Aaron');
    expect(i.text).toBe('the quote is ready');
    expect(i.needsConfirmation).toBe(true);
  });

  it('parses schedule, flag, and stop', () => {
    expect(parseIntent('schedule a site visit Tuesday').type).toBe('schedule');
    expect(parseIntent('flag').type).toBe('flag');
    expect(parseIntent('stop').type).toBe('stop');
  });

  it('falls back to unknown (with confirmation) for open commands', () => {
    const i = parseIntent('what is the weather');
    expect(i.type).toBe('unknown');
    expect(i.needsConfirmation).toBe(true);
  });
});

describe('confirmationLine', () => {
  it('reads back the target for a message', () => {
    const line = confirmationLine(parseIntent('send message to Aaron the quote is ready'));
    expect(line).toContain('Aaron');
    expect(line).toContain('confirm?');
  });
});
