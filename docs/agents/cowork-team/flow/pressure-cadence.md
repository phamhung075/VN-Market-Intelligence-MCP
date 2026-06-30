<!-- size-justification: 110L — Steps 4.4 + 4.5 + 4.5b: cadence due-check, freshness downgrade, CADENCE_MATCHES rebind. Child of main.md. -->

## Step 4.4 — Cadence due-check (adaptive mode) (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-3: evaluateCadence per slot; due = elapsed >= cadence.
     EC-3: last_fired=null → always due (first-run semantics).
     _cron_fallback: bctc-offmarket on open/half_day/unknown → cron governs.
     Snap: last_fired floored to nominal cron-tick boundary before elapsed (2b67d3a7).
     AC-P1-3-1: last_fired=null → always included.
     AC-P1-3-2: elapsed < cadence → not included.
     AC-P1-3-3: elapsed >= cadence → included.
     AC-P1-3-4: last_fired stamped after a nominal tick with cadence==cron-period → still due
                at next nominal tick, via snap-to-boundary (e.g. "0 */4" 240min: spawn at
                04:04:30Z snaps to 04:00:00Z; elapsed at 08:00Z = 14400s >= 14400s → due).
     AC-P1-3-5: output slots carry due_reason + cadence_minutes fields. -->

Only runs if `PRESSURE_MODE = "adaptive"`.

```
{ signal_backlog_tier, volatility_tier } = computeTiers(PRESSURE_STATE)
  # signal_backlog_tier: low=0–2, medium=3–9, high=≥10
  # volatility_tier: low if last_volatility_level in ["unknown","low"], high otherwise

CADENCE_MATCHES = []

for each slot in CALENDAR_ALLOWED:
  if slot.policy_id == null:
    # Legacy cron — already matched by Steps 2+3; pass through unchanged
    CADENCE_MATCHES.push(slot with { due_reason: "cron", cadence_minutes: null })
    continue

  policy_result = evaluateCadence(slot.policy_id, CALENDAR_STATUS, signal_backlog_tier, volatility_tier, POLICY_OBJ)
  # evaluateCadence: first-match in cadence-policy.json array; unmatched → interval_minutes=240

  if policy_result._cron_fallback == true:
    # bctc-offmarket on open/half_day/unknown — cron already matched this slot in Steps 2+3
    CADENCE_MATCHES.push(slot with { due_reason: "cron", cadence_minutes: null })
    continue

  if policy_result.interval_minutes == null:
    # Suppressed by policy (e.g. chef-intraday on holiday/weekend)
    log "[cowork] cadence suppress: " + slot.slot_id + " policy=" + slot.policy_id + " reason=null_interval calendar=" + CALENDAR_STATUS
    continue   # do not add to CADENCE_MATCHES; no token acquired

  cadence_seconds = policy_result.interval_minutes * 60
  last_fired_unix = slot.last_fired ? new Date(slot.last_fired).getTime() / 1000 : null

  if last_fired_unix == null:
    # EC-3: first-run semantics (last_fired=null → always due)
    CADENCE_MATCHES.push(slot with { due_reason: "first_run", cadence_minutes: policy_result.interval_minutes })
    continue

  # snapToCronBoundary: floor last_fired to cron-period boundary (UTC epoch-aligned, 2b67d3a7)
  #   "0 */H * * *" → H*3600s  |  "*/M ..." → M*60s  |  "0 H * * *" → 86400s  |  else → no-op
  snapped_last_fired = snapToCronBoundary(last_fired_unix, slot.cron)
  elapsed_seconds = now_unix - snapped_last_fired
  if elapsed_seconds >= cadence_seconds:
    CADENCE_MATCHES.push(slot with { due_reason: "cadence", cadence_minutes: policy_result.interval_minutes })
  else:
    log "[cowork] cadence skip: " + slot.slot_id + " elapsed=" + Math.floor(elapsed_seconds) + "s cadence=" + cadence_seconds + "s (snapped_last_fired=<ISO>)"
    # no token acquired — no release needed
```

---

## Step 4.5 — Freshness silent-downgrade for gatherer slots (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-5: Suppress gatherer slots when all three conditions hold:
     last_regime="unknown" AND signal_backlog=0 AND calendar_status in ["holiday","weekend"].
     Condition: "nothing has changed and market is closed — no value in running gatherers."
     AC-P1-5-1: Three-condition AND gate enforced (not two of three).
     This downgrade applies only to non-guaranteed gatherers; guaranteed slots are never touched. -->

Only runs if `PRESSURE_MODE = "adaptive"`.

```
GATHERER_SLOTS = ["news-scout-offhours", "market-watcher-offhours", "news-scout-sentiment", "market-watcher-eod"]

DOWNGRADED = []

if PRESSURE_STATE.last_regime == "unknown"
   AND PRESSURE_STATE.signal_backlog == 0
   AND CALENDAR_STATUS in ["holiday", "weekend"]:

  for each slot in CADENCE_MATCHES:
    if slot.slot_id in GATHERER_SLOTS AND slot.guaranteed == false:
      DOWNGRADED.push(slot.slot_id)
      log "[cowork] freshness downgrade: " + slot.slot_id + " — no regime, empty backlog, market closed"

  CADENCE_MATCHES = CADENCE_MATCHES.filter(s => !DOWNGRADED.includes(s.slot_id))
  # Note: these slots were in CADENCE_MATCHES but not yet claimed — no token release needed (BLOCKER-1)
```

---

## Step 4.5b — Resolve final CADENCE_MATCHES (DWF-PHASE1)

<!-- BLOCKER-1 resolution: CADENCE_MATCHES is the result after all Phase 1 gates.
     Step 4.6 receives this set (rebind MATCHES = CADENCE_MATCHES).
     Legacy mode: CADENCE_MATCHES = raw MATCHES from Steps 2+3 (no filtering). -->

```
# Rebind MATCHES for Step 4.6 compatibility
# After this step: MATCHES contains only calendar-allowed + cadence-due + not-freshness-downgraded slots
MATCHES = CADENCE_MATCHES
```

Telemetry fields added to Step 6 payload (for observability):
```
{
  "pressure_mode":        "<adaptive|legacy>",
  "calendar_status":      "<status>",
  "suppressed_calendar":  ["<slot_ids suppressed in Step 4.3>"],
  "suppressed_cadence":   ["<slot_ids skipped in Step 4.4 for null interval or elapsed<cadence>"],
  "downgraded":           ["<slot_ids removed in Step 4.5>"],
  "due_reasons":          { "<slot_id>": "<cadence|cron|first_run>" },
  "cadence_minutes":      { "<slot_id>": <N|null> }
}
```

---

## Step 4.5c — Same-tick CHEF mutual-exclusion (FIX-COWORK-CHEF-SAMETICK-MUTEX)

<!-- INVARIANT: Exactly one CHEF dish per tick. When multiple CHEF slots match the same tick,
     keep only the guaranteed slot; drop all non-guaranteed sibling slots.
     Rationale: chef-morning, chef-eod, chef-evening are guaranteed (daily editorial);
     chef-intraday is conditional (policy_id="chef-intraday", guaranteed=false).
     On 05:15 UTC coincidence tick, both chef-morning + chef-intraday matched in legacy mode,
     causing double-post to MARKET. This mutex enforces the invariant regardless of pressure_mode.
     Source: docs/signals/cowork-chef-doublepublish-2026-06-30.md FIX-A.
     Runs AFTER both pressure-mode branches complete (adaptive & legacy both reach here).
     Applies unconditionally to guarantee the mutex across all pressure states. -->

```
# Read schedule to identify CHEF slots (all are in parallel_group="chef")
SCHEDULE=$(cat docs/data/cowork-schedule.json)

# Separate guaranteed from non-guaranteed CHEF slots
GUARANTEED_CHEF_SLOTS=$(echo "$SCHEDULE" | jq -r '.slots[] | select(.parallel_group=="chef" AND .guaranteed==true) | .slot_id' | tr '\n' ' ')
NON_GUARANTEED_CHEF=$(echo "$SCHEDULE" | jq -r '.slots[] | select(.parallel_group=="chef" AND .guaranteed==false) | .slot_id' | tr '\n' ' ')

# If MATCHES has both guaranteed AND non-guaranteed CHEF slots, drop the non-guaranteed ones
HAS_GUARANTEED=$(echo "$MATCHES" | jq -r "any(.[]; .slot_id | IN($(echo $GUARANTEED_CHEF_SLOTS | xargs -I{} echo '\"{}\"' | paste -sd ',' -)))")
HAS_NON_GUARANTEED=$(echo "$MATCHES" | jq -r "any(.[]; .slot_id | IN($(echo $NON_GUARANTEED_CHEF | xargs -I{} echo '\"{}\"' | paste -sd ',' -)))")

if [ "$HAS_GUARANTEED" = "true" ] && [ "$HAS_NON_GUARANTEED" = "true" ]; then
  # Drop non-guaranteed CHEF slots; keep the rest
  NON_GUARANTEED_LIST=$(echo "$NON_GUARANTEED_CHEF" | xargs -I{} echo '\"{}\"' | paste -sd ',' -)
  MATCHES=$(echo "$MATCHES" | jq "map(select(.slot_id | IN($NON_GUARANTEED_LIST) | not))")
  
  log "[cowork] CHEF mutex: dropped non-guaranteed CHEF slots; guaranteed CHEF slot will publish this tick"
  # Telemetry flag (added to Step 6 payload)
  CHEF_MUTEX_APPLIED=true
else
  CHEF_MUTEX_APPLIED=false
fi
```

**CHEF Mutex Invariant:** Exactly one CHEF dish per tick. GUARANTEED > NON-GUARANTEED.
- **Guaranteed CHEF slots:** chef-morning, chef-eod, chef-evening (daily guaranteed; `guaranteed: true, policy_id: null`)
- **Non-guaranteed CHEF slots:** chef-intraday (conditional on policy; `guaranteed: false, policy_id: "chef-intraday"`)
- **Action:** When both guaranteed and non-guaranteed coexist in MATCHES, keep guaranteed, drop non-guaranteed.
- **Applies to:** Both adaptive and legacy pressure modes (unconditional).
- **Root cause closed:** cowork-chef-doublepublish-2026-06-30; prevents legacy-mode cadence-bypass double-posts.
