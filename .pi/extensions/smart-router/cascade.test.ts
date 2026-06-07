import { describe, it, expect } from "vitest";
import { createCascade } from "./cascade.ts";
import { DEFAULT_CONFIG } from "./router-config.ts";

describe("createCascade", () => {
  it("Stage 1 (regex) catches code file extensions", async () => {
    const c = createCascade(DEFAULT_CONFIG);
    const r = await c.classify("refactor this function in app.py");
    expect(r.category).toBe("code");
    expect(r.stage).toBe("regex");
  });

  it("Stage 1 catches embed keywords before code", async () => {
    const c = createCascade(DEFAULT_CONFIG);
    const r = await c.classify("embed this python.py script for retrieval");
    expect(r.category).toBe("embed");
  });

  it("Stage 1 catches tool keywords (non-web context)", async () => {
    const c = createCascade(DEFAULT_CONFIG);
    const r = await c.classify("run npm install and report the output");
    expect(r.category).toBe("tool");
  });

  it("WEB beats TOOL (build a React component is web, not tool)", async () => {
    const c = createCascade(DEFAULT_CONFIG);
    const r = await c.classify("build a React component with a navbar and dark mode toggle");
    expect(r.category).toBe("web");
  });

  it("falls back to default for casual chat (regex misses)", async () => {
    const c = createCascade(DEFAULT_CONFIG);
    // No Ollama call because embed classifier will fail (no cache + no live connection in test)
    // LLM classifier will also be skipped because no live connection
    c.setEmbedEnabled(false);
    c.setLlmEnabled(false);
    const r = await c.classify("hi, how are you?");
    expect(r.category).toBe("chat");
    expect(r.stage).toBe("default");
  });

  it("default fallback category is chat", async () => {
    const c = createCascade(DEFAULT_CONFIG);
    c.setEmbedEnabled(false);
    c.setLlmEnabled(false);
    const r = await c.classify("completely unrelated to anything");
    expect(r.category).toBe("chat");
  });

  it("skipRegex bypasses Stage 1", async () => {
    const c = createCascade(DEFAULT_CONFIG);
    c.skipRegex();
    c.setEmbedEnabled(false);
    c.setLlmEnabled(false);
    // Regex would have caught this — but we skipped it
    const r = await c.classify("refactor app.py to use async");
    expect(r.stage).toBe("default");
  });
});
