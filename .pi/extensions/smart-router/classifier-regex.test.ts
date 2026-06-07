import { describe, it, expect } from "vitest";
import { classifyRegex } from "./classifier-regex.ts";

describe("classifyRegex", () => {
  it("returns null on empty input", () => {
    expect(classifyRegex("")).toBeNull();
    expect(classifyRegex("   ")).toBeNull();
  });

  describe("code", () => {
    it("matches file extensions", () => {
      for (const ext of [".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".cpp", ".sh", ".sql", ".vue", ".svelte"]) {
        const r = classifyRegex(`refactor this function in app${ext} to use async`);
        expect(r?.category, ext).toBe("code");
        expect(r?.confidence, ext).toBeGreaterThanOrEqual(0.9);
      }
    });

    it("matches code keywords", () => {
      expect(classifyRegex("what does this function do with the import statement?")?.category).toBe("code");
      expect(classifyRegex("write me a class with two methods")?.category).toBe("code");
      expect(classifyRegex("convert this callback to a Promise")?.category).toBe("code");
    });

    it("matches file paths", () => {
      expect(classifyRegex("fix the bug at /home/pi/src/main.py:42")?.category).toBe("code");
    });
  });

  describe("embed", () => {
    it("matches embedding keywords", () => {
      expect(classifyRegex("embed this document for similarity search")?.category).toBe("embed");
      expect(classifyRegex("vectorize these customer reviews")?.category).toBe("embed");
      expect(classifyRegex("compute cosine similarity between two embeddings")?.category).toBe("embed");
    });
  });

  describe("tool", () => {
    it("matches tool/agent keywords", () => {
      expect(classifyRegex("use the browser tool to navigate to example.com")?.category).toBe("tool");
      expect(classifyRegex("run npm install and report the output")?.category).toBe("tool");
      expect(classifyRegex("commit this with git push")?.category).toBe("tool");
    });
  });

  describe("web", () => {
    it("matches web/frontend keywords", () => {
      expect(classifyRegex("build a React component with a navbar")?.category).toBe("web");
      expect(classifyRegex("style this div with Tailwind and a gradient")?.category).toBe("web");
      expect(classifyRegex("center this div both horizontally and vertically with CSS")?.category).toBe("web");
    });
  });

  describe("reasoning-deep", () => {
    it("matches deep reasoning keywords", () => {
      expect(classifyRegex("prove that sqrt(2) is irrational")?.category).toBe("reasoning-deep");
      expect(classifyRegex("derive the optimal stopping time for the secretary problem")?.category).toBe("reasoning-deep");
      expect(classifyRegex("analyze the legal precedent in s.340 of the Fair Work Act")?.category).toBe("reasoning-deep");
    });
  });

  describe("reasoning-fast", () => {
    it("matches quick reasoning keywords", () => {
      expect(classifyRegex("summarize this paragraph in one sentence")?.category).toBe("reasoning-fast");
      expect(classifyRegex("what's the difference between MTP and speculative decoding, briefly?")?.category).toBe("reasoning-fast");
    });
  });

  describe("chat (no match)", () => {
    it("does not match casual conversation", () => {
      // Casual greetings don't match any rule above — they fall through to embed LLM or default
      expect(classifyRegex("hi, how are you?")).toBeNull();
      expect(classifyRegex("good morning")).toBeNull();
      expect(classifyRegex("thanks, that helps")).toBeNull();
    });
  });

  describe("rule priority", () => {
    it("embed beats code (vector is not a code keyword)", () => {
      const r = classifyRegex("embed this python.py script for retrieval");
      // embed keyword fires first
      expect(r?.category).toBe("embed");
    });

    it("web beats tool (React component beats 'build')", () => {
      const r = classifyRegex("build a React component with a navbar");
      expect(r?.category).toBe("web");
    });

    it("tool beats code (run beats code keywords)", () => {
      const r = classifyRegex("run npm install and report the output");
      expect(r?.category).toBe("tool");
    });
  });

  it("returns a valid stage", () => {
    const r = classifyRegex("implement a python function");
    expect(r?.stage).toBe("regex");
  });
});
