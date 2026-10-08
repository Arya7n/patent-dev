import { describe, expect, it } from "vitest";
import { buildClaimChart } from "./chart";

describe("buildClaimChart", () => {
  it("shows the analyst decision and keeps the quoted passage", () => {
    const chart = buildClaimChart({
      projectName: "Sensor alert",
      elements: [{ id: "e1", key: "E3", text: "Receive sensor data", claimNumber: 1 }],
      priorArt: [{ id: "d1", title: "Prior Art A" }],
      links: [
        {
          elementId: "e1",
          documentId: "d1",
          ai: "weak_match",
          analyst: "strong_match",
          confidence: 0.42,
          evidenceId: "ev1",
          evidenceText: "the processor receives sensor data",
          pageNumber: 17,
          explanation: "Possible correspondence in the description.",
          analystNote: "Confirmed against paragraph 4.",
        },
      ],
    });
    expect(chart.disclaimer).toMatch(/not a determination/i);
    expect(chart.cells[0].relationship).toBe("strong_match");
    expect(chart.cells[0].evidence[0].pageNumber).toBe(17);
    expect(chart.cells[0].evidence[0].text).toContain("sensor data");
  });
});