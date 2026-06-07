# Smart Router for little-coder — Handover (Pre-Push Safety Pass)

**Date:** 2026-06-07
**Session goal:** Add vision model support to the smart-router, then make the repo safe to push to the user's public GitHub (NaustudentX18/little-coder).

## TL;DR

- ✅ Smart-router with vision routing **shipped** to user's GitHub
- ✅ IP-leak scrubbed from history (autosquash fixup onto 1054b2e → 0efaac6)
- ✅ `.gitignore` restored from 5 → 47 lines, blocking sessions/auth/debug payload from future commits
- ✅ `.mcp.json` symlink untracked, replaced with `.mcp.json.example` template
- ✅ `OLLAMA_BASE_URL` in `~/.bashrc` set to PC's Tailscale Ollama (was cloud)
- ✅ All 61 smart-router tests green, `git status` clean, no local-only commits

## What landed on GitHub (NaustudentX18/little-coder, branch main)

```
777cd8a fix(safety): restore .gitignore patterns + untrack personal MCP config
9787dea wip: local save of remaining working-tree changes
0efaac6 feat(smart-router): add smart model router with vision routing  (was 1054b2e, rebased)
7a3446a feat: cloud models, MCP, FogosVault memory, SICA loop           (pre-existing, was unpushed)
```

The OLD `1054b2e` had a hardcoded `<pc-tailnet-ip>:11434` Tailscale IP leak. It's been
amended out of history via a `fixup!` commit + `git rebase --autosquash`. The dangling
old commit is unreachable and will be GC'd. `git fsck` confirmed.

## Smart-router — what it does, how to use

3-stage cascade, hooks `before_provider_request`, swaps the model in the payload.
Only fires for the `ollama` provider (other providers bypass; use `/local-models`).

**Categories & targets (defaults):**

| Category | Model | Notes |
|---|---|---|
| `code` | `qwen3-coder-next:latest` | 44.99 tok/s, 4.7x faster than old Q4 |
| `reasoning-deep` | `qwen3.6-apex-mtp:latest` | |
| `reasoning-fast` | `gpt-oss:20b` | |
| `chat` | `qwen3.5:9b` | |
| `web` | `glm-4.7-flash:latest` | |
| `tool` | `granite4.1:8b` | |
| `embed` | `nomic-embed-text:latest` | |
| `vision` | `gemma4:e4b` | **short-circuits the cascade** if image in payload |

**User controls:**
- `/router auto|off|<category>|<model-id>|status` — explicit mode
- Mode persists at `~/.config/little-coder/router.json`
- `LITTLE_CODER_ROUTER_DEBUG=1` — log every decision
- `LITTLE_CODER_ROUTER_FOOTER=0` — suppress TUI notification
- **`OLLAMA_BASE_URL` env var** — override the classifier/embed endpoint (default: `http://127.0.0.1:11434`)

**Vision short-circuit:** If `hasImageInPayload()` AND mode is `auto|vision`, skip the cascade and route to `gemma4:e4b`. Forced non-vision modes (code, chat, etc.) still win.

## Local setup (user's machine)

**`~/.bashrc` line 191 (just changed):**
```bash
export OLLAMA_BASE_URL="http://<pc-tailnet-ip>:11434"   # PC's Tailscale Ollama
```

This is what the smart-router reads to find the embed/LLM classifier endpoint.
Without it, the smart-router uses `http://127.0.0.1:11434` (Pi's local Ollama) instead.

PC reachability: HTTP 200 in ~6.5ms via Tailscale. Verified with `curl http://<pc-tailnet-ip>:11434/api/tags`.

**`.mcp.json` symlink on disk** still points at `/home/pi/.mcp.json` (filesystem MCP). It's
no longer in git tracking — your local symlink works fine, but if you ever recreate the
file, copy `.mcp.json.example` as the template.

**`OLLAMA_CLOUD_API_KEY`** and **`OLLAMA_LOCAL_API_KEY`** in `~/.bashrc` are unchanged.
`hive` TUI uses those + hardcodes the URL per mode, so changing `OLLAMA_BASE_URL`
shouldn't break hive.

## Test status

- **61/61** smart-router unit tests pass (`npx vitest run .pi/extensions/smart-router/`)
- **Safety test** (new, added in scrub): asserts `baseUrl` default is `127.0.0.1` AND
  fails if it ever matches RFC1918 / Tailscale CGNAT ranges — prevents regression
- Typecheck: 0 errors in smart-router code (pre-existing errors in `fogosvault-bridge/`
  and `pi-mcp-adapter/` are unrelated)
- Live test (from prior session): image → `gemma4:e4b` saw the image and answered in 4.2s

## Critical files

```
.pi/extensions/smart-router/
├── index.ts                 # main hook (vision short-circuit at L181)
├── router-config.ts         # DEFAULT_CONFIG (baseUrl L131)
├── router-config.test.ts    # safety guard test L44-50
├── cascade.ts
├── classifier-regex.ts      # Stage 1
├── classifier-embed.ts      # Stage 2 (uses config.ollama.baseUrl)
├── classifier-llm.ts        # Stage 3
├── detect-image.ts          # hasImageInPayload, visionClassify
└── README.md                # env var docs (OLLAMA_BASE_URL row added)

docs/
├── SESSION_HANDOVER_smart-router-2026-06-07.md        (base router)
└── SESSION_HANDOVER_smart-router-vision-2026-06-07.md (vision add-on)

.gitignore                   # restored: sessions/, auth.json, debug_payload.json, etc.
.mcp.json.example            # template (replaces the in-tree symlink)
```

## What was held back (intentionally NOT committed/pushed)

These were in the working tree but never committed. Safe to delete if you see them:

- `~/` (literal-tilde dir with stale `.fogosvault` from May 28) — DELETED this session
- `benchmarks/__pycache__/` (Python bytecode) — DELETED this session
- `configs/models.json.bak-20260603T0000-model-hookup` (stale backup) — DELETED this session

Working tree is clean: `git status` returns nothing.

## Audit trail — what was scanned before the push

| Scan | Hits | Notes |
|---|---|---|
| Private IPs (RFC1918 + Tailscale CGNAT 100.64/10) | 0 in final | Initial: 1 leak (`<pc-tailnet-ip>`), fixed via fixup+autosquash |
| API keys (sk-*, gho_*, ghp_*, AIzaSy*, xai-*, sk-ant-*, sk-or-*) | 0 | |
| Email addresses | 0 | |
| Phone numbers (AU mobile format) | 0 | False positives were model `size_bytes` values |
| SSN-like patterns | 0 | |
| Wild Earth / FWC / QHRC / case content | 0 | None in new commits |
| Clinician names (Pannu/Garg/Carrigan etc.) | 0 | |
| Long random strings (≥40 chars) | 0 | Only commit SHAs and filenames |
| Private key markers | 0 | |
| GitHub/GitLab URLs | 0 | (besides existing `itayinbarr/little-coder` upstream ref) |
| WiFi/SSID/Bluetooth | 0 | |
| Secret values (long random strings after assignment operators) | 0 | Only env-var NAMES like `GITHUB_TOKEN` (safe) |

## Known limitations / future work

1. **Cascade doesn't escalate** — if a category classifies wrong, the wrong model is used
2. **No per-category success tracking** — no thumbs up/down to rebalance
3. **Vision followups not re-routed** — if you ask "implement this UI" after a vision
   description, it goes through cascade again rather than going to coder directly
4. **No image preprocessing** — large images go straight to the model
5. **Multi-model voting not implemented** — Phase 2 idea
6. **`.mcp.json` symlink still on disk** — works locally but is broken for anyone who
   clones the repo (they need to create their own `.mcp.json` from `.mcp.json.example`)
7. **`.gitignore` could go further** — patterns for IDE state (`.idea/`, `.vscode/`),
   OS-specific (`Thumbs.db`), etc. could be added if those ever become noise

## Out-of-scope this session

- The `gutta`d `.gitignore` was fixed but the change is local — was committed+pushed
  as `777cd8a`
- The PC's Tailscale IP being a "leak" is mitigated by the env var pattern; if you ever
  want to remove the IP from git history entirely (e.g., for a CVE disclosure), the
  rebase was done locally so the dangling commit is GC-able. The pre-rebase history is
  not in any pushed branch.

## How to verify next session

```bash
cd /home/pi/projects/little-coder-agent

# 1. Working tree clean?
git status

# 2. Tests pass?
npx vitest run .pi/extensions/smart-router/

# 3. Env var set in interactive shell?
bash -i -c 'echo $OLLAMA_BASE_URL'   # → http://<pc-tailnet-ip>:11434

# 4. PC reachable?
curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" --max-time 5 http://<pc-tailnet-ip>:11434/api/tags

# 5. In a little-coder session, confirm smart-router is using the override:
#    /router status
#    Should show: ollama.baseUrl = http://<pc-tailnet-ip>:11434
#    (when LITTLE_CODER_ROUTER_DEBUG=1, you'll see: "using OLLAMA_BASE_URL=...")
```

## Try it in a session

```bash
cd /home/pi/projects/little-coder-agent
LITTLE_CODER_ROUTER_DEBUG=1 uv run pi  # or however you launch little-coder

# In-session:
/router status
# Should show: ollama.baseUrl = http://<pc-tailnet-ip>:11434, vision→gemma4:e4b

# Paste an image. Router swaps to gemma4:e4b. TUI footer: "→ gemma4:e4b (vision)"

/router vision          # force vision mode always
/router auto            # back to auto-classify
/router off             # disable routing
```

## Where to look in this repo

- `.pi/extensions/smart-router/README.md` — full usage
- `docs/SESSION_HANDOVER_smart-router-2026-06-07.md` — original router handover
- `docs/SESSION_HANDOVER_smart-router-vision-2026-06-07.md` — vision add-on handover
- `docs/SESSION_HANDOVER_smart-router-pre-push-safety-2026-06-07.md` — **this file**
- `~/.hermes/memories/MEMORY.md` — durable fact: smart-router is shipped, OLLAMA_BASE_URL pattern
