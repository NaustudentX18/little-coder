/**
 * Smart Model Router for little-coder.
 *
 * Hooks `before_provider_request` to transparently swap the model in the
 * request payload based on a 3-stage classifier cascade (regex → embedding
 * similarity → tiny LLM). The user can override at any time with
 * `/router <mode>` where mode is `auto|off|code|reasoning|chat|web|tool|embed`
 * or a literal model id.
 *
 * Routing targets are restricted to models in the `ollama` provider.
 * Use `/local-models <name>` to switch to `ollama-cloud` or `llamacpp`.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_CONFIG,
  isCategory,
  resolveModelForMode,
  type RouterConfig,
  type RouterMode,
} from "./router-config.ts";
import { createCascade, type Cascade } from "./cascade.ts";
import { hasImageInPayload, visionClassify } from "./detect-image.ts";

const CONFIG_PATH = join(homedir(), ".config", "little-coder", "router.json");
const LOG_PATH = join(homedir(), ".config", "little-coder", "router-decisions.log");

function loadPersistedMode(): RouterMode {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG.mode;
  try {
    const j = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as { mode?: RouterMode };
    return j.mode ?? DEFAULT_CONFIG.mode;
  } catch {
    return DEFAULT_CONFIG.mode;
  }
}

/**
 * Build the effective router config for this session.
 *
 * Layered sources, lowest to highest priority:
 *   1. DEFAULT_CONFIG (compiled in)
 *   2. Persisted mode from ~/.config/little-coder/router.json
 *   3. OLLAMA_BASE_URL env var (lets the user point at a remote Ollama
 *      on a peer host without editing source -- e.g. running little-coder
 *      on a Pi while Ollama lives on a separate PC)
 */
function loadEffectiveConfig(): RouterConfig {
  const envBase = process.env.OLLAMA_BASE_URL?.trim();
  return {
    ...DEFAULT_CONFIG,
    mode: loadPersistedMode(),
    ollama: {
      ...DEFAULT_CONFIG.ollama,
      ...(envBase ? { baseUrl: envBase } : {}),
    },
  };
}

function persistMode(mode: RouterMode) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ mode }, null, 2));
}

function appendDecision(record: object) {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    writeFileSync(LOG_PATH, JSON.stringify(record) + "\n", { flag: "a" });
  } catch (err) {
    console.error(`[smart-router] failed to log decision: ${(err as Error).message}`);
  }
}

function lastUserText(payload: unknown): string {
  // OpenAI-compat request: { model, messages: [{role, content}, ...], ... }
  if (typeof payload !== "object" || payload === null) return "";
  const p = payload as { messages?: unknown };
  if (!Array.isArray(p.messages)) return "";
  // Walk backwards to find last user message
  for (let i = p.messages.length - 1; i >= 0; i--) {
    const m = p.messages[i] as { role?: string; content?: unknown };
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      // Multimodal: concat text parts
      return m.content
        .filter((c) => typeof c === "object" && c !== null && (c as { type?: string }).type === "text")
        .map((c) => (c as { text?: string }).text ?? "")
        .join("\n");
    }
  }
  return "";
}

interface SmartRouterState {
  config: RouterConfig;
  mode: RouterMode;
  cascade: Cascade;
  decisions: Array<{ ts: number; category: string; model: string; confidence: number; stage: string; reason: string }>;
  debug: boolean;
}

function getDebug(): boolean {
  return process.env.LITTLE_CODER_ROUTER_DEBUG === "1";
}

function getFooterEnabled(): boolean {
  return process.env.LITTLE_CODER_ROUTER_FOOTER !== "0";
}

export default function (pi: ExtensionAPI) {
  const effectiveConfig = loadEffectiveConfig();
  const state: SmartRouterState = {
    config: effectiveConfig,
    mode: effectiveConfig.mode,
    cascade: createCascade(effectiveConfig),
    decisions: [],
    debug: getDebug(),
  };

  if (state.debug && process.env.OLLAMA_BASE_URL) {
    console.error(`[smart-router] using OLLAMA_BASE_URL=${effectiveConfig.ollama.baseUrl}`);
  }

  // Initialize the embed classifier in the background; don't block session start
  void state.cascade.ready();

  // ───────────────────────────────────────────────────────────────────
  // /router command — explicit mode control
  // ───────────────────────────────────────────────────────────────────
  pi.registerCommand("router", {
    description: "Smart model router: auto | off | code | reasoning | chat | web | tool | embed | <model-id> | status",
    getArgumentCompletions: (prefix) => {
      const choices = [
        "auto",
        "off",
        "status",
        "code",
        "reasoning-deep",
        "reasoning-fast",
        "chat",
        "web",
        "tool",
        "embed",
        "vision",
      ];
      return choices
        .filter((c) => c.startsWith(prefix.toLowerCase()))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const query = args.trim().toLowerCase();
      if (!query || query === "status") {
        const last = state.decisions.slice(-5).map(
          (d) => `  ${new Date(d.ts).toISOString().slice(11, 19)}  ${d.stage.padEnd(6)} → ${d.category.padEnd(16)} ${d.model}  (${d.confidence.toFixed(2)})  ${d.reason}`,
        ).join("\n");
        const counts: Record<string, number> = {};
        for (const d of state.decisions) counts[d.category] = (counts[d.category] ?? 0) + 1;
        const tally = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ") || "none yet";
        ctx.ui.notify(
          `router mode: ${state.mode}\nresolved model: ${resolveModelForMode(state.config, state.mode) ?? "(auto-classify)"}\ntotal decisions: ${state.decisions.length} (${tally})\n\nLast 5:\n${last || "  (none)"}`,
          "info",
        );
        return;
      }

      if (query === "auto" || query === "off" || isCategory(query)) {
        state.mode = query;
        persistMode(state.mode);
        const resolved = resolveModelForMode(state.config, state.mode);
        ctx.ui.notify(
          `router mode: ${state.mode}${resolved ? ` → ${resolved}` : " (auto-classify)"}`,
          "info",
        );
        return;
      }

      // Treat as explicit model id
      state.mode = query;
      persistMode(state.mode);
      ctx.ui.notify(`router mode: explicit model → ${state.mode}`, "info");
    },
  });

  // ───────────────────────────────────────────────────────────────────
  // before_provider_request — the actual routing happens here
  // ───────────────────────────────────────────────────────────────────
  pi.on("before_provider_request", async (event) => {
    const mode = state.mode;
    if (mode === "off") return; // no change

    // Only route for the ollama provider (other providers are reached via /local-models)
    const provider = (pi as { provider?: string }).provider ?? "ollama";
    if (provider !== "ollama") return;

    const text = lastUserText(event.payload);
    if (!text) return;

    let target: string | null = null;
    let category: string;
    let confidence: number;
    let reason: string;
    let stage: string;

    // Vision short-circuit: image content → vision model (unless user forced a non-vision mode)
    if (hasImageInPayload(event.payload) && (mode === "auto" || mode === "vision")) {
      const r = visionClassify();
      target = state.config.categories[r.category] ?? state.config.defaults.defaultModel;
      category = r.category;
      confidence = r.confidence;
      reason = r.reason;
      stage = r.stage;
    } else if (mode === "auto") {
      // Run the cascade
      const r = await state.cascade.classify(text);
      target = state.config.categories[r.category] ?? state.config.defaults.defaultModel;
      category = r.category;
      confidence = r.confidence;
      reason = r.reason;
      stage = r.stage;
    } else {
      // Forced mode (category or model id)
      target = resolveModelForMode(state.config, mode);
      if (!target) return; // shouldn't happen
      category = isCategory(mode) ? mode : "explicit";
      confidence = 1.0;
      reason = `forced via /router ${mode}`;
      stage = "forced";
    }

    if (!target) return;

    // Defensive payload swap
    if (typeof event.payload !== "object" || event.payload === null) return;
    const p = event.payload as { model?: unknown; [k: string]: unknown };
    if (typeof p.model !== "string") return;
    if (p.model === target) return; // no change

    // Record + log
    const record = {
      ts: Date.now(),
      mode,
      category,
      model: target,
      confidence,
      stage,
      reason,
      fromModel: p.model,
    };
    state.decisions.push(record);
    if (state.decisions.length > 100) state.decisions.shift();
    if (state.debug) {
      appendDecision(record);
      console.error(`[smart-router] ${stage}: ${p.model} → ${target} (${category}, ${confidence.toFixed(2)}) ${reason}`);
    }

    // Optional: notify the user in the TUI
    if (getFooterEnabled()) {
      const piAny = pi as { ui?: { notify?: (msg: string, type?: string) => void } };
      piAny.ui?.notify?.(`→ ${target} (${category})`, "info");
    }

    // Return the swapped payload
    return { ...p, model: target };
  });
}
