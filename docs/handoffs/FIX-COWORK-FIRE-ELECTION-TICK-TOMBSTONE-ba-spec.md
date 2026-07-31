# BA Spec — FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE

**Task:** `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE` (P1, size S, zone `cross-service/`, sprint `COWORK-RELIABILITY`)
**BA author:** ba (this cycle) — spec only, no code written (see `not_my_job` / `forbidden_outputs` in `docs/agents/ba/init.md`)
**Hand off to:** architect
**Source of truth for the incident:** the board row itself (`docs/data/orch/orch-state.json` `.task_board.in_progress[]`, id `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE`) — `note`, `po_retraction_2026-07-16`, `po_reescalation_2026-07-31` fields. Original root-cause doc: `docs/handoffs/2026-07-15-cowork-tick-refire-election-lock-does-not-span-its-tick.md`.

---

## Problem summary (for architect — not re-litigating po's analysis)

`cron:cowork:<TICK>` (the P3 fire-election leader-lock, `docs/agents/cowork-team/flow/leader-lock.md` § Fire claim) is claimed at tick start and released at the end of `docs/agents/cowork-team/flow/telemetry.md` Step 6, on every exit path. That is correct **as a leader lock** (must not outlive the tick), but its lifetime is `[tick start, tick end]` with **no persistent "this nominal tick already ran" marker**. A re-fire of the *same* nominal tick arriving after the release window finds the key free, re-elects a leader, and re-runs the whole tick from scratch.

**Production-confirmed twice in 27h** (po's re-escalation, RAW-verified by dev-team before dispatch):
- `bctc-analyst-slot-3`, tick `2026-07-30T21:00Z` — `docs/signals/processed/cowork-team-2026-07-30T21:21:45Z.json`, cycle_id `20260730-2100`
- `bctc-analyst-slot-4`, tick `2026-07-31T00:00Z` — `docs/signals/cowork-team-2026-07-31T00:22:30Z.json`, cycle_id `20260731-0000`

Observed damage per incident: 2 duplicate agent spawns, ~9–20min duplicate LLM work each, `bctc_signal` files overwritten twice with materially-different-but-not-identical content, two independent notebook entries under the same cycle number, duplicate `log_agent_work` lifecycles. This discharges the row's original AC-3 "someone must probe first" gate — treat the production incident as the positive-control evidence; no sandbox reproduction required.

**Why the other 3 cowork rows don't cover it** (already ruled out by po — do not re-litigate): `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE` is scoped to `guaranteed:true` slots (all 4 bctc-analyst slots are `guaranteed:false` in `docs/data/cowork-schedule.json`); `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` + `FIX-ROUTER-COWORK-SLOT-DEMAND-DISPATCH-BLIND` are router-intent-path (peer/two-session) defects — this is an unattended cron tick, no router involved; `FIX-COWORK-SIBLING-WINDOW-CACHE-FAIL-OPEN` needs a `get_agent_signals` transport failure, not present here.

**Why the 3 existing guards all miss this** (read at source by po — cite directly):
- (g1) `cowork-slot:<slot_id>` `task_claim` TTL=180s (`slot-claim.md` L12-18) is released right after each spawn attempt — its own header states it does NOT provide cross-tick dedup.
- (g2) `isSuppressedByBoundaryDedup` (`scripts/agents-flow/cowork-match-slots.js` L99-105) needs `lastFiredUnix >= snapToCronBoundary(now,cron)`, but the `last_fired` write landed AFTER both spawns already happened — structurally blind for the whole window.
- (g3) the published-marker `task_claim` lives in the LAST stage (`docs/agents/bctc-analyst/flow/stage-log-notify.md` step 5d-1) — correctly suppresses the duplicate POST but by construction cannot prevent the duplicate WORK that already happened upstream.

---

## Requirements

- **FR-1: Pre-election tombstone check.** Before the fire-election claim (`cron:cowork:<TICK>`) is *attempted*, the cowork-team dispatch path must compare `docs/data/pressure-state.json`'s `tick_id` against the freshly-computed nominal `TICK`. A match means some prior session already ran this exact nominal tick to completion; the current invocation must exit WITHOUT ever calling `task_claim` on the election key (no re-elect, no re-run). — **DDD layer: infrastructure** (cross-cutting lock/tick-boundary orchestration, not domain business logic).
  - Applies to BOTH execution paths that currently perform the election claim: the deterministic script `scripts/agents-flow/cowork-tick-preflight.sh` (Step 3, ~common ~80% path) AND its documented ERROR-fallback / manual-run mirror `docs/agents/cowork-team/flow/leader-lock.md` § Fire claim (reached on script ERROR verdict or ad-hoc manual invocation). Fixing only one path leaves the other's known double-fire hole live.

- **FR-2: New terminal dispatch outcome for the tombstoned case.** The preflight script's one-line verdict JSON contract (`{verdict, tick, drift_min, slots, one_shots, new_signals, detail}`) needs a distinct value for this outcome (do not silently overload `SILENT`, which today means "script *itself* emitted pressure state and released a lock it held" — the tombstoned case never holds a lock at all) so ops/telemetry can distinguish "idle tick, nothing due" from "suppressed duplicate re-fire." `docs/agents/cowork-team/flow/main.md`'s JUMP-TO table (§ Step 0 — Cowork Preflight) must document the corresponding EXIT action for this new value, so an LLM reading an unfamiliar verdict string does not default to treating it as `WORK`. — **DDD layer: application** (dispatch orchestration control-flow / verdict routing).

- **FR-3: Suppression must precede the claim attempt itself**, not merely precede a *successful* election — AC-1 ("no re-elect") must hold at the tool-call level: zero `task_claim` calls against `cron:cowork:<TICK>` on a tombstoned tick, not just zero *successful* claims. — **DDD layer: application.**

## Non-Functional Requirements

- **NFR-1 — LANDMINE, load-bearing (precision-mismatch normalization).** `docs/data/pressure-state.json`'s `tick_id` is **second-precision** (live-verified: `"2026-07-31T01:00:00Z"`; server-side default construction in `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` always appends `:00` seconds; every caller that supplies `tick_id` explicitly — `docs/agents/cowork-team/flow/telemetry.md` Step 6.0, `scripts/agents-flow/cowork-tick-preflight.sh`'s own `_step8_silent_release` `tick_id="${tick%Z}:00Z"` — does the same). The nominal `TICK` computed at `cowork-tick-preflight.sh` Step 1 / `leader-lock.md`'s `compute_tick_boundary` is **minute-precision with no seconds** (e.g. `"2026-07-31T00:00Z"`). **A literal `pressure_state.tick_id == nominal_tick` string compare is ALWAYS FALSE** — this is exactly what the row's own original "cheapest correct fix" note proposed verbatim, and po's re-escalation flagged it as the reason a naive implementation would ship green and suppress nothing. Normalize one side before comparing (strip the trailing `:SS` from `tick_id`, or construct the comparison key using `TICK`'s own construction logic) — do not skip this.
- **NFR-2 — Do not over-suppress (AC-2).** A tick that crashes/dies *before* `telemetry.md` Step 6.0 (`emit_pressure_state`) runs must **never** be tombstoned — `pressure-state.json` will still hold an OLDER, non-matching `tick_id` in that case, so the normal election must proceed unmodified and the tick must be allowed to re-run. This is desired behavior, not a bug to close.
- **NFR-3 — Ordering invariant that the fix depends on.** `telemetry.md` Step 6.0 (`emit_pressure_state`) already runs strictly BEFORE the Step 6 P3 fire-election lock release (verified in the current file — Step 6.0 is the first sub-step of Step 6, the P3 release is the last). This ordering is what makes the tombstone marker outlive the lock's own short lifetime; it is what makes FR-1 correct-by-construction for the exact "re-fire arrives after release" bug class the row documents. The architect's design should pin this invariant explicitly (a comment at the release call site is sufficient) so a future edit does not silently reorder Step 6.0 after the release, or introduce an exit path that releases the lock without having run Step 6.0, reopening this exact defect.
- **NFR-4 — Positive-control regression requirement (PO's explicit AC-3 re-read).** The implementation's test suite must include a **positive-control assertion** that the normalized comparison evaluates **TRUE** for a matching pair built from real-shaped input — not merely that the code path executes without error. Reproduce the two recorded incidents specifically: tick `2026-07-30T21:00Z` (slot-3, cross-check against `docs/signals/processed/cowork-team-2026-07-30T21:21:45Z.json`) and tick `2026-07-31T00:00Z` (slot-4, cross-check against `docs/signals/cowork-team-2026-07-31T00:22:30Z.json`). A negative control (non-matching `tick_id`, and a missing/absent `pressure-state.json`) must also assert NO suppression, covering NFR-2.
- **NFR-5 — Cron re-arm/rollout consideration (see Edge Cases below).**

## Edge Cases

- **Missing/absent `pressure-state.json`** (fresh install, or first tick ever) — must not throw, must not tombstone; falls through to a normal election.
- **`tick_id` field absent or empty string** in an otherwise-present `pressure-state.json` — treat identically to "file absent" (no tombstone).
- **`tick_id` malformed / non-ISO** — treat conservatively as no-match (no tombstone) rather than attempting a lenient parse; a false "not suppressed" just re-runs a tick harmlessly (worst case: the exact pre-existing bug, not a new regression), whereas a false "suppressed" would silently drop a legitimate new tick's work.
- **Data quality — N/A for VN financial data**: this is an infra/orchestration timing fix; no Vietnamese-market data is touched. (Noted per BA charter's VN-data-edge-case responsibility — explicitly out of scope here, not overlooked.)
- **Rollout/deployment completeness (flagged during BA analysis, not a PO-priority-type blocker, but architect should design for it):** the live `*/15 * * * *` master dispatcher cron is registered via `CronCreate` with a **static prompt string** embedded in `.claude/skills/cron-cowork-team/SKILL.md` § Step 2 that explicitly enumerates verdict handling (`On verdict=SILENT: ... On verdict=WORK: ... On verdict=LOST_ELECTION: ... On verdict=DEFER: ... On verdict=ERROR: ...`). That skill's own Step 1 idempotency guard means re-running `/cron-cowork-team` after this fix ships will **no-op** (an entry already exists) and will **not** update the live cron's prompt text to mention the new verdict from FR-2 — updating `SKILL.md`'s template text alone does not propagate to the already-armed job. Per project memory (`feedback_cron_armed_but_wrong_prompt_variant` — "CronList proves cadence not payload"), architect's design should either (a) keep the new verdict's `detail` string self-descriptive enough that an LLM reading an unlisted verdict still EXITs safely without explicit prompt coverage (defensive), and/or (b) explicitly call out in the handoff to developer/qa that `.claude/skills/cron-cowork-team/SKILL.md` § Step 2 prompt text needs updating AND the live cron needs an explicit `CronDelete` + `CronCreate` re-arm (not just a `/cron-cowork-team` re-run) for the fix to take effect on the actually-running dispatcher.

## Blockers

None requiring PO's judgment. Po's `po_reescalation_2026-07-31` note already discharges the original AC-3 "someone must probe first" gate with production evidence, and P1/priority/scope have already been decided by po. The rollout/cron-re-arm consideration above is a technical design/deployment-completeness matter for architect, not a feature-priority/VN-term/data-source/historical-vs-realtime question — it does not meet BA's "questions only PO can answer" bar, so it is carried forward as an NFR/edge-case note instead of a formal blocker.

## Suggested candidate files (starting point, not gospel — architect owns the HOW)

- `scripts/agents-flow/cowork-tick-preflight.sh` — FR-1/FR-2/FR-3 implementation on the common path (insert the check between the existing presence step and the existing fire-election claim step; extend the verdict enum).
- `scripts/agents-flow/cowork-tick-preflight.test.sh` — NFR-4 regression coverage (existing test file for this exact script; no separate audit script needed).
- `docs/agents/cowork-team/flow/leader-lock.md` (~L40 `compute_tick_boundary`, § Fire claim) — FR-1 mirror on the ERROR-fallback/manual path.
- `docs/agents/cowork-team/flow/main.md` (§ Step 0 JUMP-TO table) — FR-2 verdict documentation.
- `docs/agents/cowork-team/flow/telemetry.md` (~L79-93, P3 Fire-Election Release) — NFR-3 ordering-invariant comment only; the release logic itself is correct and unchanged.
- `.claude/skills/cron-cowork-team/SKILL.md` § Step 2 — NFR-5 rollout note (prompt text + re-arm).
- `docs/data/pressure-state.json` — read-only reference for the live schema; never hand-edited (continuously overwritten by `emit_pressure_state`).

## Acceptance Criteria (carried forward from the board row, unchanged)

1. A re-fire of an already-completed nominal tick is SUPPRESSED before the election — no re-elect, no re-run.
2. A tick that died before Step 6 still re-runs (do not over-suppress).
3. Regression-verify against the two recorded 2026-07-30/2026-07-31 incidents specifically (bctc-analyst-slot-3 and slot-4 cycle_ids), with a positive-control assertion that the tick-equality comparison is actually TRUE for matching real-shaped inputs (NFR-1/NFR-4 landmine).

---

## [Architect] Brownfield Findings

- **Zone:** `cross-service/` — confirmed via `docs/data/system-map.json` (`zone.id="cross-service"`, `path="scripts/"`, `specialist="developer"`). All 6 touched files span `scripts/agents-flow/`, `docs/agents/cowork-team/flow/`, `.claude/skills/` — no single `apps/<service>/` owns this (zone-detect Tier-2: "files span >1 zone OR root/scripts/ → route to `developer`"). PM should route to generic `developer`, not a `dev-<svc>` specialist.
- **BUILD-STANDARD: not-applicable** — in-zone bug fix on an existing script + existing flow docs, no new primitives, no new service.
- **Scan clean:** true ✓ — existing interfaces (`_emit_verdict`, `run_preflight()` control flow, `leader-lock.md` § Fire claim) fully cover the need; extended, not duplicated. No new script, no new flow file.

### Verified paths (read in full before designing)

- `scripts/agents-flow/cowork-tick-preflight.sh` (264L) — Step 1 computes `tick` (L123-129, minute precision `%Y-%m-%dT%H:%MZ`); Step 2 presence claim L131-152 (never gates); Step 3 election claim L154-190 (`task_claim` on `cron:cowork:$tick`); `_emit_verdict` helper L69-75; `_step8_silent_release` helper L77-114 (same file, same pattern I'm extending).
- `scripts/agents-flow/cowork-tick-preflight.test.sh` (252L) — stubs `mcp_call` post-`source`, logs every call to `CALL_LOG_FILE` as `<tool>|<task_kind>|<task_id>`, asserts via `log_count "task_claim|cowork-slot"` style greps (T2/T4 precedent for exactly the assertion FR-1/AC-1 needs).
- `docs/agents/cowork-team/flow/leader-lock.md` (121L) — `compute_tick_boundary` L32-43 computes the same `TICK`; `### Fire claim` L45-56 is the `task_claim` call this fix must run BEFORE.
- `docs/agents/cowork-team/flow/main.md` (311L) — JUMP-TO table L64-72 (verdict→action); table is read by the LLM narrator only, the script's own verdict string is authoritative regardless of table completeness.
- `docs/agents/cowork-team/flow/telemetry.md` (153L) — Step 6.0 `emit_pressure_state` L9-22 (mandatory, un-skippable); P3 Fire-Election Release L99-114; **Error Guard L117-152 deliberately releases the lock WITHOUT calling Step 6.0 first** — verified this is intentional and correct (see NFR-3 design below), not an oversight to "fix".
- `.claude/skills/cron-cowork-team/SKILL.md` (149L) — Step 2 `CronCreate` L57-64, single-string `prompt:` arg enumerates verdict handling inline; Step 1 idempotency guard (L27-39) is what makes a bare `/cron-cowork-team` re-run a no-op post-fix.
- `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` L369-377 — confirms NFR-1 server-side: `tickId` defaults to `...HH:MM:00Z` when the caller omits it, and every caller in this codebase that supplies it explicitly (`telemetry.md` Step 6.0, `_step8_silent_release`'s own `tick_id="${tick%Z}:00Z"`) also appends `:00Z` — **there is no code path anywhere that writes a minute-precision `tick_id`**. Read-only reference, unmodified by this fix.
- Live `docs/data/pressure-state.json` re-verified at design time: `"tick_id": "2026-07-31T01:15:00Z"` — second-precision, confirms NFR-1 is current, not historical.

### Reuse patterns

- Extend `_emit_verdict`'s existing enum (`SILENT|WORK|LOST_ELECTION|DEFER|ERROR` → `+TOMBSTONED`) — same function signature, no new emitter.
- New predicate follows the **existing** `_step8_silent_release()` idiom (top-level `_`-prefixed helper function, called from inside `run_preflight()`) — not a new file, not a new script.
- `leader-lock.md`'s mirror is prose-pseudocode extending the same file's existing `### Fire claim` section shape (comment block + fenced logic block), matching how `### Backstop-Window Defer Gate (AF-1)` already sits between `compute_tick_boundary` and `### Fire claim`.

### Design decisions (file-by-file)

**1. `scripts/agents-flow/cowork-tick-preflight.sh` — FR-1 (infrastructure) + FR-3**

New pure predicate, placed after `_emit_verdict` (L75) and before `_step8_silent_release` (L77) — grouping: format helpers together, pure predicates together, side-effecting step-handlers together:

```bash
# ── Tombstone predicate (FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE FR-1) ──
# Pure function: reads pressure-state.json, returns "true"/"false" on stdout.
# NEVER makes an MCP call, NEVER throws. Edge cases collapse to ONE safe branch
# ("false" -> proceed to normal election): missing file, missing/empty tick_id,
# non-ISO tick_id, non-matching tick_id are all "false" -- do not special-case them.
_tick_already_ran() {
  local pressure_state_path="$1" nominal_tick="$2" raw_tick_id norm_tick_id
  [ -f "$pressure_state_path" ] || { echo false; return; }
  raw_tick_id=$(jq -r '.tick_id // empty' "$pressure_state_path" 2>/dev/null)
  [ -z "$raw_tick_id" ] && { echo false; return; }
  # NFR-1 LANDMINE: tick_id is server-stamped SECOND-precision
  # ("YYYY-MM-DDTHH:MM:SSZ" -- emitPressureStateTool.ts always appends ":00").
  # nominal_tick (this script's own $tick, Step 1) is MINUTE-precision
  # ("YYYY-MM-DDTHH:MMZ"). A literal == on the raw strings is ALWAYS FALSE.
  # Strip the trailing ":SS" before comparing -- DO NOT SIMPLIFY THIS AWAY.
  if [[ "$raw_tick_id" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    norm_tick_id="${raw_tick_id%:*}Z"
    [ "$norm_tick_id" = "$nominal_tick" ] && { echo true; return; }
  fi
  echo false
}
```

Call site — new **Step 2.5**, inserted between the existing Step 2 (presence, L131-152, unchanged — presence claim/heartbeat still fires unconditionally on a tombstoned tick, this is a deliberate choice, see Risk Flags) and Step 3 (election claim, currently starts L154):

```bash
  # ---- Step 2.5: pre-election tombstone check (FR-1/FR-3) ----
  # MUST run before Step 3 ever calls task_claim on cron:cowork:$tick -- a
  # tombstoned tick makes ZERO election-claim calls (AC-1 at the tool-call
  # level, not merely zero *successful* claims).
  if [ "$(_tick_already_ran "$PRESSURE_STATE_PATH" "$tick")" = "true" ]; then
    _emit_verdict "TOMBSTONED" "$tick" "$drift_min" "[]" "[]" "0" \
      "pressure-state.json tick_id already matches nominal tick $tick (server second-precision normalized to minute precision) -- a prior session already completed this exact tick; suppressed before any cron:cowork:$tick claim attempt, see docs/agents/cowork-team/flow/main.md JUMP-TO table"
    return 1
  fi
```

Header-comment updates (FR-2 documentation, top of file): add `TOMBSTONED` to the "Steps 1-8" list as step 2.5, the "Verdict JSON" enum line, and the "Lock semantics" block (`TOMBSTONED never held it — same bucket as LOST_ELECTION/DEFER`).

**2. `docs/agents/cowork-team/flow/leader-lock.md` — FR-1 second path (infrastructure)**

New subsection inserted between `### compute_tick_boundary` (ends L43) and `### Fire claim` (starts L45) — mirrors the script's predicate in prose, since this file is LLM-narrated pseudocode with no shared runtime to import the bash function from:

```markdown
### Pre-election tombstone check (FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE -- FR-1 mirror)

<!-- Mirrors _tick_already_ran in scripts/agents-flow/cowork-tick-preflight.sh. This file
     is reached only on the script's ERROR verdict or a manual/ad-hoc run -- it does NOT
     inherit the script's already-computed result and MUST re-run this same check itself.
     Skipping this here reopens the exact double-fire hole this row exists to close
     ("fixing only one path leaves the other's known double-fire hole live"). -->

PRESSURE_TICK_ID = read .tick_id from docs/data/pressure-state.json (if it exists)

# NFR-1 LANDMINE: PRESSURE_TICK_ID is SECOND-precision, e.g. "2026-07-31T00:00:00Z"
# (server always appends ":00"). TICK (computed above) is MINUTE-precision, e.g.
# "2026-07-31T00:00Z". A literal PRESSURE_TICK_ID == TICK compare is ALWAYS FALSE.
# Normalize by stripping the trailing ":SS" segment before "Z":
#   NORMALIZED_TICK_ID = strip_seconds(PRESSURE_TICK_ID)
#   Example (real incident): "2026-07-31T00:00:00Z" -> "2026-07-31T00:00Z" == TICK -> MATCH.

if PRESSURE_TICK_ID is absent OR empty OR not ISO8601 "YYYY-MM-DDTHH:MM:SSZ":
  -> PROCEED to Fire claim below (conservative: no tombstone on doubt)

else if NORMALIZED_TICK_ID == TICK:
  log "[cowork] tick " + TICK + " ALREADY RAN (pressure-state.json tick_id=" + PRESSURE_TICK_ID + ") -- TOMBSTONED, suppressed before election claim"
  EXIT   # do NOT call task_claim on cron:cowork:TICK -- FR-3, zero claim calls

else:
  -> PROCEED to Fire claim below (a tick that died before telemetry.md Step 6.0 leaves
     an OLDER, non-matching tick_id here -- NFR-2, this is desired: allow it to re-run)
```

**3. `docs/agents/cowork-team/flow/main.md` — FR-2 (application) + NFR-5(a) defensive fallback**

Two new JUMP-TO table rows (L64-72), inserted after the `DEFER` row and before/after `ERROR`:

```markdown
| `TOMBSTONED` | Done. `pressure-state.json`'s `tick_id` already matched this nominal tick — a prior session already completed it. Script made ZERO `task_claim` calls on `cron:cowork:<tick>` (suppressed before the election attempt, FR-1/FR-3). No re-elect, no re-run. EXIT. |
| *(any other/unrecognized verdict string)* | **Fail-safe (NFR-5):** do NOT default to the WORK continuation path. Treat as done/EXIT, same as SILENT/LOST_ELECTION/DEFER — an unrecognized verdict means either a stale caller (e.g. an armed cron prompt that predates a verdict this script now emits) or a script bug; neither justifies running the dispatch body. |
```

**4. `docs/agents/cowork-team/flow/telemetry.md` — NFR-3 (comment-only, no logic change)**

New HTML comment inserted after the existing P3 Fire-Election Release header comment (ends L105) and before its code block (starts L107):

```markdown
<!-- ORDERING INVARIANT (FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE NFR-3): Step 6.0
     (emit_pressure_state, above) MUST run strictly BEFORE this release on the happy
     path -- verified current: Step 6.0 is the first sub-step of Step 6, this release
     is the last. This ordering is what makes the pre-election tombstone check
     (cowork-tick-preflight.sh Step 2.5 / leader-lock.md's mirror) correct-by-
     construction: pressure-state.json's tick_id only ever reflects a COMPLETED tick.
     The Error Guard below (L117-152) deliberately releases WITHOUT calling
     emit_pressure_state first -- that omission is what lets a tick that died before
     Step 6.0 re-run on its next fire (NFR-2). Do NOT "fix" the Error Guard by adding
     an emit_pressure_state call to it, and do NOT reorder Step 6.0 after this release
     -- either change reopens this exact double-fire defect. -->
```

**5. `.claude/skills/cron-cowork-team/SKILL.md` — NFR-5(b)/(c) rollout**

Two changes:
(a) Extend the Step 2 `CronCreate` `prompt:` string (L61) with a `TOMBSTONED` clause mirroring the existing `On verdict=DEFER: ...` clause, plus a trailing defensive default clause (belt-and-suspenders alongside main.md's own fallback row above — cheap, since the prompt string is already fully enumerated by hand).
(b) New subsection (e.g. after "## Notes", before "## P3-OBSERVE-ONLY-RETIREMENT") documenting: **a bare `/cron-cowork-team` re-run after this fix ships is a no-op** (Step 1 idempotency guard finds the existing entry and stops) and will NOT propagate the updated prompt text to the live armed job. Rollout requires an explicit `CronDelete(id=<current-id-from-CronList>)` followed by the Step 2 `CronCreate` — call this out as a **required post-merge deployment step**, not optional cleanup, and note who is expected to run it (main terminal / whoever holds `CronCreate`/`CronDelete` tool access — this dispatcher's cron is session-scoped and not spawnable by dev-team agents).

### Interaction with the 3 existing guards (per BA spec, not re-derived)

FR-1 is a **4th, independent guard layer positioned strictly upstream** of all three — it runs before Step 3 (the election claim), i.e. before g1 (`cowork-slot:<slot_id>` TTL=180s, per-slot), g2 (`isSuppressedByBoundaryDedup` in `cowork-match-slots.js`, per-slot `last_fired`), and g3 (published-marker in `stage-log-notify.md`, last stage) are even reachable in the pipeline. It does not modify, depend on, or duplicate any of the three — it closes the "whole tick, before any per-slot logic runs" gap that none of them were positioned to close (g1/g2/g3 are all *downstream of a successful election*, so a re-elected leader always reaches them fresh).

### Rollout-safety cross-check (why the dual-path FR-1 requirement also covers most of NFR-5)

Traced the worst case explicitly: if the live cron's static prompt is NOT updated (NFR-5 gap) and the script starts emitting `TOMBSTONED`, an LLM narrator that doesn't recognize the string could default to the prompt's own `ERROR` clause text ("read and execute `main.md` starting at Step 0a... do NOT re-run Step 0's script"). That would walk it through `main.md` Step 0a → 0b.2 → `leader-lock.md` § Fire claim — **which now also has the same tombstone check** (item 2 above), so it would still EXIT before ever calling `task_claim` on `cron:cowork:<tick>`. The dual-path requirement in FR-1 (already mandated by the BA spec for the "known double-fire hole" reason) is therefore *also* the structural backstop against the worst-case NFR-5 misinterpretation — not a separate risk needing a separate mitigation. main.md's own defensive fallback row (item 3) is the first line of defense; `leader-lock.md`'s mirror is the second, independent of prompt staleness. The SKILL.md re-arm (item 5) is still required for full ops observability (correct verdict labeling), just not for safety.

### Test strategy

`scripts/agents-flow/cowork-tick-preflight.test.sh` (extend existing file — no new test file):
- **Positive control (NFR-4, literal incident replay):** call `_tick_already_ran` directly (bypasses wall-clock — no date-injection seam needed) with two fixture `pressure-state.json` files: `tick_id="2026-07-30T21:00:00Z"` vs `nominal_tick="2026-07-30T21:00Z"` (slot-3) and `tick_id="2026-07-31T00:00:00Z"` vs `nominal_tick="2026-07-31T00:00Z"` (slot-4) → both must assert `"true"`.
- **Negative controls:** non-matching `tick_id`, missing `pressure-state.json` file, empty/absent `tick_id` field, malformed/non-ISO `tick_id` → all assert `"false"` (covers NFR-2 + Edge Cases).
- **End-to-end TOMBSTONED case via `run_preflight`:** compute the current tick boundary the same way the script does, write a temp `pressure-state.json` with that exact tick + `:00Z` at test-run time (avoids flakiness — no fixed historical fixture needed here since the script computes `$tick` from real wall-clock), run `run_preflight`, assert `verdict=TOMBSTONED`, `RC=1`, and `log_count "task_claim|cowork-slot" == 0` (AC-1 at the tool-call level — mirrors the existing T2/T4 assertion idiom).
- **NFR-2 regression:** extend the existing SILENT-path test (T1-style) with a stale-but-present `pressure-state.json` (older, non-matching `tick_id`) → assert verdict stays `SILENT`, not `TOMBSTONED` — proves no over-suppression.
- `leader-lock.md` / `main.md` / `telemetry.md` / `SKILL.md`: no automated test harness exists for `.md` flow-doc prose anywhere in this repo (confirmed — only the deterministic script has a `.test.sh`); QA verifies via direct read/diff review against this design + a live post-deploy tick-verdict observation (2-3 ticks) + `CronList` before/after confirming the re-arm.

### Risk flags

- **Security:** none — `_tick_already_ran` is a local, read-only `jq` parse behind a strict regex allowlist; no shell interpolation of unvalidated data into a command (pure bash parameter expansion `${raw_tick_id%:*}`, never `eval`).
- **Performance:** net positive on the (rare) tombstoned-tick path — early-exit before Steps 3-8 saves ~5 MCP round trips (election claim, `claim_due_scheduled_tasks`, blind-guard read, slot matcher, `emit_pressure_state`+release) that today all execute wastefully on a re-fire. One extra local `jq` read on every other tick — negligible.
- **DDD layering — flag for PM/developer, not a violation:** this zone (`scripts/agents-flow/` + `docs/agents/cowork-team/flow/`) has no literal `domain/application/infrastructure` folder split (unlike `apps/<svc>/src/`) — it is a bash-script + markdown-flow-doc orchestration layer. The spec's `infrastructure`(FR-1) / `application`(FR-2/FR-3) labels are **conceptual** classification for documentation clarity, not a physical-file-layout requirement. Do not create new subfolders under `scripts/agents-flow/` for this S-sized fix — that would be scope creep the row never asked for.
- **THE LANDMINE ITSELF (NFR-1), highest-value regression guard:** the single biggest risk to this fix's durability is a future edit "simplifying" the normalization back to a bare `==` string compare (exactly what shipped-green-suppressed-nothing risk PO's own re-escalation flagged). Mitigated three ways: (1) inline `DO NOT SIMPLIFY THIS AWAY` comment directly on the comparison line, (2) the two positive-control tests literally replay the real incident timestamps — a naive-compare regression fails them immediately, not just "tests pass", (3) flag explicitly to QA: green suite ≠ proof the predicate fired — confirm the positive-control assertions specifically, not merely the exit code, per project memory `feedback_wrong_arg_type_silently_disables_a_verification_predicate` / `feedback_known_failure_shape_pattern_matched_without_reading_call_order`.
- **Ordering footgun (already covered by NFR-3 comment above, restated for PM visibility):** any future exit path added to `telemetry.md` that releases `cron:cowork:<TICK>` without either running Step 6.0 first (happy path) or deliberately skipping it (error path, current Error Guard) silently reopens this defect. The comment is a deliberate written tripwire, not decoration.
- **Presence-claim ordering choice (Step 2.5 placed AFTER Step 2, not before):** presence claim/heartbeat still fires unconditionally on a tombstoned tick — considered placing the tombstone check earlier (before Step 2) to also skip the presence round-trip for token economy, rejected in favor of the more literal, smaller-diff reading of FR-1's own wording ("before the fire-election claim... is attempted") and because presence's TTL=1800s (2 ticks) comfortably absorbs one skipped-if-it-had-been-skipped renewal on a rare re-fire either way — not a functional risk under either ordering, chose the smaller diff.

### Header update

`docs/agent-memory/notebooks/architect.md` line 3 updated this cycle (see notebook entry).
