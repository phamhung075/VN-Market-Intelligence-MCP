# TASK 1948e-C — (Optional) Add PC1 to primary watchlist

**Sprint:** 1948e-fix (child of SPIKE-1948e)  
**Date:** 2026-05-18  
**Owner:** dev-mcp-server  
**Priority:** LOW  
**Size:** S (~20 min, identical scope to 1946a)  
**Branch:** `task/1948e-c-pc1-watchlist`  
**Zone:** `apps/mcp-server/` + `docs/data/`  
**Status:** DEFERRED — optional sub-task, not required for legal_risk signal path

---

## Context

SPIKE-1948e identified PC1's absence from the primary watchlist as a **contributing factor** (not root cause) for low legal_risk signal urgency. PC1 appears in `referenceStocks.utilities` and `referenceStocks.energy` but is absent from the primary `watchlist` array.

Adding PC1 to the watchlist improves news-scout's urgency classification for PC1 events but is **not required** for Fixes A+B to work. Legal_risk signals will be detected and routed regardless of watchlist membership (detection uses `detectStocksInText()` which checks both watchlist + reference stocks).

This task follows the **identical scope** as TASK-1946a (PLX watchlist addition).

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | PC1 added to `docs/data/system-map.json` `.project.watchlist[]` array | grep -A5 -B5 "\"code\": \"PC1\"" system-map.json |
| AC-2 | PC1 entry includes `active: true`, `exchange: "HOSE"`, `sector: "Utilities / Power Generation"` or similar | jq '.project.watchlist[] \| select(.code=="PC1")' system-map.json |
| AC-3 | PC1 added to `apps/mcp-server/mcp.config.json` `.market.watchlist[]` array | grep "\"PC1\"" mcp.config.json |
| AC-4 | PC1 added to `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` `WATCHLIST_SEED` array | grep "\"code\": \"PC1\"" seedWatchlist.ts |
| AC-5 | PC1 added to `apps/mcp-server/src/domain/market.ts` (if WATCHLIST_STOCKS exists) | grep "PC1" apps/mcp-server/src/domain/market.ts |
| AC-6 | 3 new tests added to `1948e-c-pc1-watchlist.test.ts`: (1) seed presence, (2) query returns PC1, (3) idempotency on re-seed | npm test — TC1/TC2/TC3 GREEN |
| AC-7 | Existing watchlist tests pass (regression) | npm test — 50+ watchlist suite GREEN |
| AC-8 | TypeScript tsc clean (0 errors) | npm run build → tsc: 0 errors |

---

## What Changes

**Files:** 3 SSoT sources + 1 test file

| File | Change | Before | After |
|------|--------|--------|-------|
| `docs/data/system-map.json` `.project.watchlist[]` | Add PC1 entry | 30 tickers | 31 tickers |
| `apps/mcp-server/mcp.config.json` `.market.watchlist[]` | Add PC1 | 30 tickers | 31 tickers |
| `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` | Add `{ code: "PC1", exchange: "HOSE", domain: "utilities" }` | 30 rows | 31 rows |
| `apps/mcp-server/src/domain/market.ts` `WATCHLIST_STOCKS` (if exists) | Add PC1 | if present, +1 | if present, +1 |

**Pattern:** Identical to TASK-1946a (PLX addition, completed 2026-05-18).

---

## Test Plan

| Test Case | Scenario | Expected |
|-----------|----------|----------|
| TC1 | `SELECT * FROM watchlist WHERE code = "PC1"` after seed | 1 row with `active=1`, `exchange="HOSE"` |
| TC2 | Query `get_crisis_early_warning` with PC1 in price spike → velocity ratio ≥2.0 | PC1 appears in `crisisIndicators` result |
| TC3 | Re-run seed (idempotent) | No duplicate insert, 1 row total |
| TC4 | Regression: existing 30 tickers still present | SELECT COUNT(*) FROM watchlist >= 31 |

---

## Why Optional?

Fixes A+B are **sufficient** for the legal_risk signal path to work:
- Fix A (schema enum): allows `post_agent_signal(signal_type: "legal_risk")` to succeed
- Fix B (flow dispatch): instructs news-scout to post legal_risk signals when detected

PC1 watchlist membership **improves urgency classification** but is not **required** for detection. The `detectStocksInText()` function already checks reference stocks, so PC1 is found regardless.

However, adding PC1 to the watchlist **aligns with user expectations** (PC1 is a major state-owned power utility and should be treated as a primary focus). This matches the motivation for TASK-1946a (PLX crisis coverage).

---

## Sequencing

| Task | Order | Blocker |
|------|-------|---------|
| 1948e-A | 1st | None (primary) |
| 1948e-B | 2nd | Depends on 1948e-A (enum must exist) |
| 1948e-C | 3rd+ | None (optional; can be done in parallel or deferred) |

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| R-1: Watchlist size inflates search complexity | PC1 is 31st entry; no O(n) degradation for n=31 |
| R-2: Stale test count (like 1343a pre-1946a) | No pre-existing stale count assertions; TC4 uses >= 31 check |
| R-3: Duplicate seed on re-run | Idempotency test TC3 validates |
| R-4: 1945 window contamination | No contact with verdictResolutionJob.ts or alert_accuracy |

---

## PM Judgment

**Recommendation: Schedule as SEPARATE task after 1948e-A+B merge.**

Rationale:
1. **Decoupling:** Fixes A+B are the minimum-viable legal_risk cure. PC1 watchlist is a UX enhancement.
2. **Precedent:** SPIKE-1946 (PLX) followed the same pattern: root-cause fix (1946 SPIKE) + watchlist addition (1946a separate task).
3. **Testability:** A+B can be verified immediately post-deploy (legal_risk signals appear). C is tested via shadow observation (7d gate).
4. **WIP:** Current WIP=0/2. If 1948e-A is assigned now, 1948e-B can follow immediately, leaving 1948e-C for next cycle or concurrent with observational gates.

---

## Acceptance Sign-Off

- [ ] All 3 SSoT files updated (system-map.json, mcp.config.json, seedWatchlist.ts)
- [ ] Tests TC1–TC4: GREEN
- [ ] Regression suite: ≥50 watchlist tests pass
- [ ] tsc clean
- [ ] Ready to merge (deferred to cycle 2 of 1948e sprint)
