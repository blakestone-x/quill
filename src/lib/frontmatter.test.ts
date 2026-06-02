import { describe, it, expect } from 'vitest';
import { parseMarkdown, buildMarkdown } from './frontmatter';

describe('frontmatter', () => {
  it('returns body unchanged when there is no frontmatter', () => {
    const { meta, body } = parseMarkdown('just text');
    expect(meta).toEqual({});
    expect(body).toBe('just text');
  });

  it('parses flat scalar + array values', () => {
    const raw = '---\nid: abc\ntitle: Hello\npinned: true\ntags: [a, b]\n---\nBody here';
    const { meta, body } = parseMarkdown(raw);
    expect(meta.id).toBe('abc');
    expect(meta.title).toBe('Hello');
    expect(meta.pinned).toBe(true);
    expect(meta.tags).toEqual(['a', 'b']);
    expect(body).toBe('Body here');
  });

  it('roundtrips build -> parse, including a colon in a value', () => {
    const meta = { id: 'x1', title: 'My: Note', pinned: true, tags: ['t1', 't2'] };
    const doc = buildMarkdown(meta, 'Content line');
    const parsed = parseMarkdown(doc);
    expect(parsed.meta.id).toBe('x1');
    expect(parsed.meta.title).toBe('My: Note');
    expect(parsed.meta.pinned).toBe(true);
    expect(parsed.meta.tags).toEqual(['t1', 't2']);
    expect(parsed.body).toBe('Content line');
  });
});
