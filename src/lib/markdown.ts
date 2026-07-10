import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true
});

// marked passes raw HTML through, so sanitize before the output ever reaches
// dangerouslySetInnerHTML. Without this, pasted markdown could execute script
// in the renderer.
export function renderMarkdown(md: string): string {
  if (!md.trim()) return '';
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
