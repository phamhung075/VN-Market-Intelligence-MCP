# TASK REPORT — 1946a
**Date:** 2026-05-18
**Agent:** dev-mcp-server
**Type:** FIX (HIGH, size S)
**Branch:** task/calendar-source-10s-timeout

---

## Summary

Added PLX (Petrolimex, HOSE, Oil & Gas / Petroleum Retail) to all three watchlist SSoT sources so that `get_crisis_early_warning` evaluates PLX mention velocity. Root cause per SPIKE_1946: PLX was absent from `seedWatchlist.ts`, `mcp.config.json`, and `system-map.json` — therefore never entered the SQLite `watchlist` table queried by the tool.

---

## Files Changed

| File | Change |
|------|--------|
| `docs/data/system-map.json` | PLX added to `.project.watchlist[]` after BSR — `active=true`, `exchange=HOSE`, `sector="Oil & Gas / Petroleum Retail"` |
| `mcp.config.json` (root, symlinked from apps/mcp-server/) | `"PLX"` added to `.market.watchlist` array after `"BSR"` |
| `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` | `{ code: "PLX", exchange: "HOSE", domain: "oil_gas" }` added to `WATCHLIST_SEED` after GAS entry; header counts updated 33→34 |
| `apps/frontend/app/domain/market.ts` | `{ ticker: "PLX", company: "Petrolimex", sector: "Oil & Gas / Petroleum Retail", exchange: "HOSE", active: true }` added to `WATCHLIST_STOCKS` after BSR |
| `apps/mcp-server/src/__tests__/1946a-plx-watchlist-crisis-coverage.test.ts` | **NEW** — 7 tests covering AC-1 (PLX in WATCHLIST_SEED), AC-4 (velocity spike → crisisIndicators), AC-5 (idempotency) |
| `apps/mcp-server/src/__tests__/1343a-watchlist-restore.test.ts` | Fixed 11 pre-existing stale-count failures left from 1876a-A6 (counts 26→34, domains 11→13, HNX assertion) |

---

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: PLX in `system-map.json` with `active=true`, `exchange=HOSE` | PASS | `docs/data/system-map.json` line 408 |
| AC-2: PLX in `mcp.config.json` `.market.watchlist` | PASS | `mcp.config.json` watchlist array |
| AC-3: PLX in `WATCHLIST_SEED` with `exchange=HOSE`, `domain=oil_gas` | PASS | `seedWatchlist.ts` line 39 |
| AC-4: Unit test — seed PLX, velocity ≥2.0, getCrisisEarlyWarning returns PLX in crisisIndicators | PASS | `1946a-plx-watchlist-crisis-coverage.test.ts` — test "AC-4" |
| AC-5: Existing seedWatchlist idempotency tests pass | PASS | `1946a-plx-watchlist-crisis-coverage.test.ts` — AC-5a + AC-5b; `1343a-watchlist-restore.test.ts` 15/15 |
| AC-6: tsc 0 errors, full relevant suite GREEN | PASS | `bun tsc --noEmit` = 0 errors; 49 watchlist/crisis tests pass |
| Frontend: PLX in `WATCHLIST_STOCKS` | PASS | `apps/frontend/app/domain/market.ts` line 257 |

---

## Test Results

```
1946a-plx-watchlist-crisis-coverage.test.ts:  7 pass, 0 fail
1343a-watchlist-restore.test.ts:             15 pass, 0 fail  (was 4 pass, 11 fail)
1876a-A6-high-vol-seed.test.ts:              17 pass, 0 fail
1869b-seed-watchlist-thresholds.test.ts:     10 pass, 0 fail
267-mcp-tool-043.test.ts:                     7 pass, 0 fail
─────────────────────────────────────────────
Total:                                        49 pass, 0 fail
```

---

## Constraint Compliance

- R-1 honoured: `verdictResolutionJob.ts` and `alert_accuracy` tables not touched.
- DDD layer: no domain/ imports from infrastructure/.
- No `--no-verify` used.
- Only files in zone `apps/mcp-server/`, `docs/data/`, and `apps/frontend/app/domain/` modified.

---

## Side Fix

11 pre-existing test failures in `1343a-watchlist-restore.test.ts` were caused by Task 1876a-A6 adding 7 high-vol tickers to `WATCHLIST_SEED` without updating the test assertions. These stale counts (26, 11 sectors, no-HNX) were updated to their correct values (34, 13 sectors, HNX present via VNH) as part of this task to restore baseline green.

---

## [QA] Review Record

**Date:** 2026-05-18
**QA Agent:** qa (c188)
**Verdict:** APPROVED
**Round:** 1

### Pipeline Results

| Check | Result |
|-------|--------|
| Zone tests (1946a + 1343a) | 22/22 GREEN (339ms) — 7/7 new + 15/15 restored |
| tsc --noEmit | 0 errors |
| Full suite baseline (pre-commit) | 9239 pass / 280 fail |
| Full suite post-commit | 9240 pass / 279 fail (+1 pass, -1 fail — net improvement) |
| DDD scan (domain→infra imports) | PASS — 0 violations in changed files |
| Security scan (process.env / secrets) | PASS — 0 violations in production files |

### AC Verification (QA)

| AC | QA Result |
|----|-----------|
| AC-1: PLX in system-map.json with active=true, exchange=HOSE, sector="Oil & Gas / Petroleum Retail" | PASS — confirmed via jq |
| AC-2: PLX in mcp.config.json .market.watchlist (position 31, after BSR) | PASS — confirmed via jq |
| AC-3: PLX in seedWatchlist.ts WATCHLIST_SEED (line 39, domain=oil_gas) | PASS — confirmed via grep |
| AC-4: velocity ratio ≥2.0 → PLX in crisisIndicators (unit test GREEN) | PASS — 1946a test 7/7 |
| AC-5: tsc 0 errors | PASS |
| AC-6: 7 new tests GREEN + 1343a restored GREEN | PASS |
| Cross-check: frontend market.ts PLX entry matches system-map.json | PASS — ticker/exchange/sector/active identical |

### Notes

- No task branch — commit 5762ce2d landed directly on main
- Pre-existing 279 failures confirmed identical pattern to pre-commit baseline (network/infra/chromium-missing) — zero regressions from this commit
- 1343a: 15 tests pass (not 26 — "26" referred to DB row count in the test assertions, not test count)
- Ops agent dispatched for Docker rebuild + seedWatchlist live injection
