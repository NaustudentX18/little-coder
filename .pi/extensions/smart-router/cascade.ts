import {
  type ClassifyResult,
  type RouterConfig,
} from "./router-config.ts";
import { classifyRegex } from "./classifier-regex.ts";
import { createEmbedClassifier, type EmbedClassifier } from "./classifier-embed.ts";
import { createLlmClassifier, type LlmClassifier } from "./classifier-llm.ts";

export interface Cascade {
  /** Initialize the embed classifier (loads/builds cache). Skips embed if it fails. */
  ready(): Promise<void>;
  /** Classify a prompt. Returns default if all stages fail. */
  classify(text: string): Promise<ClassifyResult>;
  /** Test helper: bypass the regex stage. */
  skipRegex(): void;
  /** Disable embed stage (e.g. for testing). */
  setEmbedEnabled(enabled: boolean): void;
  /** Disable LLM stage (e.g. for testing). */
  setLlmEnabled(enabled: boolean): void;
  /** Expose underlying classifiers for tests. */
  __embed: EmbedClassifier | null;
  __llm: LlmClassifier;
}

export function createCascade(config: RouterConfig): Cascade {
  const embed = createEmbedClassifier(config);
  const llm = createLlmClassifier(config);
  let regexEnabled = true;
  let embedEnabled = true;
  let llmEnabled = true;
  let embedReady = false;

  return {
    async ready() {
      embedReady = await embed.ready();
      if (!embedReady) {
        console.error("[smart-router] embed classifier unavailable, will skip Stage 2");
      }
    },
    async classify(text: string): Promise<ClassifyResult> {
      // Stage 1: regex
      if (regexEnabled) {
        const r = classifyRegex(text);
        if (r) return r;
      }
      // Stage 2: embedding similarity
      if (embedEnabled && embedReady) {
        const r = await embed.classify(text);
        if (r) return r;
      }
      // Stage 3: tiny LLM classifier
      if (llmEnabled) {
        const r = await llm.classify(text);
        if (r) return r;
      }
      // Default fallback
      return {
        category: "chat",
        confidence: 0.3,
        reason: "no classifier fired, using default",
        stage: "default",
      };
    },
    skipRegex() {
      regexEnabled = false;
    },
    setEmbedEnabled(enabled: boolean) {
      embedEnabled = enabled;
    },
    setLlmEnabled(enabled: boolean) {
      llmEnabled = enabled;
    },
    get __embed() { return embed; },
    __llm: llm,
  };
}
