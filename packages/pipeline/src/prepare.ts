import {
  chunkParagraphs,
  paragraphsFromItems,
  splitSections,
  type PdfExtraction,
  type TextChunk,
  type TextSection,
} from "@patent/shared";

export function chunksFromExtraction(extraction: PdfExtraction): TextChunk[] {
  const paragraphs = extraction.pages.flatMap((page) =>
    page.items.length > 0
      ? paragraphsFromItems(page.items, page.pageNumber)
      : page.text.trim()
        ? [{ text: page.text.trim(), pageNumber: page.pageNumber, bbox: null }]
        : [],
  );
  return chunkParagraphs(paragraphs);
}

export function sectionsFromExtraction(extraction: PdfExtraction): TextSection[] {
  return splitSections(extraction.pages.map((page) => page.text).join("\n"));
}
