# little-coder Debrief — What's Been Done & How You Work Now

## 1. Cloud Models (ollama-cloud)

You have **39 cloud models** via Ollama Cloud API. Use any with `--model ollama-cloud/<name>`.

Fastest: `ollama-cloud/deepseek-v4-flash`
Strongest reasoning: `ollama-cloud/deepseek-v4-pro`, `ollama-cloud/kimi-k2.6`
Heavy coder: `ollama-cloud/qwen3-coder:480b`, `ollama-cloud/deepseek-v3.2`

Default model profile is in `.pi/settings.json` under `model_profiles` with per-model temperature, thinking budget, etc.

## 2. MCP Servers (10 available)

A `pi-mcp-adapter` extension bridges `.mcp.json` servers into your toolset. Current servers:

| Server | Auth | Purpose |
|--------|------|---------|
| filesystem | none | File ops in `/home/pi` |
| docker | none | Docker commands |
| fetch | none | Web fetching |
| tailscale | TAILSCALE_API_KEY env | Network management |
| playwright | none | Browser automation |
| github | GITHUB_TOKEN env | GitHub API |
| postgres | none | local printios DB |
| sqlite | none | knowledge-base DB |
| minimax-websearch | MINIMAX_API_KEY env | Web search |
| context7 | none | Documentation lookup |

Secrets are referenced via env vars (`${GITHUB_TOKEN}`), not stored in plaintext.

## 3. FogosVault Memory

A ChromaDB-backed RAG memory system at `/home/pi/FogosVault/little-coder/src/memory_system.py`.

**How it works:**
- **Before each turn**: searches memory for context matching the user prompt — relevant memories are injected into your system prompt as "Relevant Memories"
- **After each turn**: assistant responses are summarized and stored as conversation memories
- **Python bridge**: `/home/pi/FogosVault/little-coder/src/memory_bridge.py` exposes add/search/stats via stdin/stdout JSON

Categories tracked: `mistake-pattern`, `best-practice`, `codebase-knowledge`, `preference`, `conversation`

## 4. Extensions Loaded (29 total)

Key ones:
- `mcp-adapter` — MCP server bridge (10 servers)
- `fogosvault-bridge` — memory auto-inject + persist
- `pi-continuous-learning` — background pattern learning
- `pi-browser` — browser automation
- Built-in: skill-inject, knowledge-inject, tool-gating, permission-gate, quality-monitor, checkpoint, evidence, browser, shell-session, etc.

All in `.pi/extensions/`.

## 5. SICA Self-Improvement Loop

Policy file: `.pi/rules/sica.policy.json`
Instructions: `.pi/instructions/sica.md`

After sessions, store learnings in FogosVault:
- Mistakes → `mistake-pattern`
- Wins → `best-practice`  
- New codebase facts → `codebase-knowledge`
- User preferences → `preference`

On next session, FogosVault auto-injects relevant memories so you compound improvements.

## 6. Config Files

| File | What |
|------|------|
| `~/.pi/agent/models.json` | Model registry (ollama + ollama-cloud) |
| `~/.pi/agent/settings.json` | Runtime settings, model roles, profiles |
| `~/.pi/agent/auth.json` | API keys |
| `~/.config/little-coder/models.json` | User model overrides |
| `~/.mcp.json` | MCP server definitions (secrets via env vars) |
| `~/.bashrc` | Env vars: OLLAMA_API_KEY, GITHUB_TOKEN, TAILSCALE_API_KEY, MINIMAX_API_KEY |
| `.pi/instructions/sica.md` | SICA meta-loop guide |
| `.pi/rules/sica.policy.json` | SICA policy config |

## 7. Quick Reference

```bash
# Cloud inference
little-coder --model ollama-cloud/deepseek-v4-flash -p "your prompt"

# List models
little-coder --list-models

# MCP status (inside session)
/mcp status
/mcp tools

# Manually search/add FogosVault (standalone)
echo '{"action":"search","query":"your query","top_k":5}' | python3 -u /home/pi/FogosVault/little-coder/src/memory_bridge.py
echo '{"action":"add","content":"memory text","category":"preference"}' | python3 -u /home/pi/FogosVault/little-coder/src/memory_bridge.py
```
