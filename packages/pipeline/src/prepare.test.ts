import { describe, expect, it } from "vitest";
import { chunksFromExtraction, sectionsFromExtraction } from "./prepare";

describe("prepare extraction", () => {
  it("keeps page coordinates and finds the claims section", () => {
    const extraction = {
      pageCount: 1,
      pages: [
        {
          pageNumber: 4,
          width: 612,
          height: 792,
          text: "ABSTRACT\nA device.\n\nWhat is claimed is:\n1. A system.",
          items: [
            { text: "ABSTRACT", bbox: { x: 72, y: 72, width: 80, height: 12 } },
            { text: "A device.", bbox: { x: 72, y: 90, width: 70, height: 12 } },
          ],
        },
      ],
    };
    const chunks = chunksFromExtraction(extraction);
    expect(chunks[0].pageNumber).toBe(4);
    expect(chunks[0].bbox).not.toBeNull();
    expect(sectionsFromExtraction(extraction).map((section) => section.kind)).toContain("claims");
  });
});
