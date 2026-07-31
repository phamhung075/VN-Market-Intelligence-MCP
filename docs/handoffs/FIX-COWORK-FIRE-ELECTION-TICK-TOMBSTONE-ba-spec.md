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
