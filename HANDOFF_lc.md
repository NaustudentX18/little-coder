# Handoff: lc (local-coder) Project

## Session Summary

### Goal
Build a brand-new agent harness project called "lc" (local-coder) that:
1. Wraps around pi-coding-agent exactly like little-coder does
2. Includes all roadmap features: custom branding, mobile support, themes, gesture navigation
3. Auto-discovers and connects to local llama.cpp models (qwen3.6-35b-a3b • medium)
4. Launches when user types `lc` in terminal

### What Was Built
Created `/home/pi/projects/lc-agent/` with:
- `bin/lc` — Launcher script (auto-discovers llama.cpp models, spawns pi runtime)
- `AGENTS.md` — System prompt with fox branding rules
- `src/themes/honey-fox.json` — Warm amber/orange theme
- `src/themes/neon-night.json` — Cyberpunk pink/blue theme
- `src/tui/gesture-handler.js` — Swipe gesture detection & scroll handling
- `src/tui/mobile-tui.js` — Mobile-optimized TUI layout
- `src/assets/logo.svg` — Fox head logo (SVG)
- `src/assets/logo-ascii.txt` — ASCII fallback logo
- `.pi/extensions/lc-model-discovery/` — Auto-discovers .gguf files
- `.pi/extensions/lc-theme-selector/` — Theme switching via slash commands
- `src/models/default-config.json` — Default qwen3.6-35b-a3b config
- `README.md` — Project documentation

### Key Architecture Decisions
1. **Launcher Pattern**: Mirrors little-coder's launcher exactly — spawns pi CLI with custom args
2. **Model Discovery**: Scans `~/.local/share/llama.cpp` and `~/Library/Application Support/llama.cpp` for .gguf files
3. **Theme System**: JSON-based theme configs following pi's theme-schema.json format
4. **Mobile Support**: GestureHandler + MobileTUI classes handle swipe gestures and scroll commands

### Files Modified/Created
- Created: `/home/pi/projects/lc-agent/` (full project)
- Created: `/home/pi/projects/little-coder-agent/ROADMAP_TUI_REDESIGN.md` (roadmap from earlier session)
- Created: `/home/pi/projects/little-coder-agent/HANDOFF_lc.md` (this file)

### Next Steps for Fresh Chat
1. Install dependencies: `cd /home/pi/projects/lc-agent && npm install`
2. Test launch: `./bin/lc` or `node ./bin/lc`
3. Verify model auto-discovery works with your qwen3.6-35b-a3b model
4. Test mobile layout by running in a narrow terminal (`COLUMNS=60`)
5. Try theme switching: `/theme neon`, `/theme honey`
6. Add more themes or customize existing ones

### Known Limitations
- Theme selector currently reads from project-relative paths — may need path adjustment if installed globally
- Gesture handling is best-effort; actual touch detection depends on terminal emulator support
- Model discovery scans standard paths only — use `LC_LOCAL_MODEL` env var for custom paths
