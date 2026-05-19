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

## Sprint 1951d — VPS BCTC Pipeline Diagnostic (2026-05-19)

**Status:** DIAGNOSED — Root cause identified, escalation to dev-team required

**Problem Statement:** Cowork agents report BCTC data for only 3 of 34 watchlist stocks. Q1-2026 filings are 19 days overdue (deadline 2026-04-30, current 2026-05-19).

**Diagnostic Summary:**
- VPS service `vn-bctc-fetch.service` is running (up 5+ days)
- API connectivity to MCP server is working (queue pulls every 6h)
- Disk usage healthy (24% used, 18GB available)
- Upstream sources reachable (SSC, HNX, UPCOM all HTTP 200)
- **BUT:** Discovery script has critical pattern-matching bug preventing ANY PDF detection

**Root Cause:** `discover-bctc-urls-browser.py` on VPS has pattern-matching bug
- Function `matches_quarter_and_year()` looks for: `['q1', 'quý 1', 'quy 1', ...]` (no leading zero)
- SSC NewsSearch returns titles with: `'quý 01'`, `'quý 02'`, etc. (with leading zero)
- Result: All quarter-year matches fail validation, even though SSC rows ARE found
- Example: "Báo cáo tài chính Hợp nhất quý 01 năm 2026" (ACB Q1/2026) → skipped with error "no PDF found"

**Evidence:**
1. Service logs show "SKIP -- no PDF found" for ALL 34 queue items (CTG, D2D, DAG, GVR, HCM, etc.)
2. Cache dir `/root/bctc-cache/` has 39 ticker dirs; only 3 contain PDFs (VCB, HPG, BID from Q4.2025)
3. Last successful fetch was 2026-04-29; since then zero PDFs for any ticker
4. Python pattern test: `matches_quarter_and_year('báo cáo ... quý 01 năm 2026', 'Q1', 2026)` → **False** (bug confirmed)
5. Would return **True** if source used `'quý 1'` format (without zero)

**Secondary Issue:** jq parse error at end of fetch log
- Last line: `jq: parse error: Invalid numeric literal at line 1, column 6`
- Context: appears after 2026-05-19T02:29:06Z FETCH START
- Likely cause: QUEUE variable empty/truncated or unquoted in jq pipeline
- Impact: Blocks second cycle; service restarts but repeats same cycle indefinitely
- **Note:** This is lower priority — pattern-matching bug is the blocker

**Blockers for Data Ingestion:**
1. **discover-bctc-urls-browser.py pattern fix** — Must add 'quý 01', 'quý 02', etc. to patterns list
2. **fetch-bctc.sh jq error** — Debug QUEUE variable handling
3. **19-day backlog** — After fix, service will need to re-discover + pull all 34 Q1/2026 filings

**File Locations:**
- VPS script: `/root/discover-bctc-urls-browser.py` (Python 3, NOT in repo)
- VPS shell: `/root/fetch-bctc.sh` (not in repo, but mirror exists at `vps-scripts/fetch-bctc.sh`)
- Service unit: `/etc/systemd/system/vn-bctc-fetch.service`
- Log file: `/var/log/vn-bctc-fetch.log`

**Coordination:**
- dev-pdf-extractor responsible for MCP-side pull + OCR (downstream of this fix)
- This diagnostic is VPS-side only (push → queue fill)
- Failure point: upstream of MCP (PDFs never reach VPS push endpoint)

**Next Actions:**
1. Dev team: Fix discover script patterns, deploy to VPS via `scripts/deploy-vinahost.sh`
2. Dev team: Test fix on one ticker (e.g., ACB Q1/2026)
3. Ops: Monitor next 6-hour cycle for successful PDF fetches
4. Escalation channel: WORK (dev-team) + BUG (incident tracking)

**Diagnostic Output:** `docs/signals/ops-1951d-vps-bctc-diagnostic.json`

---

## Recent tasks (2026-05-19)

### Sprint 1953b — Docker Rebuild + OCR Verification (09:50 UTC)

**Status:** BLOCKED — Infrastructure OK, code defect found

Sprint 1953b (commit `eb0766ab`) added poppler-utils + tesseract-ocr + tesseract-ocr-vie to mcp-server Dockerfile for in-container OCR extraction.

**Steps completed:**
1. Docker rebuild: PASS (156 sec, all deps installed)
2. OCR binary verify: PASS (`/usr/bin/pdftoppm`, `/usr/bin/tesseract` present)
3. Vietnamese lang: PASS (`tesseract --list-langs | grep vie` → vie)
4. Container deploy: PASS (healthy, 142 tools registered, health check passing)
5. OCR extraction retry on GAS/EIB/DHG/FPT Q1-2026: **FAIL**

**Blocker:** EPIPE (broken pipe) crash at pdfOcrWorker.ts:176 during Tesseract text streaming. Occurs on every OCR extraction attempt for large PDFs (36-76 pages). Process crashes, container restarts, bctc_vps_queue entries remain 'pending'.

**Root cause diagnosis:** Stream handling defect in pdfOcrWorker.ts when piping Tesseract output for multi-page PDFs. Suspected: (a) improper lifecycle mgmt, (b) buffer overflow, (c) child process signal handling.

**Signal file:** `docs/signals/ops-1953b-deploy-verify.json` (full verification results, stack traces, database state)

**Escalation:** dev-mcp-server sprint 1953b — pdfOcrWorker.ts EPIPE fix required before retry.

**Infrastructure state:** All 11 Docker containers healthy. mcp-server running normally outside of OCR jobs. No VPS/DB/network issues.

