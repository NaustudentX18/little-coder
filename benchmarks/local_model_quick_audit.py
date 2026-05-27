#!/usr/bin/env python3
"""Fast proxy audit for all local little-coder models.

This is intentionally lightweight: it does not run long model prompts.
Instead it combines live provider metadata with configuration inventory to
produce a quick, usable estimate of speed, cold-start pain, quality, and a
four-way ranking set for local models.
"""
from __future__ import annotations

import json
import math
import os
import re
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = Path(__file__).resolve().parent / "local_model_quick_audit.json"
CONFIG_FILE = REPO_ROOT / "models.json"

OLLAMA_BASE = os.environ.get("BENCH_OLLAMA_BASE", "http://127.0.0.1:11434")
LLAMACPP_BASE = os.environ.get("BENCH_LLAMACPP_BASE", "http://127.0.0.1:8001")
LMSTUDIO_BASE = os.environ.get("BENCH_LMSTUDIO_BASE", "http://127.0.0.1:1234")


@dataclass
class ModelRow:
    provider: str
    model: str
    source: str
    live: bool
    size_bytes: int | None = None
    parameter_billions: float | None = None
    context_window: int | None = None
    max_tokens: int | None = None
    reasoning: bool | None = None
    input_modes: list[str] | None = None
    warm_tps_est: float | None = None
    cold_start_s_est: float | None = None
    warm_first_token_s_est: float | None = None
    quality_score_est: float | None = None
    recommendation_score: float | None = None
    best_suited_for: str | None = None
    notes: str | None = None


def parse_parameter_billions(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*B", text, re.IGNORECASE)
    if not m:
        m = re.search(r"([0-9]+(?:\.[0-9]+)?)", text)
    if not m:
        return None
    try:
        return float(m.group(1))
    except Exception:
        return None


def normalize_model_id(model: str) -> str:
    text = str(model or "").strip()
    return text[:-7] if text.endswith(":latest") else text


def fetch_json(url: str, timeout: int = 8) -> dict[str, Any]:
    with urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def provider_live(base_url: str) -> bool:
    try:
        fetch_json(f"{base_url}/v1/models", timeout=6)
        return True
    except Exception:
        return False


def load_ollama_live() -> dict[str, dict[str, Any]]:
    try:
        payload = fetch_json(f"{OLLAMA_BASE}/api/tags", timeout=8)
    except Exception:
        return {}
    out: dict[str, dict[str, Any]] = {}
    for item in payload.get("models", []):
        mid = str(item.get("name") or item.get("model") or item.get("id") or "").strip()
        if not mid:
            continue
        if "embed" in mid.lower():
            continue
        size = item.get("size")
        details = item.get("details") or {}
        out[normalize_model_id(mid)] = {
            "size_bytes": int(size) if isinstance(size, int) else None,
            "parameter_billions": parse_parameter_billions(details.get("parameter_size")),
            "context_window": 65536 if "35b" in mid.lower() else 32768,
            "max_tokens": 4096,
            "reasoning": True,
            "input_modes": ["text"],
            "source": "live-ollama-tags",
        }
    return out


def load_config_models() -> list[dict[str, Any]]:
    if not CONFIG_FILE.exists():
        return []
    payload = json.loads(CONFIG_FILE.read_text())
    models: list[dict[str, Any]] = []
    for provider, cfg in (payload.get("providers") or {}).items():
        for model in cfg.get("models") or []:
            models.append(
                {
                    "provider": provider,
                    "model": str(model.get("id") or "").strip(),
                    "source": "models.json",
                    "live": False,
                    "size_bytes": None,
                    "parameter_billions": parse_parameter_billions(model.get("name")),
                    "context_window": model.get("contextWindow"),
                    "max_tokens": model.get("maxTokens"),
                    "reasoning": model.get("reasoning"),
                    "input_modes": model.get("input"),
                }
            )
    return models


def family_bonus(model: str, provider: str) -> float:
    mid = model.lower()
    if provider == "llamacpp":
        return 1.08
    if "qwen3.6" in mid:
        return 1.06
    if "qwen3.5" in mid:
        return 1.0
    if "qwen3" in mid:
        return 0.97
    if "mistral" in mid:
        return 0.98
    if "gemma4" in mid:
        return 1.00
    if "nemotron" in mid:
        return 1.03
    if "glm" in mid:
        return 0.96
    if "granite" in mid:
        return 0.92
    if "local-model" in mid:
        return 0.65
    return 0.9


def parse_params_from_model_id(model: str) -> float | None:
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*b", model.lower())
    if not m:
        return None
    try:
        return float(m.group(1))
    except Exception:
        return None


def infer_params(row: dict[str, Any]) -> float | None:
    if row.get("parameter_billions") is not None:
        return float(row["parameter_billions"])
    parsed = parse_params_from_model_id(row["model"])
    if parsed is not None:
        return parsed
    if row["provider"] == "lmstudio":
        return 7.0
    return None


def estimate_speed(params_b: float | None) -> float | None:
    if params_b is None or params_b <= 0:
        return None
    # Tuned to produce reasonable relative ordering for the current local set.
    return round(250.0 / (params_b ** 0.8), 1)


def estimate_cold_start(size_bytes: int | None, live: bool) -> float | None:
    if not live:
        return None
    if size_bytes is None or size_bytes <= 0:
        return 8.0
    size_gb = size_bytes / 1_000_000_000
    return round(4.5 + size_gb * 1.6, 1)


def estimate_warm_first_token(params_b: float | None, live: bool) -> float | None:
    if not live:
        return None
    if params_b is None:
        return 1.8
    return round(0.7 + 0.12 * math.sqrt(params_b), 1)


def estimate_quality(params_b: float | None, provider: str, model: str, live: bool) -> float | None:
    if params_b is None:
        return 0.0 if not live else 3.0
    bonus = family_bonus(model, provider)
    availability = 1.0 if live else 0.35
    return round(params_b * bonus * availability, 2)


def suit_for(params_b: float | None, live: bool, provider: str) -> str:
    if not live:
        return "unavailable"
    if params_b is None:
        return "fallback / unknown size"
    if params_b <= 10:
        return "fast triage, short edits"
    if params_b <= 18:
        return "general coding, planning"
    if params_b <= 28:
        return "deeper reasoning, refactors"
    return "hard reasoning, broad context"


def main() -> int:
    t0 = time.perf_counter()
    ollama_live = load_ollama_live()
    providers_live = {
        "ollama": bool(ollama_live),
        "llamacpp": provider_live(LLAMACPP_BASE),
        "lmstudio": provider_live(LMSTUDIO_BASE),
    }

    rows: list[ModelRow] = []
    seen: set[tuple[str, str]] = set()

    # Live Ollama models from the endpoint are the authoritative current inventory.
    for model_id, meta in sorted(
        ollama_live.items(),
        key=lambda kv: (
            kv[1].get("parameter_billions") or kv[1].get("size_bytes") or 0,
            kv[0],
        ),
    ):
        key = ("ollama", model_id)
        seen.add(key)
        params_b = infer_params({"provider": "ollama", "model": model_id, **meta})
        speed = estimate_speed(params_b)
        quality = estimate_quality(params_b, "ollama", model_id, True)
        rows.append(
            ModelRow(
                provider="ollama",
                model=model_id,
                source="live-ollama-tags",
                live=True,
                size_bytes=meta.get("size_bytes"),
                parameter_billions=params_b,
                context_window=meta.get("context_window"),
                max_tokens=meta.get("max_tokens"),
                reasoning=meta.get("reasoning"),
                input_modes=meta.get("input_modes"),
                warm_tps_est=speed,
                cold_start_s_est=estimate_cold_start(meta.get("size_bytes"), True),
                warm_first_token_s_est=estimate_warm_first_token(params_b, True),
                quality_score_est=quality,
                recommendation_score=round((quality or 0) * 0.55 + (speed or 0) * 0.35 + 8 * 0.10, 2),
                best_suited_for=suit_for(params_b, True, "ollama"),
                notes="Live Ollama tag; proxy estimate only.",
            )
        )

    # Config-defined models ensure we cover the current little-coder harness surface.
    for cfg in load_config_models():
        key = (cfg["provider"], cfg["model"])
        if key in seen or not cfg["model"]:
            continue
        live = providers_live.get(cfg["provider"], False)
        params_b = infer_params(cfg)
        speed = estimate_speed(params_b) if live else None
        quality = estimate_quality(params_b, cfg["provider"], cfg["model"], live) if live else 0.0
        rows.append(
            ModelRow(
                provider=cfg["provider"],
                model=cfg["model"],
                source="models.json",
                live=live,
                size_bytes=cfg.get("size_bytes"),
                parameter_billions=params_b,
                context_window=cfg.get("context_window"),
                max_tokens=cfg.get("max_tokens"),
                reasoning=cfg.get("reasoning"),
                input_modes=cfg.get("input_modes"),
                warm_tps_est=speed,
                cold_start_s_est=estimate_cold_start(cfg.get("size_bytes"), live),
                warm_first_token_s_est=estimate_warm_first_token(params_b, live),
                quality_score_est=quality,
                recommendation_score=round((quality or 0) * 0.55 + (speed or 0) * 0.35 + (8 if live else -8) * 0.10, 2),
                best_suited_for=suit_for(params_b, live, cfg["provider"]),
                notes=("Provider unavailable right now." if not live else "Config-defined model; proxy estimate only."),
            )
        )

    # Add an explicit live-status summary so the audit is honest.
    provider_summary = {
        p: {
            "live": live,
            "source": ("api/tags" if p == "ollama" and live else "v1/models probe"),
        }
        for p, live in providers_live.items()
    }

    def rank_rows(key: str, reverse: bool = True) -> list[dict[str, Any]]:
        items = [asdict(r) for r in rows]
        return sorted(
            items,
            key=lambda x: (
                x.get(key) is None,
                -(x.get(key) or 0) if reverse else (x.get(key) or 0),
                0 if x.get("live") else 1,
                x["provider"],
                x["model"],
            ),
        )

    payload = {
        "mode": "proxy",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "duration_s": round(time.perf_counter() - t0, 3),
        "providers": provider_summary,
        "models": [asdict(r) for r in rows],
        "rankings": {
            "speed_first": rank_rows("warm_tps_est"),
            "quality_first": rank_rows("quality_score_est"),
            "balanced_agent_first": rank_rows("recommendation_score"),
            "memory_friendly": sorted(
                [asdict(r) for r in rows],
                key=lambda x: (
                    x.get("size_bytes") is None,
                    x.get("size_bytes") or 0,
                    0 if x.get("live") else 1,
                    x["provider"],
                    x["model"],
                ),
            ),
        },
    }
    OUT_FILE.write_text(json.dumps(payload, indent=2, sort_keys=True))
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
