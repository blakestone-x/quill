import { describe, it, expect } from 'vitest';
import { redactPII } from './redaction';

describe('redactPII', () => {
  it('redacts emails, phones, SSNs, and card numbers', () => {
    expect(redactPII('reach me at a.b+x@quill.io').text).toBe('reach me at [email]');
    expect(redactPII('call 555-123-4567 today').text).toBe('call [phone] today');
    expect(redactPII('ssn 123-45-6789').text).toBe('ssn [ssn]');
    expect(redactPII('card 4111 1111 1111 1111').text).toBe('card [card]');
  });

  it('leaves clean text untouched and reports zero', () => {
    const r = redactPII('send the quote to CBRE tomorrow');
    expect(r.text).toBe('send the quote to CBRE tomorrow');
    expect(r.redacted).toBe(0);
    expect(r.labels).toEqual([]);
  });

  it('counts multiple hits and lists labels', () => {
    const r = redactPII('a@b.com and c@d.com and 555-123-4567');
    expect(r.redacted).toBe(3);
    expect(r.labels.sort()).toEqual(['email', 'phone']);
  });
});
