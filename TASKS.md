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
- **DDD Phase 0:** Monorepo scaffold (feature/ddd-phase-0) — ready to merge
- **DDD Phase 1a/1b:** PDF Extractor + RAG Service Python/FastAPI — done
- **DDD Phase 2a/2b:** 4 TS microservices + kinh-dich + alert-engine — review
- **Phase 3c:** Parallel TA + BB alert scan (Promise.allSettled) — merged 8c33f0da

---

## Sprint 1327 — Phase 0 Merge + Test Infrastructure Stabilization

| ID | Title | Layer | Status | Size | Handoff |
|----|-------|-------|--------|------|---------|
| BA-1327 | Requirement Spec: Phase 0 merge + test failure triage | spec | Done | M | `docs/REQ_1327.md` |
| 1327a | Fix Bootstrap AC-4c: update agentFiles + projectRoot in 230-bootstrap-verify.test.ts | test | Todo | S | `docs/handoffs/TASK_1327a.md` |
| 1327b | Fix TA Alert Scan AC-1,2,5,6,7,9: update computeFn mock to async (code:string)=>Promise<ComputeTAResponse> | test | Todo | S | `docs/handoffs/TASK_1327b.md` |
| 1327c | Merge feature/ddd-phase-0 → main (gate: tsc clean, fail count = 15) | infra | Todo | S | `docs/handoffs/TASK_1327c.md` |
| 1327-docker | Post-merge: docker-compose up --build + health check port 3000 | ops | Todo | S | — |
| 1327-bun-crash | Document Bun 1.3.11 post-test panic as known non-code bug | infra | Todo | S | — |

**Dependency:** 1327a and 1327b run in parallel. 1327c depends on both. 1327-docker depends on 1327c.
**Deferred to Sprint 1328:** BCTC OCR x4, SSC pipeline null x2, Watchdog recovery x1, Price pipeline AC-4 x1 (all pre-existing, non-regression)

---

## Backlog

---
