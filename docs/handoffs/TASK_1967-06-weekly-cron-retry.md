# Handoff — TASK_1967-06: Weekly cron crash with no re-fire mechanism

**Task:** 1967-06 | **Sprint:** 1967c | **Severity:** HIGH | **Size:** S

---

## Summary

vnstockFundamentalsRefresh and vnstockTradingStatsRefresh crashed on 2026-05-18 and never re-fired. The scheduler does not block re-fire after crash, but no catch-up mechanism exists. Weekly cadence means next opportunity is 7 days later.

---

## Evidence

**Brief cross-link:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-09

**Repro path:line:** 
- `apps/mcp-server/src/scheduler/cronConfig.ts:133` — `vnstockFundamentalsRefresh: '0 1 * * 1'` (weekly Mon 01:00 UTC)
- `startScheduler.ts:112` — `reapZombieJobRuns()` at startup converts running→crashed; does NOT block future cron.schedule()
- `TASKS.md:L46-47` — OBSERVE-1955d FAIL confirmed 2026-05-21T22:55Z: both jobs `total_runs=1` (no re-fire since crash on 2026-05-18)

**Gate:** OBSERVE-1955e unlock 2026-05-22T21:00Z (soak release of 1959-watchdog-4)

---

## Current Behavior

- vnstockFundamentalsRefresh crashed 2026-05-18 01:00Z, marked `status=crashed`, `total_runs=1`
- No re-fire attempt on 2026-05-19 or 2026-05-20 (weekly cadence, no other Mon 01:00 slot)
- Fundamental data stale for up to 7 days
- Affects financial-analyst and report-analyzer capabilities

---

## Expected Behavior

Either:
- **Option A (catch-up pass):** system-auditor D4/D5 detects crashed+next-fire > 48h → WORK alert; manual catch-up pass or re-fire triggering
- **Option B (schedule change):** Change to daily `0 1 * * 1-5` (Mon-Fri) so catch-up opportunity arrives same week

**Recommended:** Option A + Option B (both safe)

---

## Proposed Fix

**Part 1 (dev-mcp-server):** cronConfig.ts — change to daily Mon-Fri
```
vnstockFundamentalsRefresh: '0 1 * * 1-5'  // Daily Mon-Fri, not weekly
```
Plus verify `startScheduler.ts` does not block re-fire after `status=crashed`.

**Part 2 (agent-father):** system-auditor audit-dimensions.md — add D-N dimension: if any job `status=crashed AND next_scheduled_fire > now() + 48h` → WORK alert

**Zone:** 
- `apps/mcp-server/src/scheduler/cronConfig.ts` (dev-mcp-server)
- `docs/agents/system-auditor/audit-dimensions.md` (agent-father)

**Blast radius:** Fundamental data freshness improved; Q1/Q2 earnings window no longer stale

**Dependency chain:** OBSERVE-1955e (diagnostic gate 2026-05-22T21:00Z)

---

## Acceptance Criteria

1. [ ] vnstockFundamentalsRefresh changed to daily Mon-Fri schedule
2. [ ] cronConfig.ts verified: `'0 1 * * 1-5'` OR similar (validate cadence syntax)
3. [ ] startScheduler.ts reapZombieJobRuns() confirmed to NOT block future fires
4. [ ] Next vnstock refresh after deploy fires successfully on Mon 01:00 UTC
5. [ ] system-auditor D-N dimension added: crashed + 48h guard → WORK alert
6. [ ] Unit tests: cron schedule parsing + guard evaluation
7. [ ] tsc 0 errors

---

## Owner & Zone

- **Primary:** dev-mcp-server (cronConfig.ts change)
- **Secondary:** agent-father (system-auditor dimension)
- **Zone:** `apps/mcp-server/src/scheduler/`
- **Model:** claude-haiku-4-5-20251001

---

## Blocked By

- OBSERVE-1955e (diagnostic gate 2026-05-22T21:00Z)

---

## Related

- REQ-1967-5a (status=crashed blocks re-fire)
- OBSERVE-1955d (FAIL confirmed 2026-05-21T22:55Z)
- OBSERVE-1955e (diagnostic escalation, unlock date 2026-05-22T21:00Z)
