import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true
});

export function renderMarkdown(md: string): string {
  if (!md.trim()) return '';
  return marked.parse(md, { async: false }) as string;
}
