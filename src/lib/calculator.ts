import { evaluate } from 'mathjs';

// Expression can contain digits, decimal, tabs/spaces, parens, and operators.
// No newlines — expression must be on a single line.
const EXPR_TAIL = /([\d.\t ()+\-*/^%]+)$/;

export interface ExpressionMatch {
  expr: string;
  leadingWhitespace: number;
}

export function findExpressionBeforeCursor(text: string, cursor: number): ExpressionMatch | null {
  const before = text.slice(0, cursor);
  const match = before.match(EXPR_TAIL);
  if (!match) return null;

  const raw = match[1];
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (!/\d/.test(trimmed)) return null;
  if (!/[+\-*/^%]/.test(trimmed)) return null;

  // Reject a bare number (including unary-minus number).
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return null;

  const leadingWhitespace = raw.length - raw.trimStart().length;
  return { expr: trimmed, leadingWhitespace };
}

export function tryEvaluate(expr: string): string | null {
  try {
    const result = evaluate(expr);
    const n = coerceNumeric(result);
    if (n === null) return null;
    if (typeof n === 'bigint') return n.toString();
    if (!isFinite(n)) return null;
    return formatNumber(n);
  } catch {
    return null;
  }
}

function coerceNumeric(value: unknown): number | bigint | null {
  if (typeof value === 'number' || typeof value === 'bigint') return value;

  // mathjs returns a ResultSet for multi-statement inputs. Take the last entry.
  if (value && typeof value === 'object') {
    const anyVal = value as { entries?: unknown[] };
    if (Array.isArray(anyVal.entries) && anyVal.entries.length > 0) {
      return coerceNumeric(anyVal.entries[anyVal.entries.length - 1]);
    }
    if (Array.isArray(value) && value.length > 0) {
      return coerceNumeric(value[value.length - 1]);
    }
  }
  return null;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded);
}
