# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|
| 1420 | Sprint housekeeping — close 1416, open 1420, sync project-stats.json | MEDIUM | chore | claude-manager-helper | — |
| 1421 | Fix QQ1 double-prefix in insertFallbackRecord | HIGH | bug | developer | — |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| 1419 | QA sign-off: 25 pre-existing test failures resolved → 0. 38 documented skips (9 cross-worker DB contamination + 29 prior). 8076 pass, 0 fail. | 2026-04-29 | reports/TASK_REPORT_1419.md |
| 1418 | QA sign-off: 4 TSC errors fixed in 1383 + 1397c test files. 0 TSC errors. 10 + 5 targeted tests pass. | 2026-04-29 | reports/TASK_REPORT_1418.md |
| 1416b | QA sign-off: FPT 2025-Q4 total_assets=88,089,621 triệu confirmed in DB. trimToBalanceSheetWindow helper + findValueByCode. 6 new tests pass. 8068 total pass. | 2026-04-29 | reports/TASK_REPORT_1416b.md |
| 1416a | QA sign-off: VCB total_assets=2,441,928,945 (Q4) + 2,109,260,616 (Q1) confirmed in DB. Banking-label fallback emits key "270". 20 hotfix tests pass. validation_status=passed. | 2026-04-29 | reports/TASK_REPORT_1416a.md |
| 1416c | QA sign-off: HPG added to WATCHLIST_SEED (26 tickers), disk-scan now resolves HPG filenames. 5/5 targeted tests pass. 8058 total pass. HPG confirmed in live DB. | 2026-04-29 | reports/TASK_REPORT_1416c.md |
| 1415b | QA sign-off: VCB BCTC bank page-pair parser — contains-based separator + page-pair merge. 16 hotfix tests + 8053 total pass. total_liabilities Q1=1,904,318,782 Q4=2,214,393,069 confirmed. total_assets out of scope (ADR). | 2026-04-29 | reports/TASK_REPORT_1415b.md |
| hotfix-vcb-parser-fixer | Fix extractNumber fallback year filter + expand detectUnitMultiplier scan window + B-3a/B-3b real OCR fixtures + banking-label fallback | 2026-04-29 | docs/handoffs/TASK_hotfix_vcb_parser_fixer.md |
| hotfix-vcb-parser | VCB bank BCTC parser — unit header + year filter (partial, B-1/B-2 open) | 2026-04-29 | reports/TASK_REPORT_hotfix_vcb_parser.md |
| 1395a | alertBatchGrouper wired to pushPricesHandler — batch sends replace per-alert loop | 2026-04-29 | reports/TASK_REPORT_1395a.md |
| JANITOR-004 | DRY: replace COMPANY_SHORT_NAME with getCompanyName (STOCK_CATALOG SSOT) | 2026-04-29 | — |
| JANITOR-005 | DRY: extract IMF_HISTORICAL_BASELINE=3.0 to imfIndicators.ts, 3 callers updated | 2026-04-29 | — |
| JANITOR-007 | DRY: Vietnamese severity label map extracted to severityLabels.ts, 5 files updated | 2026-04-29 | — |
| JANITOR-008 | DRY: LOG_ROTATE_BYTES constant in vps-lib.sh, 10 scripts sourced | 2026-04-29 | — |
| 1409a | AUDIT: Trim SPRINT_GOAL.md to ≤30 lines | 2026-04-29 | — |
| 1409b | AUDIT: Archive old sprint prose from TASKS.md to docs/TASKS_ARCHIVE.md | 2026-04-29 | — |
| 1409c | AUDIT: Create .claude/knowledge/agent-spawn-template.md | 2026-04-29 | — |
| 1409d | AUDIT: ULTRA/FULL/LITE compression policy — merged into .claude/skills/token-economy/SKILL.md Part 3 | 2026-04-29 | — |
| 1409e | AUDIT: Delete docs/agent-memory/modules/test-module-memory.md (ghost file) | 2026-04-29 | — |
| 1409f | AUDIT: Update project-stats.json — currentSprintNotes + lastUpdated + knowledgeFileCount | 2026-04-29 | — |
| 1406a | Extract pushPricesHandler.ts + server-startup.ts from server.ts | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406b | Extract pushForeignFlowHandler.ts from server.ts | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406c | Extract webhookHandler.ts from server.ts — server.ts ≤1600 lines achieved | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406d | server-startup.ts done (part of 1406a) | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406e | Decompose jobs.ts (967 lines) → cronConfig.ts + startupHelpers.ts + startScheduler.ts + 15-line barrel | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406f | QA sign-off: 8043 tests pass, 0 TS errors, all structural targets met | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1413b | foreignFlow CB self-heal fix: early-return guard removed, CircuitOpenError→503+Retry-After, 15 regression tests | 2026-04-29 | reports/TASK_REPORT_1413b.md |
| 1396 | [UX] GAS digest: (+HH:MM) ICT intraday progression label replaces (+thêm) — 11 tests, 8093 total | 2026-04-29 | reports/TASK_REPORT_1396.md |

---
