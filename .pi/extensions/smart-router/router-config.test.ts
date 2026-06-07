import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  DEFAULT_CONFIG,
  isCategory,
  resolveModelForMode,
  type RouterConfig,
} from "./router-config.ts";

describe("DEFAULT_CONFIG", () => {
  it("has a routing entry for every category", () => {
    for (const cat of CATEGORIES) {
      expect(DEFAULT_CONFIG.categories[cat], `category ${cat}`).toBeTruthy();
    }
  });

  it("has 3+ exemplars per category for embedding similarity", () => {
    for (const cat of CATEGORIES) {
      const ex = DEFAULT_CONFIG.examples[cat];
      expect(ex, `examples for ${cat}`).toBeDefined();
      expect(ex.length, `count for ${cat}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("default model is the flagship (qwen3.6-apex-mtp)", () => {
    expect(DEFAULT_CONFIG.defaults.defaultModel).toBe("qwen3.6-apex-mtp:latest");
  });

  it("code category routes to Qwen3-Coder-Next", () => {
    expect(DEFAULT_CONFIG.categories.code).toBe("qwen3-coder-next:latest");
  });

  it("confidence thresholds are 0-1", () => {
    const t = DEFAULT_CONFIG.thresholds;
    // llmMinPromptLen is a char count, not a confidence — exclude it
    for (const key of ["embedMin", "llmMin"] as const) {
      const v = t[key];
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Prompt-length threshold is positive
    expect(t.llmMinPromptLen).toBeGreaterThan(0);
  });

  it("default ollama baseUrl is localhost -- never a private/tailnet IP", () => {
    const url = DEFAULT_CONFIG.ollama.baseUrl;
    // Must not bake in a private LAN address (RFC1918) or Tailscale CGNAT (100.64/10).
    // Override per-host via OLLAMA_BASE_URL env var.
    expect(url).toBe("http://127.0.0.1:11434");
    expect(url).not.toMatch(/^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/);
  });
});

describe("isCategory", () => {
  it("recognizes known categories", () => {
    expect(isCategory("code")).toBe(true);
    expect(isCategory("reasoning-deep")).toBe(true);
    expect(isCategory("embed")).toBe(true);
  });

  it("rejects unknown strings and mode keywords", () => {
    expect(isCategory("auto")).toBe(false);
    expect(isCategory("off")).toBe(false);
    expect(isCategory("qwen3.5:9b")).toBe(false);
    expect(isCategory("")).toBe(false);
  });
});

describe("resolveModelForMode", () => {
  const cfg: RouterConfig = DEFAULT_CONFIG;

  it("returns null for auto (no forced model)", () => {
    expect(resolveModelForMode(cfg, "auto")).toBeNull();
  });

  it("returns null for off (no forced model)", () => {
    expect(resolveModelForMode(cfg, "off")).toBeNull();
  });

  it("resolves category to its model", () => {
    expect(resolveModelForMode(cfg, "code")).toBe("qwen3-coder-next:latest");
    expect(resolveModelForMode(cfg, "chat")).toBe("qwen3.5:9b");
  });

  it("passes through explicit model id", () => {
    expect(resolveModelForMode(cfg, "gpt-oss:20b")).toBe("gpt-oss:20b");
    expect(resolveModelForMode(cfg, "anything-else:latest")).toBe(
      "anything-else:latest",
    );
  });
});
