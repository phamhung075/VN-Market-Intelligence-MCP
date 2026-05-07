# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1848)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1850c | FIX: HSG price inconsistency — bootstrap vs history change_pct diverge (-21.63% vs +2.04%). Check priceHistoryService formula consistency. 1-2 files. | MEDIUM | FIX | developer | — | — |
| 1850e | CLEAN: cascade rule gap — chemicals/petrochemicals domain missing from alert cascade map. 1 file. | LOW | CLEAN | code-janitor | — | — |
| 1850d | CLEAN: DBC domain classification — Dabaco (DBC) incorrectly tagged as tech; should be agro/food sector. 1 file. | LOW | CLEAN | code-janitor | — | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| 1851a | FIX: post_agent_signal schema reconciliation — align market-watcher cycle.md + tools package with actual MCP schema (from_agent, to_agent, signal_type, payload). 2 files. | HIGH | FIX | developer | 2026-05-07 |
| 1851b | FIX: run_impact_chain + post_agent_signal params — news-scout cycle.md (newsText not ticker/event) + tools package. Absorbs 1850b. 3 files. | HIGH | FIX | developer | 2026-05-07 |
| 1851c | FIX: get_price_history actionCode→code — already fixed in prior sprint (commit 0d514018). Stale report closed. | MEDIUM | FIX | — | 2026-05-07 |
| 1851d | FIX: market-watcher session append-only — explicit APPEND instruction in cycle.md Step 5 (GAP-10). 1 file. | MEDIUM | FIX | developer | 2026-05-07 |
| 1850g | FIX: PriceAnomalyFindingDataSchema — ref_price/window_days optional, added passthrough + market-watcher fields. 2 files + 17 tests. | MEDIUM | FIX | dev-mcp-server | 2026-05-07 |
| 1850a | FIX: vnstock-sync storeShareholders Array.isArray + null-code guards. 1 file + 11 tests. | HIGH | FIX | dev-mcp-server | 2026-05-07 |
| 1850f | FIX: Polymarket t163-mkt-* test fixtures excluded from prod + staleness tightened 30d→7d. 1 file + 7 tests. | HIGH | FIX | dev-mcp-server | 2026-05-07 |
| 1849a | SPRINT-S: Schema migration + store functions — resolution tracking on telegram_reports. 2 files, 5 tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1849b | SPRINT-S: MCP tool + serializeReport upgrade — process_telegram_report resolution param. 1 file, 3 tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1849c | SPRINT-S: Dev-team flow Step 4 update — monitoring loop guard (C-6). 1 file. | MEDIUM | SPRINT-S | developer | 2026-05-07 |
| 1849d | SPRINT-S: Tests + regression — telegram report resolution tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1850-GAP9 | FIX: get_technical_indicators migrated from market_prices_history to daily_ohlcv. 1 file + 34 tests. | HIGH | FIX | dev-mcp-server | 2026-05-07 |

---
