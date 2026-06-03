<!-- size-justification: 90L — Steps 4.2 + 4.3: pressure-state load + adaptive/legacy mode decision + calendar suppression gate. Child of main.md. -->

## Step 4.2 — Read and validate pressure-state.json (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-6: Staleness self-check on every tick (NFR-P1-7).
     AC-P1-6-1: Missing → legacy cron fallback, zero behavioral difference from today.
     AC-P1-6-2: emitted_at > 20 min old → fallback.
     AC-P1-6-3: stale_warning=true → fallback even if emitted_at is recent.
     _staleness_threshold_minutes is read from cadence-policy.json (SSOT — not hardcoded).
     Rate-limit WORK telegram: only emit when staleness epoch changes (tick_id differs). -->

```
PRESSURE_FILE   = "docs/data/pressure-state.json"
POLICY_FILE     = "docs/data/cadence-policy.json"
PRESSURE_MODE   = "adaptive"   # default; may downgrade to "legacy" below
PRESSURE_STATE  = null

# Load cadence policy (needed for _staleness_threshold_minutes)
if POLICY_FILE is missing or fails JSON parse:
  log "[cowork] WARN: cadence-policy.json missing/malformed — cadence fallback to legacy cron"
  PRESSURE_MODE = "legacy"
  → skip to Step 4.5b (CADENCE_MATCHES = MATCHES; proceed to Step 4.6)
else:
  POLICY_OBJ = JSON.parse(readFile(POLICY_FILE))
  STALENESS_THRESHOLD = POLICY_OBJ._staleness_threshold_minutes || 20

# Load pressure state
if PRESSURE_FILE is missing or fails JSON parse:
  reason = "missing" if file absent else "malformed"
  log "[cowork] WARN: pressure-state.json unavailable (" + reason + ") — cadence fallback to legacy cron"
  send_telegram(channel=work, "[cowork] WARN: pressure-state.json unavailable — cadence fallback to legacy cron (reason: " + reason + ")")
  PRESSURE_MODE = "legacy"
  → skip to Step 4.5b (CADENCE_MATCHES = MATCHES; proceed to Step 4.6)
else:
  PRESSURE_STATE = JSON.parse(readFile(PRESSURE_FILE))
  # isStale checks both stale_warning flag AND age threshold (AC-P1-6-2 / AC-P1-6-3)
  stale = isStale(PRESSURE_STATE, STALENESS_THRESHOLD)   # from cadence-policy.js
  if stale:
    reason = "stale_warning_flag" if PRESSURE_STATE.stale_warning == true else "stale"
    log "[cowork] WARN: pressure-state.json stale (reason: " + reason + ") — cadence fallback to legacy cron"
    # Rate-limit telegram: only emit when tick_id changes vs previous staleness epoch
    PRESSURE_MODE = "legacy"
    → skip to Step 4.5b (CADENCE_MATCHES = MATCHES; proceed to Step 4.6)

# PRESSURE_MODE = "adaptive" — proceed to Steps 4.3, 4.4, 4.5
```

If `PRESSURE_MODE = "legacy"` at end of this step: CADENCE_MATCHES = MATCHES (raw from Steps 2+3). Skip Steps 4.3–4.5. Proceed directly to Step 4.5b. This satisfies NFR-P1-3 (never worse than today).

---

## Step 4.3 — Calendar suppression (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-4: Suppress non-guaranteed slots on holiday/weekend.
     BLOCKER-1 resolution: suppression runs BEFORE Step 4.6 per-work-item claim.
     No token is acquired for suppressed slots — no task_release needed.
     AC-P1-4-1: holiday → guaranteed slots still fire (never suppressed).
     AC-P1-4-2: unknown → no suppression (conservative).
     OQ-P1-3: bctc-offmarket + holiday → suppress; bctc-offmarket + weekend → NOT suppressed here
               (cadence policy handles 1440-min rate for weekend bctc slots in Step 4.4). -->

Only runs if `PRESSURE_MODE = "adaptive"`.

```
CALENDAR_STATUS = PRESSURE_STATE.calendar_status   # from Step 4.2

SUPPRESS_CALENDAR = new Set()

if CALENDAR_STATUS in ["holiday", "weekend"]:
  for each slot in MATCHES:
    if slot.guaranteed == true:
      continue   # guaranteed slots never suppressed (NFR-P1-4)

    if slot.policy_id == "bctc-offmarket":
      if CALENDAR_STATUS == "holiday":
        SUPPRESS_CALENDAR.add(slot.slot_id)
        log "[cowork] calendar suppress: " + slot.slot_id + " reason=holiday (bctc-offmarket policy)"
      # bctc-offmarket + weekend: NOT suppressed here — Step 4.4 cadence policy resolves 1440-min rate
      continue

    # All other non-guaranteed slots: suppress on holiday OR weekend
    SUPPRESS_CALENDAR.add(slot.slot_id)
    log "[cowork] calendar suppress: " + slot.slot_id + " reason=" + CALENDAR_STATUS

# No token acquired → no task_release needed (BLOCKER-1 resolution)
CALENDAR_ALLOWED = MATCHES.filter(s => !SUPPRESS_CALENDAR.has(s.slot_id))
```

For `CALENDAR_STATUS` values `"open"`, `"half_day"`, `"unknown"`: no suppression (conservative — AC-P1-4-2).
