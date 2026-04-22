# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`
> Sprints 190–220 archived: `docs/archive/sprints-190-220.md`
> Sprints 221–230 archived: `docs/archive/sprints-221-230.md`
> Sprints 231–239 archived: `docs/archive/sprints-231-239.md`
> Sprints 240–240 archived: `docs/archive/sprints-240-240.md`
> Sprints 1269–1277 archived: `docs/archive/sprints-1269-1277.md`
> Sprints 1278–1282 archived: `docs/archive/sprints-1278-1282.md` (includes MSCI inclusion + agriculture weather cascades + data freshness monitoring tool, BCTC timeout fix, all merged)
> Sprints 1282–1289 archived: `docs/archive/sprints-1282-1289.md` (includes data freshness monitoring tool, foreign flow circuit breaker diagnostics, insider selling sentiment fix, BCTC async queue enrichment, foreign flow fallback fetcher, parse errors root-cause fix, all merged)

---

## Sprint 1290 — Integrate Foreign Flow Fallback Fetcher (S-size)

**Status:** Todo | **Goal:** Complete resilience loop by integrating fallback fetcher into scheduler job | **Size:** S (2 tasks, ~80 lines code, 8 assertions) | **Baseline:** 6297 | **Target:** 6305 (+8 assertions) | **Blocker:** None

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1290a | RED: Foreign flow fallback job test spec | Review | test | 8 assertions: primary success, timeout→cache, CB open, all fallbacks exhausted, stale cache, recovery, result contract, error logging |
| 1290b | GREEN: Implement fallback fetcher job + cron registration | Todo | scheduler | NEW foreignFlowFetcherJob.ts: calls `fetchForeignFlowWithFallback()` every 60s, logs fallback activation, integrates into jobs.ts |

**Context:** Sprint 1288 delivered fallback logic (primary→cache→SSE→none) for when VPS is down. Current state: endpoint unreachable since 2026-04-22 07:36:55 (2+ weeks). Fallback is implemented but never called. This sprint activates it: new scheduler job fetches every 60s, hits fallback on timeout, uses cache/SSE to keep data flowing. Result: outages mitigated automatically. Alert Commander can analyze with staleness warnings until primary recovers.

**Handoff:** `docs/handoffs/TASK_1290a.md` (RED spec) | `docs/handoffs/TASK_1290b.md` (GREEN impl)

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1284 | IMF context sentiment detection | MEDIUM | Policy vs crisis distinction |
| 1274 | HOSE staleness guard | MEDIUM | >2h old = circuit DEGRADED |
| 1267 | SSC PDF timeout fallback | MEDIUM | Use news chain if OCR fails |
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
