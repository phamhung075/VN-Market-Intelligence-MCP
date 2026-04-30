# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|
| JANITOR-012 | DRY/fix: DAG misclassified as pharma — should be machinery; reclassify in seedWatchlist.ts | low | JANITOR | code-janitor | — |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|
| 1777a | VPS price pipeline dark since 2026-04-24 — diagnose + restore VPS price/foreign-flow push [BLOCKED: needs Docker rebuild to activate restart_vps_service] | critical | UNBLOCK | ops | — | 2026-04-29 |

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
| 1780 | vnstock BCTC fetcher: exponential backoff + box-drawing rate-limit detection | 2026-04-30 | reports/TASK_REPORT_1780.md |
| 1779a | sshExec infrastructure layer — Bun.spawn args array, 15s timeout, 7 tests | 2026-04-30 | reports/TASK_REPORT_1779a.md |
| 1779b | restart_vps_service MCP tool — three-layer allowlist handler, registry entry, 8 tests | 2026-04-30 | reports/TASK_REPORT_1779b.md |
| 1779c | SSH key mount + known_hosts seeding — docker-compose :ro mount, entrypoint.sh ssh-keyscan fail-loud | 2026-04-30 | reports/TASK_REPORT_1779c.md |
| 1779 | VPS SSH restart pipeline (parent) — sshExec + restart_vps_service MCP tool + Docker SSH key mount | 2026-04-30 | — |
| JANITOR-011 | DRY: extract ANSI+box-drawing regex to domain/utils/ansiUtils.ts — 3 inline copies removed | 2026-04-30 | reports/TASK_REPORT_JANITOR011.md |
| 1781 | classifyFilingStatus off-by-one: deadline day now SAP_DEN not QUA_HAN — calendar-date UTC comparison | 2026-04-30 | reports/TASK_REPORT_1781.md |
| 1782 | BCTC enricher Q1-2026: seed queue at startup + park exhausted rows as url_not_found after 5 attempts | 2026-04-30 | reports/TASK_REPORT_1782.md |
| 1783 | Morning bulletin: hide/mask foreign flow section when data stale; fix top-5 sort to |net_flow| desc | 2026-04-30 | reports/TASK_REPORT_1783.md |
| 1784 | Sector alerts: render as sector-level not per-ticker; deduplicate in morning bulletin | 2026-04-30 | reports/TASK_REPORT_1784.md |
| 1785 | France summary change_pct: prev-close-to-close reference; formatPct(null) → N/A | 2026-04-30 | reports/TASK_REPORT_1785.md |
| 1787 | GVR sector fix: oil_gas → agriculture (Vietnam Rubber Group) | 2026-04-30 | reports/TASK_REPORT_1787.md |

---
