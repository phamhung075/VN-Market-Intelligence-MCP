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

## Sprint 1951 Phase 1 — 24h Smoke-Test Monitoring (2026-05-18 setup)

**Status:** In Progress — monitoring window 2026-05-19 00:00 UTC to 2026-05-20 00:00 UTC

**Objective:** Validate ≥3 RemoteTrigger ticks fire at expected times with correct agent sessions + zero MARKET duplicate dishes (idempotency check).

**3 Guaranteed-Slot Triggers (Live 2026-05-18):**
1. `chef-morning` (trig_019nwLpkYELqFdE1DZaRhPUk): `23 5 * * 1-5` = **05:23 UTC Mon-Fri**
2. `chef-eod` (trig_011HNsRMNiQwa3vNwN1b9Anh): `37 8 * * 1-5` = **08:37 UTC Mon-Fri**
3. `tnb-audit` (trig_01LpUxJ98v2aK22FqLSBtL1G): `13 20 * * *` = **20:13 UTC daily**

**Next Expected Ticks (UTC):**
- 2026-05-18 20:13 — tnb-audit (tonight, ~4h from setup)
- 2026-05-19 05:23 — chef-morning (tomorrow, first weekday tick)
- 2026-05-19 08:37 — chef-eod (tomorrow)

**Verification Plan:**
1. **WORK channel scan:** Search for `[chef] START`, `[chef] SENT`, `[chef] SILENT`, `[tnb]` patterns at/within 5min of expected tick times.
2. **Agent session trace:** Confirm session_id + unified-agent or tran-ngoc-bau session launched (via WORK telemetry).
3. **MARKET idempotency:** Grep MARKET for duplicate `morning_dish` / `eod_dish` within same 24h window (zero duplicates = PASS).
4. **Tick documentation:** WORK Telegram per tick: `[ops/1951b-smoke] <slot_id> fired <timestamp> → <agent> session <id> → <dish_type>`

**Monitoring Details:**
- tnb-audit pattern: `[tnb]` prefix + expected time 20:13 UTC (audits last chef cycle)
- chef pattern: `[chef] START <dish_type> | cycle=chef-<type>-<TS>` = entry; `[chef] SENT <dish_type>` = MARKET publish success
- Silent exit OK: `[chef] SILENT intraday` only (morning/eod/evening must always publish)

**Carry-over state:**
- Infrastructure stable (all 11 containers healthy)
- 12/16 RemoteTriggers created (4 rejected API min-interval <1h constraint)
- Cron schedule SSOT: `docs/data/cowork-schedule.json` with trigger_id + cron confirmed

**Next step:** Keep TASK_1951b **In Progress**. Close only after ≥3 ticks verified (1951c persistence gate depends on this).
