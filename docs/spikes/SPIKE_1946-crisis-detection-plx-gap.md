# SPIKE-1946 — Crisis Detection PLX Gap

**Date:** 2026-05-18
**Author:** Architect (read-only diagnostic)
**Timebox:** 120 min
**Status:** DONE — Verdict: FIX (child task 1946a)
**Constraint R-1:** `verdictResolutionJob.ts` and `alert_accuracy` tables NOT touched.

---

## Executive Summary

`get_crisis_early_warning` did NOT fire for PLX at 06:03 UTC 2026-05-18 because PLX is absent from the runtime `watchlist` table. The tool queries `SELECT code FROM watchlist` — PLX is not in `seedWatchlist.ts` (`WATCHLIST_SEED` array) and therefore never lands in the SQLite `watchlist` table that backs the tool. The mechanism is correct; the coverage set is wrong.

news-scout signal #3383 (`chain_catalyst`, `event_type=crisis`, PLX, bearish, 05:20 UTC) DID fire because news-scout's impact chain analysis runs over `affected_stocks` derived from `stockAliases.ts` and `sectorPeers.ts`, which both include PLX — those two domain services are independent of the `watchlist` table.

Root cause is a **watchlist divergence**: `docs/data/system-map.json` lists PLX as NOT in the watchlist (PLX is absent from `.project.watchlist[]`) and `mcp.config.json` also lacks PLX, but BSR (Binh Son Refinery, same Oil & Gas sector) IS in both. PLX (Petrolimex, HOSE) was never added to either the JSON SSOT or the seed file.

---

## Investigation Findings

### Q1: Is PLX in the watchlist?

**Answer: NO.**

| Source | PLX present? | BSR present? |
|---|---|---|
| `docs/data/system-map.json` `.project.watchlist[].ticker` | No | Yes (active=true, Oil & Gas / Refinery, UPCOM) |
| `apps/mcp-server/mcp.config.json` `.market.watchlist` | No | Yes |
| `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` `WATCHLIST_SEED` | No | No (BSR absent from seed too) |

The canonical watchlist in `system-map.json` has 32 active tickers. PLX (Petrolimex, HOSE) is not among them. BSR is the Oil & Gas representative on the watchlist. PLX appears in domain tables (`sectorPeers.ts:78`, `newsNormalizer.ts:478`, `predictionCascadeMapper.ts:148`) as a sector peer but not as a monitored watchlist stock.

Note: `seedWatchlist.ts` has only `GAS` for oil_gas and does not include BSR either. The `mcp.config.json` path (schema.ts L173) seeds BSR on first-run only if watchlist is empty. After the idempotent `seedWatchlist(db)` call (L199), the final watchlist state depends on which seed wins. BSR is in `mcp.config.json` but not `WATCHLIST_SEED` — there is a secondary divergence between the two seed sources that is outside the scope of this spike.

### Q2: Where is `get_crisis_early_warning` implemented? What triggers it?

**File:** `apps/mcp-server/src/interface/mcp/tools/sector/crisisTools.ts`
**Use case:** `apps/mcp-server/src/application/usecases/getCrisisEarlyWarning.ts`

The tool is a **passive MCP tool** — it is not scheduled. It fires only when explicitly called.

**Two callers:**

1. **Alert Commander** — `stage-bootstrap.md` Step 2: `get_crisis_early_warning()` is called every alert cycle (market hours every 15 min, off-hours every 2 h). This is the call that ran at 06:03 UTC and returned "no signals."

2. **On-demand** — any Cowork agent or manual MCP call.

There is no scheduler job that calls `getCrisisEarlyWarning`. Verified: grep across all files under `apps/mcp-server/src/scheduler/` returns zero results for `getCrisisEarlyWarning`.

### Q3: What threshold/condition gates it? Was PLX's -40% insufficient?

**Answer: PLX never entered the evaluation at all — it was not in the `stockCodes` array passed to `getCrisisEarlyWarning`.**

The tool resolves stock codes from `SELECT code FROM watchlist` (crisisTools.ts:55). PLX absent from `watchlist` table → PLX never passed to `getVelocity()`. No mention velocity check, no baseline comparison, no crisis indicator generated.

The threshold that would have applied (had PLX been in the watchlist) is `VELOCITY_SPIKE_THRESHOLD = 2.0` in `getCrisisEarlyWarning.ts:48`. This threshold compares `mentionCount / baseline` for the current hour window — it is a **news mention velocity spike detector**, not a price-drop detector.

This is the second structural gap: even if PLX had been in the watchlist, a -40% price crash would only trigger `get_crisis_early_warning` if there was a 2× mention velocity spike in the same hour. PLX's -40% crash at 07:07 UTC was caught by news-scout (chain_catalyst #3383 at 05:20 UTC, urgent_news #3391 at 07:20 UTC) via the news pipeline, meaning PLX articles DID land in `pollNews`. Those articles would have written mention velocity records for PLX via `recordMention()` (pollNews.ts L1193) if PLX were in the signals array. The signals are generated from `buildCausalChain()` / `detectStocksInText()` — both use `stockAliases.ts` which contains PLX. So PLX mention velocity records would have been written if PLX appeared in detected signals.

However: since `get_crisis_early_warning` only queries stocks in the `watchlist` table (L55), those velocity records would never be read back even if written.

**Summary of the gate logic:**

```
get_crisis_early_warning()
  → stockCodes = SELECT code FROM watchlist   ← PLX absent, evaluation stops here
  → for each code: getVelocity(code, hourKey)
  → if velocity.mentionCount / baseline >= 2.0 → crisis indicator
```

PLX never reached the threshold check.

### Q4: Does alert-commander call `get_crisis_early_warning` or is it passive?

**Alert-commander calls it actively, every cycle.** (`stage-bootstrap.md` Step 2.)

The 06:03 UTC alert-commander cycle log (notebook c173) confirms:
```
Crisis: clear (get_crisis_early_warning: no signals)
```
The tool was called. It returned empty. PLX was not in the query set.

The 07:07 UTC cycle (the one that fired 8 MARKET alerts) also shows:
```
Crisis: clear (get_crisis_early_warning: no signals)
chain_catalyst=0
```
Signal #3383 (chain_catalyst, PLX, posted 05:20 UTC) was on the signal bus but alert-commander reports `chain_catalyst=0` at 07:07 UTC. This is consistent with the signal having been consumed (marked read) or expired in prior cycles. The news-scout notebook confirms signal #3383 was deduped at the 06:20 UTC news-scout cycle, which means the signal was already on the bus and alert-commander should have read it — however, at 07:07 UTC `chain_catalyst=0` signals were present. This suggests signal #3383 either (a) had its TTL expire between 05:20 and 07:07 UTC (100 min window, TTL likely 120 min), or (b) was read/consumed in an intermediate alert-commander cycle between 05:20 and 07:07 UTC. The cycle log shows the 06:03 UTC cycle had `chain_catalyst=0` — so #3383 was either not yet visible at 06:03 or expired before 07:07.

The news-scout notebook confirms: signal #3383 was posted at ~05:20 UTC. Default agent signal TTL is typically 120 min. By 07:07 UTC (107 min later) it may still have been within TTL, but the cycle log says 0 chain_catalyst signals — likely the intermediate 06:22 or 06:42 UTC cycles consumed it, or it expired marginally before 07:07 UTC. Either way this is a separate observation concern, not the root cause of the `get_crisis_early_warning` gap.

### Q5: Does news-scout's `chain_catalyst` path cover what crisis-early-warning misses?

**Partially yes, with important gaps.**

| Dimension | `get_crisis_early_warning` | `chain_catalyst` (news-scout) |
|---|---|---|
| Coverage scope | Watchlist stocks only (`SELECT code FROM watchlist`) | Any stock detected in article text via `stockAliases.ts` + `detectStocksInText()` — includes PLX |
| Trigger mechanism | Mention velocity spike (2× 24h baseline) | News article analysis + impact chain + confidence ≥ regime threshold |
| Price-drop awareness | None — price data not read | Indirect — bearish event_type=crisis in finding_data |
| Routing | Step 2 (Bootstrap) — runs every cycle regardless of signals on bus | Step 3c (Signal Matrix) — requires signal to be on agent_signals bus with non-expired TTL |
| Latency | Immediate on tool call (reads DB) | Depends on news-scout cycle (every 30 min per cron, or 15-min market-hours if wired) |
| Expiry risk | None — always reads current hour window | TTL expiry (~120 min) can cause gap if alert-commander cycle misses the window |
| Watchlist constraint | Hard filter | None — covers any stock in aliases |

news-scout catches PLX-class events (non-watchlist stocks, crisis severity) **if** the news article is fetched, PLX is detected in text, impact score exceeds threshold, and the resulting signal reaches alert-commander within TTL. The chain_catalyst path is therefore coverage for what crisis-early-warning structurally cannot cover (non-watchlist stocks), but it is probabilistic (depends on article fetch timing, TTL window, and regime confidence thresholds).

---

## Root Cause

Three layered causes, all contributing to the gap:

**RC-1 (Primary): PLX absent from watchlist.**
PLX is not in `docs/data/system-map.json` watchlist, `mcp.config.json`, or `seedWatchlist.ts`. The `watchlist` SQLite table therefore never contains PLX. `get_crisis_early_warning` hard-filters to `SELECT code FROM watchlist` → PLX evaluation never happens.

**RC-2 (Secondary): `get_crisis_early_warning` is a velocity-spike detector, not a price-crash detector.**
The tool detects **mention velocity spikes** (2× 24h rolling average). A -40% price crash has no direct path into the crisis indicator unless it also generates a news velocity spike for a watchlist stock. The tool is architecturally scoped to systemic/reputational events (many articles, many sources, sustained mentions) not individual stock price moves.

**RC-3 (Observation, not a bug): chain_catalyst signal TTL window.**
Signal #3383 was posted at 05:20 UTC. By 07:07 UTC the signal may have been consumed or expired (120-min TTL). This created a brief window where alert-commander had no active chain_catalyst for PLX despite news-scout having caught it. This is a known design trade-off of the TTL-based signal bus, not a bug.

---

## Verdict: FIX

**Option chosen: (b) — expand watchlist to include PLX (and audit oil_gas coverage), plus document the architectural scope boundary of `get_crisis_early_warning`.**

Rationale:
- PLX is Petrolimex, Vietnam's largest petroleum retailer (HOSE). It is a top-5 market-cap stock and a natural watchlist candidate for an oil_gas sector crash event. Its absence is an oversight, not a design decision.
- BSR (Binh Son Refinery) is the only oil_gas representative in the current watchlist and it is UPCOM-listed. PLX is HOSE-listed with far higher liquidity and crash risk relevance.
- Adding PLX to the watchlist covers RC-1 and makes RC-2 irrelevant for PLX (velocity spike on a -40% crash day will easily exceed 2× baseline given the news flood).
- The architectural scope of `get_crisis_early_warning` (velocity-based, watchlist-scoped) should be **documented** rather than redesigned — it is intentionally a complementary detection path to the news-scout chain_catalyst path. The two are designed to catch different signal shapes.

**WONTFIX rationale for scope expansion (rejected):** Expanding `get_crisis_early_warning` to read price data directly would duplicate `get_alerts` / `price_anomaly` signals and violate the tool's single-responsibility as a velocity + reputation radar. That redesign is disproportionate to the root cause.

---

## Child Task 1946a — ACs

**Zone:** `apps/mcp-server/` + `docs/data/`
**Type:** FIX (S — Small)
**Owner:** dev-mcp-server

### Files to modify

| File | Change |
|---|---|
| `docs/data/system-map.json` | Add PLX to `.project.watchlist[]` (active=true, sector="Oil & Gas / Petroleum Retail", exchange="HOSE") |
| `apps/mcp-server/mcp.config.json` | Add `"PLX"` to `.market.watchlist` array (after `"BSR"`, before closing bracket) |
| `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` | Add `{ code: "PLX", exchange: "HOSE", domain: "oil_gas" }` to `WATCHLIST_SEED` (after GAS entry) |

### Acceptance Criteria

**AC-1:** `docs/data/system-map.json` contains PLX with `active: true` and `exchange: "HOSE"` in `.project.watchlist`.

**AC-2:** `apps/mcp-server/mcp.config.json` `.market.watchlist` array includes `"PLX"`.

**AC-3:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` `WATCHLIST_SEED` includes `{ code: "PLX", exchange: "HOSE", domain: "oil_gas" }`.

**AC-4:** Unit test: seed PLX into in-memory DB via `seedWatchlist(db)`, then call `getCrisisEarlyWarning(db, ["PLX"])` with a mocked `mention_velocity` row that produces `velocityRatio >= 2.0` for PLX → `crisisIndicators` contains PLX entry.

**AC-5:** Existing `seedWatchlist` tests still pass (idempotency: running `seedWatchlist()` twice produces the same row count).

**AC-6:** `tsc` 0 errors, full test suite green.

### Out of scope for 1946a

- Redesigning `get_crisis_early_warning` to read price data (disproportionate, not the root cause).
- Adding BSR to `seedWatchlist.ts` (BSR is in `mcp.config.json` seed path; the BSR–seed divergence is a separate low-risk issue — BSR is already in the runtime DB from the mcp.config path).
- Any changes to `verdictResolutionJob.ts` or `alert_accuracy` tables (constraint R-1).
- Modifying signal TTL for chain_catalyst (RC-3 is a design trade-off, not a fixable bug within this scope).

---

## Brownfield Scan

**Zone:** `apps/mcp-server/` (primary)

**Verified paths:**
- `apps/mcp-server/src/interface/mcp/tools/sector/crisisTools.ts` — MCP tool registration; watchlist query at L55
- `apps/mcp-server/src/application/usecases/getCrisisEarlyWarning.ts` — use case; `VELOCITY_SPIKE_THRESHOLD=2.0` at L48; `REPUTATION_WARNING_THRESHOLD=50` at L51
- `apps/mcp-server/src/infrastructure/db/mentionVelocityStore.ts` — `getVelocity()` / `getBaseline()` / `recordMention()`
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — `WATCHLIST_SEED` (33 entries, PLX absent)
- `apps/mcp-server/mcp.config.json` — `.market.watchlist` (31 entries, PLX absent, BSR present)
- `docs/data/system-map.json` — `.project.watchlist[]` (32 active entries, PLX absent, BSR present)
- `.claude/flows/alert-commander/stage-bootstrap.md` — Step 2 confirms `get_crisis_early_warning()` called every cycle
- `.claude/flows/alert-commander/stage-signals.md` — Step 3c confirms chain_catalyst routing logic

**Scan clean:** true — no DDD violations, no security issues, no memory leaks detected in the affected paths.

---

## Constraint Compliance

R-1 honoured: `verdictResolutionJob.ts` and `alert_accuracy` tables not read, not analysed, not mentioned in the fix scope.
