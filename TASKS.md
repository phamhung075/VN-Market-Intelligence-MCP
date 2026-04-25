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
- **DDD Phase 0:** Monorepo scaffold — merged
- **DDD Phase 1a/1b:** PDF Extractor + RAG Service Python/FastAPI — done
- **DDD Phase 2a/2b:** 4 TS microservices + kinh-dich + alert-engine — done
- **Phase 3c:** Parallel TA + BB alert scan (Promise.allSettled) — merged 8c33f0da
- **1327:** Phase 0 merge + test infrastructure stabilization — Done (1327b,1327c done; 1327a review; 1327-docker deferred)
- **1328:** Cowork communication overhaul — Done (signal payload fields, conviction scorer, suppression transparency, 3-channel strategy, impact threshold tuning)
- **fix-1293c:** Signal rejection time-filtering — Done (SQLite datetime() replaces JS ISO cutoff, 3 regression tests restored)
- **fix-1328e:** notifyTelegramAlert BUG channel routing — Done (coreSend("bug") direct, rebased onto watchdog null-fix, 12/12 pass)
- **fix-bctc-ocr:** BCTC OCR fallback hardening — Done (fallback disabled by default, null on rejection, contamination reverted, merged 1e366b66)
- **fix-watchdog-recovery:** Null foreign-flow timestamp treated as fresh — Done (3 tests pass, APPROVED, report 2026-04-25)
- **1329e:** scoreImfMacro() + WEIGHTS rescaling to 7 dimensions — Done (13 new tests pass, WEIGHTS sum=1.0000 exact, merged 5347ee19)

---

## Backlog

---
