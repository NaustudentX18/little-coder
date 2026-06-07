import { describe, it, expect } from "vitest";
import { hasImageInPayload, visionClassify } from "./detect-image.ts";

describe("hasImageInPayload", () => {
  it("returns false on null/undefined/non-object", () => {
    expect(hasImageInPayload(null)).toBe(false);
    expect(hasImageInPayload(undefined)).toBe(false);
    expect(hasImageInPayload("string")).toBe(false);
    expect(hasImageInPayload(42)).toBe(false);
  });

  it("returns false on payload without messages", () => {
    expect(hasImageInPayload({})).toBe(false);
    expect(hasImageInPayload({ model: "x" })).toBe(false);
  });

  it("returns false when last user message is text-only", () => {
    const payload = {
      model: "qwen3.5:9b",
      messages: [
        { role: "system", content: "You are a helper" },
        { role: "user", content: "implement a function" },
      ],
    };
    expect(hasImageInPayload(payload)).toBe(false);
  });

  it("returns true when last user message has image_url content part", () => {
    const payload = {
      model: "gemma4:e4b",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what's in this image?" },
            { type: "image_url", image_url: { url: "data:image/png;base64,iVBOR..." } },
          ],
        },
      ],
    };
    expect(hasImageInPayload(payload)).toBe(true);
  });

  it("returns true with Anthropic-style image content type", () => {
    const payload = {
      model: "gemma4:e4b",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBOR..." } },
          ],
        },
      ],
    };
    expect(hasImageInPayload(payload)).toBe(true);
  });

  it("checks the LAST user message, not earlier ones", () => {
    const payload = {
      messages: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "data:..." } }],
        },
        { role: "assistant", content: "I see an image" },
        { role: "user", content: "now implement a function in python" }, // text only
      ],
    };
    expect(hasImageInPayload(payload)).toBe(false);
  });

  it("ignores tool/function messages", () => {
    const payload = {
      messages: [
        { role: "user", content: "run the tests" },
        { role: "tool", content: "tests passed" },
      ],
    };
    expect(hasImageInPayload(payload)).toBe(false);
  });

  it("handles string content (text-only message)", () => {
    const payload = {
      messages: [{ role: "user", content: "hi how are you" }],
    };
    expect(hasImageInPayload(payload)).toBe(false);
  });

  it("handles image in middle of conversation", () => {
    const payload = {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image_url", image_url: { url: "data:..." } },
          ],
        },
      ],
    };
    expect(hasImageInPayload(payload)).toBe(true);
  });
});

describe("visionClassify", () => {
  it("returns vision category with full confidence", () => {
    const r = visionClassify();
    expect(r.category).toBe("vision");
    expect(r.confidence).toBe(1.0);
    expect(r.reason).toContain("image");
  });
});
