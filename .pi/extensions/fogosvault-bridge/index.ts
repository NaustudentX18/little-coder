import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";

const BRIDGE = "/home/pi/FogosVault/little-coder/src/memory_bridge.py";

function bridgeCall(req: Record<string, unknown>): Record<string, unknown> {
  const input = JSON.stringify(req) + "\n";
  const stdout = execFileSync("/usr/bin/python3", ["-u", BRIDGE], {
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      FOGOSVAULT_PERSIST_DIR: process.env.FOGOSVAULT_PERSIST_DIR || "/home/pi/.fogosvault/memory_store",
    },
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout.trim());
}

export default function fogosvaultBridge(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event: { systemPrompt: string; prompt: string }) => {
    const prompt = event.prompt || "";
    if (!prompt) return undefined;
    try {
      const resp = bridgeCall({ action: "search", query: prompt, top_k: 5 }) as { memories?: Array<{ content: string; category: string; importance: number }> };
      const ms = resp.memories ?? [];
      if (ms.length === 0) return undefined;
      const block = ms.map((m, i) => `${i + 1}. [${m.category}] ${m.content}`).join("\n");
      return { systemPrompt: event.systemPrompt + `\n\n## Relevant Memories\n${block}\n` };
    } catch {
      return undefined;
    }
  });

  pi.on("agent_end", (event: { messages?: Array<{ role: string; content: string }> }) => {
    if (!event.messages) return;
    const responses = event.messages
      .filter(m => m.role === "assistant" && typeof m.content === "string")
      .map(m => m.content);
    const summary = responses.slice(-3).join(" ").slice(0, 300);
    if (summary.length > 30) {
      try { bridgeCall({ action: "add", content: summary, category: "conversation", importance: 0.2 }); } catch { /* skip */ }
    }
  });
}
