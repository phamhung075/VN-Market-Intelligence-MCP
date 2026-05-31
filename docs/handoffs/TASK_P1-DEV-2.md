<!-- size-justification: 180L — task handoff for evaluator module creation; input arch blueprint + spec; output CommonJS module with 4 exports + acceptance criteria + DV test mapping; no framework imports beyond fs/path -->

# TASK P1-DEV-2 — Create `scripts/agents-flow/cadence-policy.js` (Evaluator Module)

**Sprint:** DWF-PHASE1
**Task ID:** P1-DEV-2
**Assigned zone:** cross-service (shared script, cowork zone)
**Estimated:** ~2h (core evaluator + tier computation + staleness + module exports)
**Status:** READY
**Precondition:** Architect design complete; P1-DEV-1 (cadence-policy.json) should exist

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` § `scripts/agents-flow/cadence-policy.js` — New Module
- `docs/REQ_DYN-WF-PHASE1.md` § FR-P1-1, FR-P1-3 (tier computation logic)
- `docs/data/cadence-policy.json` (created by P1-DEV-1; file path injection)

---

## Deliverable

**File:** `scripts/agents-flow/cadence-policy.js`

A CommonJS module with four exported functions:

```javascript
module.exports = {
  loadCadencePolicy,    // () → policy object (reads cadence-policy.json)
  evaluateCadence,      // (policy_id, calendar_status, signal_backlog_tier, volatility_tier, policy_obj) → {interval_minutes, _cron_fallback}
  computeTiers,         // (pressure_state) → {signal_backlog_tier, volatility_tier}
  isStale,              // (pressure_state, threshold_minutes) → boolean
};
```

---

## Acceptance Criteria

**AC-P1-1-1 (BLOCKING, inherited from AC-P1-1-1 spec):** `evaluateCadence("gatherer-standard", "open", "medium", "*", policyObj)` returns `{interval_minutes: 60, _cron_fallback: false}`.
- DV proof: T-1 in test suite.

**AC-P1-1-2 (BLOCKING):** `evaluateCadence("chef-intraday", "holiday", "*", "*", policyObj)` returns `{interval_minutes: null, _cron_fallback: false}`.
- DV proof: T-2 in test suite.

**AC-P1-1-3 (BLOCKING):** Unmatched policy/state → returns safe default `{interval_minutes: 240, _cron_fallback: false}`.
- DV proof: T-3 in test suite.

**AC-P1-6-2 (BLOCKING, staleness threshold OQ-P1-2):** `isStale(pressure_state, 20)` where `emitted_at` is 25 minutes ago → returns `true`; where `emitted_at` is 18 minutes ago → returns `false`.
- DV proof: T-9 in test suite.

**AC-P1-6-3 (BLOCKING):** `isStale(pressure_state, 20)` where `stale_warning: true` AND `emitted_at` is recent (5 minutes ago) → returns `true` (stale_warning flag overrides age).
- DV proof: T-10 in test suite.

**AC-P1-3-4:** Output object includes `due_reason` and `cadence_minutes` fields for slot tracking. (Handled by cowork-match-slots.js extension, but evaluator must return `interval_minutes` and `_cron_fallback` fields for matcher to construct the slot object.)
- Inherited from T-8 schema validation (test harness).

**Function signatures and behavior:**

1. **`loadCadencePolicy(filePath = 'docs/data/cadence-policy.json')`**
   - Reads the JSON file from `filePath` (default relative path from script's `__dirname`)
   - Parses and returns the policy object
   - On file missing/malformed: throws error (caller handles) or returns empty structure (conservative)

2. **`evaluateCadence(policy_id, calendar_status, signal_backlog_tier, volatility_tier, policy_obj)`**
   - Filters `policy_obj.policies` by `policy_id` match
   - Iterates rules in array order (first-match wins)
   - For each rule, checks `calendar_status`, `signal_backlog_tier`, `volatility_tier` (all support `"*"` wildcard)
   - Returns `{interval_minutes: rule.interval_minutes, _cron_fallback: rule._cron_fallback ?? false}`
   - If no match: returns `{interval_minutes: 240, _cron_fallback: false}` (safe default)

3. **`computeTiers(pressure_state)`**
   - Input: `pressure_state` object with fields `signal_backlog`, `last_volatility_level`, `last_regime`, `calendar_status`
   - Computes `signal_backlog_tier`: `low` (0–2), `medium` (3–9), `high` (≥10)
   - Computes `volatility_tier`: `low` if `last_volatility_level` in `["unknown", "low"]`; `high` otherwise
   - Returns `{signal_backlog_tier: "low|medium|high", volatility_tier: "low|high"}`
   - Used by Step 4.4 in flow (cowork-team/flow/main.md)

4. **`isStale(pressure_state, threshold_minutes)`**
   - Checks two conditions:
     1. If `pressure_state.stale_warning === true` → return `true` (self-reported stale)
     2. If `(now_unix - parse(pressure_state.emitted_at).unix()) / 60 > threshold_minutes` → return `true` (age-based)
   - Otherwise → return `false`
   - Used by Step 4.2 in flow to decide adaptive vs legacy mode

---

## Files to Modify

**CREATE:**
- `scripts/agents-flow/cadence-policy.js` (~180 lines, CommonJS exports)

---

## Implementation Notes

1. **No npm dependencies:** Use only Node.js builtins (`fs`, `path`).
2. **Timezone handling:** Parse ISO8601 UTC timestamps from `emitted_at`. Use `new Date().getTime()` or similar for current time (both are UTC in Node.js context).
3. **Wildcard matching:** `"*"` in policy rules matches any value. Check: `rule.calendar_status === "*" || rule.calendar_status === calendar_status`.
4. **bctc-offmarket `_cron_fallback` field:** Check presence via `rule._cron_fallback ?? false` (default false if field absent).
5. **Error handling:** If `loadCadencePolicy()` fails to read the file, log a WARN and return an empty policy object `{policies: []}`. This allows the matcher to gracefully degrade (return default `240` for all lookups).
6. **Export as CommonJS:** Use `module.exports = { ... }` (not ES6 `export`). The test harness imports via `require()`, and `cowork-match-slots.js` extends via `require()`.

---

## Test Mapping

| AC | DV Test | Description |
|---|---|---|
| AC-P1-1-1 | T-1 | gatherer-standard open/medium → 60 |
| AC-P1-1-2 | T-2 | chef-intraday holiday → null (suppress) |
| AC-P1-1-3 | T-3 | unmatched → 240 default |
| AC-P1-6-2 | T-9 | emitted_at 25min old → isStale=true; 18min → false |
| AC-P1-6-3 | T-10 | stale_warning=true + recent → isStale=true |

**Test suite:** `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (created in P1-DEV-7)

---

## Zone & Dependencies

**Zone:** cross-service (cowork scripts zone)
**Depends on:** P1-DEV-1 (cadence-policy.json should exist; if missing, graceful fallback)
**Blocks:** P1-DEV-3 (cowork-match-slots.js extension requires this evaluator)
**Parallel-run with:** P1-DEV-1, P1-DEV-4

---

## Success Criteria

- [ ] File `scripts/agents-flow/cadence-policy.js` exists
- [ ] Four functions exported correctly (`loadCadencePolicy`, `evaluateCadence`, `computeTiers`, `isStale`)
- [ ] All four DV proofs (T-1, T-2, T-3, T-9, T-10) set up and RED before this task, GREEN after
- [ ] No npm dependencies (fs, path only)
- [ ] CommonJS syntax (`module.exports`)
- [ ] Committed to `main`

---

## RETURN

```
ZONE: cross-service
FILE_COUNT: 1 (CREATE)
LINES: ~180
BLOCKING_ACS: 5 (AC-P1-1-1/1-2/1-3/6-2/6-3)
DV_TESTS: 5 (T-1/2/3/9/10)
PARALLEL_WITH: P1-DEV-1, P1-DEV-4
SEQUENCE_BEFORE: P1-DEV-3 (cowork-match-slots.js requires this evaluator)
```
