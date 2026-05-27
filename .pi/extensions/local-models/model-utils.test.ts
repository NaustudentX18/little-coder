import { describe, expect, it } from "vitest";
import { filterLocalModels, modelLabel, resolveLocalModel, sortLocalModels } from "./model-utils.ts";

const models = [
  { provider: "ollama", id: "qwen3.6:35b-a3b", name: "Qwen3.6 35B A3B" },
  { provider: "anthropic", id: "claude", name: "Claude" },
  { provider: "llamacpp", id: "Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf", name: "Qwen3.6 MTP" },
  { provider: "lmstudio", id: "local-model", name: "LM Studio" },
];

describe("local model helpers", () => {
  it("filters to local providers only", () => {
    expect(filterLocalModels(models).map((m) => `${m.provider}/${m.id}`)).toEqual([
      "ollama/qwen3.6:35b-a3b",
      "llamacpp/Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf",
      "lmstudio/local-model",
    ]);
  });

  it("sorts current model first and then by provider/id", () => {
    const sorted = sortLocalModels(filterLocalModels(models), { provider: "llamacpp", id: "Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf" });
    expect(sorted.map((m) => `${m.provider}/${m.id}`)).toEqual([
      "llamacpp/Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf",
      "lmstudio/local-model",
      "ollama/qwen3.6:35b-a3b",
    ]);
  });

  it("resolves by provider/id, id, name, or fuzzy text", () => {
    expect(resolveLocalModel(models, "ollama/qwen3.6:35b-a3b")?.id).toBe("qwen3.6:35b-a3b");
    expect(resolveLocalModel(models, "local-model")?.provider).toBe("lmstudio");
    expect(resolveLocalModel(models, "Qwen3.6 MTP")?.provider).toBe("llamacpp");
    expect(resolveLocalModel(models, "apex mtp")?.provider).toBe("llamacpp");
  });

  it("labels the current model", () => {
    expect(modelLabel(models[0]!, { provider: "ollama", id: "qwen3.6:35b-a3b" })).toContain("▶ ollama/qwen3.6:35b-a3b");
  });
});
