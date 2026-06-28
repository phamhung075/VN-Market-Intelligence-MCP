---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P1.5
branch: task/1984-p15-mcp-3-periodic-reaper-timer
size: S
zone: apps/mcp-server/
depends_on: [TASK_1980, TASK_1983]
blocks: [TASK_1985]
---

## TLDR

Add a server-side periodic timer in the mcp-server startup path that calls `gcExpiredLocks(db, graceSeconds=300)` every 600 seconds (10 minutes). This ensures the reaper fires even when no `task_claim` call arrives — crucial for the "all sessions dead" case where the mcp-server is the only process alive and must emit adoptable orphan-signals without any client trigger.

## [PM] Planning Context

**Architect Brief Section:** §6.5.2 + §8 (Concrete Follow-On Tasks: P1.5-MCP-3)

**Zone:** apps/mcp-server/

**Acceptance Criteria:**

- [ ] `setInterval(() => { gcExpiredLocks(db, 300); }, 600_000);` added to the mcp-server initialization (or coordination module startup)
- [ ] Timer starts after the coordination database is ready (after migration phase in startup sequence)
- [ ] Grace window = 300s (5 min), period = 600s (10 min) per brief §6.5.3 + §6.5.2
- [ ] **DoD-P15-5:** Timer MUST wrap `gcExpiredLocks` call in try/catch + log error on failure, continue running (do NOT kill the interval on transient DB-busy or other errors — else all-sessions-dead gap re-opens)
- [ ] One uncaught error in the closure MUST NOT stop the timer from firing on the next 600s tick
- [ ] Acceptance test (P1.5-REGRESSION): inject a transient DB-busy error into gcExpiredLocks, verify the timer logs the error and still fires on the next tick (assert via mock/spy on the setInterval callback)
- [ ] No per-session timer (crons are session-local; all-sessions-dead case needs server-side always-on)
- [ ] Safe shutdown: if mcp-server terminates, Node.js process exit is unclean garbage but does not corrupt coordination.db (SQLite ensures atomicity)

**DoD Locks Baked (PO-S9):**
- DoD-P15-5 — 600s timer MUST wrap gcExpiredLocks in try/catch + log+continue on transient DB-busy; one uncaught error must NOT kill the interval (test: inject GC error, assert timer fires next tick)

**Files to read first:**
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:298-317` (gcExpiredLocks function signature)
- `apps/mcp-server/src/server.ts` or coordination module entry point (startup sequence)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§6.5.2` (reaper timing spec)

**Files to modify:**
- `apps/mcp-server/src/server.ts` or `apps/mcp-server/src/infrastructure/coordination/index.ts` (add setInterval after DB ready)

**Knowledge needed:**
- Node.js setInterval + exception handling
- Grace window vs. period semantics (grace=300 allows 5 min of safe miss-heartbeat before orphan emit; period=600 ensures >= 15 min latency in worst-case all-sessions-dead)

## Context

The reaper must run constantly, not just when a client calls `task_claim`. If every session crashes, the only thing running is the mcp-server itself (PID 1, always-on container). Without this periodic timer, it would wait forever for a client to trigger `gcExpiredLocks` (via the opportunistic per-claim GC in P1-MCP-2 coordinationStore.ts).

The timer + try/catch gives the reaper resilience: a transient DB lock or I/O hiccup does not kill the entire timer loop.

## Success Signal

- Acceptance test passes: mock a DB error, verify timer survives and logs the error
- Inspect mcp-server logs: `[coordination] gcExpiredLocks fired at 600s, 1200s, 1800s, ...` intervals (or similar logging)
- Manual test: kill all sessions, wait 600s + 300s (within grace window orphan-signals should exist), new session comes online and sees `task_list_held(kind="orphan-signal")` rows
