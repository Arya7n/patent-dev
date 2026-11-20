type Alignment = { claimPhrase: string; sourcePhrase: string; color: string };

export function HighlightedText({
  text,
  alignments,
  field,
}: {
  text: string;
  alignments: Alignment[];
  field: "claimPhrase" | "sourcePhrase";
}) {
  const parts = splitPhrases(text, alignments, field);
  return (
    <>
      {parts.map((part, index) =>
        part.color ? (
          <mark
            key={index}
            className="rounded-sm px-0.5 text-inherit"
            style={{ backgroundColor: `#${part.color}` }}
            title={part.pair ? `Maps to: ${part.pair}` : undefined}
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function splitPhrases(text: string, alignments: Alignment[], field: "claimPhrase" | "sourcePhrase") {
  const other = field === "claimPhrase" ? "sourcePhrase" : "claimPhrase";
  const marks = alignments
    .map((item) => ({ phrase: item[field], pair: item[other], color: item.color }))
    .filter((item) => item.phrase.length > 0)
    .sort((a, b) => b.phrase.length - a.phrase.length);
  const parts: { text: string; color: string | null; pair?: string }[] = [];
  let cursor = 0;
  const lower = text.toLowerCase();
  while (cursor < text.length) {
    let found: { index: number; phrase: string; pair: string; color: string } | null = null;
    for (const mark of marks) {
      const index = lower.indexOf(mark.phrase.toLowerCase(), cursor);
      if (index < 0) continue;
      if (!found || index < found.index || (index === found.index && mark.phrase.length > found.phrase.length)) {
        found = { index, phrase: text.slice(index, index + mark.phrase.length), pair: mark.pair, color: mark.color };
      }
    }
    if (!found) {
      parts.push({ text: text.slice(cursor), color: null });
      break;
    }
    if (found.index > cursor) parts.push({ text: text.slice(cursor, found.index), color: null });
    parts.push({ text: found.phrase, color: found.color, pair: found.pair });
    cursor = found.index + found.phrase.length;
  }
  return parts.filter((part) => part.text.length > 0);
}
