// Minimal YAML frontmatter parser/stringifier.
// Only supports the keys Quill writes — flat keys with scalar or array values.

export interface ParsedMarkdown {
  meta: Record<string, unknown>;
  body: string;
}

export function parseMarkdown(text: string): ParsedMarkdown {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const nl = text.indexOf('\n');
  if (nl === -1) return { meta: {}, body: text };
  const endMarker = text.indexOf('\n---', nl);
  if (endMarker === -1) return { meta: {}, body: text };
  const yamlBlock = text.slice(nl + 1, endMarker);
  // Advance past the closing --- line + its newline
  let bodyStart = endMarker + 4;
  if (text[bodyStart] === '\n') bodyStart += 1;
  const body = text.slice(bodyStart);
  return { meta: parseFlatYaml(yamlBlock), body };
}

export function buildMarkdown(meta: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    lines.push(`${k}: ${yamlValue(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body;
}

function parseFlatYaml(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = parseValue(m[2]);
  }
  return out;
}

function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    try {
      return JSON.parse(v.replaceAll("'", '"'));
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseValue(s.trim()));
  }
  return v;
}

function yamlValue(v: unknown): string {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => yamlValue(x)).join(', ')}]`;
  const s = String(v);
  if (/[:#\[\]{}&*!|>%@`,]/.test(s) || s.includes('\n')) return JSON.stringify(s);
  return s;
}
