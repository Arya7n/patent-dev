import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  normalizeClaimDecomposition,
  normalizeEvidenceAssessment,
} from "./schemas";

describe("normalizeClaimDecomposition", () => {
  it("assigns element ids and maps unknown types", () => {
    const parsed = normalizeClaimDecomposition({
      claimNumber: "1",
      elements: [
        { text: "System", type: "component" },
        { text: "Receive sensor data", type: "not-a-type" },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.elements.map((element) => element.id)).toEqual(["E1", "E2"]);
    expect(parsed.data.elements[1].type).toBe("other");
  });

  it("rejects an empty element list", () => {
    expect(normalizeClaimDecomposition({ claimNumber: 1, elements: [] }).success).toBe(false);
  });
});

describe("normalizeEvidenceAssessment", () => {
  it("maps model labels and clamps confidence", () => {
    const parsed = normalizeEvidenceAssessment(
      {
        relationship: "STRONG_MATCH",
        confidence: 1.4,
        reasoning: "The passage describes receiving sensor data.",
        evidenceText: "a processor receives sensor data",
        sourcePage: 17,
      },
      1,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.relationship).toBe("strong_match");
    expect(parsed.data.confidence).toBe(1);
    expect(parsed.data.sourcePage).toBe(17);
  });

  it("falls back to needs review when the label is missing", () => {
    const parsed = normalizeEvidenceAssessment({ evidenceText: "unclassified passage" }, 4);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.relationship).toBe("needs_review");
    expect(parsed.data.sourcePage).toBe(4);
  });
});

describe("extractJsonObject", () => {
  it("reads fenced JSON", () => {
    expect(extractJsonObject('```json\n{"claimNumber":1}\n```')).toEqual({ claimNumber: 1 });
  });
});
