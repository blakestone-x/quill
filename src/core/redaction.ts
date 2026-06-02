// PII redaction (M8). Pure, deterministic. Applied to the COPY that leaves the
// device (VPS sync / Cartograph), never to the local-only transcript. A
// regex-first pass; a Presidio/NER pass can layer on later server-side.

export interface RedactionResult {
  text: string;
  redacted: number;
  labels: string[];
}

const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { label: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'card', re: /\b(?:\d{4}[ -]?){3}\d{4}\b/g },
  { label: 'phone', re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g }
];

export function redactPII(input: string): RedactionResult {
  let text = input;
  let redacted = 0;
  const labels: string[] = [];
  for (const { label, re } of PATTERNS) {
    text = text.replace(re, () => {
      redacted++;
      if (!labels.includes(label)) labels.push(label);
      return `[${label}]`;
    });
  }
  return { text, redacted, labels };
}
