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

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1284 | IMF context sentiment | MEDIUM | Policy vs crisis distinction |
| 1274 | HOSE staleness guard | MEDIUM | >2h old = circuit DEGRADED |
| 1267 | SSC PDF timeout fallback | MEDIUM | Use news chain if OCR fails |
| 1283b | Foreign flow fallback source | MEDIUM | If primary endpoint unrecoverable, use SSE alt data |
| 1285 | Add rag_analyses + evidence_scores schema | HIGH | Structural additions (L-size) |
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
