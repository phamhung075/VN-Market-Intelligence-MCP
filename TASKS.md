# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 140 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1394 | test(alert-digest-diacritics): TDD test 1394-alert-digest-diacritics.test.ts | Done | Dev |
| 1395 | fix(alert-digest-diacritics): proper Vietnamese diacritics in assembleAlertDigest | Done | Dev |

> Sprint goal: `SPRINT_GOAL.md` | COMPLETE 2026-04-17 | 5061 pass, 0 fail, 21 skip

---

## Sprint 141 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1396 | fix(db-isolation): setup.ts process.env → Bun.env + purge phantom telegram_report rows | Done | Dev |
| 1400 | test(db-isolation): RED test — assert Bun.env["DB_PATH"] = ":memory:" | Done | Dev |
| 1401 | fix(db-isolation): setup.ts + purge phantom rows + dev-standards template | Done | Dev |

> Sprint goal: COMPLETE 2026-04-18 | fix shipped, 84 phantom rows purged

## Sprint 142 — Active

> Spec: `docs/REQ_1402.md` | Tech: `docs/TECH_1402.md` (APPROVED_BY_ARCHITECT)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1402 | test(volume-spike-multiplier): RED test — assert two tickers with different avg volumes produce different multipliers | Done | Dev |
| 1403 | fix(volume-spike-multiplier): extend ATC guard + per-ticker avgVolume logging + correct baseline query | Done | Dev |
| 1404 | test(alert-diacritics): RED test — assert convictionScorer labels contain correct Vietnamese diacritics | Review | Dev |
| 1405 | fix(alert-diacritics): replace unaccented labels in convictionScorer.ts + technicalIndicatorTools.ts | Todo | Dev |

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|
| 1399 | fix(hut-sector): HUT misclassified as real_estate — triggers BĐS cascade incorrectly (should be infrastructure/construction) | MEDIUM | Sprint 143 |

---

## Task Details (backlog)

### 1397 — fix(volume-spike-multiplier): identical 5.9× across all tickers

**Priority:** HIGH
**Root cause:** Two compounding issues:
1. `src/interface/mcp/server.ts:514` comment documents a past "bogus uniform 5.3× spikes" fix but the 5.9× still fires. The SQL at lines 522-531 queries `MAX(volume) per day` excluding today via `substr(fetched_at, 1, 10) < ?` — if `fetched_at` timezone mismatch causes all closed-day rows to be excluded, `avg_vol=NULL` propagates as `avgVolume=0`, and the `avgVolume > 0` guard at `src/domain/services/signalDetector.ts:249` suppresses spikes entirely. But if the issue is that volume is intraday cumulative and the average is an end-of-day baseline, the ratio converges identically across all tickers mid-session.
2. ATC window guard at `src/domain/services/signalDetector.ts:247` blocks `07:30–08:05 UTC` but the uniform 5.9× fires at `08:30 UTC` (= 15:30 VN, post-ATC session close) — just outside the guard window.
**Files:**
- `src/interface/mcp/server.ts:517-534` — `avgVolMap` SQL computation per ticker
- `src/domain/services/signalDetector.ts:244-258` — ATC window guard (lines 247-248) and volume spike message (line 255)
- `src/domain/services/signalDetector.ts:145` — `VOLUME_SPIKE_MULTIPLIER = 2` (threshold, not the 5.9× value)
**Impact:** Volume spike alerts unreliable — user cannot distinguish real anomalies from systematic end-of-session misfires.
**Fix:** (1) Extend ATC guard to cover 08:00–08:35 UTC (market close flush window); (2) add logging to dump per-ticker `avgVolume` values to confirm per-ticker isolation; (3) TDD test asserting two tickers with different avg volumes produce different multipliers.

### 1398 — fix(alert-diacritics): unaccented text in server-side alert messages

**Priority:** HIGH
**Root cause:** Conviction scoring labels and inline message strings in the alert assembly pipeline use unaccented Vietnamese. Sprints 135-140 fixed scheduler digest formatters but did NOT touch the conviction scorer or its output strings.
**Files (exact locations):**
- `src/domain/services/convictionScorer.ts:127-130` — `LEVEL_VI` labels: `"XAC TIN CAO"`, `"Kha chac chan"`, `"Hon hop"`, `"Tin hieu yeu/mau thuan"` all need diacritics
- `src/domain/services/convictionScorer.ts:338` — inline string `"tin hieu mau thuan, than trong"` needs diacritics
- `src/interface/mcp/tools/technicalIndicatorTools.ts:235` — `"can than — co the xem xet chot loi hoac cho them xac nhan"` needs diacritics
- `src/interface/mcp/tools/kinhDichTools.ts:1035` — `"BAT LOI cho giao dich — can than trong"` needs diacritics (secondary, not in alert pipeline)
**Fix:** TDD RED (test that `scoreConviction()` output contains correct accented strings) → GREEN (replace all unaccented labels in `convictionScorer.ts` + `technicalIndicatorTools.ts`). Do NOT touch `kinhDich/kinhDichReading.ts:80` — that `"BAT LOI"` is a lookup key, not user-facing text.

### 1399 — fix(hut-sector): HUT misclassified as real_estate

**Priority:** MEDIUM
**Root cause:** HUT (Tasco Joint Stock Company — toll roads, highway infrastructure) appears in the alert system classified under `real_estate` sector, causing it to trigger "Bất động sản giảm đồng loạt" cascade alerts alongside 9 genuine real estate stocks. HUT's business is highway concessions + infrastructure construction, not property development.
**Files:**
- `docs/data/stock-classification.json` — HUT entry needs sector changed from `real_estate` to `infrastructure` (or `construction`). NOTE: HUT is NOT currently in the `watchlist` array of this file (verified 2026-04-17). The misclassification may be in a different store — check `data/market.db` watchlist table: `SELECT code, sector FROM watchlist WHERE code = 'HUT'`
- If not in DB watchlist, the source may be hardcoded in a sector cascade rule — grep `src/` for `"HUT"` to find where it is assigned to real_estate.
**Fix:** (1) Locate exact HUT sector assignment (DB row or hardcoded string); (2) reclassify to `infrastructure`; (3) verify cascade rule test for real_estate no longer includes HUT.

---
