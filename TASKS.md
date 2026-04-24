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

## Sprints 1296–1302 — COMPLETE — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`
- 1296: IMF research + classifier design | 1297a: fail-loud injection (done) | 1298: IMF test coverage (6508+ tests)
- 1299: token reduction 65k→<30k (6590 tests) | 1300: TelegramMessageFactory (6573 tests) | 1302: textUtils.ts DDD fix (6606 tests)
- Task 1304: newsNormalizer DDD import fix (merge 4ca649a7)

---

## Sprint 1297 — IN PROGRESS (1297a Done, 1297b Review, 1297c Todo)

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1297a | Fail-Loud Protocol Injection (16 agents) | agents | Done |
| 1297b | BCTC Portal URL Discovery Fix | vps-scripts | Review |
| 1297c | VPS Validation of BCTC Portal Fix | ops | Todo (blocked on 1297b) |

### 1297b — BCTC Portal URL Discovery Fix
context: `docs/handoffs/TASK_1297b.md`
branch: main (merged a52c34b1)
layer: vps-scripts
files_modified: `vps-scripts/discover-bctc-urls-browser.py`
AC: HNX AJAX POST mapped, UPCOM same flow, HOSE informative error, ≥2/3 VNM/BID/FPT re-test pass on VPS

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
| 1303g | UNBLOCK — VPS all-services down (prices/BCTC/news/FX/flow) | ops | Done | #2598,2599,2604,2607 |
| 1303h | SPRINT — BCTC PDF parser impossible figures | domain | Done | #2597,2608,2610 |
| 1303i | SPRINT — Cascade rule gaps (geo/BCTC overdue/trade map) | domain | Done | #2595,2600,2602 |

**Status:** 1303a–1303i DONE. WIP: 0/2.

### 1303h/1303i — DONE — details: `docs/handoffs/TASK_1303h.md`, `docs/handoffs/TASK_1303i.md`

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
