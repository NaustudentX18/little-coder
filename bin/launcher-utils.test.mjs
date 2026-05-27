import { describe, it, expect, vi } from "vitest";
import {
  autoUnloadLlamaCpp,
  isLlamaCppModel,
  llamaUnloadEndpoints,
  parseModelArg,
} from "./launcher-utils.mjs";

describe("parseModelArg", () => {
  it("reads --model as a separate argument", () => {
    expect(parseModelArg(["--model", "ollama/qwen3.6-agent"])).toBe("ollama/qwen3.6-agent");
  });

  it("reads --model=inline", () => {
    expect(parseModelArg(["--model=llamacpp/qwen3.6-35b-a3b"])).toBe("llamacpp/qwen3.6-35b-a3b");
  });
});

describe("isLlamaCppModel", () => {
  it("recognizes llama.cpp models by prefix", () => {
    expect(isLlamaCppModel("llamacpp/qwen3.6-35b-a3b")).toBe(true);
    expect(isLlamaCppModel("ollama/qwen3.6-agent")).toBe(false);
  });
});

describe("llamaUnloadEndpoints", () => {
  it("tries both root and /v1 unload endpoints", () => {
    expect(llamaUnloadEndpoints("http://127.0.0.1:8001/v1")).toEqual([
      "http://127.0.0.1:8001/models/unload",
      "http://127.0.0.1:8001/v1/models/unload",
    ]);
  });
});

describe("autoUnloadLlamaCpp", () => {
  it("skips unload for llama.cpp selections", async () => {
    const fetchImpl = vi.fn();
    const spawnSyncImpl = vi.fn();
    const result = await autoUnloadLlamaCpp({
      args: ["--model", "llamacpp/qwen3.6-35b-a3b"],
      env: { LLAMACPP_BASE_URL: "http://x:8001/v1" },
      fetchImpl,
      spawnSyncImpl,
    });
    expect(result.attempted).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });

  it("attempts unload on a non-llama selection", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const spawnSyncImpl = vi.fn();
    const result = await autoUnloadLlamaCpp({
      args: ["--model", "ollama/qwen3.6-agent"],
      env: {
        LLAMACPP_BASE_URL: "http://x:8001/v1",
        LITTLE_CODER_LLAMACPP_UNLOAD_MODEL_ID: "MyModel.gguf",
      },
      fetchImpl,
      spawnSyncImpl,
    });

    expect(result.succeeded).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://x:8001/models/unload");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ model: "MyModel.gguf" });
    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });

  it("falls back to a stop command when the unload endpoint fails", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }));
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }));
    const result = await autoUnloadLlamaCpp({
      args: ["--model", "ollama/qwen3.6-agent"],
      env: {
        LLAMACPP_BASE_URL: "http://x:8001/v1",
        LITTLE_CODER_LLAMACPP_STOP_CMD: "echo stopped",
      },
      fetchImpl,
      spawnSyncImpl,
    });

    expect(result.succeeded).toBe(true);
    expect(spawnSyncImpl).toHaveBeenCalledTimes(1);
  });
});
