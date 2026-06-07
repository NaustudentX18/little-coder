import { type ClassifyResult } from "./router-config.ts";

/**
 * Detect whether the most recent user message in an OpenAI-compat request
 * payload contains any image content (vision attachment).
 *
 * Supports both OpenAI-style `image_url` and Anthropic-style `image` content
 * types, plus multimodal parts that have an `image_url` field.
 */
export function hasImageInPayload(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as { messages?: unknown };
  if (!Array.isArray(p.messages)) return false;
  // Walk backwards to find the last user message
  for (let i = p.messages.length - 1; i >= 0; i--) {
    const m = p.messages[i] as { role?: string; content?: unknown };
    if (m?.role !== "user") continue;
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (typeof part !== "object" || part === null) continue;
        const t = (part as { type?: string }).type;
        if (t === "image_url" || t === "image") return true;
      }
    }
    return false; // checked the last user message, no image
  }
  return false;
}

/**
 * Build a vision classification result. Used when the cascade is short-circuited
 * because the request has an image attachment.
 */
export function visionClassify(): ClassifyResult {
  return {
    category: "vision",
    confidence: 1.0,
    reason: "image content in user message",
    stage: "regex",
  };
}
