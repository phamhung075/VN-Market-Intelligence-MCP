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
> Sprints 1283–1289 archived: `docs/archive/sprints-1283-1289.md` (includes foreign flow circuit breaker diagnostics, BCTC async queue enrichment, foreign flow fallback fetcher, data freshness monitoring, recurring parse errors root-cause fix, all merged)

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1290 | Integrate foreign flow fallback fetcher into scheduler job | MEDIUM | Fallback source (1288) ready; needs scheduler integration |
| 1284 | IMF context sentiment detection | MEDIUM | Policy vs crisis distinction |
| 1274 | HOSE staleness guard | MEDIUM | >2h old = circuit DEGRADED |
| 1267 | SSC PDF timeout fallback | MEDIUM | Use news chain if OCR fails |
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---

## Sprint 1282 — Data Freshness Monitoring Tool (S-size)

**Status:** COMPLETE | **Goal:** Eliminate false alarm cascade rule gaps via data freshness detection tool | **Size:** S (2 tasks, 2 files) | **Baseline:** 6187 | **Target:** 6197 (+8 assertions) | **Note:** Data freshness monitoring tool complete, all 8 tests PASS

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1282a | RED: Data freshness monitoring tool tests | Done | test | 8 assertions: price/BCTC/news SLA breach + recovery detection |
| 1282b | GREEN: Implement freshness detector + formatter | Done | interface+domain | Calls `freshnessSlaChecker` domain service, formats alerts |

**Context:** Existing `freshnessSlaChecker.ts` (domain) defines SLA thresholds per signal type. New tool wraps it for interface layer (MCP + future briefing gate-keeping). Prevents cascade alerts when data is stale.

---

## Sprint 1283 — Foreign Flow Circuit Breaker Diagnostics (S-size)

**Status:** COMPLETE | **Goal:** Implement diagnostic + reset tools for foreign flow circuit breaker to unblock OPS incident recovery | **Size:** S (2 tasks, 2 tools, ~80 lines code + 10 tests) | **Baseline:** 6257 | **Target:** 6267 (+10 assertions) | **Note:** Circuit breaker diagnostics tool (incident recovery aid). Merged 2026-04-22. All tests PASS.

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1283a | RED: Foreign flow CB diagnostics tests | Done | test | 10 assertions: state query, error counts, reset logic, idempotency |
| 1283b | GREEN: Implement diagnostic + reset tools | Done | interface | Two MCP tools: diagnose_foreign_flow_circuit_breaker() + reset_foreign_flow_circuit_breaker() |

**Context:** vps_push_log shows 5108 consecutive error pushes (2026-04-22 07:36:55–now), last good push 2026-04-15 07:52:10. Ops needs observability into circuit breaker state to diagnose root cause. Tools provide: state query (closed/open/half-open), failure counts, last failure timestamp, manual reset capability. Merged with full test coverage.

---

## Sprint 1272 — Insider Selling Sentiment Fix (S-size)

**Status:** COMPLETE | **Goal:** Distinguish insider selling (BEARISH) from buying (BULLISH) cascade | **Size:** S (2 tasks, 1 sentiment check + 1 cascade fix) | **Baseline:** 6189 | **Target:** 6197 (+4 RED + 4 GREEN assertions)

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1272a | RED: Insider selling sentiment distinction tests | Done | test | 4 assertions: classifier bearish + cascade direction + mixed sentiment |
| 1272b | GREEN: Fix sentiment direction logic in cascade executor | Done | application | Verify bearish check in detectInsiderDumpPeers + keyword weights |

**Context:** CEO Group insider selling articles ("xả hàng", "bán sạch", "thoái sạch") misclassified as BULLISH, wrong cascade fired. Sentiment classifier correct; cascade executor has inverted direction check or keyword weight sign error. Outcome: Fix already implemented in Task 1278b; all tests pass.

---

## Sprint 1287 — Async BCTC Queue Enrichment (S-size)

**Status:** COMPLETE | **Goal:** Background job to enrich BCTC queue with source_urls, prevents /api timeout on >100 items | **Size:** S (2 tasks, ~40 lines job, 8 assertions) | **Baseline:** 6255 | **Target:** 6256 (+1 assertion — tests counted as 8 sub-cases, 1 actual assertion increase)

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1287a | RED: BCTC queue enricher tests | Done | test | 8 test cases, 29 assertions: job execution, URL population, timeout handling, idempotency |
| 1287b | GREEN: Implement background scheduler job | Done | scheduler | Dequeue 20 items/15min with NULL source_url, call SSC with 5s timeout, update DB, Promise.race timeout protection |

**Context:** Sprint 1280 added `skip_enrichment=true` flag to unblock `/api/bctc-fetch-queue` timeout when processing >100 PDFs. This sprint defers enrichment to background job: runs every 15min, batch-processes queue items, timeout-safe, retryable.

---

## Sprint 1288 — Foreign Flow Fallback Source (S-size)

**Status:** COMPLETE | **Goal:** Unblock OPS incident — foreign flow service down since 2026-04-22 | **Size:** S | **Baseline:** 6267 | **Target:** 6275 (+8 assertions) | **Note:** Merged 2026-04-22. Foreign flow fallback fetcher provides graceful degradation (primary→cache→SSE→none). All 8 tests PASS.

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1288a | RED: Foreign flow fallback tests | Done | test | 8 assertions: primary timeout, fallback activation, circuit breaker, cache, SSE, staleness, recovery |
| 1288b | GREEN: Implement fallback fetcher + circuit breaker logic | Done | infrastructure | NEW foreignFlowFetcher.ts: primary (CB wrapped) → cache → SSE → none |

**Context:** vn-foreign-flow.service down 2026-04-22 07:36:55–ongoing. Sprint 1283 shipped diagnostics tools. This sprint adds resilience: if primary VPS endpoint fails, switch to secondary source (cache or SSE). Graceful degradation: primary (5s timeout, CB-wrapped) → cache (in-memory, <2h old) → SSE messages (recent broadcast) → empty with warning. No schema changes. Next sprint: integrate fetcher into scheduler job.

**Handoff:** `docs/handoffs/TASK_1288a.md` (RED spec) | `docs/handoffs/TASK_1288b.md` (GREEN impl) | Reports: `reports/TASK_REPORT_1288a.md` + `reports/TASK_REPORT_1288b.md`

---

## Sprint 1289 — Foreign Flow Parse Errors Root-Cause Fix (M-size)

**Status:** Review | **Goal:** Root-cause analysis + fix for recurring parse errors (784 in 24h, ≥2 prior fix attempts) | **Size:** M (4 tasks) | **Baseline:** 6283 (1289b) | **Progress:** 6297 (+8 from 1289e, total +14 across sprint) | **Blocker:** None (all tasks complete, ready for QA review)

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1289a | ARCH: Root-cause analysis + design doc | Done | design | Silent filter bug identified: fetchPrimaryVpsEndpoint filters invalid items without error logging; validator duplicated across entry points |
| 1289b | RED: Foreign flow validation error handling tests | Review | test | 11 test cases, 40 assertions: invalid code type, missing date, truncation scenarios, validation error logging |
| 1289c | GREEN: Modify fetcher to call domain validator (fail loudly) | Review | infrastructure | NEW validateForeignFlowFetcherPayload() for WriteForeignFlowItem schema; 6 integration tests, 17 assertions, +6 passing |
| 1289d | GREEN: Modify POST endpoint to call validator (reject HTTP 400) | Review | interface | Unify validation path; reject invalid payloads instead of filtering silently |
| 1289e | QA: Verify parse errors <5/day, no silent filtering, diagnostics logged | Review | qa | 8 integration tests, 32 assertions: validation logging, error diagnostics, parse error count, no regressions |

**Context:** Recurring bug escalation: 784 parse errors/24h (threshold >50), 3,739 total since Sprint 214. Sprint 228 added parse hardening (missed silent filter). Sprint 1288 added fallback fetcher (masked problem). Root cause: `isValidForeignFlowItem()` silently filters invalid items using `.filter()` without logging diagnostics. Different validator in domain layer (`foreignFlowValidator.ts`) never called by fetcher. Solution: Unify validators across entry points (POST endpoint + fallback fetcher), fail loudly on schema violations, log item index + field name for VPS debugging.

**Task order:** 1289b (RED foundation) → 1289c & 1289d (GREEN parallel, depend on 1289b) → 1289e (QA final)

**Handoff docs:** `docs/handoffs/TASK_1289b.md` | `docs/handoffs/TASK_1289c.md` | `docs/handoffs/TASK_1289d.md` | `docs/handoffs/TASK_1289e.md`

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1284 | IMF context sentiment | MEDIUM | Policy vs crisis distinction |
| 1274 | HOSE staleness guard | MEDIUM | >2h old = circuit DEGRADED |
| 1267 | SSC PDF timeout fallback | MEDIUM | Use news chain if OCR fails |
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
