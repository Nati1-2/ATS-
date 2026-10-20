/** Renders plain text where lines starting with "-" or "•" become bullet lists. No HTML is interpreted. */
export default function Markdownish({ text }) {
  if (!text) return null;
  const blocks = [];
  let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    if (bullet) {
      if (!list) blocks.push((list = { type: 'ul', items: [] }));
      list.items.push(bullet[1]);
    } else {
      list = null;
      if (line) blocks.push({ type: 'p', text: line });
    }
  }
  return (
    <div className="prose-job text-[15px] leading-7 text-slate-700">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        )
      )}
    </div>
  );
}
