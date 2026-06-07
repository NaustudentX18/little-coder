# 🦊 local-coder — TUI Redesign Roadmap

> **From "little-coder" → "local-coder"** with a custom SVG logo, richer theme, conversation scrolling, and expanded feature set.

---

## Phase 0: Foundation & Branding

### 0.1 Rename to "local-coder"
- [ ] Update `APP_NAME` from `"little-coder"` → `"local-coder"` in config.js
- [ ] Update all references across the codebase (AGENTS.md, package.json, README)
- [ ] Update version banner text: `local-coder ▌ v1.8.2`

### 0.2 Custom SVG Logo
- [ ] Design a custom icon for "lc" — consider:
  - A fox head (play on "local" → "fox"谐音), or
  - A terminal bracket `⟨⟩` with a circuit pattern, or
  - A stylized `L` + `C` monogram with gradient-like ASCII art
- [ ] Create `assets/logo.svg` — optimized for terminal rendering (monochrome-friendly)
- [ ] Create `assets/logo-ascii.txt` — fallback ASCII art logo for terminals without truecolor
- [ ] Integrate logo into header: replace plain text "local-coder" with `[logo] local-coder ▌ v1.8.2`
- [ ] Add animated cursor to logo (honey-colored, blinking)

---

## Phase 1: Visual Overhaul — Theme & Colors

### 1.1 New Color Palette (Dark Mode Primary)
- [ ] Create `theme/dark-local.json` with a refined dark palette:
  ```json
  {
    "pageBg": "#0d1117",        // GitHub-dark inspired
    "cardBg": "#161b22",
    "border": "#30363d",
    "accent": "#f781bf",        // Pink-purple (fox tail)
    "accentAlt": "#58a6e7",      // Blue (code blocks)
    "success": "#3fb550",        // Green
    "error": "#f85149",          // Red
    "warning": "#d29921",        // Yellow
    "muted": "#6e7681",
    "dim": "#6e7681",
    "text": "#e6edf3",
    "userMsgBg": "#1a1f27",
    "assistantMsgBg": "#161b22",
    "toolPendingBg": "#1c2533",
    "toolSuccessBg": "#1a2e1a",
    "toolErrorBg": "#2e1a1a"
  }
  ```
- [ ] Create `theme/local-orange.json` — warm honey/amber theme (alternative)
- [ ] Add `theme/neon-night.json` — cyberpunk-inspired with neon accents

### 1.2 Enhanced Visual Elements
- [ ] Add **gradient-like borders** using double-line box drawing: `╭───╮` style
- [ ] Add **status indicator dots** (●) next to model name, MCP count, context usage
- [ ] Add **animated separator lines** between messages (fading dashes `·····`)
- [ ] Add **progress ring** around logo for context window usage
- [ ] Add **sparkle/emoji reactions** to assistant messages (configurable)

### 1.3 Typography Improvements
- [ ] Support truecolor (24-bit) terminal output when available
- [ ] Add proportional font fallback for wider terminals
- [ ] Improve emoji rendering with `nerd-fonts` detection

---

## Phase 2: Conversation Scrolling & Touch Support

### 2.1 Swipe Gesture Support
- [ ] Detect mobile terminal (TERM variable, $COLUMNS < 100)
- [ ] Add touch-drag scroll for conversation area when content overflows viewport
- [ ] Implement **momentum scrolling** — swipe up/down to navigate conversation history
- [ ] Add **scroll indicator** (small arrow or `↑` / `↓`) when content is off-screen
- [ ] Support **two-finger scroll** on touchscreens

### 2.2 Conversation Navigation
- [ ] Add `/scroll top` — jump to beginning of conversation
- [ ] Add `/scroll bottom` — jump to latest messages
- [ ] Add `/scroll page +` / `-` — navigate by viewport-sized pages
- [ ] Add **jump-to-message** with number: `/goto 5`
- [ ] Add **search in conversation**: `/find <query>` highlights matches

### 2.3 Visual Scroll Hints
- [ ] Show scroll indicator when content is truncated
- [ ] Animate scroll arrows when content extends beyond viewport
- [ ] Add "peek" animation when new messages arrive (subtle bounce)

---

## Phase 3: Expanded Features & Functions

### 3.1 Session Management
- [ ] **Quick session switcher** — `/sessions` lists recent sessions with preview
- [ ] **Session templates** — save common prompt patterns as templates
- [ ] **Conversation export** — `/export markdown` / `/export json` / `/export html`
- [ ] **Session import** — load from file or URL

### 3.2 Tool Enhancement
- [ ] **Tool result preview** — collapse large outputs by default, expand on tap
- [ ] **Tool output diff viewer** — side-by-side comparison for edits
- [ ] **Bash output pager** — `less`-style paging for long command outputs
- [ ] **Image viewer** — render base64 images inline with terminal escape sequences

### 3.3 Agent Capabilities
- [ ] **Multi-agent mode** — spawn sub-agents for parallel tasks
- [ ] **Agent memory** — persist conversation context across sessions
- [ ] **Scheduled tasks** — `/schedule "check PR #123 every 5min"`
- [ ] **Webhook integrations** — send results to Slack, Discord, Telegram

### 3.4 Status & Diagnostics
- [ ] **Resource monitor** — show CPU/memory/disk usage in footer
- [ ] **Token cost tracker** — real-time cost estimation per session
- [ ] **Latency gauge** — show response time per model call
- [ ] **Health check** — `/health` shows model status, MCP servers, git state

---

## Phase 4: Mobile Optimization

### 4.1 Responsive Layout
- [ ] Detect small terminals (< 80 columns) and switch to mobile layout
- [ ] Stack header/footer vertically on narrow screens
- [ ] Collapse keybinding hints into `/help` on mobile
- [ ] Optimize message rendering for vertical scrolling (single column)

### 4.2 Touch-Friendly Interactions
- [ ] Replace keyboard shortcuts with tap-friendly alternatives
- [ ] Add swipe-to-delete messages
- [ ] Add pull-to-refresh for new model responses
- [ ] Long-press for context menu (copy, share, fork)

### 4.3 Mobile-Specific Commands
- [ ] `/voice` — start voice input mode (if microphone available)
- [ ] `/share` — generate shareable link to conversation
- [ ] `/bookmark` — save current view for later reference

---

## Phase 5: Polish & Performance

### 5.1 Performance
- [ ] Virtual scrolling for large conversations (> 100 messages)
- [ ] Debounced re-renders during rapid tool execution
- [ ] Lazy-load tool output expansion (only render visible content)

### 5.2 Accessibility
- [ ] Screen reader support (ARIA-like announcements for TUI)
- [ ] High contrast mode for colorblind users
- [ ] Reduced motion option (`--no-animation` flag)

### 5.3 Documentation
- [ ] Update README with new features
- [ ] Add `/cheatsheet` command showing all keyboard shortcuts
- [ ] Add interactive tutorial on first launch

---

## Implementation Priority (Recommended Order)

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Rename to "local-coder" + config update | Low | High — brand identity |
| **P0** | Custom SVG/ASCII logo | Medium | High — visual identity |
| **P1** | New dark theme (dark-local.json) | Medium | High — immediate visual upgrade |
| **P1** | Scroll indicators + jump commands | Medium | High — usability on mobile |
| **P2** | Mobile responsive layout | Medium | High — phone UX |
| **P2** | Tool output collapsing/expanding | Low | Medium — cleaner output |
| **P3** | Token cost tracker | Low | Medium — transparency |
| **P3** | Session management (/sessions) | Medium | Medium — workflow |
| **P4** | Multi-agent mode | High | High — capability expansion |
| **P5** | Voice input / Webhooks | High | Niche — specific use cases |

---

## Files to Modify

```
config.js                    → APP_NAME, VERSION
interactive-mode.js          → Header rendering, scroll handling
theme/light.json           → New color vars
theme/dark-local.json      ← NEW: custom dark theme
assets/logo.svg            ← NEW: custom logo
assets/logo-ascii.txt      ← NEW: ASCII fallback
footer.js                  → Enhanced status display
user-message.js            → Mobile-friendly rendering
assistant-message.js       → Collapsible outputs
keybindings.js             → Add scroll commands
```

---

## Testing Checklist

For each phase, verify:
- [ ] Works on 80-column terminal (standard desktop)
- [ ] Works on 40-column terminal (mobile portrait)
- [ ] Works with 256-color vs truecolor terminals
- [ ] Works with `tmux` nested sessions
- [ ] Works with `screen`
- [ ] No crashes on rapid tool execution
- [ ] Memory usage < 200MB for 100-message conversation
- [ ] Scroll feels smooth (no jank on touch devices)
- [ ] Logo renders correctly in monochrome mode
