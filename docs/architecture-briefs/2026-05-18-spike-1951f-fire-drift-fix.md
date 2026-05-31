# Architecture Brief: SPIKE-1951f — Cowork-Team Master Cron Fire-Drift Fix

**Date:** 2026-05-18
**Author:** agents-architect
**Status:** COMPLETE — ready for agent-father implementation
**Unblocks:** 1951g (implement), 1951d (cutover gate)

---

## 1. Root Cause of the Cron Parsing Bug

### Symptom
At 21:16Z (1.6 min drift from nominal :15 tick) the matcher returned 0 matches. At ~21:07Z (7.1–7.2 min drift from nominal :00 tick) it also returned 0 matches. Both fires should have been close enough to their nominal ticks for enabled slots to match — yet every run was a silent exit.

### Code path that fails

`cowork-match-slots.js` lines 15–16 capture wall-clock time:

```js
const M = now.getUTCMinutes();   // actual fire minute
const H = now.getUTCHours();
```

`cronMatches()` then probes a ±2-minute window around that **actual** minute:

```js
for (let d = -2; d <= 2; d++) {
  let m = M + d, h = H;
  ...
  if (field(cm, m) && ...)
```

When the CronCreate `*/15 * * * *` job fires 7 minutes late (e.g., nominal :15, actual :22), the probe window spans minutes 20–24. No slot cron expression has its minute field at 20, 21, 22, 23, or 24; the nearest slot target (:13 for tnb-audit, :15 for chef-morning, etc.) is outside the window.

### Why the ±2 window failed even at 1.6 min drift for the 21:16 case

At 21:16, no slot is scheduled at hour 21 except `*/15`-range ones restricted to hours 2–8 (which are correctly excluded by the hour field check). The 21:16 silent exit is therefore **correct behavior** — there are no slots targeting minute 15 at hour 21. The 21:16 signal is a false alarm about a true-negative.

The real failure mode is any fire between :17 and :29 (or equivalent for other quarters) when a slot IS scheduled at that quarter: the ±2 window misses by the drift amount. This is demonstrated by the 20:22 case: tnb-audit `13 20 * * *` — at actual fire :22, window [20..24] misses :13.

### Root cause summary

**The base of the ±2 window is the actual fire minute, not the nominal tick minute.** When CronCreate drift pushes the fire past `nominal_tick + 2`, the window slides away from slot targets. The cron expression field parser (`field()`) is correct — `*/15` matching, range, step, and exact-value all behave correctly. The bug is purely in the choice of window anchor.

---

## 2. Option Chosen: B — Nominal-Tick Rounding

**Decision: Option B.**

### Rationale

| Option | Mechanism | Max drift tolerated | Collision risk | Code change size |
|--------|-----------|--------------------|--------------------|-----------------|
| A (widen to ±10) | Expand window to [-10..+10] | 10 min (minus slot offset) | HIGH — adjacent ticks 15 min apart, window of 20 min overlaps neighbour | ~3 chars |
| B (nominal-tick round) | `M = floor(actual / 15) * 15` then ±2 | 14 min (full 15-min block − 1) | ZERO — window stays within its 15-min block | 2 lines |
| C (drop master-cron) | Revert to per-slot CronCreate | N/A | N/A | Sprint-level revert |

Option A creates a 20-minute window centered on the actual fire time. Adjacent 15-min ticks are 15 minutes apart. A window of ±10 covering 20 minutes guaranteed overlaps with the prior or next tick's targets. Collision mitigation would require a "last-fired" dedup guard, adding state and complexity.

Option B rounds the actual fire minute down to the nearest 15-min boundary (`floor(M/15)*15`) and uses that as the window anchor. The ±2 window then spans `[nominal-2 .. nominal+2]`, which is always within the same 15-min block. No overlap with adjacent ticks is possible. Max safe drift is 14 minutes — nearly double the observed worst-case of 7.2 minutes.

Option C is a regression: loses the ability to dispatch sub-hourly slots in the same CronCreate job; the API_MIN_INTERVAL issue that motivated Sprint 1951 returns.

**Option B is chosen: minimum-diff, zero collision risk, 2× safety margin over observed drift.**

---

## 3. Exact Fix Specification

**File:** `scripts/agents-flow/cowork-match-slots.js`

### Change — lines 15–17 (variable declarations)

**Before:**
```js
const now = new Date();
const M = now.getUTCMinutes();
const H = now.getUTCHours();
```

**After:**
```js
const now = new Date();
const actualM = now.getUTCMinutes();
const M = Math.floor(actualM / 15) * 15; // nominal tick: round down to nearest 15-min boundary
const H = now.getUTCHours();
```

**No other lines change.** The `cronMatches()` loop, field parser, slot filter, and output are all unchanged. The `H` variable continues to use the real UTC hour (hour never drifts by more than 0 minutes for a sub-minute cron; the 15-min rounding stays within the same hour except at the :45→:00 boundary, which is handled correctly: minute :59 rounds to :45, staying in the same hour).

### Hour-boundary edge case analysis

The one structural edge case is a :45-slot fire that drifts past the hour boundary (e.g., nominal 20:45 but actual fire at 21:01 = 16 min drift). In that case `floor(1/15)*15 = 0`, so the anchor becomes 21:00 — missing the :45 slot. **This is acceptable:** 16 min drift exceeds the 14-min block limit; it would also exceed Option A's ±10 min window. If drift consistently exceeds 14 min the CronCreate scheduling is broken at the infrastructure level and must be escalated separately.

### Summary of file diff

```
- const M = now.getUTCMinutes();
+ const actualM = now.getUTCMinutes();
+ const M = Math.floor(actualM / 15) * 15; // nominal tick: round down to nearest 15-min boundary
```

One line deleted, two lines inserted. Net +1 line. No imports, no helper functions, no interface changes.

---

## 4. Collision Rule

**Rule:** No collision is possible under Option B by construction.

The nominal tick anchor `Math.floor(M/15)*15` maps every minute 0–59 to exactly one of {0, 15, 30, 45}. The ±2 window around each anchor spans:

- :00 anchor → [−2..2] clamped to [0..2] (h-1 rollover for :58/:59 is irrelevant since cron fires after :00)
- :15 anchor → [13..17]
- :30 anchor → [28..32]
- :45 anchor → [43..47]

These four windows are disjoint with a 10-minute gap between each. A slot scheduled at minute :18 would fall in neither the :15 window [13..17] nor the :30 window [28..32] — it would simply never match. Slot authors must place targets within ±2 of a 15-min boundary. All existing slots comply (verified below).

### Existing slot minute fields vs 15-min boundaries

| Slot | Cron minute | Nearest boundary | Delta | Within ±2? |
|------|------------|-----------------|-------|------------|
| chef-morning | 15 | :15 | 0 | YES |
| chef-intraday | 13 | :15 | 2 | YES (boundary) |
| chef-eod | 45 | :45 | 0 | YES |
| chef-evening | 45 | :45 | 0 | YES |
| digest-sunday | 47 | :45 | 2 | YES (boundary) |
| tnb-audit | 13 | :15 | 2 | YES (boundary) |
| financial-analyst-morning | 0 | :00 | 0 | YES |
| financial-analyst-midday | 0 | :00 | 0 | YES |
| news-scout-market | */15 | :00/:15/:30/:45 | 0 | YES |
| news-scout-offhours | 0 | :00 | 0 | YES |
| news-scout-sentiment | 0 | :00 | 0 | YES |
| market-watcher-market | */15 | :00/:15/:30/:45 | 0 | YES |
| market-watcher-prepost | */30 | :00/:30 | 0 | YES |
| market-watcher-offhours | 0 | :00 | 0 | YES |
| market-watcher-eod | 0 | :00 | 0 | YES |
| alert-commander-market | */15 | :00/:15/:30/:45 | 0 | YES |

All 16 enabled slots have minute targets within ±2 of a 15-min boundary. The fix is compatible with every existing slot definition.

**Addition rule for future slots:** Any new slot added to `docs/data/cowork-schedule.json` MUST have its minute field within ±2 of a 15-min boundary (i.e., minute ∈ {58, 59, 0, 1, 2, 13, 14, 15, 16, 17, 28, 29, 30, 31, 32, 43, 44, 45, 46, 47}). The `_ssot` note in `cowork-schedule.json` should be updated with this constraint.

---

## 5. Idempotency During Parallel-Run (Legacy RemoteTrigger Interaction)

During the Sprint 1951 24h parallel-run, legacy RemoteTriggers and the master CronCreate dispatcher run concurrently. The drift fix does not affect idempotency behavior:

- Legacy RemoteTriggers fire each agent flow directly with no slot-matcher involvement.
- The master dispatcher calls `cowork-match-slots.js` and spawns agents for matched slots.
- The existing idempotency guard in `.claude/flows/cowork-team/main.md` (dedup on `slot_id` + time window) continues to suppress double-publish regardless of whether the dispatcher fires 0 or 7 minutes late.
- The fix changes only which slots are matched, not whether matched slots are deduped. There is no new idempotency surface.

**The fix is safe to deploy mid-parallel-run without disrupting AC-6 observation.**

---

## 6. Regression Test Plan

The test file should be placed at `scripts/agents-flow/cowork-match-slots.test.js` (or equivalent Jest/Node test runner used by the project).

### TC-1: On-time fire matches */15 slot (baseline)
- Input: actual M=0, H=3, DOW=Monday
- Slot: news-scout-market `*/15 2-8 * * 1-5`
- Expected: match returned

### TC-2: 7-min drift still matches slot (regression case from signal)
- Input: actual M=22, H=20, DOW=any
- Slot: tnb-audit `13 20 * * *`
- Expected: match returned
- **This is the exact scenario from the drift signal. Under old code: 0 matches. Under fix: 1 match.**

### TC-3: 7-min drift from :00 tick
- Input: actual M=7, H=21, DOW=any
- Slot: (hypothetical) `0 21 * * *`
- Expected: match returned (nominal tick :00, window [0..2], actual :07 → nominal :00 → checks minute 0 → MATCH)
- Note: actual M=7 rounds to nominal :00; ±2 scans [-2..2], d=-7 is not in loop range; d=0 checks m=0 → field('0',0)=true → MATCH

Wait — re-checking: nominal M = floor(7/15)*15 = 0. Loop d=-2 to +2: d=0 gives m=0 → matches `0` minute field. YES, MATCH.

### TC-4: 14-min drift (maximum safe)
- Input: actual M=14, H=5, DOW=Monday
- Slot: chef-morning `15 5 * * 1-5`
- Expected: match (nominal=0, window[-2..2], d=1 gives m=1 — wait, nominal=floor(14/15)*15=0, window [−2..2] = [0..2] clamped, none hits :15)

Correction: chef-morning is at minute :15. If actual=14, nominal=floor(14/15)*15=0 (not :15). Window [0..2] does NOT catch :15. This is expected — :14 is only 1 minute before :15 but it rounds to the :00 block, not the :15 block. The fire is arriving 1 minute BEFORE the nominal :15 tick, meaning the CronCreate fired early, not late. CronCreate fires late by design (Claude mid-query jitter). A fire at :14 for a :15 slot means the CronCreate triggered ahead of schedule — this is not the failure mode being fixed.

**Revised TC-4: late drift near block boundary**
- Input: actual M=29, H=5, DOW=Monday
- Slot: (hypothetical) `28 5 * * 1-5` (within ±2 of :30 boundary)
- Expected: nominal=floor(29/15)*15=15... wait: floor(29/15)=1, *15=15. Window [13..17]. :28 is NOT in [13..17]. Miss.

Correction again: 29//15 = 1 remainder 14. floor(29/15)*15 = 15. The :28-minute slot targets the :30 boundary (delta=2). But at actual fire=:29, nominal=:15, window [13..17] — misses :28. This would only hit if actual=:28,29,30,31,32 (nominal=:30 for those). 

**Actual TC-4: 14-min drift within block**
- Input: actual M=29, H=2, DOW=Monday (fire 14 min after :15 nominal tick — but :29 actually rounds to :15 because floor(29/15)=1, *15=15)
- Slot: chef-intraday `13 2-8 * * 1-5` (target :13, within ±2 of :15)
- Expected: nominal=15, window [13..17], :13 is in window → MATCH
- This confirms max 14-min drift catches :13 from actual :29 fire.

### TC-5: No false match for out-of-window slot
- Input: actual M=22, H=20, DOW=any
- Slot: chef-morning `15 5 * * 1-5` (wrong hour)
- Expected: no match (hour field 5 vs actual H=20)

### TC-6: Adjacent-tick no collision
- Input: actual M=17, H=2, DOW=Monday (just past :15 boundary, nominal=:15)
- Slot A: chef-intraday `13 2-8 * * 1-5` → nominal :15 window [13..17] → :13 IN → MATCH
- Slot B: (hypothetical) `28 2-8 * * 1-5` → target :28, nominal :30 boundary; only matches when nominal=:30 → NOT matched at nominal=:15
- Expected: only Slot A matches — zero collision

### TC-7: Disabled slot not returned
- Input: actual M=30, H=0, DOW=Monday
- Slot: digest-monday-predict `30 0 * * 1`, `enabled: false`, `_disabled_by` set
- Expected: no match (disabled slot filtered)

---

## 7. Files Changed by This Fix

| File | Change | Owner |
|------|--------|-------|
| `scripts/agents-flow/cowork-match-slots.js` | Line 16: rename `M` to `actualM`, add nominal-tick rounding line | dev-mcp-server / agent-father |
| `docs/data/cowork-schedule.json` | Add `_slot_minute_rule` note to `_notes` block | agent-father |

Optional (recommended):
| `scripts/agents-flow/cowork-match-slots.test.js` | New file: TC-1 through TC-7 | dev-mcp-server |

---

## 8. Signal

Signal dropped to agent-father: `docs/signals/agents-architect-spike-1951f-fix.json`
