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

---

## Backlog

---

## Todo

### Sprint 1330 — Fix 7 Failing Tests

| ID | Title | Size | Status | Handoff |
|----|-------|------|--------|---------|
| 1330a | RED: Confirm failure map for 7 failing tests | XS | Done | `docs/handoffs/TASK_1330a.md` |
| 1330b | GREEN: Fix blocking regressions + isolation bugs | S | Todo | `docs/handoffs/TASK_1330b.md` |

**Baseline:** 6927 pass / 7 fail → Target: 6934 pass / 0 fail

**7 failures confirmed (1330a triage — corrected map):**
- `1294b` (3): `result?.fallback` undefined — field not on return type of `fetchParseAndStoreBctc`
- `1476` (2): Sprint 1329 changed WAL message format + threshold — update test contracts
- `240` AC-4 (1): Missing `_resetWatchdogCooldown()` call — cooldown leaks from prior tests
- `1319` (1): Logic bug — `null` reader treated as age=0 (fresh), test expects alert-sent

---

## In Progress

---
