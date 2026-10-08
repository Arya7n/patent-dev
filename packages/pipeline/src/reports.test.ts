import { describe, expect, it } from "vitest";
import { RESEARCH_DISCLAIMER } from "@patent/shared";
import { renderDocx, renderPdf } from "./reports";

const chart = {
  projectName: "Sensor alert",
  disclaimer: RESEARCH_DISCLAIMER,
  elements: [{ id: "e1", key: "E1", text: "Receive sensor data", claimNumber: 1 }],
  priorArt: [{ id: "d1", title: "Prior Art A" }],
  cells: [
    {
      elementId: "e1",
      documentId: "d1",
      relationship: "partial_match" as const,
      confidence: 0.4,
      evidence: [
        {
          text: "a processor receives sensor data",
          pageNumber: 17,
          explanation: "Possible partial correspondence.",
          confidence: 0.4,
          analystRelationship: null,
          analystNote: null,
          evidenceId: "ev1",
        },
      ],
    },
  ],
};

describe("report rendering", () => {
  it("writes a docx and a pdf that include the research disclaimer", async () => {
    const docx = await renderDocx(chart);
    const pdf = await renderPdf(chart);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(docx.length).toBeGreaterThan(500);
    expect(pdf.length).toBeGreaterThan(500);
  });
});
