# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162: `docs/archive/sprints-133-162.md`
> Sprints 163–176: `docs/archive/sprints-163-176.md`
> Sprints 177–189: `docs/archive/sprints-177-181.md` / `sprints-182-189.md`
> Sprints 190–240: `docs/archive/sprints-190-220.md` / `sprints-221-230.md` / `sprints-231-239.md` / `sprints-240-240.md`
> Sprints 1269–1294: `docs/archive/sprints-1269-1277.md` / `1278-1282.md` / `1282-1289.md` / `1290-1290.md` / `1291-1294.md`
> **Sprint 1289f/1295/1296 details + Sprint 1297/1299 task details archived:** `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1296 — COMPLETE (1296a Done, 1296b impl in 1296) — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1297 — IN PROGRESS (1297a Done, 1297b Review, 1297c Todo) — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1298 — COMPLETE (1298a/b Done, IMF test coverage complete, 6508+ tests) — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`

## Sprint 1299 — COMPLETE (1299a/b/c Done, 65k→<30k token reduction, 6590 tests) — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`

## Sprint 1300 — COMPLETE (1300a/b Done, TelegramMessageFactory, 7 truncation bugs fixed, 6573 tests) — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`

## Sprint 1302 — COMPLETE (1302a/b Done, textUtils.ts, DDD violation fixed, 6606 tests) — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1303: Backlog Drain — Bug Fixes from Telegram Reports (2026-04-24)

| ID | Title | Layer | Status | Reports |
|----|-------|-------|--------|---------|
| 1303a | price_surge 4h bucket dedup (was 1h) | domain | Done | #2589 |
| 1303b | Sentiment: add cost-pressure bearish keywords | domain | Done | #2588 |
| 1303c | policyImpactMapper: add corporate_governance type | domain | Done | #2587 |
| 1303d | Test log contamination: extend schema cleanup | infra | Done | #2590 |
| 1303e | pipelineWatchdog + vpsProxyWatchdog: remove MARKET channel spam | scheduler | Done | #2596 |
| 1303f | append_session_record: add content deduplication | interface | Done | SEC |
| 1303g | UNBLOCK — VPS all-services down (prices/BCTC/news/FX/flow) | ops | Todo | #2598,2599,2604,2607 |
| 1303h | SPRINT — BCTC PDF parser impossible figures | domain | Done | #2597,2608,2610 |
| 1303i | SPRINT — Cascade rule gaps (geo/BCTC overdue/trade map) | domain | Done | #2595,2600,2602 |

**Status:** 1303a–1303f, 1303h, 1303i DONE. 1303g BLOCKED on ops. WIP: 0/2.

### 1303h — BCTC PDF Parser Impossible Figures Guard
context: `docs/handoffs/TASK_1303h.md`
branch: `task/1303h-impossible-figures-guard`
layer: domain
depends: none
files_create: `src/domain/services/financial-reports/extractorGuards.ts`, `src/__tests__/1303h-extractor-guards.test.ts`
files_modify: `incomeStatementExtractor.ts` (return block), `balanceSheetExtractor.ts` (post-applyMultiplier)
AC: `guardFinancialField(600T,...)→0 + warn`, `guardBalanceSheet` applied on BS, VNM-scale passes, `bun tsc` clean

### 1303i — Cascade Rule Gaps (Geo/BCTC-Overdue/Trade-Map)
context: `docs/handoffs/TASK_1303i.md`
branch: `task/1303i-cascade-gaps`
layer: domain + scheduler
depends: none
files_create: `src/__tests__/1303i-cascade-gaps.test.ts`
files_modify: `cascadeEngine.ts` (Taiwan rules), `tradeRelationships.ts` (taiwan keywords + 4 profiles + 4 relevance entries), `bctcOverdueCheckJob.ts` (fire-and-forget runImpactChain)
AC: Taiwan strait → tech "down" in chain, BCTC overdue → runImpactChain called, DHG/GMD/CTD/NKG profiles exist, `bun tsc` clean

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
