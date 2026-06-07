# Smart Model Router

A pi extension for [little-coder](../) that **auto-picks the right local Ollama model for each request**. You stop thinking about which model to use — the router classifies your prompt and swaps in the best match.

## Why

With 10+ Ollama models installed (Qwen3-Coder-Next, Qwen3.6-APEX-MTP, GPT-OSS, GLM-4.7, Granite, etc.), picking the right one per task is a real chore. The router does it for you. Speed matters too: a 12GB-VRAM RTX 4070 Ti runs a small model at ~70 tok/s but a heavy dense model at ~3 tok/s — **20x slower**. The wrong pick costs you minutes per request.

## How

Three-stage classifier cascade, cheap-first, plus a **vision short-circuit** that fires when the user message has an image attachment:

```
User prompt (with optional image)
   ↓
[Vision short-circuit]          image_url/image detected → route to gemma4:e4b
   ↓ no image
[1] Regex (~0ms, free)         catches file extensions, framework names, "embed", "run", etc.
   ↓ no high-confidence match
[2] Embedding sim (~50ms)      nomic-embed-text vs labelled exemplars
   ↓ still ambiguous
[3] Tiny LLM classifier (~500ms)   qwen3.5:9b with JSON prompt
   ↓
Map category → model → swap model in payload → ship
```

The cascade is hooked into pi's `BeforeProviderRequestEvent` — it transparently rewrites the model on every LLM call.

## Routing table

| Category | Trigger examples | Model |
|---|---|---|
| `code` | `.py` / `.ts` / `.go` file refs, "implement a function", "refactor" | `qwen3-coder-next:latest` |
| `reasoning-deep` | "prove", "derive", "analyze legal precedent", math, multi-step | `qwen3.6-apex-mtp:latest` |
| `reasoning-fast` | "summarize", "briefly", "what's the difference between X and Y" | `gpt-oss:20b` |
| `chat` | "hi, how are you?", "what's the weather" (catch-all) | `qwen3.5:9b` |
| `web` | "React component", "Tailwind", "CSS", "Vue", frontend keywords | `glm-4.7-flash:latest` |
| `tool` | "run npm", "git push", "use the browser tool", MCP/agent calls | `granite4.1:8b` |
| `embed` | "embed this", "vectorize", "cosine similarity", "nearest neighbors" | `nomic-embed-text:latest` |
| `vision` | Image attachment in user message (any image_url or image content) | `gemma4:e4b` |

Defaults live in `router-config.ts`. Override at runtime per category, or pin a specific model with `/router <model-id>`.

## Vision

Image attachments in user messages are **always routed to `gemma4:e4b`** (multimodal) when in `auto` or `vision` mode. The detection walks the message content array for `type: "image_url"` (OpenAI-style) or `type: "image"` (Anthropic-style) parts. Vision short-circuits the text cascade — it's a different kind of signal.

If you've forced a specific mode (e.g. `/router code`), images still go to that model — user override wins. Switch to `/router auto` or `/router vision` to re-enable image-based routing.

Supported image formats: PNG, JPEG, WebP via base64 or HTTP URL. The vision model is `gemma4:e4b` (8B params, ~4B effective, 9.6GB disk, fast on 12GB VRAM). `gemma4:26b` is also vision-capable — edit `DEFAULT_CONFIG.categories.vision` to swap.

## Commands

| Command | Effect |
|---|---|
| `/router auto` | Enable auto-routing (default) |
| `/router off` | Disable — use whatever the user picked |
| `/router code` | Force code category (routes to Qwen3-Coder-Next) |
| `/router reasoning-deep` / `reasoning-fast` | Force reasoning category |
| `/router chat` / `web` / `tool` / `embed` | Force a category |
| `/router qwen3.5:9b` | Pin a specific model by id |
| `/router status` | Show current mode, last 5 decisions, per-category tally |

## Configuration

Mode persists in `~/.config/little-coder/router.json`. Edit to pin a mode across sessions:

```json
{ "mode": "auto" }
```

Embeddings cache lives at `~/.config/little-coder/router-embeddings.json` — built on first run, ~10s for 60 phrases × 768-dim.

Decision log: `~/.config/little-coder/router-decisions.log` (one JSONL line per routing decision). Enable with `LITTLE_CODER_ROUTER_DEBUG=1`.

## Environment variables

| Var | Default | Effect |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Override the Ollama endpoint used by the embed + LLM classifiers. Set this to a tailnet/private URL if your Ollama runs on a separate host. |
| `LITTLE_CODER_ROUTER_DEBUG=1` | off | Log every routing decision to `router-decisions.log` + stderr |
| `LITTLE_CODER_ROUTER_FOOTER=0` | on | Suppress the TUI notification on each routed request |

## Tying it together

The router only runs in the `ollama` provider. For `ollama-cloud` or `llamacpp` providers, use `/local-models <name>` to switch first — the router will pick up from there.

If you want a different model for a category, edit `DEFAULT_CONFIG.categories` in `router-config.ts` (or persist a `router.json` with `mode: <category>`).

## Out of scope (Phase 2)

- Cascade fallback (try small model first, escalate if response looks bad)
- Per-category success tracking (log thumbs up/down, rebalance)
- Vision model routing (no vision model installed — graceful failure)
- Multi-model voting (run 2-3 models in parallel, pick best)

## Files

```
.pi/extensions/smart-router/
├── index.ts                # main extension entry — registerCommand + on(before_provider_request)
├── router-config.ts        # types, defaults, routing table, thresholds
├── router-config.test.ts
├── classifier-regex.ts     # Stage 1: regex classifier
├── classifier-regex.test.ts
├── classifier-embed.ts     # Stage 2: nomic-embed-text similarity
├── classifier-embed.test.ts
├── classifier-llm.ts       # Stage 3: qwen3.5:9b JSON classifier
├── classifier-llm.test.ts
├── detect-image.ts           # vision short-circuit (hasImageInPayload, visionClassify)
├── detect-image.test.ts
├── cascade.ts                # orchestrator
├── cascade.test.ts
└── README.md
```

## Tests

```bash
npx vitest run .pi/extensions/smart-router/    # 60 unit tests (10 of which are vision)
node --experimental-strip-types /tmp/integration-test-router.mjs   # live Ollama smoke
```
