import { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';

interface Props {
  content: string;
}

export default function MarkdownPreview({ content }: Props) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.href && /^https?:\/\//i.test(anchor.href)) {
      e.preventDefault();
      window.quill.openExternal(anchor.href);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-ink-900 no-drag">
      {content.trim() ? (
        <div
          onClick={handleClick}
          className="markdown-body px-5 py-4 text-[13px] leading-[1.7] text-paper-100 font-sans max-w-[72ch]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="p-5 text-paper-200/40 text-xs font-mono">preview (empty)</div>
      )}
    </div>
  );
}
