# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Completed Sprints (summary — details in `docs/TASKS_ARCHIVE.md`)

- **1296–1302:** IMF classifier, fail-loud injection, token reduction, TelegramMessageFactory, textUtils DDD fix, newsNormalizer fix
- **1303:** 9-bug backlog drain (price/sentiment/cascade/watchdog/VPS/BCTC)
- **1307a–1311a:** Macro alert cooldown, sentiment patterns, cascade rules, schema migration, foreign-flow UNIQUE fix
- **1312–1313:** BCTC skip logic inversion, channel-routing regression guard
- **1315:** Cost-push cascade rules + ClimateImpactMapper
- **1317:** Task308 test regex + project-stats sync
- **1318–1321:** Watchdog foreign_flow staleness, VPS OOM guard
- **1326b:** MARKET channel spam guard
- **DDD Phase 0–3c:** Monorepo scaffold, PDF/RAG Python services, 4 TS microservices, parallel TA+BB scan — all merged
- **1327–1329:** Phase 0 merge + test infra, Cowork overhaul, WAL hardening + IMF 7th conviction dim — Done (6927 pass / 7 fail)
- **fix-1293c / fix-1328e / fix-bctc-ocr / fix-watchdog-recovery / fix/signal-payload-fields:** Signal, bug routing, OCR, null-flow, conviction fields — all merged
- **feat/value-investor-analysis-system (1336):** 30 analysis ledger files, Report Analyzer agent (new), 4 agent mods (News Scout/Market Watcher/Alert Commander/Unified Agent), quarterly conviction synthesis, value_investor mode — MERGED 2026-04-26 (6520 pass / 213 fail baseline maintained)
- **1330a–1330b:** Fix 7 failing test regressions from Sprint 1329 (1289c fallback field, 1476 WAL threshold/msg, 240 AC-4 cooldown reset, 1551 isolation) — DONE 2026-04-25 (26/26 target tests pass)
- **1338:** Retrospective documentation for sprints 1330–1337 (SPRINT_GOAL.md, project-stats.json validation tests, sprint history consolidation) — DONE 2026-04-26
- **1339a:** RED phase — 10 failing tests for PriceConfirmation catalyst correlation fields — APPROVED + merged 2026-04-26 (merge commit: 6f617113)
- **1339b:** GREEN phase — implement PriceConfirmation catalyst correlation fields (signalTypes + signalBuilders) — APPROVED + merged 2026-04-26 (merge commit: 7b9de84c)
- **1342b:** GREEN phase — implement DB integrity check job (runIntegrityCheck + integrityCheckJob.ts + CRONS.integrityCheck) — APPROVED + merged 2026-04-26 (merge commit: e93149fc)
- **1343a–1343e:** BCTC PDF pipeline recovery — watchlist restore (30 tickers), HOSE PDF discovery (multi-source SSC/cafef/vietstock), VPS skip endpoint (no infinite retry), fetch-bctc.sh update, integration test (6/6 pass) — APPROVED + merged 2026-04-27
- **1344a–1344c:** Sprint 1344 — Fix 9 pre-existing test failures (6536→7371 pass, 213→0 fail) — ALL MERGED 2026-04-27
- **1345a–1345e:** Sprint 1345 — News + Analysis Pipeline Hardening + Data Quality — Reuters/TE VPS systemd + newsapi fallback, BCTC financial validation (VNM/VEA), Polymarket 24h staleness guard, VN-Index cascade MARKET broadcast, integration pipeline + TSC fix (B1-B4) — APPROVED + merged 2026-04-27 (7355 pass / 73 pre-existing fail / 0 regression)

---

## Todo

---

## In Progress

---

## Review

---
