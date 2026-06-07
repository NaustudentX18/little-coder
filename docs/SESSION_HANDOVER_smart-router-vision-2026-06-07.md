# Smart Router for little-coder — Vision Support Added

**Date:** 2026-06-07
**Session goal:** Add vision model support to the smart-router (no new model pull needed — `gemma4:e4b` is already multimodal).

## TL;DR

✅ **DONE.** Smart-router now detects image attachments in user messages and routes them to `gemma4:e4b` (already installed, vision-capable). **10/10 vision router tests pass, vision model verified working live, 60/60 unit tests, 295/295 full suite, 0 type errors.**

## Key finding: no new pull needed

`ollama show gemma4:e4b` and `gemma4:26b` both list **`vision` as a capability** (along with `audio`, `tools`, `thinking`). Gemma 4 is multimodal out of the box. Using `gemma4:e4b` for vision:

- 8B params (~4B effective — the "e4b" suffix)
- 9.6 GB on disk
- Vision input via OpenAI-compat `image_url` content type
- ~95 tok/s on text (per benchmark); vision adds ~5s cold start

No new model pulled. No disk used. Just routing.

## What changed

**Created:**
- `.pi/extensions/smart-router/detect-image.ts` — `hasImageInPayload()` walks the messages array for `type: "image_url"` (OpenAI) or `type: "image"` (Anthropic) content parts. Returns true if the last user message has any image.
- `.pi/extensions/smart-router/detect-image.test.ts` — 10 tests covering OpenAI/Anthropic formats, last-message semantics, text-only payload, null/edge cases.

**Modified:**
- `router-config.ts` — added `"vision"` to `Category` union, `CATEGORIES` array, and `DEFAULT_CONFIG.categories` (→ `gemma4:e4b`). Added 5 vision exemplars to `examples`.
- `index.ts` — added vision short-circuit in `before_provider_request`. Order:
  1. If `hasImageInPayload(event.payload)` AND mode is `auto` or `vision` → route to vision model
  2. Else if mode is `auto` → run cascade
  3. Else (forced mode) → use forced model (user override wins)
- `README.md` — added vision section, updated routing table, updated test count
- `~/.hermes/memories/MEMORY.md` — vision info added

## Routing behavior

| Mode | Has image | Result |
|---|---|---|
| `auto` | yes | Routes to `gemma4:e4b` (vision) — cascade skipped |
| `auto` | no | Cascade runs (regex → embed → llm) |
| `vision` | yes | Routes to `gemma4:e4b` |
| `vision` | no | Routes to `gemma4:e4b` anyway (mode forces it) |
| `code` / `chat` / `web` / `tool` / `embed` / `<model>` | yes | User override wins — image goes to forced model |
| `off` | yes | No routing — image goes to whatever was active |

## Live test results

**Vision model smoke test (gemma4:e4b + 1x1 PNG):**
```
Tokens: prompt=100 completion=353
Content: "I cannot see a clear image to determine if it is a red square, a blue circle, or a green triangle. The image provided appears corrupted."
Reasoning: "The user has presented an image and asked me to identify its shape/color combination from three options..."
✓ Vision model works (saw image, returned response)
```
4.2 seconds total. Model saw the image and answered (correctly identified it as too small to recognize). 100 prompt tokens for image+text.

**Router integration test (mocked payload):**
```
✓ text-only, auto mode: routed=false target=qwen3.5:9b
✓ text-only, vision mode: routed=false target=qwen3.5:9b
✓ OpenAI image, auto mode: routed=true target=gemma4:e4b
✓ OpenAI image, vision mode: routed=true target=gemma4:e4b
✓ Anthropic image, auto mode: routed=true target=gemma4:e4b
✓ image, code mode (forced, no override): routed=false target=qwen3.5:9b
✓ image, off mode: routed=false target=qwen3.5:9b

7/7 pass, 0 fail
```

**Unit tests:**
- 60/60 pass in `.pi/extensions/smart-router/` (was 50, added 10 for vision)
- 295/295 pass in full suite
- 0 type errors in new code

## Try it in a session

```bash
cd /home/pi/projects/little-coder-agent
# Launch little-coder (your normal way)
# In-session:
/router status
# Should show: mode=auto, vision→gemma4:e4b in the routing table

# Paste an image into the chat. The router will swap to gemma4:e4b automatically.
# You should see in the TUI: → gemma4:e4b (vision)

# To force vision always:
/router vision
# Now text-only also goes to gemma4:e4b (faster but lower quality)
```

## Limits / known issues

1. **1x1 PNGs don't work well for testing** — model says "image appears corrupted" because there's nothing to see. Use real images for actual testing.
2. **Vision is in 12GB VRAM** — `gemma4:e4b` uses ~6GB, leaves headroom. `gemma4:26b` (17GB on disk) would be slow due to offload.
3. **No image preprocessing** — large images go straight to the model. If you have multi-MB screenshots, consider resizing first.
4. **Vision routing only fires for the last user message** — multi-turn conversations with images in older messages won't be re-routed (the model that handled them should already be vision-capable).

## Files

```
.pi/extensions/smart-router/
├── cascade.ts
├── cascade.test.ts
├── classifier-embed.ts
├── classifier-embed.test.ts
├── classifier-llm.ts
├── classifier-llm.test.ts
├── classifier-regex.ts
├── classifier-regex.test.ts
├── detect-image.ts          # NEW: hasImageInPayload, visionClassify
├── detect-image.test.ts     # NEW: 10 tests
├── index.ts                 # modified: vision short-circuit
├── README.md                # modified: vision section
├── router-config.ts         # modified: vision category
└── router-config.test.ts
```

## Where to look

- `.pi/extensions/smart-router/detect-image.ts` — the detection logic
- `.pi/extensions/smart-router/index.ts:181` — vision short-circuit in the hook
- `.pi/extensions/smart-router/router-config.ts:60` — `vision: "gemma4:e4b"` in the routing table
- `~/.hermes/memories/MEMORY.md` — updated memory entry
- `docs/SESSION_HANDOVER_smart-router-2026-06-07.md` — original router handover (still accurate)

## Future ideas (not implemented)

1. **Image preprocessing** — resize large images to 1024x1024 before sending (could improve speed/quality)
2. **Vision-aware cascade** — after vision model describes the image, route the followup to the right model (e.g. "implement this UI" → coder)
3. **Multiple vision models** — `gemma4:26b` for high-quality, `gemma4:e4b` for fast. Pick based on image size.
4. **Vision metadata** — track what kind of images (screenshots, photos, charts) and route accordingly
