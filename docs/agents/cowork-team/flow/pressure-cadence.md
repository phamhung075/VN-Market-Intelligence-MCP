<!-- size-justification: 214L — Step 4.4 cadence due-check (live pseudocode) + Steps 4.5/4.5c/4.5d marked SUPERSEDED (UC-CDC-P7 Phase 2a moved all three into cowork-match-slots.js; kept as pointers + historical incident record, not deleted) + 4.5b telemetry-field sourcing table. Child of main.md. FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-COLLISION-SCHEDULE-AND-PATHSPEC 2026-08-14: added Step 4.5d same-agent supersede-mutex doc pointer (+34L), mirrors 4.5c exactly. -->

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

**SUPERSEDED (UC-CDC-P7 Phase 2a):** this gate now runs INSIDE `scripts/agents-flow/
cowork-match-slots.js` (`applyFreshnessDowngrade()`) — the SAME single computation used by
Steps 2+3 above, on BOTH the WORK path (`cowork-tick-preflight.sh` Step 6) and the
ERROR-fallback path (`match-slots.md` Steps 2+3). `CADENCE_MATCHES`/`MATCHES` arriving at this
point in the flow ALREADY have this filtering applied — there is nothing left to do here.
Gatherer-slot membership is derived from `cowork-schedule.json`'s own
`parallel_group=="gatherers"` field (no more `GATHERER_SLOTS` literal to keep in sync).
Observability: the script's stdout carries `downgraded` (array of removed slot_ids) — on the
WORK path read `$VERDICT_JSON.downgraded`; on the ERROR path read it from the Steps 2+3 `$RAW`
capture. This step is a documentation no-op; kept for the historical FR-P1-5/AC-P1-5-1 spec.

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
Sourcing (UC-CDC-P7 Phase 2a — `pressure_mode`/`suppressed_cadence`/`downgraded`/`due_reasons`/
`cadence_minutes`/`chef_mutex_applied` are now script-computed, not LLM-narrated):
- **WORK path:** read straight off `$VERDICT_JSON.<field>` (`cowork-tick-preflight.sh` Step 6
  already captured them from the matcher's stdout into the verdict envelope).
- **ERROR-fallback path:** `match-slots.md` Steps 2+3 capture the same fields from `$RAW`
  (the direct `cowork-match-slots.js` CLI call) into local vars of the same names.
- `suppressed_calendar` (Step 4.3, `pressure-read.md`) and `calendar_status` are the only two
  fields in this payload still computed inline in this flow, not the script.

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

**SUPERSEDED (UC-CDC-P7 Phase 2a):** the mutex now runs INSIDE `scripts/agents-flow/
cowork-match-slots.js` (`finish()` calls `cowork-chef-mutex.js`'s `applyChefMutex()`
in-process — no more `printf | node` subprocess round-trip), unconditionally at the tail of
BOTH the legacy and adaptive branches, on every invocation (WORK-path preflight Step 6 AND
ERROR-fallback `match-slots.md` Steps 2+3). `MATCHES` arriving at this point already has the
mutex applied — there is nothing left to do here. Read `chef_mutex_applied` the same way as
`downgraded` above (WORK: `$VERDICT_JSON.chef_mutex_applied`; ERROR: captured from `$RAW`).
This step is a documentation no-op; kept for the historical FIX-COWORK-CHEF-SAMETICK-MUTEX /
FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT incident record below.

<details>
<summary>Historical incident record (pre-UC-CDC-P7 inline shell implementation)</summary>

```
# FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT (2nd occurrence, 07-14 + 07-16T05:15Z): the prior
# inline `SCHEDULE=$(cat ...); echo "$SCHEDULE" | jq ...` pattern was defeated by zsh's
# `echo` builtin, which interprets backslash escapes BY DEFAULT (unlike bash). chef-intraday's
# trigger_prompt contains a literal `\n` inside its JSON string value; echoing it back turned
# that escaped `\n` into a real newline byte, which is illegal unescaped inside a JSON string
# — jq then failed with a control-character parse error, G_ARR/NG_ARR came back EMPTY,
# CHEF_MUTEX_APPLIED silently stayed false, and BOTH chef-morning + chef-intraday spawned —
# a double market publish, failing silently. NEVER round-trip a JSON payload through `echo`.
# The mutex logic is now a tested helper (scripts/agents-flow/cowork-chef-mutex.test.js
# includes a regression guard reproducing this exact corruption against the real fixture).
#
# MATCHES is piped via `printf '%s'` (never `echo` — printf never interprets backslash
# escapes in its %s argument) and the schedule is read file-direct inside the script
# (fs.readFileSync, no shell cat/echo involved). $RESULT is consumed back via
# `jq -n --argjson` (execve argv, not a pipe an interpreter could re-read/re-escape).
RESULT=$(printf '%s' "$MATCHES" | node scripts/agents-flow/cowork-chef-mutex.js)

MATCHES=$(jq -n --argjson r "$RESULT" -c '$r.matches')
CHEF_MUTEX_APPLIED=$(jq -n --argjson r "$RESULT" '$r.chef_mutex_applied')

if [ "$CHEF_MUTEX_APPLIED" = "true" ]; then
  log "[cowork] CHEF mutex: dropped non-guaranteed CHEF slots; guaranteed CHEF slot will publish this tick"
fi
```

</details>

**CHEF Mutex Invariant:** Exactly one CHEF dish per tick. GUARANTEED > NON-GUARANTEED.
- **Guaranteed CHEF slots:** chef-morning, chef-eod, chef-evening (daily guaranteed; `guaranteed: true, policy_id: null`)
- **Non-guaranteed CHEF slots:** chef-intraday (conditional on policy; `guaranteed: false, policy_id: "chef-intraday"`)
- **Action:** When both guaranteed and non-guaranteed coexist in MATCHES, keep guaranteed, drop non-guaranteed.
- **Applies to:** Both adaptive and legacy pressure modes (unconditional).
- **Root cause closed:** cowork-chef-doublepublish-2026-06-30; prevents legacy-mode cadence-bypass double-posts.

---

## Step 4.5d — Same-agent notebook-collision mutex (supersede) (FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-COLLISION-SCHEDULE-AND-PATHSPEC)

<!-- INVARIANT: a slot with a non-empty `supersedes` array, when matched in the same tick as any
     slot it names, drops those named slots before spawn-fanout ever sees them.
     Generalizes the CHEF mutex (Step 4.5c) to same-agent pairs that cannot use the `guaranteed`
     boolean as a tie-break (both slots `guaranteed: false`) — an explicit, declarative,
     one-directional, opt-in `supersedes` field on the schedule row instead of an inferred one.
     market-watcher-eod (`0 16 * * 1-5`) and market-watcher-offhours (`0 */4 * * *`) co-fire every
     weekday at the 16:00 UTC boundary, both writing the SAME OVERWRITE-class notebook
     (docs/agent-memory/notebooks/market-watcher.md) — the loser's cycle content is not merged, it
     is gone. Source: docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md §3. -->

**SUPERSEDED (UC-CDC-P7 Phase 2a pattern, applied here on first ship):** this mutex runs INSIDE
`scripts/agents-flow/cowork-match-slots.js` (`finish()` calls `cowork-supersede-mutex.js`'s
`applySupersedeMutex()` in-process via `require()` — never a shell `echo`/`printf` pipe, same
corruption class the CHEF mutex's own incident record warns about), unconditionally at the tail
of BOTH the legacy and adaptive branches, immediately AFTER the CHEF mutex (Step 4.5c), on every
invocation (WORK-path preflight Step 6 AND ERROR-fallback `match-slots.md` Steps 2+3). `MATCHES`
arriving at this point already has the supersede mutex applied — there is nothing left to do
here. Read `supersede_mutex_applied` the same way as `chef_mutex_applied` above (WORK:
`$VERDICT_JSON.supersede_mutex_applied`; ERROR: captured from `$RAW`). This step is a
documentation no-op; kept for the historical incident record.

**Supersede Mutex Invariant:** For every slot `S` in `MATCHES` whose schedule row declares a
non-empty `.supersedes` array: if any `slot_id` in `S.supersedes` is ALSO present in `MATCHES`,
drop those named slot_ids — `S` survives, its named victims do not. Order-preserving on survivors.
- **Declared pair (first ship):** `market-watcher-eod` supersedes `market-watcher-offhours`
  (`docs/data/cowork-schedule.json` `market-watcher-eod.supersedes`).
- **Applies to:** Both adaptive and legacy pressure modes (unconditional), same-tick coincidences only.
- **Does not affect:** Any tick where `market-watcher-offhours` fires alone (the field is one-directional and opt-in — no change to the offhours slot's own object).
- **Root cause closed:** market-watcher-eod/offhours OVERWRITE-class notebook data loss + the RULE 2.5 wrong-file-commit this incident also surfaced (fixed separately in `eod.md`/`cycle.md`, see brief §4).
