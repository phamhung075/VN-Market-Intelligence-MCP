## Task Report TSU-DEV-U1

changed:
- apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts (new, 53L)
- apps/mcp-server/src/interface/mcp/server.ts (proxy hook +20L, lines 261-277)
- apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts (rewrite, 62L)
- apps/mcp-server/src/scheduler/startScheduler.ts (wiring ±6L, line 779-784)
- apps/mcp-server/src/__tests__/TSU-DEV-U1-per-call-counter.test.ts (new, 113L)
- apps/mcp-server/src/__tests__/1299c-session-cache.test.ts (updated TC-7/TC-8)
- apps/mcp-server/src/__tests__/1356b-track-session-tool-usage-job-gaps.test.ts (updated TSU-1..8)
- docs/microservice/mcp-server/infrastructure.md (+14L)
- docs/handoffs/TASK_TSU-DEV-U1.md (new)

tests: 24 pass / 0 fail (TSU-DEV-U1: 8, 1299c: 8, 1356b: 8) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS
live: 6 MCP tool calls via /mcp streamable HTTP — get_market_snapshot×3, get_macro_snapshot×2, get_alerts×1 — all returned real data
counter: in-process singleton verified; mechanism traced (module-level Map, per-request proxy, Bun process-scoped module cache)
sessionCount: ABSENT from ToolUsageStats interface and from docs/agent-memory/modules/tool-usage-stats.json (3 keys only)
scope: git show --stat 829931b3 = 9 files, all U1 seam, no unrelated production files
flush: cron-only 0 */8 * * * — not yet materialized; residual noted per gate spec

verdict: APPROVED

qa_agent: 829931b3 | cycle-256 | 2026-06-13
