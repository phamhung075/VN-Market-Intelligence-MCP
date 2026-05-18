# Ops — Notebook

**Last updated:** 2026-05-18 18:43 UTC | **Sprint:** 1950

> Full session history archived → `docs/archive/notebooks/ops-2026-05-18.md`

## Current state

**Infrastructure:** All 11 Docker containers healthy (api-gateway:4000, mcp-server:3000, technical-analysis:5003, macro-indicators:5004, kinh-dich-service:5005, alert-engine:5006, pdf-extractor:5001, rag-service:5002, stock-price:5010, news-fetch:5008)
**Watchlist:** 39 stocks (27 std + 7 high-vol + 5 other) — PLX added Sprint 1946a
**Scheduler:** 70 cron jobs registered (post-Sprint 1949 cron rewiring)
**Last rebuild:** kinh-dich-service 2026-05-18 17:09 UTC (hexagram name fix abf5ef2d)

## Known patterns / preferences

- Container restart does NOT auto-refresh live cron schedules — CronDelete + CronCreate required in same session
- Docker named volume prevents SQLite corruption (macOS VirtualMachine SHM tear on container stop — fixed Sprint 1336)
- VPS proxy required for all geo-blocked VN sources (Vinahost Hanoi) — NOT Vultr Singapore (decommissioned 2026-04-13)
- alert-engine Go binary: 3-phase DDL split required (CREATE TABLE → ALTER TABLE ADD COLUMN → CREATE INDEX)

---

## Recent tasks (2026-05-18)

### Sprint 1949 Completion — mcp-server Container Restart (18:43 UTC)

**Status:** DONE — Container restarted, new cron schedules active

Sprint 1949 cron rewiring (commit `44aa791a`) landed before this restart. Container had been running 8h predating the commit.

**Cron Schedule Changes (Sprint 1949-T6 & T7):**
- foreignFlowAlertJob: 09:30 UTC → 08:13 UTC weekdays (`13 8 * * 1-5`)
- macroIndicatorRefreshJob: 06:00 GMT+7 → 19:13 UTC daily (`13 19 * * *`)

**Verification:**
- Container status: healthy (up 5 seconds)
- Scheduler bootstrap: 70 cron jobs registered
- Both foreignFlowAlert and macroIndicatorRefresh confirmed loaded

### kinh-dich-service Docker Rebuild (17:09–17:10 UTC)

**Status:** DONE — commit abf5ef2d (kinh-dich-name-fix) now live

**Root cause:** Container was running old code where all hexagram names resolved to "Cần". Fix applied: 64 QUE_META hexagram names corrected to Vietnamese diacritics + fallback path fixed + repository query corrected.

**Smoke test:** `GET /reading/HPG` → `"name": "Khôn"` (correct)
**All 11 containers:** healthy post-rebuild

### Sprint 1946a — Docker Rebuild + PLX Watchlist (10:39 UTC)

**Status:** DONE — PLX added to watchlist, toolCount=142, watchlist.count=39

**AC:** All 7 criteria met (rebuild ✓, health 200 ✓, PLX in DB ✓, count 39 ✓, MCP responding ✓, bug signal processed ✓, project-stats updated ✓)
