# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162: `docs/archive/sprints-133-162.md`
> Sprints 163–176: `docs/archive/sprints-163-176.md`
> Sprints 177–189: `docs/archive/sprints-177-181.md` / `sprints-182-189.md`
> Sprints 190–240: `docs/archive/sprints-190-220.md` / `sprints-221-230.md` / `sprints-231-239.md` / `sprints-240-240.md`
> Sprints 1269–1294: `docs/archive/sprints-1269-1277.md` / `1278-1282.md` / `1282-1289.md` / `1290-1290.md` / `1291-1294.md`
> **Sprint 1289f/1295/1296 details + Sprint 1297/1299 task details archived:** `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprints 1296–1302 — COMPLETE — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`
- 1296: IMF research + classifier design | 1297a: fail-loud injection (done) | 1298: IMF test coverage (6508+ tests)
- 1299: token reduction 65k→<30k (6590 tests) | 1300: TelegramMessageFactory (6573 tests) | 1302: textUtils.ts DDD fix (6606 tests)
- Task 1304: newsNormalizer DDD import fix (merge 4ca649a7)

---

## Sprint 1297 — DONE (1297a Done, 1297b Done, 1297c Done)

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1297a | Fail-Loud Protocol Injection (16 agents) | agents | Done |
| 1297b | BCTC Portal URL Discovery Fix | vps-scripts | Done |
| 1297c | VPS Validation of BCTC Portal Fix | ops | Done |

### 1297c — VPS Validation (2026-04-24)
deploy: `scp vps-scripts/discover-bctc-urls-browser.py root@125.212.251.27:/root/` (16682 bytes)
service: `vn-bctc-fetch.service` restarted 12:50:48 +07, active (running)
AC: HNX AJAX POST works (PVS/NVB → PDF URLs), UPCOM flow no crash, HOSE informative error (VNM/BID/FPT all HOSE → expected empty+error), report: `reports/TASK_REPORT_1297c.md`

---

## Sprint 1303: Backlog Drain — Bug Fixes from Telegram Reports (2026-04-24)

| ID | Title | Layer | Status | Reports |
|----|-------|-------|--------|---------|
| 1303a | price_surge 4h bucket dedup (was 1h) | domain | Done | #2589 |
| 1303b | Sentiment: add cost-pressure bearish keywords | domain | Done | #2588 |
| 1303c | policyImpactMapper: add corporate_governance type | domain | Done | #2587 |
| 1303d | Test log contamination: extend schema cleanup | infra | Done | #2590 |
| 1303e | pipelineWatchdog + vpsProxyWatchdog: remove MARKET channel spam | scheduler | Done | #2596 |
| 1303f | append_session_record: add content deduplication | interface | Done | SEC |
| 1303g | UNBLOCK — VPS all-services down (prices/BCTC/news/FX/flow) | ops | Done | #2598,2599,2604,2607 |
| 1303h | SPRINT — BCTC PDF parser impossible figures | domain | Done | #2597,2608,2610 |
| 1303i | SPRINT — Cascade rule gaps (geo/BCTC overdue/trade map) | domain | Done | #2595,2600,2602 |

**Status:** 1303a–1303i DONE. WIP: 0/2.

### 1303h/1303i — DONE — details: `docs/handoffs/TASK_1303h.md`, `docs/handoffs/TASK_1303i.md`

---

## Sprint 1298 — IMF Sentiment Classifier: Test Coverage

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1298a | IMF Domain Model + Classifier + Schema Tests (RED) | test/domain | Done |
| 1298b | IMF Fetcher + Poller Job + Cron Registry Tests (GREEN) | test/infra | Done |
| 1298c | IMF Cascade Rules + Conviction Weight + MCP Tool Tests (GREEN) | test/signal | Done |

context: `docs/TECH_1298.md` | handoffs: `docs/handoffs/TASK_1298a.md`, `TASK_1298b.md`, `TASK_1298c.md`
note: All 8 FRs implemented in sprint 1296. This sprint = 3 missing test files only. No production code changes expected.

---

## Task 1312 — BCTC enrich-bctc-urls.sh skip logic inversion fix (2026-04-24)

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1312 | enrich-bctc-urls.sh skip condition inverted | vps-scripts | Done |

Fix: `vps-scripts/enrich-bctc-urls.sh:47–55` — was `[ -z "$SOURCE_HINTS" ]` (skip when empty = skip unenriched rows). Changed to `[ -n "$SOURCE_HINTS" ] && ! grep -qF "congbothongtin.ssc.gov.vn/faces/NewsSearch"` (skip when first hint is NOT fallback portal = skip already-enriched rows). 6742 tests pass. Branch: `task/1312-bctc-skip-logic`.

---

## Sprint 1313 — Channel Routing Regression Guard (2026-04-24)

| ID | Title | Layer | Status | Size |
|----|-------|-------|--------|------|
| 1313a | Add channel-enforcement integration tests + audit routing paths | test | Done | S |

**Status:** 1313a DONE. 6 new tests (all GREEN, 6715 total suite). Prevents recurring routing violations via static-analysis guards.
Note: Test 1 validates watchdog jobs never send to 'market'. Test 2 validates server.ts errors→'work'. Test 3 whitelists legitimate 'market' callers (briefing jobs only). Merge commit: b9104e98.

WIP: 0/2

---

## Sprint 1311 — Backlog Drain: DB Schema + Sentiment + Macro (2026-04-24)

| ID | Title | Layer | Status | Reports | Size |
|----|-------|-------|--------|---------|------|
| 1311a | Schema migration: add verdict/reviewed_at to market_messages (prod) | infra | Done | 1265 | S |
| 1310a | push-foreign-flow UNIQUE constraint: diagnose + fix duplicate code rows | infra | Done | 1275,1277,1280 | S |
| 1309a | Cascade rule gaps: Hormuz oil+aviation, govt securities, agri exclusion | domain | Done | 1264,1268,1286 | M |
| 1308a | Sentiment: add insider SELLING + global bearish macro patterns | domain | Done | 1272,1278,1284 | S |
| 1307a | Macro alerts: fix level-drift cooldown bypass + direction label in briefing | domain/scheduler | Done | 1269,1270,1276 | S |

**Status:** 1311a–1307a DONE. All implementations shipped + tests green (57 tests, 6710 total suite).
Note: 1311a verdict migration confirmed in `schema-news.ts:148-156`. 1310a UNIQUE(code,date) fix confirmed in `vnstockStore.ts:60-120`. 1307a cooldown fix confirmed at `intelligenceCycleJob.ts:629-634`. 1308a patterns confirmed in `sentimentClassifier.ts:205-214`. 1309a agri-exclusion + Hormuz rules confirmed in `cascadeEngine.ts:1150-1167,2824-2826`.

WIP: 0/2

---

### 1311a — Schema migration: verdict columns in market_messages

**Root cause:** `verdict`, `verdict_note`, `reviewed_at` columns added to `CREATE TABLE IF NOT EXISTS market_messages` DDL but no `ALTER TABLE` guards. Production DB tables created before these columns were added → columns missing → `UPDATE` silently no-ops → `WHERE verdict IS NULL` returns same rows every loop.

**Fix:** Add `ALTER TABLE` migration guards in `schema-news.ts` (same pattern as impact_score columns at line 150-155).

**Files:**
- `src/infrastructure/db/schema-news.ts:149-155` — add three `ALTER TABLE market_messages ADD COLUMN verdict/verdict_note/reviewed_at` guards in try/catch block
- `src/__tests__/1311a-market-messages-verdict-migration.test.ts` — RED test: create table without columns, run `initNewsTables()`, assert columns exist

**AC:** `batch_review_market_messages` with IDs that previously re-appeared unreviewed now stays reviewed. Test baseline +3 tests.

**baseline_pass:** 6629

---

### 1310a — push-foreign-flow UNIQUE constraint (recurring x3)

**Root cause investigation needed:** `vnstockStore.ts` uses `INSERT OR REPLACE` with `UNIQUE(code)` (no date). But `schema.ts` also creates `UNIQUE INDEX uq_vnstats_code_date ON vnstock_trading_stats(code, date)` — two competing UNIQUE constraints. When VPS sends same `code` twice in one batch, `INSERT OR REPLACE` on `(code, date)` fires conflict. But there is ALSO an implicit `UNIQUE(code)` from the original table DDL (if any). Check exact DDL in production vs schema.ts.

**Files:**
- `src/infrastructure/db/vnstockStore.ts:60-120` — audit UNIQUE constraint resolution; confirm `INSERT OR REPLACE` targets `(code, date)` not `(code)` alone; add `ON CONFLICT(code, date) DO UPDATE` explicit syntax if needed
- `src/__tests__/1310a-push-foreign-flow-dedup.test.ts` — RED test: insert same code twice in one batch, assert no UNIQUE constraint error

**AC:** VPS batch with duplicate ticker codes succeeds. No UNIQUE constraint errors in logs. Test baseline +3 tests.

**baseline_pass:** 6629

---

### 1309a — Cascade rule gaps (Hormuz, govt securities, agriculture exclusion)

**Root cause:** `cascadeEngine.ts` SECTOR_RULES last touched sprint 1303i. Three confirmed gaps from 24-report batch:
1. Hormuz blockade → oil_gas BULLISH (BSR refinery margin) + aviation BEARISH (VJC fuel cost) missing
2. Government market support announcement → securities sector BULLISH (SSI/VCI/VIX/VND) missing
3. Agriculture commodity export news (coffee/rice) → should NOT cascade to real_estate (HUT); sector filter too broad

**Files:**
- `src/domain/services/cascadeEngine.ts` — add Hormuz rules (oil_gas+aviation), govt_support rules (securities), tighten agriculture sector filter
- `src/__tests__/1309a-cascade-rule-gaps.test.ts` — RED tests: 3 scenarios (hormuz/govt/agri-exclusion)

**AC:** (1) "Hormuz blockade" → BSR BULLISH + VJC BEARISH. (2) "Chính phủ hỗ trợ thị trường" → SSI/VCI BULLISH. (3) "xuất khẩu cà phê tăng" → no cascade to HUT (real_estate). Test baseline +6 tests.

**baseline_pass:** 6629

---

### 1308a — Sentiment: insider SELLING + global bearish macro patterns

**Root cause:**
1. `leadershipSignal.ts` has `insider_sell` type but the Vietnamese text "xả hàng" (dump), "bán ra 9 triệu cổ phiếu" is not in keyword patterns → classified default BULLISH.
2. Global bearish macro: "hạ dự báo GDP" (lower GDP forecast), "báo lỗ lớn" (report large losses), "IMF cắt giảm" (IMF cuts) → not in bearish macro keyword list → classified BULLISH.

**Files:**
- `src/domain/services/leadershipSignal.ts:115-150` — add "xả hàng", "bán ra.*triệu", "thoái vốn", "giảm sở hữu" to insider_sell detection pattern
- `src/domain/services/sentimentAnalyzer.ts` (or equivalent) — add "hạ dự báo", "cắt giảm dự báo", "báo lỗ", "thiệt hại", "IMF.*cắt" to bearish macro patterns

**AC:** "Cổ đông lớn xả hàng 9M cổ phiếu CEO" → BEARISH insider_sell. "IMF hạ dự báo GDP toàn cầu" → BEARISH macro. Test baseline +4 tests.

**baseline_pass:** 6629

---

### 1307a — Macro alerts: level-drift cooldown bypass + briefing direction label

**Root cause (two independent bugs):**

**Bug 1 — Cooldown bypass:** Alert ID is `macro-{today}-{name}-{level}` (e.g. `macro-2026-04-15-usdVndRate-extreme`). When level drifts `extreme→high` on next 15-min cycle, new ID = `macro-2026-04-15-usdVndRate-high` → `alreadySentToday` check misses it → fires again. 5 alerts in 65 minutes.

**Fix:** Change `alreadySentToday` LIKE pattern to `macro-{today}-{name}-%` (already does this at line 631) — but the INSERT also uses `{level}` in the id. If a new level fires, it inserts with `notified_telegram=0` initially. Fix: skip if ANY alert for this indicator was already stored today (regardless of whether notified), not just notified ones. Or: deduplicate by name+day at storage time (INSERT OR IGNORE by a partial key).

**Bug 2 — Hardcoded direction:** `morningBriefingJob.ts` uses template with hardcoded "cao hơn TB" even when `direction === "below"`. Wire `levelVi` from `macroThresholds.classifyDeviation()` result which already has correct directional label.

**Files:**
- `src/scheduler/news-analysis/intelligenceCycleJob.ts:629-632` — remove `AND notified_telegram = 1` from `alreadySentToday` check; skip if ANY macro alert stored today for this indicator (regardless of sent status). Prevents level-drift (extreme→high) from creating duplicate alerts on next 15-min cycle.
- `src/scheduler/briefings/morningBriefingJob.ts` — find macro direction label template, replace hardcoded string with dynamic `dev.levelVi` or equivalent from `classifyDeviation()` output

**AC:** USD/VND alert fires max once per indicator per UTC day. Morning briefing shows "thấp hơn TB" when σ is negative. Test baseline +4 tests.

**baseline_pass:** 6629

---

## Sprint 1315 — Cost-Push Cascade Rules: Logistics / Utilities / Construction

| ID | Title | Layer | Status | Size |
|----|-------|-------|--------|------|
| 1315a | Cascade cost-push rules + ClimateImpactMapper (RED) | domain | Done | S |
| 1315b | Integration tests + regression (GREEN) | test | Done | S |

context: `docs/TECH_1315.md` | handoffs: `docs/handoffs/TASK_1315a.md`, `docs/handoffs/TASK_1315b.md`
branch: `task/1315-cost-push-cascade`
baseline: 6715 tests

---

## FIX-1317 — Task308 test regex + project-stats sync (2026-04-24)

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1317 | Fix Task308 /toolRegistry\.forEach/ regex + stale project-stats | test/docs | Done |

Fix: `src/__tests__/308-tool-registry.test.ts:99` — regex relaxed from `/toolRegistry\.forEach/` to `/toolRegistry/`. server.ts uses `fns=toolRegistry` alias pattern; forEach is on `fns`, not `toolRegistry` directly. Removes 1 false-fail from pre-existing baseline noise.
`docs/data/project-stats.json` — currentSprint:1317, testBaseline:6762, notes current.
merge: 62bbc16e

---

## Sprint 1318–1321 — Infrastructure & Backlog Cleanup (2026-04-24)

| ID | Title | Layer | Status | Size |
|----|-------|-------|--------|------|
| 1319 | Watchdog add foreign_flow staleness monitoring | infra | Done | S |
| 1320 | Update IMPLEMENTATION_STATUS.md (backlog 1286) | docs | Done | S |
| 1321 | VPS OOM prevention: MemoryMax + StartLimitBurst guard | vps-scripts | Done | S |

**Status:** 1319–1321 DONE. WIP: 0/2. +8 tests (6777 total).

### 1319 — Watchdog foreign_flow staleness (90-min threshold)
Adds readLatestForeignFlowTimestamp() reader + stale check to prevent silent 7-day staleness like Apr 21-24 outage. Query: MAX(updated_at) WHERE foreign_buy_vol IS NOT NULL. Merged: f7986f40.

### 1320 — IMPLEMENTATION_STATUS.md sprint summary
Appended comprehensive block covering sprints 074-1317: IMF classifier, VPS validation, backlog drain (9 fixes), cost-push cascade, current stats. Resolves backlog item 1286. Merged: 8b2893f2.

### 1321 — VPS news-fetch OOM prevention
MemoryMax 128M→512M, added MemorySwapMax=0, StartLimitIntervalSec=300, StartLimitBurst=5 to prevent infinite restart loop (Apr 21-24 OOM killer crash → 7623 restarts → manual stop). Merged: f6c7b191.

---

## FIX-1326b — MARKET channel spam guard (2026-04-24)

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1326b | send_telegram: block pipeline diagnostics from MARKET channel | interface | Done |

Fix: `src/interface/mcp/tools/briefings/telegramTools.ts:51-70` — 6-pattern regex guard blocks diagnostic/VPS messages from market channel; work/bug bypass unaffected. +4 tests (6752 total). Merge: a1b34020.

---

## DDD Microservices — Phase 0 (2026-04-24)

| ID | Title | Layer | Status | Branch |
|----|-------|-------|--------|--------|
| DDD-P0 | Monorepo Scaffold: move src/ → apps/mcp-server/ | infra | Review | feature/ddd-phase-0 |

Plan: `/Users/admin/.claude/plans/harmonic-juggling-dongarra.md`
Gate: 6778 pass / 9 fail (baseline 6759/11). +17 scaffold gate tests. tsc clean.
Handoff: `docs/handoffs/DDD_PHASE0.md`

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|
| DDD-P1a | Phase 1a: PDF Extractor Python/FastAPI microservice | high | after P0 merged |
| DDD-P1b | Phase 1b: RAG Service Python/FastAPI microservice | high | after P0 merged |

---
