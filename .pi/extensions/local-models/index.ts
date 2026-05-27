import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { filterLocalModels, modelLabel, resolveLocalModel, sortLocalModels } from "./model-utils.ts";

function formatCurrent(model?: { provider: string; id: string } | undefined): string {
  return model ? `${model.provider}/${model.id}` : "no model";
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("local-models", {
    description: "List and switch live local models (llama.cpp, Ollama, LM Studio)",
    getArgumentCompletions: (prefix) => {
      const choices = ["list", "current"];
      const filtered = choices.filter((c) => c.startsWith(prefix.toLowerCase()));
      return filtered.map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const available = await ctx.modelRegistry.getAvailable();
      const localModels = sortLocalModels(filterLocalModels(available), ctx.model);

      if (localModels.length === 0) {
        ctx.ui.notify("No live local models are currently available", "warning");
        return;
      }

      const query = args.trim();
      if (query && query !== "list" && query !== "current") {
        const resolved = resolveLocalModel(localModels, query);
        if (!resolved) {
          ctx.ui.notify(`No live local model matched "${query}"`, "warning");
          return;
        }
        const model = ctx.modelRegistry.find(resolved.provider, resolved.id);
        if (!model) {
          ctx.ui.notify(`Model not found: ${resolved.provider}/${resolved.id}`, "error");
          return;
        }
        const success = await pi.setModel(model);
        if (!success) {
          ctx.ui.notify(`No API key for ${resolved.provider}/${resolved.id}`, "error");
          return;
        }
        ctx.ui.notify(`Model switched to ${resolved.provider}/${resolved.id}`, "info");
        return;
      }

      if (query === "current") {
        ctx.ui.notify(`Current model: ${formatCurrent(ctx.model)}`, "info");
        return;
      }

      const selected = await ctx.ui.select(
        "Live local models",
        localModels.map((model) => modelLabel(model, ctx.model)),
      );

      if (!selected) return;

      const resolved = resolveLocalModel(localModels, selected.replace(/^▶\s*/, "").split(" — ")[0] ?? selected);
      if (!resolved) return;
      const model = ctx.modelRegistry.find(resolved.provider, resolved.id);
      if (!model) {
        ctx.ui.notify(`Model not found: ${resolved.provider}/${resolved.id}`, "error");
        return;
      }
      const success = await pi.setModel(model);
      if (!success) {
        ctx.ui.notify(`No API key for ${resolved.provider}/${resolved.id}`, "error");
        return;
      }
      ctx.ui.notify(`Model switched to ${resolved.provider}/${resolved.id}`, "info");
    },
  });
}
