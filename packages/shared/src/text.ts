import type { BBox } from "./schemas";
import type { SectionKind } from "./domain";

export type Paragraph = {
  text: string;
  pageNumber: number;
  bbox: BBox | null;
};

export type TextChunk = Paragraph;

const SECTION_RULES: { kind: SectionKind; pattern: RegExp }[] = [
  { kind: "claims", pattern: /^(what is claimed is|claims|i claim|we claim)\b/i },
  { kind: "abstract", pattern: /^abstract\b/i },
  { kind: "references", pattern: /^(references|cited references|other publications)\b/i },
  {
    kind: "description",
    pattern: /^(detailed description|description of (the )?(embodiments|invention)|background|field of the invention|summary)\b/i,
  },
  { kind: "title", pattern: /^title\b/i },
];

export function detectSectionKind(line: string): SectionKind | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return null;
  for (const rule of SECTION_RULES) {
    if (rule.pattern.test(trimmed)) return rule.kind;
  }
  return null;
}

export type TextSection = {
  kind: SectionKind;
  heading: string;
  text: string;
};

export function splitSections(fullText: string): TextSection[] {
  const lines = fullText.split(/\r?\n/);
  const sections: TextSection[] = [];
  let current: TextSection = { kind: "other", heading: "", text: "" };

  const push = () => {
    const text = current.text.trim();
    if (text || current.heading) sections.push({ ...current, text });
  };

  for (const line of lines) {
    const kind = detectSectionKind(line);
    if (kind) {
      push();
      current = { kind, heading: line.trim(), text: "" };
      continue;
    }
    current.text += `${line}\n`;
  }
  push();
  return sections.filter((section) => section.text.length > 0 || section.heading.length > 0);
}

export function needsOcr(pages: { text: string }[]): boolean {
  if (pages.length === 0) return true;
  const total = pages.reduce((sum, page) => sum + page.text.trim().length, 0);
  return total / pages.length < 40;
}

export function unionBBox(boxes: Array<BBox | null | undefined>): BBox | null {
  const real = boxes.filter((box): box is BBox => Boolean(box));
  if (real.length === 0) return null;
  const x0 = Math.min(...real.map((box) => box.x));
  const y0 = Math.min(...real.map((box) => box.y));
  const x1 = Math.max(...real.map((box) => box.x + box.width));
  const y1 = Math.max(...real.map((box) => box.y + box.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function paragraphsFromItems(
  items: { text: string; bbox?: BBox | null }[],
  pageNumber: number,
  yGap = 16,
): Paragraph[] {
  const usable = items
    .map((item) => ({ text: item.text.trim(), bbox: item.bbox ?? null }))
    .filter((item) => item.text.length > 0);
  if (usable.length === 0) return [];
  if (usable.every((item) => !item.bbox)) {
    return usable.map((item) => ({ text: item.text, pageNumber, bbox: null }));
  }

  const sorted = [...usable].sort((a, b) => {
    const ay = a.bbox?.y ?? 0;
    const by = b.bbox?.y ?? 0;
    if (Math.abs(ay - by) > 2) return ay - by;
    return (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0);
  });

  const groups: Paragraph[] = [];
  for (const item of sorted) {
    const previous = groups[groups.length - 1];
    const sameBand =
      previous?.bbox &&
      item.bbox &&
      Math.abs(item.bbox.y - (previous.bbox.y + previous.bbox.height)) <= yGap;
    if (previous && sameBand) {
      previous.text = `${previous.text} ${item.text}`;
      previous.bbox = unionBBox([previous.bbox, item.bbox]);
      continue;
    }
    groups.push({ text: item.text, pageNumber, bbox: item.bbox });
  }
  return groups;
}

export function chunkParagraphs(paragraphs: Paragraph[], maxChars = 1000): TextChunk[] {
  const chunks: TextChunk[] = [];
  let buffer: Paragraph[] = [];
  let length = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const pageNumber = buffer[0].pageNumber;
    const samePage = buffer.every((item) => item.pageNumber === pageNumber);
    chunks.push({
      text: buffer.map((item) => item.text).join("\n\n"),
      pageNumber,
      bbox: samePage ? unionBBox(buffer.map((item) => item.bbox)) : null,
    });
    const overlap = buffer[buffer.length - 1];
    buffer = overlap && overlap.text.length < maxChars ? [overlap] : [];
    length = buffer.reduce((sum, item) => sum + item.text.length, 0);
  };

  for (const paragraph of paragraphs) {
    if (length > 0 && length + paragraph.text.length > maxChars) flush();
    if (paragraph.text.length > maxChars && buffer.length === 0) {
      for (let index = 0; index < paragraph.text.length; index += maxChars) {
        chunks.push({
          text: paragraph.text.slice(index, index + maxChars),
          pageNumber: paragraph.pageNumber,
          bbox: paragraph.bbox,
        });
      }
      buffer = [];
      length = 0;
      continue;
    }
    buffer.push(paragraph);
    length += paragraph.text.length;
  }
  if (buffer.length > 0) {
    const pageNumber = buffer[0].pageNumber;
    const samePage = buffer.every((item) => item.pageNumber === pageNumber);
    chunks.push({
      text: buffer.map((item) => item.text).join("\n\n"),
      pageNumber,
      bbox: samePage ? unionBBox(buffer.map((item) => item.bbox)) : null,
    });
  }
  return chunks.filter((chunk) => chunk.text.trim().length > 0);
}

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "document.pdf";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || "document.pdf";
}
