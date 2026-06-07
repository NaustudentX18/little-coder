import { describe, it, expect } from "vitest";
import { __test__ } from "./classifier-embed.ts";

const { cosineSim, meanVector } = __test__;

describe("cosineSim", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [0.3, 0.4, 0.5];
    expect(cosineSim(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSim([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 5);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it("returns -1.0 for opposite vectors", () => {
    expect(cosineSim([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0, 5);
  });

  it("returns 0 for length-mismatched vectors", () => {
    expect(cosineSim([1, 2, 3], [1, 2])).toBe(0);
  });

  it("handles zero vectors safely", () => {
    expect(cosineSim([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("normalizes to magnitude-invariant similarity", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6];
    expect(cosineSim(a, b)).toBeCloseTo(1.0, 5);
  });

  it("returns reasonable values for typical text embeddings", () => {
    // Simulate: two similar vectors
    const a = [0.1, 0.2, 0.3, 0.4];
    const b = [0.11, 0.21, 0.29, 0.41];
    const sim = cosineSim(a, b);
    expect(sim).toBeGreaterThan(0.99);
    expect(sim).toBeLessThanOrEqual(1.0);
  });
});

describe("meanVector", () => {
  it("returns empty array for empty input", () => {
    expect(meanVector([])).toEqual([]);
  });

  it("averages vector components", () => {
    expect(meanVector([[1, 2, 3], [3, 4, 5]])).toEqual([2, 3, 4]);
  });

  it("handles single vector", () => {
    expect(meanVector([[0.5, 0.6]])).toEqual([0.5, 0.6]);
  });
});
