<!-- size-justification: 117L — Steps 4.2 + 4.3: pressure-state load + adaptive/legacy mode decision + calendar suppression gate. Child of main.md. FR-A5 (TASK_2008c, UC-CDC-P1, 2026-08-15): added CALENDAR_STATUS_DOMAIN enumeration + fail-loud (log + send_telegram(channel="bug")) on out-of-domain calendar_status, defense-in-depth for legacy on-disk values predating TASK_2008a's server-side enum gate. FIX-COWORK-FLOWDOC-STALE-WEEKEND-SUPPRESSION-AND-BGFAN1-RETURN-PRESUMPTION 2026-08-23: +2L — Step 4.3's blanket weekend/holiday suppression marked SUPERSEDED (UC-CDC-P7 Phase 2a moved calendar-aware cadence into docs/data/cadence-policy.json's per-policy table + cowork-match-slots.js's evaluateCadence(), same move already documented on Steps 4.4/4.5/4.5c/4.5d in pressure-cadence.md — this step moved with them but never got the marker); body kept as historical record, not deleted. -->

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
  send_telegram(channel="work", message="[cowork] WARN: pressure-state.json unavailable — cadence fallback to legacy cron (reason: " + reason + ")")
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

**SUPERSEDED (UC-CDC-P7 Phase 2a, discovered stale 2026-08-23 — FIX-COWORK-FLOWDOC-STALE-WEEKEND-SUPPRESSION-AND-BGFAN1-RETURN-PRESUMPTION):** the blanket "suppress all non-guaranteed slots on holiday OR weekend" rule below now runs INSIDE `scripts/agents-flow/cadence-policy.js`'s `evaluateCadence()` (called from `cowork-match-slots.js`), the SAME per-policy cadence table Step 4.4 already documents as the live owner — the sibling Steps 4.4/4.5/4.5c/4.5d were all marked SUPERSEDED under this same Phase 2a move (`pressure-cadence.md:74,134,196`); this step moved with them but never got the marker. `docs/data/cadence-policy.json`'s `policies[]` table resolves weekend/holiday PER POLICY, not as a blanket suppress: e.g. `gatherer-standard` on `calendar_status:"weekend"` resolves `interval_minutes:480` (throttled, NOT suppressed — gatherers fired live Saturday 2026-08-22T20:08:12Z, confirming this), while `chef-intraday` on weekend resolves `interval_minutes:null` (suppressed) via that policy's own row, not this step's blanket logic. Any slot with `_cron_fallback:true` (e.g. weekend `bctc-offmarket`) is handled by `cowork-match-slots.js` as "cron governs," never as suppress. `CADENCE_MATCHES`/`MATCHES` arriving at Step 4.4 already reflect `evaluateCadence()`'s per-policy resolution — there is nothing left for this step's blanket rule to do. This step is a documentation no-op; kept below as historical record of the pre-Phase-2a inline logic, do not delete or apply it literally.

Only runs if `PRESSURE_MODE = "adaptive"` (historical — pre-Phase-2a gate, no longer executed literally, see SUPERSEDED note above).

```
CALENDAR_STATUS = PRESSURE_STATE.calendar_status   # from Step 4.2
CALENDAR_STATUS_DOMAIN = ["open", "half_day", "weekend", "holiday", "unknown"]   # FR-A5: the only 5 values a producer may ever write

SUPPRESS_CALENDAR = new Set()

if CALENDAR_STATUS not in CALENDAR_STATUS_DOMAIN:
  # FR-A5 fail-loud (defense-in-depth for a legacy on-disk file predating FR-A1/FR-A2's
  # server-computed producer + enum gate): an out-of-domain literal (e.g. historically
  # observed "closed"/"off_market") must be VISIBLE, not silently indistinguishable from
  # a legitimate "unknown". No rate-limit (unlike the Step 4.2 staleness warning) — once
  # FR-A1/FR-A2 land, the value self-heals within one tick, so this is a one-shot alert
  # window, not a persistent-until-fixed condition.
  log "[cowork] WARN: out-of-domain calendar_status value: " + CALENDAR_STATUS + " — falling through to no-suppression (conservative)"
  send_telegram(channel="bug", message="[pressure-read] out-of-domain calendar_status: " + CALENDAR_STATUS)
  # falls through below unchanged — same no-suppression path as a legitimate "unknown"

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

For `CALENDAR_STATUS` values `"open"`, `"half_day"`, `"unknown"`, or any value outside the 5-value domain `CALENDAR_STATUS_DOMAIN` above: no suppression (conservative — AC-P1-4-2). Out-of-domain values additionally fail loud (log + `send_telegram(channel="bug")`, above) — this is the ONLY behavioral difference; the no-suppression fallthrough itself is unchanged.

<!-- SIGNAL-TRIAGE HELPER (added 2026-07-21, escalate-path list updated 2026-08-08 per
     FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP): when a
     signal_queue A-30 "mcp-server memory pressure" WARN row arrives during a tick,
     discriminate benign GC-sawtooth from genuine loss-of-reclamation with
     `scripts/audits/verify-a30-mcp-memory-reclamation.sh [PROBES] [INTERVAL_SEC]` (default
     12/25s = ~5min window). Verdict FOLD|ESCALATE in its JSON. Escalate to ops on ANY of:
     RestartCount/StartedAt changed during the window (container died/restarted mid-probe),
     OOMKilled, ExitCode=0 with a FinishedAt delta (this fleet's OOMKilled-less death
     signature), a >40pp single-step discontinuity (crash cliff), VmHWM advancing to a new
     peak while pinned at/near the cgroup cap, all samples >93% sustained (a lone <=0.5pp
     jitter dip no longer vetoes this), or the window median >97%. Otherwise FOLD to
     FIX-MCP-MEMORY-CODE-LEAK. Ref memory feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn
     + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip. The script pins
     LC_ALL=C — it MUST, or a comma-decimal locale corrupts the float math into invalid JSON. -->

