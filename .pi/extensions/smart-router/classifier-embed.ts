import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  type Category,
  type ClassifyResult,
  type RouterConfig,
  CATEGORIES,
} from "./router-config.ts";

const CACHE_PATH = join(homedir(), ".config", "little-coder", "router-embeddings.json");

interface EmbeddingCache {
  model: string;
  createdAt: number;
  /** category → array of embedding vectors for that category's exemplars */
  exemplars: Record<Category, number[][]>;
}

async function embedTexts(
  texts: string[],
  baseUrl: string,
  model: string,
): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!res.ok) {
      throw new Error(`Ollama embeddings HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { embedding: number[] };
    out.push(data.embedding);
  }
  return out;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  // Guard against zero vectors
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0]?.length ?? 0;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      out[i] += v[i] ?? 0;
    }
  }
  return out.map((x) => x / vectors.length);
}

async function loadOrBuildCache(config: RouterConfig): Promise<EmbeddingCache | null> {
  // Try cache first
  if (existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as EmbeddingCache;
      if (cached.model === config.ollama.embedModel) {
        // Validate all categories present
        for (const cat of CATEGORIES) {
          if (!cached.exemplars[cat]?.length) throw new Error(`missing ${cat}`);
        }
        return cached;
      }
    } catch (err) {
      // Fall through to rebuild
      console.error(`[smart-router] embeddings cache invalid: ${(err as Error).message}, rebuilding`);
    }
  }

  // Build cache from exemplars
  try {
    const exemplars: Record<Category, number[][]> = {} as Record<Category, number[][]>;
    for (const cat of CATEGORIES) {
      const phrases = config.examples[cat];
      exemplars[cat] = await embedTexts(phrases, config.ollama.baseUrl, config.ollama.embedModel);
    }
    const cache: EmbeddingCache = {
      model: config.ollama.embedModel,
      createdAt: Date.now(),
      exemplars,
    };
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    return cache;
  } catch (err) {
    console.error(`[smart-router] failed to build embeddings cache: ${(err as Error).message}`);
    return null;
  }
}

export interface EmbedClassifier {
  /** Build / load the embeddings cache. Returns false if Ollama is unreachable. */
  ready(): Promise<boolean>;
  /** Classify a prompt via embedding similarity. */
  classify(text: string): Promise<ClassifyResult | null>;
}

export function createEmbedClassifier(config: RouterConfig): EmbedClassifier {
  let cache: EmbeddingCache | null = null;

  return {
    async ready(): Promise<boolean> {
      cache = await loadOrBuildCache(config);
      return cache !== null;
    },

    async classify(text: string): Promise<ClassifyResult | null> {
      if (!cache) return null;
      try {
        const [promptVec] = await embedTexts([text], config.ollama.baseUrl, config.ollama.embedModel);
        let bestCat: Category | null = null;
        let bestSim = -Infinity;
        for (const cat of CATEGORIES) {
          const centroid = meanVector(cache.exemplars[cat]);
          const sim = cosineSim(promptVec, centroid);
          if (sim > bestSim) {
            bestSim = sim;
            bestCat = cat;
          }
        }
        if (!bestCat || bestSim < config.thresholds.embedMin) return null;
        return {
          category: bestCat,
          confidence: Number(bestSim.toFixed(3)),
          reason: `embedding sim ${bestSim.toFixed(3)} vs ${bestCat}`,
          stage: "embed",
        };
      } catch (err) {
        console.error(`[smart-router] embed classify failed: ${(err as Error).message}`);
        return null;
      }
    },
  };
}

/** Exposed for tests. */
export const __test__ = { cosineSim, meanVector };
