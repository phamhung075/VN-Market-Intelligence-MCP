# Sprint Goal

## Sprint 1777 — VPS Price Pipeline Restoration (2026-04-29)
**Status:** IN PROGRESS
**Vision:** Restore live price and foreign-flow data ingestion so evening reports are no longer empty.
**Root cause:** VPS price push dark since 2026-04-24 08:59. Foreign-flow CB OPEN (UNIQUE constraint). `daily_ohlcv` 0 rows 2026-04-25 – 2026-04-29. VN Index cache empty.
**Success Metric:** `vps_push_log` has `prices` entries dated 2026-04-29+; `ohlcvRowsMin > 0` in evening report.
**Tasks:** 1777a (ops — VPS restore) · 1777b (developer — CB reset + UNIQUE guard)

---

## Hotfix: bctc-parser2 — 3 critical BCTC parser bugs (2026-04-29)
**Status:** IN REVIEW — worktree-agent-a1e01646, awaiting QA merge
**Bugs:** DIG/SHB ticker case mismatch (CRITICAL) · FPT unit multiplier quadrillion-scale (CRITICAL) · DGC/BSR phantom confidence all-zero fields (HIGH)
**Tests:** 7 new in hotfix-bctc-parser2.test.ts

---

## Closed Sprints

| Sprint | Date | Result |
|--------|------|--------|
| 1416 — BCTC confidence + HPG disk-scan | 2026-04-29 | VCB/FPT confidence restored, HPG fixed. 8076 pass. |
| 1419 — Test baseline audit | 2026-04-29 | 25 pre-existing failures resolved. 8076 pass. |
| 1420 — QQ1 double-prefix fix | 2026-04-29 | Guard added at 2 sites. 8090 pass. |
| 1422 — VCB bank-format BCTC parser | 2026-04-29 | Confirmed resolved by 1415b+1416a. No impl needed. |
| 1423 — Báu Methodology Phase 1: Global Macro | 2026-04-29 | 5 tasks merged (^TNX, FRED, carry, Thien Thoi, calendar). 8198 pass. |
| 1425 — Housekeeping: stats + ghost dirs + DRY | 2026-04-29 | stats synced, ~281MB freed, VN_INDEX_FRESHNESS_MS extracted. |
