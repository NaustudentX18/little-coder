import { spawnSync } from "node:child_process";

const DEFAULT_LLAMACPP_UNLOAD_MODEL = "Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf";

export function parseModelArg(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--model" && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith("--model=")) {
      return arg.slice("--model=".length);
    }
  }
  return undefined;
}

export function isLlamaCppModel(model) {
  return typeof model === "string" && model.startsWith("llamacpp/");
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
}

export function llamaUnloadEndpoints(baseUrl) {
  const root = normalizeBaseUrl(baseUrl);
  return [`${root}/models/unload`, `${root}/v1/models/unload`];
}

function postJson(fetchImpl, url, payload, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetchImpl(url, {
    method: "POST",
    signal: ctrl.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).finally(() => clearTimeout(timer));
}

export async function autoUnloadLlamaCpp({
  args,
  env = process.env,
  fetchImpl = fetch,
  spawnSyncImpl = spawnSync,
  logger = () => {},
} = {}) {
  const selectedModel = parseModelArg(args ?? []);
  if (isLlamaCppModel(selectedModel)) {
    return { attempted: false, reason: "selected llama.cpp model" };
  }

  if (env.LITTLE_CODER_LLAMACPP_AUTO_UNLOAD === "0") {
    return { attempted: false, reason: "auto unload disabled" };
  }

  const baseUrl = env.LLAMACPP_BASE_URL;
  if (!baseUrl) {
    return { attempted: false, reason: "no LLAMACPP_BASE_URL" };
  }

  const unloadModel = env.LITTLE_CODER_LLAMACPP_UNLOAD_MODEL_ID || DEFAULT_LLAMACPP_UNLOAD_MODEL;
  const endpoints = llamaUnloadEndpoints(baseUrl);
  const payload = { model: unloadModel };
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const res = await postJson(fetchImpl, endpoint, payload);
      if (res.ok) {
        return { attempted: true, succeeded: true, endpoint, model: unloadModel };
      }
      errors.push(`${endpoint}: HTTP ${res.status}`);
    } catch (err) {
      errors.push(`${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const stopCmd = env.LITTLE_CODER_LLAMACPP_STOP_CMD;
  if (stopCmd) {
    const result = spawnSyncImpl(stopCmd, {
      shell: true,
      stdio: "ignore",
      env,
    });
    if (result.status === 0) {
      return {
        attempted: true,
        succeeded: true,
        stopCommand: stopCmd,
        model: unloadModel,
      };
    }
    errors.push(`stop command failed with status ${result.status ?? "unknown"}`);
  }

  logger(`little-coder: unable to auto-unload llama.cpp model (${errors.join("; ")})`);
  return { attempted: true, succeeded: false, model: unloadModel, errors };
}
