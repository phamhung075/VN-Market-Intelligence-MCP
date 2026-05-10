# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-10 22:45 UTC (Cycle 10 close) | **ctx at checkpoint:** ~mid-conversation

## Cycle 10 shipped (2026-05-10)

| Task | Type | Result |
|------|------|--------|
| 1868d | CHORE-LOW handoff sweep | merged `f6483b9d` + `47b33232` — 73 files cleaned, audit re-verified, task/1863b deleted |
| 1862c (parent) | FIX-HIGH decomposed | brief `docs/architecture-briefs/2026-05-10-1862c-cowork-mcp-rca.md` → moved to Done via `e6d37aa7` |

## Cycle 10 brief + decomposition

**Architect RCA root causes (3 ranked):**
1. Cloudflare `/mcp` route MISSING — `https://zenmidi.com/mcp` 404s
2. SSE `keepAliveTimeout: 30s` = heartbeat boundary race — silent drops
3. SseSessionManager in-process singleton — Docker restart wipes sessions, cowork holds dead IDs → 404s

**Why 1862-MAT-a not sufficient:** stops phantom BLOCKED claims (stale-memory cascade) but does NOT fix the real SSE race.

**Atomic tasks queued (Todo):**
- **1862c-D** OPS-HIGH — Cloudflare `/vn-market/mcp` ingress rule + cron hint updates (`zenmidi.com/mcp` → `zenmidi.com/vn-market/mcp`). 30min. No rebuild.
- **1862c-E** OPS-HIGH — SSE `keepAliveTimeout` 30s → 300s. 10min. No rebuild. Ship with D in single cloudflared reload.
- **1862c-F** FIX-MEDIUM — `SseSessionManager` dead-session eviction in `apps/mcp-server/src/interface/mcp/transport.ts`. 2 files + 5 tests. Rebuild required. Blocked-by: container-rebuild.
- **1862c-G** FIX-HIGH — Market-watcher smoke-test probe at cron start. 1 flow file. No rebuild.

**Architect ship order:** D+E (single cloudflared reload) → observe 5 cycles → G → F (last, needs rebuild).

## Current baseline

- **8804 pass / 1 fail** (unchanged)
- toolCount=132, totalTasksDone=556 (+1 for 1868d)
- currentSprint=1868
- pipeline-state: idle

## Carry-over to Cycle 11

### Ready to ship (dev-team scope)
- **1862c-G** is fastest dev win after D+E land. Architect recommends waiting per ship order, but if D+E delayed >2 cycles, ship G first for observability.

### Ops-gated (waiting on user / ops)
- **1862c-D + 1862c-E** — need Cloudflare config edits on host (not in our repo). Single WORK telegram already sent by PM cycle 10.
- **Container rebuild** still gates 1862f / 1862j / 1865a / σ data / 1862c-F.

### Patterns to watch (3rd cycle = action)
- 2843 get_system_status EOF (cycle 9 entry — still in monitoring)
- 2844 price_drop precision <60% (cycle 9 entry — 2nd cycle persistent)
- 2845 news freshness >2h (likely resolves on Reuters/TE rebuild)

### TNB Cycle 32 improvement
TNB ran c32 (`674188ca`) — status NEEDS_ATTENTION/**IMPROVING** vs c31's DEGRADING. RCA brief delivery likely contributed.

## Architecture state (unchanged from cycle 9)

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP
- alertVerdictStore + verdictResolutionJob cron `7 * * * *` live since cycle 8
- All 16 circuit breakers OK in DB
- Source health: Reuters/TE still Ngưng (1862f undeployed pending container rebuild)

## Cycle 10 process notes

- Parallel agent spawns worked cleanly this cycle (code-janitor + architect, different file scopes). No HEAD.lock issues this time.
- TASKS.md anomaly from cycle 9 (1862h "handoff Done" stuck in Todo) appears self-corrected during code-janitor 1868d work.
- PM decomposition kept WIP=0 (all 4 child tasks queued, none In Progress). Respects "ship completion not slices" + WIP ≤ 2.

## Next-cycle intent (Cycle 11)

1. Drain new signals + reports
2. If 1862c-D/E shipped by ops → spawn dev for 1862c-G smoke probe
3. If 1862c-D/E NOT shipped after 2 more cycles → escalate or ship 1862c-G first for observability
4. Continue monitoring 2843/2844/2845 patterns
5. If `expire_monitoring_reports` flips any of those to wontfix at 72h TTL → archive them
