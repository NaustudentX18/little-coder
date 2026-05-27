import { describe, expect, it } from "vitest";
import setupLocalModels from "./index.ts";

function register() {
  let reg: { name: string; opts: any } | undefined;
  const pi = {
    registerCommand(name: string, opts: any) {
      reg = { name, opts };
    },
    async setModel(_model: any) {
      return true;
    },
  };
  setupLocalModels(pi as any);
  if (!reg) throw new Error("no command registered");
  return { reg, pi };
}

describe("/local-models command", () => {
  it("registers the command", () => {
    const { reg } = register();
    expect(reg.name).toBe("local-models");
    expect(typeof reg.opts.description).toBe("string");
    expect(typeof reg.opts.handler).toBe("function");
  });

  it("switches directly when given a provider/id query", async () => {
    const { reg, pi } = register();
    let switchedTo: string | undefined;
    const ctx = {
      model: { provider: "ollama", id: "qwen3.5", name: "Qwen3.5" },
      modelRegistry: {
        async getAvailable() {
          return [
            { provider: "ollama", id: "qwen3.5", name: "Qwen3.5" },
            { provider: "llamacpp", id: "Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf", name: "Qwen3.6 MTP" },
            { provider: "anthropic", id: "claude", name: "Claude" },
          ];
        },
        find(provider: string, id: string) {
          return { provider, id, name: `${provider}/${id}` };
        },
      },
      ui: {
        notify: (_msg: string) => undefined,
        select: async () => undefined,
      },
    };
    pi.setModel = async (model: any) => {
      switchedTo = `${model.provider}/${model.id}`;
      return true;
    };

    await reg.opts.handler("llamacpp/Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf", ctx);
    expect(switchedTo).toBe("llamacpp/Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf");
  });
});
