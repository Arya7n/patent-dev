import { describe, expect, it } from "vitest";
import { extractClaimsFromSections } from "./claims";
import { chunkParagraphs, needsOcr, paragraphsFromItems, safeFilename, splitSections } from "./text";

describe("claims", () => {
  it("reads numbered claims and marks dependencies", () => {
    const claims = extractClaimsFromSections([
      {
        kind: "description",
        text: "1. This numbered paragraph is a description, not a claim.",
      },
      {
        kind: "claims",
        text: `What is claimed is:
1. A system comprising a processor configured to receive sensor data, determine a condition based on the sensor data, and transmit an alert.
2. The system of claim 1, wherein the sensor data is temperature data.`,
      },
    ]);
    expect(claims).toHaveLength(2);
    expect(claims[0].isIndependent).toBe(true);
    expect(claims[0].text).toContain("receive sensor data");
    expect(claims[1].isIndependent).toBe(false);
    expect(claims[1].claimNumber).toBe(2);
  });
});

describe("sections and chunks", () => {
  it("splits abstract and claims and flags image-only PDFs for OCR", () => {
    const sections = splitSections("ABSTRACT\nA wearable alert device.\n\nWhat is claimed is:\n1. A device.");
    expect(sections.map((section) => section.kind)).toEqual(["abstract", "claims"]);
    expect(needsOcr([{ text: "" }, { text: "x" }])).toBe(true);
    expect(needsOcr([{ text: "a".repeat(80) }])).toBe(false);
  });

  it("packs paragraphs and keeps a bounding box on a single page", () => {
    const paragraphs = paragraphsFromItems(
      [
        { text: "Alpha", bbox: { x: 10, y: 10, width: 40, height: 10 } },
        { text: "beta", bbox: { x: 52, y: 12, width: 30, height: 10 } },
        { text: "Next", bbox: { x: 10, y: 80, width: 20, height: 10 } },
      ],
      3,
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe("Alpha beta");
    expect(paragraphs[0].bbox?.width).toBe(72);

    const chunks = chunkParagraphs(
      [
        { text: "a".repeat(800), pageNumber: 1, bbox: { x: 0, y: 0, width: 10, height: 10 } },
        { text: "b".repeat(800), pageNumber: 1, bbox: { x: 0, y: 20, width: 10, height: 10 } },
      ],
      1000,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].bbox).not.toBeNull();
  });
});

describe("safeFilename", () => {
  it("strips path characters", () => {
    expect(safeFilename("../../secret.pdf")).toBe("secret.pdf");
    expect(safeFilename("claim chart (final).pdf")).toBe("claim_chart_final_.pdf");
  });
});
