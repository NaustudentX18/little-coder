import {
  type Category,
  type ClassifyResult,
  type RouterConfig,
  CATEGORIES,
  isCategory,
} from "./router-config.ts";

const TIMEOUT_MS = 5_000;

const SYSTEM_PROMPT = `You are a routing classifier for a coding agent. Given the user's message, return ONLY a JSON object with this exact shape:
{"category": "<one of: ${CATEGORIES.join("|")}>", "confidence": <0.0-1.0>}

Category definitions:
- code: implementing, refactoring, debugging, or reviewing source code
- reasoning-deep: math, proofs, multi-step analysis, legal/medical reasoning
- reasoning-fast: short explanations, summaries, "what's the difference"
- chat: casual greeting or simple question that needs no depth
- web: HTML/CSS/JS/React/Vue/Svelte/frontend work
- tool: tool calls, agent execution, shell commands, MCP
- embed: embeddings, vectorization, similarity search

Return JSON only. No prose, no markdown fences.`;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface LlmClassifier {
  classify(text: string): Promise<ClassifyResult | null>;
}

export function createLlmClassifier(config: RouterConfig): LlmClassifier {
  return {
    async classify(text: string): Promise<ClassifyResult | null> {
      // Skip very short prompts to save a 500ms call
      if (text.length < config.thresholds.llmMinPromptLen) return null;

      const prompt = `${SYSTEM_PROMPT}\n\nUser message: ${text}\n\nJSON:`;
      try {
        const res = await fetchWithTimeout(
          `${config.ollama.baseUrl}/api/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: config.ollama.classifierModel,
              prompt,
              format: "json",
              stream: false,
              options: { temperature: 0, num_predict: 80 },
            }),
          },
          TIMEOUT_MS,
        );
        if (!res.ok) {
          console.error(`[smart-router] LLM classifier HTTP ${res.status}: ${await res.text()}`);
          return null;
        }
        const data = (await res.json()) as { response: string };
        const parsed = JSON.parse(data.response) as { category?: string; confidence?: number };
        if (!parsed.category || !isCategory(parsed.category)) {
          console.error(`[smart-router] LLM returned unknown category: ${parsed.category}`);
          return null;
        }
        const conf = Math.max(0, Math.min(1, parsed.confidence ?? 0.7));
        if (conf < config.thresholds.llmMin) return null;
        return {
          category: parsed.category,
          confidence: conf,
          reason: `LLM classified as ${parsed.category}`,
          stage: "llm",
        };
      } catch (err) {
        console.error(`[smart-router] LLM classify failed: ${(err as Error).message}`);
        return null;
      }
    },
  };
}
