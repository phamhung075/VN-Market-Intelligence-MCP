<!-- size-justification: 55L — Step 5b: batched last_fired write to cowork-schedule.json (DWF-PHASE1 FR-P1-7). Child of main.md. -->

## Step 5b — Batch `last_fired` write (DWF-PHASE1 FR-P1-7)

<!-- BLOCKER-3 resolution: single batched read→update-all-WON→write.tmp→rename.
     No per-slot writes (avoids lost-update race from parallel fan-out).
     Only WON_SLOTS (successful spawns) update last_fired — failed spawns leave it unchanged.
     Single-slot CAS + monotonic forward-only write: no slot's last_fired ever decreases.
     Non-fatal on write failure: log WARN, continue to Step 6, do NOT roll back spawns.
     AC-P1-7-1: last_fired written after successful spawn.
     AC-P1-7-2: spawn failure → last_fired NOT written.
     AC-P1-7-3: write failure is non-fatal; spawn already happened. -->

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
