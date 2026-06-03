<!-- size-justification: 110L — Steps 4.4 + 4.5 + 4.5b: cadence due-check, freshness downgrade, CADENCE_MATCHES rebind. Child of main.md. -->

## Step 4.4 — Cadence due-check (adaptive mode) (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-3: evaluateCadence per slot; due = elapsed >= cadence.
     EC-3: last_fired=null → always due (first-run semantics).
     _cron_fallback: bctc-offmarket on open/half_day/unknown → cron governs.
     AC-P1-3-1: last_fired=null → always included.
     AC-P1-3-2: elapsed < cadence → not included.
     AC-P1-3-3: elapsed >= cadence → included.
     AC-P1-3-4: output slots carry due_reason + cadence_minutes fields. -->

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

  elapsed_seconds = now_unix - last_fired_unix
  if elapsed_seconds >= cadence_seconds:
    CADENCE_MATCHES.push(slot with { due_reason: "cadence", cadence_minutes: policy_result.interval_minutes })
  else:
    log "[cowork] cadence skip: " + slot.slot_id + " elapsed=" + Math.floor(elapsed_seconds) + "s cadence=" + cadence_seconds + "s"
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
