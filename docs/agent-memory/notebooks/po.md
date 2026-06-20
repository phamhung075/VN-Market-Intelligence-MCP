# PO Notebook

_Last: 2026-06-20T08:15:29Z_

## Carry-over
- 3 NEW db_integrity_breach (router-RAW-verified live market.db) triaged this tick → minted FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 (db1+db2, multi), CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR (depends on it), FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (db3, apps/mcp-server/). Signal rows db1/db2/db3 NEW→READ (not RESOLVED until fix ships).
- review[6]: 4 CI/behavioral-gated (FIX-CI-RED-7fef5850, FIX-CI-NETWORK-SKIP-GUARDS-CASCADE-INTEG = BLOCKED on out-of-band push+CI-green, do NOT advance) + FIX-ALERT-ENGINE-RSI-SINGLEDIGIT + FIX-BCTC-ENRICH-SILENT-0ROWS (LIVE gates). ARCH-SHIP-WAVE-REAUDIT PARKED.
- WIP=0, head idle. New P0 writer-integrity + db3 returned in BATCH for router promotion (≤2 active discipline).
- 14 prior TRIAGED rows = reconfirmed known (no re-mint). vps-bctc 3.19d / cowork SKIPPED_BLIND_NO_BACKSTOP = known-standing, informational, no task.

## This cycle — dev-team triage tick 20260620T080911Z (Sat weekend, VN market CLOSED; gateway-blind local spawn; router did all live-DB verify)
RETURN = BATCH of 3 (1 P0 FIX writer-integrity, 1 CLEAN residue-repair dependent, 1 P1 FIX vnindex-cache).

PRIMARY: 3 router-VERIFIED db_integrity_breach rows from new cron-db-data-integrity (b8224509).
- db1 (HIGH) 835 OHLC-constraint violations/129 tickers/2026-04-24..06-12 (close-outside-[low,high] BMI/SHS/OIL/HUT + h=l=0 sentinels VNDAF) + db2 (CRITICAL) DFF 1000x intra-row scale (06-12 0.5/500) → FOLDED into ONE writer-integrity FIX per memory ohlcv_startup_purge_defeated_by_backfill_seeder (same daily_ohlcv WRITER class, fix the WRITER, trace ALL writers incl raw-INSERT bypass). zone=multi (architect splits stock-price writer + mcp-server writeOhlcvBatch). ABSORBS existing FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2 (the prevClose=0→detectAndNormalizeScale no-op is db2's scale root). Companion CLEAN repairs the 835 existing rows AFTER writer ships (else re-poisoned), illiquid→honest-gap not synthesize.
- db3 (MEDIUM) vn_index_cache 0 rows / vnIndexRefresh */5 not populating → own FIX apps/mcp-server/, refresh-path trace; folds the audit-question rows CI-FRESH-01-FIX + MD-FUNC-01-FIX (their answer: NOT populating).

DEDUP: checked backlog — no exact dup of constraint-violation class (LINT-OHLCV-WRITE-BYPASS = guardrail kept separate; FIX-OHLCV-CORP-ACTION-CONTINUITY = different). db3 distinct from the two FACTORY audit questions.
