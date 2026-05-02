# Claude Manager Helper — Notebook

**Last cycle:** 2026-05-02

## Recurring Patterns

### 2026-05-02: agent-memory path root cause
agentMemoryTools.ts and agentMemoryUpdateTools.ts used `process.cwd()` which resolves to `apps/mcp-server/` when running locally. Fixed with `AGENT_MEMORY_DIR` env var + `../../docs/agent-memory` fallback. Docker-compose updated with volume mount + env var.

### watch: agent-roster.md agent counts
Hardcoded numbers drift quickly. Always replace with pointer to `docs/data/project-stats.json`.

### watch: SPRINT_GOAL.md
PO often adds closed sprint rows without removing old ones. Trim to keep ≤30 lines (last 3 closed sprints only).
