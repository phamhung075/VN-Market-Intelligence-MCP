## Task Report FIX-SIGNALS-STOCK-FULL-DETAIL

changed: [
  apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts (new, 187L),
  apps/mcp-server/src/interface/mcp/server.ts (-66L extraction to handler),
  apps/mcp-server/src/__tests__/FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts (new, 431L),
  docs/agent-memory/decisions/sprint-FE-PAGE-REORG-dev-mcp-server.md (+9L DJ entry),
  docs/agent-memory/notebooks/dev-mcp-server.md (+10L)
]

tests: 22 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0

genericity: PASS — querySignalsForStock passes finding_data through generically for ALL signal types (no signal_type switch); no ticker hardcode; null finding_data → null (no fabrication)
no-fake-data: PASS — unparseable JSON → null, not {} or empty string; normalizeCreatedAt returns null on NaN (honest failure)
dj-gate-1: PASS — sprint-FE-PAGE-REORG-dev-mcp-server.md §dev-mcp-server-S5 contains task-id: FIX-SIGNALS-STOCK-FULL-DETAIL

verdict: APPROVED
