# little-coder — handover note

## What this repo is

`little-coder` is a small, reproducible coding harness built on top of `pi` for local-model workflows. It keeps the tool surface compact, ships curated local-model defaults, and supports llama.cpp, Ollama, and LM Studio.

## What’s currently in place

- Live local-model discovery for Ollama.
- A local-only `/local-models` picker in the TUI.
- Automatic llama.cpp unload behavior when switching to non-llama local models.
- Public-facing docs and the landing page have been cleaned to avoid leaking private LAN details.
- Benchmark outputs are ignored so they do not get committed accidentally.

## Public-safe launch summary

Install:

```bash
npm install -g little-coder
# or
bun add -g little-coder
# or
curl -fsSL https://raw.githubusercontent.com/itayinbarr/little-coder/main/install.sh | bash
```

Run:

```bash
little-coder --list-models
little-coder --model llamacpp/qwen3.6-35b-a3b
little-coder --model ollama/qwen3.5
little-coder --model lmstudio/local-model
```

Local providers should be configured with environment variables or user overrides instead of hardcoding machine-specific endpoints into the repo.

## Verification already completed

- `npm test`
- `npm run typecheck`
- JSON parsing for the shipped config files
- `git diff --check`
- repo scan for accidental private LAN / machine-name leakage in tracked files

## Notes for future maintainers

- Keep public docs generic and safe for GitHub.
- Keep machine-specific benchmark artifacts out of commits.
- If you change the local model catalog, re-run `little-coder --list-models` and the test suite before pushing.
- If you touch the landing page, preserve the truthful public messaging and the current version markers.
