/**
 * Smart router config: categories, default routing table, thresholds, persistence.
 *
 * Routing targets are model IDs in the `ollama` provider. The `ollama-cloud` and
 * `llamacpp` providers are reached via `/local-models` (manual switch), not this router.
 */

export type Category =
  | "code"
  | "reasoning-deep"
  | "reasoning-fast"
  | "chat"
  | "web"
  | "tool"
  | "embed"
  | "vision";

export type RouterMode = "auto" | "off" | Category | string;

export interface RouterConfig {
  mode: RouterMode;
  categories: Record<Category, string>;
  examples: Record<Category, string[]>;
  thresholds: {
    embedMin: number;
    llmMin: number;
    llmMinPromptLen: number;
  };
  defaults: {
    defaultModel: string;
  };
  ollama: {
    baseUrl: string;
    classifierModel: string;
    embedModel: string;
  };
}

export const CATEGORIES: Category[] = [
  "code",
  "reasoning-deep",
  "reasoning-fast",
  "chat",
  "web",
  "tool",
  "embed",
  "vision",
];

export const DEFAULT_CONFIG: RouterConfig = {
  mode: "auto",
  categories: {
    code: "qwen3-coder-next:latest",
    "reasoning-deep": "qwen3.6-apex-mtp:latest",
    "reasoning-fast": "gpt-oss:20b",
    chat: "qwen3.5:9b",
    web: "glm-4.7-flash:latest",
    tool: "granite4.1:8b",
    embed: "nomic-embed-text:latest",
    vision: "gemma4:e4b",
  },
  examples: {
    code: [
      "implement a Python function that flattens a nested dict",
      "refactor this TypeScript class to use async/await",
      "fix the bug in app.py where the import fails",
      "add a Rust struct with serde serialization",
      "write a SQL query with a JOIN across three tables",
      "what does this Go function do?",
      "convert this callback to a Promise",
    ],
    "reasoning-deep": [
      "prove that sqrt(2) is irrational",
      "derive the optimal stopping time for the secretary problem",
      "explain the thermodynamic argument for the heat death of the universe",
      "analyze the legal precedent in s.340 of the Fair Work Act",
      "walk me through the proof of Gödel's incompleteness theorem",
      "compare Bayesian and frequentist approaches to hypothesis testing",
    ],
    "reasoning-fast": [
      "summarize this paragraph in one sentence",
      "what's the difference between MTP and speculative decoding?",
      "explain why the sky is blue, briefly",
      "give me a quick pros/cons list of REST vs GraphQL",
    ],
    chat: [
      "hi, how are you?",
      "good morning",
      "thanks, that helps",
      "what's the weather like?",
      "tell me a joke",
    ],
    web: [
      "build a React component with a navbar and dark mode toggle",
      "style this div with Tailwind and a gradient background",
      "write HTML for a contact form with validation",
      "create a Vue 3 single-file component with TypeScript",
      "center this div both horizontally and vertically with CSS",
    ],
    tool: [
      "use the browser tool to navigate to example.com",
      "run the tests and report the failures",
      "list the files in /tmp and sort by size",
      "call the weather API and parse the JSON response",
      "create a git commit with this diff",
    ],
    embed: [
      "embed this document for similarity search",
      "vectorize these customer reviews for clustering",
      "compute cosine similarity between these two texts",
      "find the nearest neighbors to this embedding",
    ],
    vision: [
      "describe what's in this image",
      "read the text from this screenshot",
      "what does this chart show?",
      "identify the objects in this photo",
      "OCR this document image",
    ],
  },
  thresholds: {
    embedMin: 0.5,
    llmMin: 0.6,
    llmMinPromptLen: 100,
  },
  defaults: {
    defaultModel: "qwen3.6-apex-mtp:latest",
  },
  ollama: {
    // Default points at the same machine. Override at runtime with the
    // OLLAMA_BASE_URL env var if your Ollama is remote (e.g. on a peer
    // host on your tailnet). Never bake a private IP into this file.
    baseUrl: "http://127.0.0.1:11434",
    classifierModel: "qwen3.5:9b",
    embedModel: "nomic-embed-text:latest",
  },
};

export interface ClassifyResult {
  category: Category;
  confidence: number;
  reason: string;
  stage: "regex" | "embed" | "llm" | "default";
}

export function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

export function resolveModelForMode(
  config: RouterConfig,
  mode: RouterMode,
): string | null {
  if (mode === "auto" || mode === "off") return null;
  if (isCategory(mode)) return config.categories[mode];
  // Treat as explicit model id
  return mode;
}
