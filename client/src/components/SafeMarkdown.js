'use client';

import Link from 'next/link';

/**
 * Renders the small markdown subset the AI uses: paragraphs, bullet/numbered lists,
 * **bold** and [links](/internal/path). Nothing is rendered as HTML, and only links to
 * pages inside this app are allowed — a manipulated AI answer can't link anywhere else.
 */
const INTERNAL = /^\/(candidates|jobs|pipeline|reports|dashboard)(\/[\w-]*)?(\?[\w=&%-]*)?$/;

function inline(text, keyPrefix, onNavigate) {
  const out = [];
  const rx = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      out.push(
        INTERNAL.test(href) ? (
          <Link key={`${keyPrefix}-${i++}`} href={href} onClick={onNavigate} className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700">
            {m[1]}
          </Link>
        ) : (
          m[1] // external or odd links are shown as plain text
        )
      );
    } else {
      out.push(<strong key={`${keyPrefix}-${i++}`}>{m[3]}</strong>);
    }
    last = rx.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function SafeMarkdown({ text, onNavigate }) {
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) blocks.push((list = { type, items: [] }));
      list.items.push((bullet || numbered)[1]);
    } else {
      list = null;
      if (line.trim()) blocks.push({ type: 'p', text: line.replace(/^#+\s*/, '') });
    }
  });
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, bi) =>
        b.type === 'p' ? (
          <p key={bi}>{inline(b.text, `p${bi}`, onNavigate)}</p>
        ) : (
          (() => {
            const Tag = b.type;
            return (
              <Tag key={bi} className={b.type === 'ul' ? 'list-disc space-y-1 pl-5' : 'list-decimal space-y-1 pl-5'}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{inline(it, `l${bi}-${ii}`, onNavigate)}</li>
                ))}
              </Tag>
            );
          })()
        )
      )}
    </div>
  );
}
