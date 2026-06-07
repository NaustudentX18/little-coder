import { type Category, type ClassifyResult, CATEGORIES } from "./router-config.ts";

/** Code file extensions. */
const CODE_FILE = /\b[\w/.-]+\.(py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|swift|c|h|cpp|cc|hpp|hh|rb|php|cs|scala|ex|exs|lua|sh|bash|zsh|sql|html|css|scss|sass|vue|svelte|astro|mdx|yaml|yml|toml|json|xml|dart|ipynb|graphql|proto|zig|odin|v|sv|vhdl|asm)\b/i;

/** Words that strongly suggest code. */
const CODE_KEYWORD = /\b(function|class|import|from|def|const|let|var|return|async|await|throw|try|catch|interface|type|struct|impl|trait|enum|match|if|else|for|while|switch|case|break|continue|new|delete|public|private|protected|static|void|null|nil|true|false|self|this|super|module|export|require|include|package|using|namespace|trait|fn|fun|let|mut|pub|use|crate|extern|ref|mut|impl|trait|where|move|borrow)\b/i;

/** Phrases that suggest deep reasoning. */
const REASONING_DEEP = /\b(prove|derive|theorem|axiom|lemma|proof|formal|mathematical|calculus|integral|derivative|matrix|eigenvalue|entropy|topology|kernel|complexity|asymptotic|recurrence|invariant|proposition|corollary|conjecture|induction|deduction|syllogism|analyze|analysis|argument|rationale|implications|trade-?offs)\b/i;

/** Phrases that suggest quick reasoning. */
const REASONING_FAST = /\b(summarize|summary|briefly|short|tl;dr|tldr|concise|quickly|one[- ]line|elevator pitch|headline)\b/i;

/** Phrases that suggest web/frontend work. (File extensions like .vue/.svelte/.astro excluded — caught by CODE_FILE.) */
const WEB = /\b(html|css|scss|sass|tailwind|bootstrap|react|angular|next\.?js|nuxt|remix|gatsby|redux|mobx|component|element|stylesheet|frontend|webpack|vite|rollup|parcel|emotion|styled-components|chakra|material-?ui|antd|ant-?design|primereact|navbar|sidebar|modal|tooltip|popover|dropdown|carousel|layout|flexbox|responsive|media-?query|viewport|breakpoint|dom|ui\b|ux\b)\b/i;

/** Phrases that suggest tool use / agentic work. */
const TOOL = /\b(tool|function[- ]?call|tool[- ]?call|tool[- ]?use|mcp|agent|execute|run|shell|bash|powershell|npm|yarn|pnpm|pip|conda|git|commit|push|pull|merge|rebase|fetch|deploy|build|test|ci|cd|workflow|action|automation|orchestrat)\b/i;

/** Phrases that suggest embeddings. */
const EMBED = /\b(embed|embedding|vectorize|vectori[sz]ation|cosine|similarity|search|annoy|faiss|chroma|pinecone|weaviate|qdrant|pgvector|retrieval|ranking|rerank|knn|ball[- ]tree|hnsw|ann)\b/i;

/**
 * Stage 1 classifier: regex over the latest user message.
 * Returns null when no high-confidence signal fires.
 */
export function classifyRegex(text: string): ClassifyResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Order: most specific first, then fall through.
  // WEB > TOOL because "build a React component" is web work even though "build" is in TOOL.
  if (EMBED.test(trimmed)) {
    return { category: "embed", confidence: 0.95, reason: "embedding keyword", stage: "regex" };
  }
  if (WEB.test(trimmed)) {
    return { category: "web", confidence: 0.9, reason: "web/frontend keyword", stage: "regex" };
  }
  if (TOOL.test(trimmed)) {
    return { category: "tool", confidence: 0.9, reason: "tool/agent keyword", stage: "regex" };
  }
  if (CODE_FILE.test(trimmed)) {
    return { category: "code", confidence: 0.95, reason: "code file extension", stage: "regex" };
  }
  if (REASONING_DEEP.test(trimmed)) {
    return { category: "reasoning-deep", confidence: 0.85, reason: "deep-reasoning keyword", stage: "regex" };
  }
  if (REASONING_FAST.test(trimmed)) {
    return { category: "reasoning-fast", confidence: 0.8, reason: "fast-reasoning keyword", stage: "regex" };
  }
  if (CODE_KEYWORD.test(trimmed)) {
    return { category: "code", confidence: 0.7, reason: "code keyword", stage: "regex" };
  }
  return null;
}

// Re-export for the cascade to introspect
export const REGEX_RULES = {
  CODE_FILE,
  CODE_KEYWORD,
  REASONING_DEEP,
  REASONING_FAST,
  WEB,
  TOOL,
  EMBED,
};
