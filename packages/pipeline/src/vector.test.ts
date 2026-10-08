import { describe, expect, it } from "vitest";
import { estimateCost, hashEmbedding } from "./ai";
import { toVectorLiteral } from "./vector";

describe("embeddings", () => {
  it("builds a stable unit vector and rejects a bad literal", () => {
    const first = hashEmbedding("sensor data", 8);
    expect(hashEmbedding("sensor data", 8)).toEqual(first);
    expect(first).toHaveLength(8);
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(toVectorLiteral([0.25, -0.5], 2)).toBe("[0.25,-0.5]");
    expect(() => toVectorLiteral([Number.NaN], 1)).toThrow(/Invalid embedding/);
  });

  it("estimates chat and embedding cost from token counts", () => {
    expect(
      estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, {
        inputPerMillion: 0.1,
        outputPerMillion: 0.4,
        embeddingPerMillion: 0.15,
      }, "chat"),
    ).toBeCloseTo(0.5);
    expect(
      estimateCost({ inputTokens: 2_000_000, outputTokens: 0 }, {
        inputPerMillion: 0.1,
        outputPerMillion: 0.4,
        embeddingPerMillion: 0.15,
      }, "embedding"),
    ).toBeCloseTo(0.3);
  });
});
