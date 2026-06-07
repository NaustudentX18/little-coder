import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLlmClassifier } from "./classifier-llm.ts";
import { DEFAULT_CONFIG } from "./router-config.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// All test prompts are >= 100 chars (the llmMinPromptLen threshold)
const LONG_PROMPT = "implement a Python function that flattens a nested dict and handles edge cases like empty dicts, deeply nested structures, mixed key types, and circular references gracefully without infinite recursion or stack overflows during processing";

function mockOllamaReply(category: string, confidence: number) {
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ response: JSON.stringify({ category, confidence }) }),
  }) as unknown as typeof fetch;
}

describe("createLlmClassifier", () => {
  it("skips prompts shorter than llmMinPromptLen", async () => {
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const r = await clf.classify("hi"); // 2 chars
    expect(r).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Ollama /api/generate and parses JSON", async () => {
    mockOllamaReply("code", 0.9);
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const r = await clf.classify(LONG_PROMPT);
    expect(r?.category).toBe("code");
    expect(r?.stage).toBe("llm");
    expect(r?.confidence).toBe(0.9);
  });

  it("clamps confidence to 0-1", async () => {
    mockOllamaReply("chat", 1.5);
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const r = await clf.classify(LONG_PROMPT);
    expect(r?.confidence).toBe(1.0);
  });

  it("returns null for unknown category", async () => {
    mockOllamaReply("potato", 0.9);
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const r = await clf.classify(LONG_PROMPT);
    expect(r).toBeNull();
  });

  it("returns null for low confidence (below threshold)", async () => {
    mockOllamaReply("code", 0.3); // below 0.6 default threshold
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const r = await clf.classify(LONG_PROMPT);
    expect(r).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "internal error",
    }) as unknown as typeof fetch;
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const r = await clf.classify(LONG_PROMPT);
    expect(r).toBeNull();
  });

  it("returns null on network/timeout error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const r = await clf.classify(LONG_PROMPT);
    expect(r).toBeNull();
  });

  it("returns null on invalid JSON response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "not json",
      json: async () => ({ response: "this is not json" }),
    }) as unknown as typeof fetch;
    const clf = createLlmClassifier(DEFAULT_CONFIG);
    const r = await clf.classify(LONG_PROMPT);
    expect(r).toBeNull();
  });
});
