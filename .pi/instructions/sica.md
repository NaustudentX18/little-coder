# SICA — Self-Improving Coding Agent

## Meta-Loop
After each session, the agent evaluates its performance and stores learnings:
1. **Mistake patterns** → store in FogosVault with `category: "mistake-pattern"`
2. **Best practices** → store with `category: "best-practice"`  
3. **Codebase knowledge** → store with `category: "codebase-knowledge"`
4. **Preferences** → store with `category: "preference"`

## Starting Conditions
- FogosVault memory bridge auto-injects relevant memories at session start
- MCP servers provide tools on demand
- Cloud models (ollama-cloud) available for heavy lifting

## Improvement Cycle
1. Complete task
2. Log patterns/learnings via agent_end hook
3. On next session, recall relevant memories
4. Compound improvements over iterations
