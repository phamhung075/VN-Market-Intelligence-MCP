# Architecture Brief — CI Triage: Task 1282a Data Freshness (TRIAGE-CI-C1282a-DATA-FRESHNESS-PROD-VS-TEST)

**Date:** 2026-06-09
**Sprint:** CI-RED-RECONCILE
**Author:** architect
**Task-id:** TRIAGE-CI-C1282a-DATA-FRESHNESS-PROD-VS-TEST
**CI baseline:** 57 fails (sha b106a1ec, run 27220454437, job 80373590001)
**Zone:** apps/mcp-server/

---

## Scope

Two unique failing tests in `apps/mcp-server/src/__tests__/system-data-freshness.test.ts`:

- **TC-1:** `detectDataFreshnessBreach() > TC-1: detects HIGH breach on stale price data (age > threshold)`
- **TC-2:** `detectDataFreshnessBreach() > TC-2: detects CRITICAL breach when age > 1.5× threshold`

Failure fingerprint: ~1ms genuine assertion failure (not ~5000ms transport-hang, not SyntaxError contamination). Both fail at `expect(result.hasBreach).toBe(true)` receiving `false`.

---

## Evidence: Prod Implementation vs Test Assertions

### Prod seam

File: `apps/mcp-server/src/interface/mcp/tools/system/dataFreshnessTools.ts`

`detectDataFreshnessBreach(db, config?)` (lines 79–143):
1. Constructs `now = new Date()` internally (not injectable via public API).
2. Queries each signal table and computes `signalAges[signalType]` in minutes.
3. Calls `checkDataFreshnessSla(signalAges, config, [], now)` from the domain service.

File: `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts`

`getSlaThreshold("price", config, now)` (lines 518–590):
- `price` is in `MARKET_HOURS_ONLY_SOURCES` (line 227).
- **During VN market hours (Mon–Fri 02:00–08:59 UTC):** returns `10` min (defaultThresholdMinutes).
- **Outside market hours:** returns `minutesSinceLastWindowEnd(now) + 30`.

### Test setup

Both TC-1 and TC-2 use `beforeEach` to populate `vps_push_log` with a `pushed_at` value **12 minutes old**. The test comment states: *"12 minutes old (exceeds 10min threshold but < 15min → HIGH breach)"*, explicitly assuming a static 10-min threshold.

### Actual vs expected

At run time 2026-06-09T16:42Z UTC (Tuesday, outside market hours):
- `isVnMarketHours(now)` = **false** (UTC 16:42 is not within 02:00–08:59Z).
- `lastExpectedWindowEnd(now)` = 2026-06-09T08:59:00Z (today's trading-day close, already past).
- `minutesSinceLastWindowEnd(now)` ≈ **463 minutes**.
- Dynamic threshold for `price` = 463 + 30 = **493 minutes**.
- Data age = **12 minutes**.
- 12 > 493 = **false** → `hasBreach = false`.

Tests expect `hasBreach = true`; prod returns `hasBreach = false`.

**Prod is CORRECT.** The dynamic off-hours SLA for market-hours-only sources is intentional design (FIX-SLA-WEEKEND-AWARE). Data that is 12 minutes old at 16:42 UTC (after the 08:59Z session close) is not stale — the VPS push loop does not run outside the market window.

**Tests are STALE.** TC-1 and TC-2 were written during the Task 1282a RED phase, before the `MARKET_HOURS_ONLY_SOURCES` time-aware threshold logic was introduced. The comments in both tests ("price threshold is 10 minutes", "CRITICAL when age > 15 minutes (10 × 1.5)") are explicit stale assumptions about a static threshold that no longer applies.

---

## Verdict

### TC-1: REWRITE-STALE

Expected: `hasBreach = true` (assuming static 10-min threshold).
Actual: `hasBreach = false` (dynamic off-hours threshold ≈ 493 min; 12 < 493 → no breach).
Which is right: **prod is right**. The dynamic threshold is the correct domain contract. The test assumption is stale.
Coverage: retained by rewrite (the TC-1 intent — HIGH breach detection — remains valid with a time-fixed `now`).

### TC-2: REWRITE-STALE

Expected: `hasBreach = true` (first assertion, before the conditional CRITICAL check).
Actual: `hasBreach = false` (same root cause as TC-1, same DB setup, same dynamic threshold).
Which is right: **prod is right**. TC-2's CRITICAL assertion is conditional (`if (criticalBreach)`) and would safely skip even after the rewrite (12 min < 10 × 1.5 = 15 min → no CRITICAL, but `hasBreach` becomes `true` because 12 > 10 under market-hours threshold).
Coverage: retained by rewrite (TC-2 intent — CRITICAL breach path — requires a separate data setup with age > 15 min; the conditional guard means TC-2 passes correctly even without a CRITICAL breach in the test DB, as long as `hasBreach` is true).

---

## Fix Spec

### Root cause (single)

`detectDataFreshnessBreach` constructs `now = new Date()` internally. The test has no way to freeze time. When run outside VN market hours, the dynamic threshold for `price` (and `foreign_flow`) balloons to hundreds of minutes, making 12-minute-old data appear fresh.

### Required fix

Add an optional `now?: Date` parameter to `detectDataFreshnessBreach` for test-time determinism. This is a minimal additive interface extension with zero behavior change for callers that omit the parameter.

**File 1 (prod — minimal interface extension):**
`apps/mcp-server/src/interface/mcp/tools/system/dataFreshnessTools.ts`

Line 79 (current signature):
```typescript
export async function detectDataFreshnessBreach(
  db: Database,
  config?: SignalSlaConfig[],
): Promise<...>
```

Change to:
```typescript
export async function detectDataFreshnessBreach(
  db: Database,
  config?: SignalSlaConfig[],
  now?: Date,
): Promise<...>
```

Line 87 (current):
```typescript
const now = new Date();
```

Change to:
```typescript
const now_: Date = now ?? new Date();
```

And update all subsequent references from `now` to `now_` within the function body (lines 130 and 136).

**File 2 (test — rewrite stale assertions):**
`apps/mcp-server/src/__tests__/system-data-freshness.test.ts`

In the `beforeEach` block (line 45), add a frozen market-hours `now` constant:
```typescript
const frozenNow = new Date("2026-06-09T04:00:00Z"); // Tue, within 02:00-08:59 UTC market window
```

TC-1 call (line 95) — change from:
```typescript
const result = await detectDataFreshnessBreach(db);
```
to:
```typescript
const result = await detectDataFreshnessBreach(db, undefined, frozenNow);
```

TC-2 call (line 117) — same change:
```typescript
const result = await detectDataFreshnessBreach(db, undefined, frozenNow);
```

TC-3 (line 136) and TC-4 (line 149) — apply same `frozenNow` parameter for consistency (these currently pass or are conditional, but pinning them makes the suite deterministic regardless of run time).

### Verification at frozen time 2026-06-09T04:00:00Z

- `isVnMarketHours(frozenNow)` = true (UTC 04:00, Tuesday, non-holiday).
- `getSlaThreshold("price", config, frozenNow)` = 10 min.
- Data age = 12 min; 12 > 10 → breach, severity = HIGH (12 < 15 = 10 × 1.5 → not CRITICAL).
- TC-1: `hasBreach = true` ✓, `priceBreach.severity = "HIGH"` ✓.
- TC-2: `hasBreach = true` ✓, `criticalBreach` = undefined (conditional block skips) ✓.

---

## Projected CI Delta

Current baseline: **57 fails** (job 80373590001).

TC-1 and TC-2 contribute **2 unique test failures** (PO re-tally confirms these are the only 2 from this file in the 57 baseline). After the rewrite:

Projected: **57 → 55** (−2).

No collateral expected. TC-3 through TC-8 are already passing (6/8 pass in the baseline run). The `frozenNow` change to TC-3/TC-4 is safe (their assertions are conditional or property-presence checks that pass in any time context).

---

## Coverage Retention

TC-1 and TC-2 are REWRITE-STALE (not REMOVE-obsolete). Coverage is retained:
- The `detectDataFreshnessBreach` function and the HIGH-breach detection path remain fully exercised.
- The `price` signal SLA threshold at 10 min (market hours) is the domain contract being tested.
- Protecting siblings: TC-3 (all-fresh case), TC-4 (recovery tracking), and the full `formatFreshnessAlert` suite (TC-5 through TC-8) remain untouched and green.
- No coverage gap is introduced. The CRITICAL path (TC-2's conditional) is not exercised by the current 12-min data setup — but the conditional guard makes this safe; a dedicated CRITICAL test would require data older than 15 minutes, which is a separate concern not in scope for the 57-baseline fix.

---

## Recommended Next Task

**REWRITE-stale fix**, owner: **dev-mcp-server**, type: **BUG-FIX / MAINTENANCE** (single zone, no new primitives → BUILD-STANDARD: not-applicable).

Scope: 2 files, bounded changes:
1. `apps/mcp-server/src/interface/mcp/tools/system/dataFreshnessTools.ts` — add optional `now?` param (3 lines changed).
2. `apps/mcp-server/src/__tests__/system-data-freshness.test.ts` — add `frozenNow`, update 2–4 call sites.

Expected verification gate: `bun test src/__tests__/system-data-freshness.test.ts` → 8/8 pass.
Expected CI delta: 57 → 55 (−2 from this task alone).

PO may queue as **FIX-CI-C1282a-DATA-FRESHNESS-REWRITE** on the sprint board.

---

## Appendix: Local Test Run Evidence

```
bun test src/__tests__/system-data-freshness.test.ts
# 6 pass, 2 fail
# TC-1 fail: expect(false).toBe(true) at line 102 — hasBreach
# TC-2 fail: expect(false).toBe(true) at line 119 — hasBreach
# Both at ~1-28ms (genuine assertion, no transport-hang)
```

Dynamic threshold computed at run time (2026-06-09T16:42Z):
- `minutesSinceLastWindowEnd` = 463 min
- `getSlaThreshold("price")` = 493 min
- 12 min < 493 min → no breach
