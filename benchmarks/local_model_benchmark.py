#!/usr/bin/env python3
"""Benchmark local little-coder models with cold/warm passes.

This runner:
  - inventories the local models exposed by little-coder
  - runs one cold pass and one warm pass per model
  - captures raw provider timings when available
  - captures a short quality answer for manual scoring

Outputs JSON to stdout and writes a copy to benchmarks/local_model_benchmark.json
for later analysis / ranking.
"""
from __future__ import annotations

import json
import os
import re
import argparse
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = Path(__file__).resolve().parent / "local_model_benchmark.json"
LC_BIN = Path("/home/pi/.local/bin/little-coder")

OLLAMA_BASE = os.environ.get("BENCH_OLLAMA_BASE", "http://127.0.0.1:11434")
LLAMACPP_BASE = os.environ.get("BENCH_LLAMACPP_BASE", "http://127.0.0.1:8001")
LMSTUDIO_BASE = os.environ.get("BENCH_LMSTUDIO_BASE", "http://127.0.0.1:1234")

SPEED_PROMPT = "Reply with exactly OK."
QUALITY_PROMPT = (
    "You are helping choose the safest implementation plan for a code change that "
    "touches model selection, startup behavior, and unload behavior. "
    "Give exactly 3 bullets. Each bullet must be short, specific, and actionable, "
    "with 8 words max. "
    "Include rollback, verification, one edge case, and one memory-safety concern."
)


@dataclass
class ModelInfo:
    provider: str
    model: str
    display: str
    context: str | None = None
    thinking: str | None = None
    images: str | None = None
    size_bytes: int | None = None
    parameter_billions: float | None = None


def http_json(url: str, payload: dict[str, Any] | None = None, timeout: int = 90) -> tuple[dict[str, Any], float]:
    data = None
    headers = {}
    method = "GET"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = Request(url, data=data, headers=headers, method=method)
    t0 = time.perf_counter()
    with urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
    elapsed = time.perf_counter() - t0
    return json.loads(body), elapsed


def estimate_token_count(text: str) -> int:
    words = re.findall(r"\S+", text.strip())
    return len(words)


def http_stream_jsonl(
    url: str,
    payload: dict[str, Any],
    *,
    timeout: int = 90,
    token_limit: int | None = None,
    extract_text: Any,
) -> tuple[dict[str, Any], float]:
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.perf_counter()
    text = ""
    last_chunk: dict[str, Any] = {}
    with urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            if not raw:
                continue
            line = raw.decode("utf-8").strip()
            if not line:
                continue
            chunk = json.loads(line)
            last_chunk = chunk if isinstance(chunk, dict) else {}
            delta = extract_text(last_chunk)
            if delta:
                text += str(delta)
                if token_limit is not None and estimate_token_count(text) >= token_limit:
                    break
            if last_chunk.get("done") is True:
                break
    elapsed = time.perf_counter() - t0
    last_chunk["_observed_text"] = text
    last_chunk["_observed_tokens"] = estimate_token_count(text)
    return last_chunk, elapsed


def parse_little_coder_list() -> list[ModelInfo]:
    raw = subprocess.check_output([str(LC_BIN), "--list-models"], text=True)
    models: list[ModelInfo] = []
    for line in raw.splitlines():
      # Table columns: provider model context max-out thinking images
        if not line or line.startswith("provider") or line.startswith("---"):
            continue
        parts = line.split()
        if len(parts) < 6:
            continue
        provider = parts[0]
        model = parts[1]
        if provider not in {"llamacpp", "ollama", "lmstudio"}:
            continue
        models.append(
            ModelInfo(
                provider=provider,
                model=model,
                display=model,
                context=parts[2],
                thinking=parts[4],
                images=parts[5],
            )
        )
    return models


def is_chat_ollama_model(model: str) -> bool:
    return "embed" not in model.lower()


def normalize_model_id(model: str) -> str:
    text = str(model or "").strip()
    return text[:-7] if text.endswith(":latest") else text


def ollama_models() -> dict[str, dict[str, Any]]:
    payload, _ = http_json(f"{OLLAMA_BASE}/api/tags", timeout=15)
    out: dict[str, dict[str, Any]] = {}
    for item in payload.get("models", []):
        mid = str(item.get("name") or item.get("model") or item.get("id") or "").strip()
        if mid and is_chat_ollama_model(mid):
            size = item.get("size")
            details = item.get("details") or {}
            out[mid] = {
                "size_bytes": int(size) if isinstance(size, int) else 0,
                "parameter_billions": parse_parameter_billions(details.get("parameter_size")),
            }
    return out


def parse_parameter_billions(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    m = re.search(r"([0-9]+(?:\\.[0-9]+)?)\\s*B", text, re.IGNORECASE)
    if not m:
        m = re.search(r"([0-9]+(?:\\.[0-9]+)?)", text)
    if not m:
        return None
    try:
        return float(m.group(1))
    except Exception:
        return None


def llamacpp_models() -> list[str]:
    try:
        payload, _ = http_json(f"{LLAMACPP_BASE}/v1/models", timeout=15)
    except Exception:
        return []
    out: list[str] = []
    data = payload.get("data") or []
    if isinstance(data, list):
        for item in data:
            mid = str(item.get("id") or item.get("name") or "").strip()
            if mid:
                out.append(mid)
    if not out:
        for item in payload.get("models", []):
            mid = str(item.get("model") or item.get("name") or "").strip()
            if mid:
                out.append(mid)
    return out


def lmstudio_models() -> list[str]:
    try:
        payload, _ = http_json(f"{LMSTUDIO_BASE}/v1/models", timeout=5)
    except Exception:
        return []
    out: list[str] = []
    for item in payload.get("data", []):
        mid = str(item.get("id", "")).strip()
        if mid:
            out.append(mid)
    return out


def ollama_generate(model: str, prompt: str, keep_alive: str | int) -> tuple[dict[str, Any], float]:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": keep_alive,
        "think": False,
        "options": {
            "temperature": 0,
            "num_predict": 1 if prompt == SPEED_PROMPT else 40,
        },
    }
    return http_json(f"{OLLAMA_BASE}/api/generate", payload=payload, timeout=90)


def ollama_chat(model: str, prompt: str, keep_alive: str | int) -> tuple[dict[str, Any], float]:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "keep_alive": keep_alive,
        "think": False,
        "options": {
            "temperature": 0,
            "num_predict": 1 if prompt == SPEED_PROMPT else 40,
        },
    }
    return http_json(f"{OLLAMA_BASE}/api/chat", payload=payload, timeout=90)


def ollama_chat_stream(model: str, prompt: str, keep_alive: str | int, token_limit: int) -> tuple[dict[str, Any], float]:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "keep_alive": keep_alive,
        "think": False,
        "options": {
            "temperature": 0,
            "num_predict": token_limit,
        },
    }
    return http_stream_jsonl(
        f"{OLLAMA_BASE}/api/chat",
        payload,
        timeout=90,
        token_limit=token_limit,
        extract_text=lambda chunk: chunk.get("message", {}).get("content", "") if isinstance(chunk.get("message"), dict) else "",
    )


def llamacpp_completion(model: str, prompt: str) -> tuple[dict[str, Any], float]:
    payload = {
        "model": model,
        "prompt": prompt,
        "temperature": 0,
        "max_tokens": 1 if prompt == SPEED_PROMPT else 40,
        "stream": False,
    }
    return http_json(f"{LLAMACPP_BASE}/v1/completions", payload=payload, timeout=90)


def llamacpp_completion_stream(model: str, prompt: str, token_limit: int) -> tuple[dict[str, Any], float]:
    payload = {
        "model": model,
        "prompt": prompt,
        "temperature": 0,
        "max_tokens": token_limit,
        "stream": True,
    }
    return http_stream_jsonl(
        f"{LLAMACPP_BASE}/v1/completions",
        payload,
        timeout=90,
        token_limit=token_limit,
        extract_text=lambda chunk: chunk.get("choices", [{}])[0].get("text", "") if isinstance(chunk.get("choices"), list) and chunk.get("choices") else "",
    )


def lmstudio_completion(model: str, prompt: str) -> tuple[dict[str, Any], float]:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 40,
        "stream": False,
    }
    return http_json(f"{LMSTUDIO_BASE}/v1/chat/completions", payload=payload, timeout=90)


def tokens_per_second(resp: dict[str, Any], elapsed: float) -> float | None:
    if "timings" in resp and isinstance(resp["timings"], dict):
        t = resp["timings"]
        if "predicted_per_second" in t:
            try:
                return float(t["predicted_per_second"])
            except Exception:
                pass
    usage = resp.get("usage") or {}
    if "eval_count" in resp and "eval_duration" in resp:
        try:
            return float(resp["eval_count"]) / (float(resp["eval_duration"]) / 1e9)
        except Exception:
            pass
    if "completion_tokens" in usage:
        try:
            return float(usage["completion_tokens"]) / elapsed
        except Exception:
            pass
    if "eval_count" in usage and "eval_duration" in usage:
        try:
            return float(usage["eval_count"]) / (float(usage["eval_duration"]) / 1e9)
        except Exception:
            pass
    observed = resp.get("_observed_tokens")
    if observed is not None:
        try:
            return float(observed) / elapsed
        except Exception:
            pass
    return None


def prompt_text(resp: dict[str, Any], provider: str) -> str:
    if provider == "ollama":
        if "response" in resp:
            return str(resp.get("response", ""))
        message = resp.get("message", {})
        if isinstance(message, dict):
            return str(message.get("content", ""))
        return ""
    if "choices" in resp and resp["choices"]:
        choice0 = resp["choices"][0]
        if "text" in choice0:
            return str(choice0.get("text", ""))
        msg = choice0.get("message", {})
        if isinstance(msg, dict):
            return str(msg.get("content", ""))
    return ""


def _timed_backend_call(
    provider: str,
    model: str,
    prompt: str,
    *,
    cold: bool,
    lite: bool,
) -> tuple[dict[str, Any], float]:
    if provider == "ollama":
        if lite:
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "keep_alive": 0 if cold else 300,
                "think": False,
                "options": {
                    "temperature": 0,
                    "num_predict": 1,
                },
            }
            return http_json(f"{OLLAMA_BASE}/api/chat", payload=payload, timeout=20)
        return ollama_chat_stream(model, prompt, 90, 1 if prompt == SPEED_PROMPT else 32)
    if provider == "llamacpp":
        if lite:
            payload = {
                "model": model,
                "prompt": prompt,
                "temperature": 0,
                "max_tokens": 1,
                "stream": False,
            }
            return http_json(f"{LLAMACPP_BASE}/v1/completions", payload=payload, timeout=20)
        return llamacpp_completion_stream(model, prompt, 1 if prompt == SPEED_PROMPT else 32)
    if provider == "lmstudio":
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 1 if prompt == SPEED_PROMPT else 32,
            "stream": False,
        }
        return http_json(f"{LMSTUDIO_BASE}/v1/chat/completions", payload=payload, timeout=20 if lite else 90)
    raise ValueError(f"unsupported provider: {provider}")


def measure_model(provider: str, model: str) -> dict[str, Any]:
    rows: dict[str, Any] = {"provider": provider, "model": model}
    backend = {
        "ollama": ollama_chat,
        "llamacpp": llamacpp_completion,
        "lmstudio": lmstudio_completion,
    }.get(provider)
    if backend is None:
        return {**rows, "status": "unsupported"}

    try:
        # cold speed
        if provider == "ollama":
            cold_resp, cold_elapsed = ollama_chat_stream(model, SPEED_PROMPT, 90, 1)
        elif provider == "llamacpp":
            cold_resp, cold_elapsed = llamacpp_completion_stream(model, SPEED_PROMPT, 1)
        else:
            cold_resp, cold_elapsed = backend(model, SPEED_PROMPT)  # type: ignore[misc]
    except TypeError:
        cold_resp, cold_elapsed = backend(model, SPEED_PROMPT)  # type: ignore[misc]
    except Exception as e:
        return {**rows, "status": "error", "error": f"cold: {e}"}

    # warm speed / quality
    try:
        if provider == "ollama":
            warm_resp, warm_elapsed = ollama_chat_stream(model, SPEED_PROMPT, 90, 1)
            quality_resp, quality_elapsed = ollama_chat_stream(model, QUALITY_PROMPT, 90, 32)
        elif provider == "llamacpp":
            warm_resp, warm_elapsed = llamacpp_completion_stream(model, SPEED_PROMPT, 1)
            quality_resp, quality_elapsed = llamacpp_completion_stream(model, QUALITY_PROMPT, 32)
        else:
            warm_resp, warm_elapsed = backend(model, SPEED_PROMPT)  # type: ignore[misc]
            quality_resp, quality_elapsed = backend(model, QUALITY_PROMPT)  # type: ignore[misc]
    except Exception as e:
        return {
            **rows,
            "status": "error",
            "cold": {
                "elapsed_s": round(cold_elapsed, 3),
                "tps": tokens_per_second(cold_resp, cold_elapsed),
                "response": prompt_text(cold_resp, provider)[:400],
            },
            "error": f"warm/quality: {e}",
        }

    rows.update({
        "status": "ok",
        "cold": {
            "elapsed_s": round(cold_elapsed, 3),
            "tps": tokens_per_second(cold_resp, cold_elapsed),
            "response": prompt_text(cold_resp, provider)[:400],
            "load_hint": cold_resp.get("load_duration"),
            "raw": cold_resp,
        },
        "warm": {
            "elapsed_s": round(warm_elapsed, 3),
            "tps": tokens_per_second(warm_resp, warm_elapsed),
            "response": prompt_text(warm_resp, provider)[:400],
            "raw": warm_resp,
        },
        "quality": {
            "elapsed_s": round(quality_elapsed, 3),
            "response": prompt_text(quality_resp, provider),
            "raw": quality_resp,
        },
    })
    return rows


def measure_model_lite(provider: str, model: str) -> dict[str, Any]:
    rows: dict[str, Any] = {"provider": provider, "model": model}
    try:
        cold_resp, cold_elapsed = _timed_backend_call(provider, model, SPEED_PROMPT, cold=True, lite=True)
    except Exception as e:
        return {**rows, "status": "error", "error": f"cold: {e}"}

    try:
        warm_resp, warm_elapsed = _timed_backend_call(provider, model, SPEED_PROMPT, cold=False, lite=True)
    except Exception as e:
        return {
            **rows,
            "status": "error",
            "cold": {
                "elapsed_s": round(cold_elapsed, 3),
                "tps": tokens_per_second(cold_resp, cold_elapsed),
                "response": prompt_text(cold_resp, provider)[:200],
                "raw": cold_resp,
            },
            "error": f"warm: {e}",
        }

    rows.update({
        "status": "ok",
        "cold": {
            "elapsed_s": round(cold_elapsed, 3),
            "tps": tokens_per_second(cold_resp, cold_elapsed),
            "response": prompt_text(cold_resp, provider)[:200],
            "raw": cold_resp,
        },
        "warm": {
            "elapsed_s": round(warm_elapsed, 3),
            "tps": tokens_per_second(warm_resp, warm_elapsed),
            "response": prompt_text(warm_resp, provider)[:200],
            "raw": warm_resp,
        },
        "quality": {
            "elapsed_s": None,
            "response": "",
            "raw": {},
            "skipped": True,
        },
    })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["lite", "full"], default=os.environ.get("BENCH_MODE", "lite"))
    args = parser.parse_args()
    lite_mode = args.mode == "lite"

    local_models: list[ModelInfo] = []
    ollama_inventory = ollama_models()
    for model_name, meta in ollama_inventory.items():
        local_models.append(
            ModelInfo(
                provider="ollama",
                model=model_name,
                display=model_name,
                size_bytes=int(meta.get("size_bytes") or 0),
                parameter_billions=meta.get("parameter_billions"),
            )
        )

    for model_name in llamacpp_models():
        local_models.append(
            ModelInfo(
                provider="llamacpp",
                model=model_name,
                display=model_name,
            )
        )

    for model_name in lmstudio_models():
        local_models.append(
            ModelInfo(
                provider="lmstudio",
                model=model_name,
                display=model_name,
            )
        )

    local_models.sort(
        key=lambda m: (
            0 if m.provider == "llamacpp" else 1 if m.provider == "ollama" else 2,
            (
                ollama_inventory.get(normalize_model_id(m.model), {}).get("parameter_billions")
                or ollama_inventory.get(normalize_model_id(m.model), {}).get("size_bytes")
                or 0
            )
            if m.provider == "ollama"
            else 0,
            m.model.lower(),
        )
    )

    results: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for m in local_models:
        key = (m.provider, m.model)
        if key in seen:
            continue
        seen.add(key)

        print(f"[bench] {m.provider}/{m.model}", file=sys.stderr)
        res = measure_model_lite(m.provider, m.model) if lite_mode else measure_model(m.provider, m.model)
        res["display_context"] = m.context
        if m.size_bytes is not None:
            res["size_bytes"] = m.size_bytes
        if m.parameter_billions is not None:
            res["parameter_billions"] = m.parameter_billions
        results.append(res)

    payload = {
        "mode": args.mode,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "models": results,
    }
    OUT_FILE.write_text(json.dumps(payload, indent=2, sort_keys=True))
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
