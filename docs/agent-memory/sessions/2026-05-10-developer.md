### Task: Task 1300b: Memory Update Tools
- **Finding**: Agents need update_memory tool
- **Fix**: Implemented append_session_record
- **Status**: Ready for QA

---

### Cycle 2026-05-10 — Task 1862j: W-3 sigma dedup safeguard

**Root cause confirmed:**
`runWeeklyAudit` W-3 used a two-condition DELETE that kept only MAX(rowid) per (code, DATE(fetched_at)). When the VPS price-push job emitted many intraday readings on the same day, ALL rows on that date were treated as "duplicates". The dedup kept 1 row per (code, date) and wiped the rest. With 417 stocks × many intraday pushes, sigma data dropped from 30+ rows/stock to near 0 → all stocks fell from READY to NOT READY.

**Fix (dataAuditJob.ts W-3 block):**
- Pre-count rows before DELETE
- Dry-run SELECT COUNT of rows that WOULD be deleted
- If wouldDelete / preCount > 50%: ABORT, emit `check="duplicate_price_history_aborted"` (severity=critical, action=escalated), skip the DELETE
- Below threshold: proceed with DELETE as before

**Tests (1862j-sigma-dedup-safeguard.test.ts — 5 tests):**
- AC-1: safeguard aborts when >50% would be deleted (100 rows, 90% deletion)
- AC-2: normal dedup proceeds below threshold (155 rows, 5 deletions = 3.2%)
- AC-3: sigma readiness (30 rows/stock) preserved after normal dedup
- AC-4: aborted finding detail contains row counts for human audit
- AC-5: empty table runs safely with 0 changes

**Results:** 5/5 new tests pass. 16/16 existing audit tests pass. Full suite: baseline 115 fail → 113 fail (no regressions, 2 new passes).

**Branch:** task/1862j-sigma-data-safeguard | **Commit:** fd5db6b6

---

### Cycle 01:42 UTC — Task 1862g: urgent_news 4h signal dedup

**Problem:** news-scout fires same ticker + direction urgent_news signals every 15 min for hours (VIC bullish 07:14-11:20 UTC). Alert spam.

**Fix (agentSignalStore.ts postSignal):**
- Added `dedupWindowMinutes?: number` to `PostSignalInput`
- Default: 240m (4h) for `urgent_news`, 0 (disabled) for all other types
- Before INSERT: query existing (stock_code, signal_type, direction) within window
- Returns -1 when suppressed; no DB insert
- Direction read from `finding_data.direction` fallback `finding_data.catalyst_direction`
- Skipped when stock_code or direction absent (can't form dedup key)
- JSON_EXTRACT primary path, LIKE fallback for older SQLite

**Key decision:** type-aware default (urgent_news only) avoids breaking 1295d enrichment chain tests that intentionally post same ticker+direction for catalyst+validation pair.

**Tests (1862g-signal-dedup.test.ts — 10 tests):**
- First signal inserts normally
- Same stock+direction within window → returns -1 (suppressed)
- Different direction → not suppressed
- Different ticker → not suppressed
- Different signal_type → not suppressed
- No direction in finding_data → no dedup, both pass
- No stock_code → no dedup, both pass
- dedupWindowMinutes=0 → window expired, both pass
- Custom dedupWindowMinutes=30 → suppresses within 30 min
- Row count = 1 after suppressed duplicate

**Results:** 10/10 new tests pass. Full suite: 9084 pass, 15 fail (all 15 pre-existing, no new regressions).

**Branch:** task/1862g-signal-dedup | **Commit:** 4982fb1d