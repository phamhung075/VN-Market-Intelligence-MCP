# dev-mcp-server -- Notebook

## 2026-06-15 · FIX-BCTC-ENRICH-SILENT-0ROWS — 0-rows enrich fails loud

**Task:** FIX-BCTC-ENRICH-SILENT-0ROWS (P0 CO-OWNER surface: enrich orchestration)
**Pattern learned:** Silent-swallow class — extraction fires, header inserts, rows=0, queue advances to done. Fix: read ACTUAL DB counts post-extraction (JOIN bctc_table_rows via financial_reports on action_code+sort_key); if both 0 → enrich_failed + logger.error + sendTelegramBug + continue.
**Key:** sort_key = `${period_year}-${period_quarter}` (e.g. "2026-Q1"). bctc_table_rows joins via report_id FK so must go through financial_reports for the action_code filter.
**Regression pattern:** 3 existing test files expected `done` on happy-path runs but had no extraction rows seeded. Fix: `seedExtractionResult(db, ticker, year, quarter)` in beforeEach or per-test — minimal financial_reports header + 1 bctc_table_rows row.
**Commit:** d4a0dacc | **Tests:** 9 new ACs + 55/55 across 4 files | No push (PO's call)
**Ops flag:** container REBUILD required before done_verified (worktree code not yet in live image)

## 2026-06-16 · FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 — aggregator migrated to writeOhlcvBatch

**Task:** FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 (RESUME — prior session died on transport, edits on disk)
**Root class:** 4 corruption classes per behavioral gate RED (2026-06-16-RED.md)

**Class 3 root (NEW FINDING):** PDN/NHD ÷1000 persists: prices in [100,999] bypass normalizeOhlcvToVnd (>=STOCK_MIN_VND=100). detectAndNormalizeScaleFromPrevClose needs prevClose>0 — PDN/NHD have NO prior real-volume row. prevCloseMap=0 → ratio check no-op. Cold-start gap; needs exchange reference-price seed (separate task).

**Gate results:** tsc clean | 6/6 new pass | 29/29 existing pass | 13073 full / 54 pre-existing fail | tools=164 | sched=3
**Live RAW:** VHM/VIC RSI healed (was 6.5/8.8, now 30.6/36.1). DCR/H11/DAG stranded pre-fix rows remain (FR-S1 blocks new re-creation).
**Commit:** d4b532be | Image rebuilt 05:41Z | REBUILD DONE

Zone health: tsc clean, 164 tools intact, scheduler 3 cron.schedule, VHM/VIC RSI real mid-band post-rebuild | HEALTHY

## 2026-06-16 · FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 — generic purge of synthetic flat seed bars

**Task:** FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 | Priority: P1 | Zone: apps/mcp-server/

**Root surface:** allzeroOhlcvBackfill.ts — added purgeStrandedSeedRows(). No separate repair job needed: called synchronously at startScheduler startup (before ohlcvStartupProbe fire-and-forget). On next ops rebuild+restart the live named-volume DB is repaired in-place.

**Shape predicate (GENERIC — no date literal, no ticker allowlist):**
`volume=0 AND open=high AND high=low AND low=close`
Covers Class 1 (DCR close=5900, H11 close=25700 — wrong-scale seeds) and Class 2 (DAG/DFF/POM close=0 — all-zero seeds). Safety: vol>0 candles never matched; ATC halt-day rows immune. Idempotent: second run deletes 0 rows.

**Why delete not recompute-on-read:** /goal#1 — no fake data stays in DB. Future readers without the guard would re-serve poison. Delete is permanent; recompute-on-read is not.

**Tests (7 cases in FIX-OHLCV-STRANDED-ROWS-REPAIR-P1.test.ts):**
- Regression: exact DCR/H11/DAG 2026-06-16 rows planted → all 5 purged
- Generic: XTICKER/ANOTHER on arbitrary past dates → deleted by shape alone
- Safety: ABC vol=100000 O=H=L=C (halt day) → NOT deleted
- Mixed: 3 real candles survive, 3 stranded deleted
- Idempotent: second run = 0 deletions
- Empty table: 0 deletions, no error
- Class-1 scale-outlier: DCR prior real close survives, stranded seed gone

**Gate results:** tsc clean (0 errors) | 73 pass / 0 fail (CONTAM-5/7 + P0 + ALLZERO + P1 suite) | tools=164 | sched=81
**Commit:** d4dcb5c4 | **REBUILD_REQUIRED:** YES — repair executes at container startup against named-volume DB

Zone health: tsc clean, 164 tools intact, scheduler 81 (cron.schedule+scheduleCron), purgeStrandedSeedRows wired at startup | HEALTHY
