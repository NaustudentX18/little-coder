# Smart Router for little-coder — Session Handover

**Date:** 2026-06-07
**Session goal:** Build a smart model router for little-coder that auto-picks the right Ollama model per request.

## TL;DR

✅ **DONE.** Built `.pi/extensions/smart-router/` in `projects/little-coder-agent` — a 3-stage cascade (regex → embedding sim → tiny LLM) that hooks `before_provider_request` and swaps the model in the payload. **Live test: 10/10 expected categories routed correctly.** 50/50 unit tests pass, 0 type errors, 285/285 full suite green.

## What you can do now

Inside a little-coder session:

| Command | What it does |
|---|---|
| `/router status` | Show current mode, last 5 decisions, per-category tally |
| `/router auto` | Enable auto-routing (default on install) |
| `/router off` | Disable — use whatever the user picked |
| `/router code` / `reasoning-deep` / `reasoning-fast` / `chat` / `web` / `tool` / `embed` | Force a category |
| `/router qwen3.5:9b` | Pin a specific model id |
| `LITTLE_CODER_ROUTER_DEBUG=1` | Log every decision to `~/.config/little-coder/router-decisions.log` |

## Files changed/created

**Created (13 files in `.pi/extensions/smart-router/`):**
- `index.ts` — main entry, registers `/router` command + `before_provider_request` hook
- `router-config.ts` — types, default routing table, thresholds, exemplars
- `router-config.test.ts` — 9 tests
- `classifier-regex.ts` + `.test.ts` — Stage 1, 14 tests
- `classifier-embed.ts` + `.test.ts` — Stage 2, 10 tests
- `classifier-llm.ts` + `.test.ts` — Stage 3, 8 tests
- `cascade.ts` + `.test.ts` — orchestrator, 7 tests
- `README.md` — full documentation

**Modified:**
- `models.json` (shipped) — refreshed to 10 current Ollama models + 2 llamacpp + 1 lmstudio. Restored `LMSTUDIO_API_KEY` placeholder.
- `~/.config/little-coder/models.json` (user) — refreshed `ollama.models` to 10 current, preserved ollama-cloud (7 models) and llamacpp (1 placeholder)
- `~/.config/little-coder/models.json.bak.pre-router-20260607T122123` — backup of previous user config
- `~/.config/little-coder/router-embeddings.json` — built fresh (795 KB, 60 exemplars × 768-dim)
- `~/.hermes/skills/qwen-mtp-server-management/SKILL.md` — added cross-ref to smart-router
- `~/.hermes/memories/MEMORY.md` — pointer entry

## Routing table (defaults)

| Category | Model | Why |
|---|---|---|
| `code` | `qwen3-coder-next:latest` | Trained for code, 45 tok/s |
| `reasoning-deep` | `qwen3.6-apex-mtp:latest` | Flagship 35B-A3B + MTP, 55 tok/s |
| `reasoning-fast` | `gpt-oss:20b` | 62 tok/s, open reasoning |
| `chat` | `qwen3.5:9b` | 72 tok/s, fast small |
| `web` | `glm-4.7-flash:latest` | 36 tok/s, Zhipu frontend |
| `tool` | `granite4.1:8b` | 18 tok/s, clean tool output |
| `embed` | `nomic-embed-text:latest` | Embedding endpoint |

## Test results

**Live integration test (against `localhost:11434`):**
```
✓ code → qwen3-coder-next:latest (regex, conf 0.95)
✓ reasoning-fast → gpt-oss:20b (embed, conf 0.77)
✓ web → glm-4.7-flash:latest (regex, conf 0.90)
✓ chat → qwen3.5:9b (embed, conf 0.82)  ← "hi, how are you?" — regex misses, embed catches
✓ tool → granite4.1:8b (regex, conf 0.90)
✓ embed → nomic-embed-text:latest (regex, conf 0.95)
✓ reasoning-deep → qwen3.6-apex-mtp:latest (regex, conf 0.85)
✓ code → qwen3-coder-next:latest (regex, conf 0.95)
✓ chat → qwen3.5:9b (embed, conf 0.72)  ← "what's the weather like?"
✓ embed → nomic-embed-text:latest (regex, conf 0.95)
Score: 10/10 correct
```

**Unit tests:** 50/50 pass in `smart-router/`. Full suite 285/285 pass.

**Typecheck:** 0 errors in new code (pre-existing errors in pi-mcp-adapter unrelated).

## Key design decisions

1. **Only routes in `ollama` provider.** Cross-provider routing (e.g. → `ollama-cloud/DeepSeek`) deferred. Use `/local-models <name>` for that.
2. **Per-request payload swap, not session-wide `setModel()`.** This is what `BeforeProviderRequestEvent` was designed for — the user can keep their "primary" model in the TUI but the router overrides per-prompt.
3. **Exemplars cached to disk** at `~/.config/little-coder/router-embeddings.json`. Cold-start: ~10s to embed 60 phrases. After that: instant.
4. **Stage 3 (LLM) is opt-out via `LITTLE_CODER_ROUTER_DEBUG=0`** but defaults ON. The classifier only fires for prompts ≥100 chars (the `llmMinPromptLen` threshold) to keep short prompts fast.
5. **Stage 1 priority:** embed > web > tool > code-file > reasoning-deep > reasoning-fast > code-keyword. The order is designed so a prompt mentioning React OR file extensions goes to the right place even if "build" or "function" is in there.

## Open issues / known limitations

1. **No vision model.** If user attaches an image, the router doesn't try to handle it (no vision model installed). The payload swap will go through but the LLM might fail. Graceful — just won't route specially for image content.
2. **Embedding cold-start is slow** on first run. Subsequent runs are instant (cache hit).
3. **Stage 1 regex is brittle** for ambiguous prompts. Stage 2 (embed) catches most of those, but the LLM classifier (Stage 3) is the safety net.
4. **Routing decisions are session-scoped.** If you set `/router off` in session A, it doesn't affect session B.

## Where to look

- `projects/little-coder-agent/.pi/extensions/smart-router/README.md` — full docs
- `projects/little-coder-agent/.pi/extensions/smart-router/router-config.ts` — change defaults here
- `~/.config/little-coder/router.json` — current mode (auto/off/etc)
- `~/.config/little-coder/router-decisions.log` — decision history (with `LITTLE_CODER_ROUTER_DEBUG=1`)
- `~/.config/little-coder/router-embeddings.json` — cached embeddings

## Next session

If user wants to extend:
- **Vision model:** pull `ollama pull qwen3.6:35b` (vision) and add `vision` category → `qwen3.6:35b` with image-detection in `before_provider_request`
- **Per-category success tracking:** hook `message_end` or `turn_end`, log thumbs up/down, auto-rebalance thresholds
- **Cascade fallback:** try small model first, escalate on low-confidence response
- **Custom routing rules:** users can edit `router-config.ts` and re-run without rebuilding the extension
