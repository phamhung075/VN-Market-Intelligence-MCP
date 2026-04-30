# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|
| 1777a | VPS price pipeline dark since 2026-04-24 — diagnose + restore VPS price/foreign-flow push | critical | UNBLOCK | ops | — | 2026-04-29 |

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| 1425a | Sync project-stats.json toolCount=113 + schedulerFileCount=44 to registry SSoTs | 2026-04-29 | — |
| 1425b | Remove hardcoded REQ/TECH file counts from docs-organization.md | 2026-04-29 | — |
| 1425c | Delete ghost dirs docs/agent-memory + corrupt DB backups (~281MB) + .fuse_hidden* | 2026-04-29 | — |
| JANITOR-010 | DRY: extract VN_INDEX_FRESHNESS_MS=25h to timeConstants.ts | 2026-04-29 | — |
| 1424a | BCTC confidence=0 false positive: VAL-01 unit-scale guard + banking operatingMargin proxy | 2026-04-29 | reports/TASK_REPORT_1424a.md |
| hotfix-bctc-parser2 | BCTC parser: DIG/SHB case mismatch + FPT unit scale + DGC/BSR phantom confidence | 2026-04-29 | reports/TASK_REPORT_hotfix_bctc_parser2.md |
| 1423a | Add US 10Y Yield (^TNX) to Yahoo Finance fetcher + schema column | 2026-04-29 | docs/handoffs/TASK_1423a.md |
| 1423b | FRED API fetcher for Fed Funds Rate → tracked_indicators | 2026-04-29 | reports/TASK_REPORT_1423b.md |
| 1423c | wire get_carry_trade_signal MCP tool (carryTools.ts) + 1423c/1423d test suites | 2026-04-29 | reports/TASK_REPORT_1423ac.md |
| 1423d | Extend get_macro_snapshot with [Global Macro Inputs — Thien Thoi] section | 2026-04-29 | reports/TASK_REPORT_1423d.md |
| 1423e | get_macro_calendar targeted MCP tool tests | 2026-04-29 | reports/TASK_REPORT_1423ac.md |
| 1423f | Add Max Deposit Rate line to get_macro_snapshot SBV section | 2026-04-29 | — |
| 1426c | Dinh Gia section in get_macro_snapshot for Báu Phase 2 | 2026-04-29 | reports/TASK_REPORT_1426c.md |
| 1777b | foreign-flow dedup + CB self-healing regression tests (12 tests, no prod code change) | 2026-04-29 | reports/TASK_REPORT_1777b.md |
| 1776 | vnstock ANSI escape sequence handling + circuit breaker | 2026-04-29 | reports/TASK_REPORT_1776.md |
| 1407b | SLA monitor: skip price+foreign_flow escalations outside market hours | 2026-04-29 | reports/TASK_REPORT_1407b.md |
| 1778 | BCTC vnstock junk response guard — Strategy A only in extractCafefUrls, 28 stuck tickers unblocked | 2026-04-30 | reports/TASK_REPORT_1778.md |

---
