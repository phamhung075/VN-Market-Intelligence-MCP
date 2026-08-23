<!-- size-justification: 55L — Step 5b: batched last_fired write to cowork-schedule.json (DWF-PHASE1 FR-P1-7). Child of main.md. FIX-COWORK-FLOWDOC-STALE-WEEKEND-SUPPRESSION-AND-BGFAN1-RETURN-PRESUMPTION 2026-08-23: +17L — AC-P1-7-4 corrected from an in-line pre-write filter (presumed spawn-fanout.md Step 5.3 always runs before this write, which BGFAN-1 makes the exception, not the rule) to a DEFERRED de-stamp reconciliation contract matching real async-return timing; content-only, the write itself is unchanged. -->

## Step 5b — Batch `last_fired` write (DWF-PHASE1 FR-P1-7)

<!-- BLOCKER-3 resolution: single batched read→update-all-WON→write.tmp→rename.
     No per-slot writes (avoids lost-update race from parallel fan-out).
     Only WON_SLOTS (successful spawns) update last_fired — failed spawns leave it unchanged.
     Single-slot CAS + monotonic forward-only write: no slot's last_fired ever decreases.
     Non-fatal on write failure: log WARN, continue to Step 6, do NOT roll back spawns.
     AC-P1-7-1: last_fired written after successful spawn.
     AC-P1-7-2: spawn failure → last_fired NOT written.
     AC-P1-7-3: write failure is non-fatal; spawn already happened.
     AC-P1-7-4 (FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW, 2026-07-29; TIMING CONTRACT
     corrected FIX-COWORK-FLOWDOC-STALE-WEEKEND-SUPPRESSION-AND-BGFAN1-RETURN-PRESUMPTION,
     2026-08-23): a slot Step 5.3 (spawn-fanout.md) flags as off-flow-router-latch-detected
     gets the non-stamp treatment ONLY when Step 5.3's match runs BEFORE this step (the rare
     SAME-TICK path — the batch's task notification genuinely landed inside
     `batch_wait_max_seconds`) — same non-stamp treatment as AC-P1-7-2, just gated on the
     spawn's returned content instead of its transport-level success/failure. Under BGFAN-1
     (`run_in_background=true` on every spawn) this step ordinarily runs and stamps
     `last_fired` BEFORE the batch's return text is available at all (confirmed live
     2026-08-23 — see spawn-fanout.md Step 5.3's TIMING CONTRACT) — a pre-write filter cannot
     fire on content that does not exist yet. For that ordinary DEFERRED case, an off-flow
     detection found LATER (once the return text lands, by this same session's later turn, the
     router, or the next tick's bootstrap) is applied as a DE-STAMP correction against the
     value written here: re-read this file, and IF the flagged slot's `last_fired` still equals
     the `FIRED_AT` this step wrote (no fresher, genuine fire has since superseded it — never
     revert a later stamp) THEN revert it to the value it held immediately before this write
     (never to `null` — the monotonic-forward-only invariant above is preserved; this is a
     correction, not a reset), making the slot due again on its normal cadence. Scripting the
     de-stamp write is a developer-owned follow-up to `cowork-write-last-fired.js` (out of
     agent-father's `commit_zone`); until it ships, the reconciling session performs the
     equivalent read→compare→atomic-write by hand, same shape as the pseudocode below. -->

Only execute if `WON_SLOTS` is non-empty (skip on silent-exit path).

**Implementation → `scripts/agents-flow/cowork-write-last-fired.js`** (added 2026-07-23). Run it; do
NOT hand-roll this step inline. Two confirmed corruptions of `cowork-schedule.json` came from
ad-hoc inline versions and both were SILENT: a multi-slot `jq` needle that clobbered sibling
slots, and a zsh `for s in $SLOT_IDS` loop that (zsh does not word-split unquoted vars) iterated
once over the whole string, matched nothing, and still reported write-OK. The script makes both
structurally impossible — whole-document parse → in-memory mutation against a Set → parse-back
guard → atomic rename — and refuses with rc=2 on an empty or unknown slot id rather than writing
a valid-looking file that updated nothing.

```bash
FIRED_AT=<ISO8601 UTC, optional> node scripts/agents-flow/cowork-write-last-fired.js <slot_id> [<slot_id> ...]
# → {"ok":true,"fired_at":"...","updated":[...],"skipped":[{slot_id,kept}]}
# rc=0 written · rc=1 runtime failure (non-fatal per AC-P1-7-3 — record in telemetry, never roll back spawns)
# rc=2 caller bug (no/unknown slot ids) — loud by design
```

The pseudocode below is the reference contract the script implements.

```
FIRED_AT      = new Date().toISOString()   # UTC ISO8601 — same timestamp for all WON_SLOTS in this tick
SCHED_FILE    = "docs/data/cowork-schedule.json"
SCHED_TMPFILE = "docs/data/cowork-schedule.json.tmp"

try:
  # Single read — load entire schedule into memory
  schedule = JSON.parse(readFileSync(SCHED_FILE, 'utf8'))

  # Update in memory — only for WON_SLOTS (suppressed + held slots untouched)
  WON_IDS = new Set(WON_SLOTS.map(s => s.slot_id))
  for each slot in schedule.slots:
    if WON_IDS.has(slot.slot_id):
      currentLastFired = slot.last_fired           # from FRESHLY-READ file
      if currentLastFired === null OR FIRED_AT > currentLastFired:
        slot.last_fired = FIRED_AT
      # else: sibling already wrote a fresher stamp — leave unchanged

  # Atomic write: write to .tmp then rename (AC-P1-2-2 / NFR-P1-6)
  writeFileSync(SCHED_TMPFILE, JSON.stringify(schedule, null, 2))
  renameSync(SCHED_TMPFILE, SCHED_FILE)

  log "[cowork-team] last_fired updated for slots: " + [...WON_IDS].join(", ") + " at " + FIRED_AT

catch (e):
  # Non-fatal: spawn already happened (Steps 0–5 complete). Next tick computes due from stale last_fired.
  # Conservative: under-suppress (slot may fire again at next tick) — never over-suppress.
  # Do NOT abort or roll back the spawn (FR-P1-7 AC-P1-7-3).
  log "[cowork-team] WARN: last_fired write failed: " + e.message + " — slot(s): " + WON_SLOTS.map(s=>s.slot_id).join(", ")
  # Telemetry captures the failure in last_fired_write_errors below
```

**Extend telemetry payload (Step 6):** Add these fields to the signal output:

```json
{
  "last_fired_timestamp":    "<ISO8601 of write — same as FIRED_AT>",
  "last_fired_slots":        ["<slot_ids whose last_fired was updated>"],
  "last_fired_write_errors": "<null or error message if write failed>"
}
```
