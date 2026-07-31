---
sprint: COWORK-RELIABILITY
branch: task/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE
size: S
zone: cross-service/
depends_on: []
blocks: []
---

## TLDR

Fix a production double-fire defect: re-fires of already-completed nominal ticks re-elect a leader and re-run the tick from scratch. Implement a pre-election tombstone check using pressure-state.json, normalize tick_id precision (server second-precision vs script minute-precision), and mirror the check in the ERROR-fallback path. Six files, all tightly coupled.

## [PM] Planning Context

### Zone & Routing
- **Zone:** `cross-service/`
- **Specialist:** generic `developer` (not dev-<service>; files span scripts/agents-flow/, docs/agents/cowork-team/flow/, .claude/skills/)
- **Routing:** dev-team Step 3 dispatcher will route by zone to `developer`

### Background: Production Defect
Two confirmed duplicate-fire incidents in 27h (2026-07-30T21:00Z and 2026-07-31T00:00Z):
- Same nominal tick arrived twice post-election-lock-release
- Both spawned duplicate agents, ~9-20min duplicate LLM work each
- bctc_signal files overwritten twice with different content
- Duplicate notebook entries, duplicate log_agent_work lifecycles (id 1710+1712)
- Root cause: `cron:cowork:<TICK>` lock released at Step 6 end, re-fire finds it free, re-elects, re-runs (AC-1 goal: suppress before the election claim, at tool-call level)

Full incident analysis: `docs/handoffs/2026-07-15-cowork-tick-refire-election-lock-does-not-span-its-tick.md` + board row `po_reescalation_2026-07-31` field.

### NFR-1 LANDMINE — CRITICAL, READ FIRST
The two fields being compared have **different precision**:
- `docs/data/pressure-state.json` `.tick_id`: **SECOND-precision**, e.g. `"2026-07-31T00:00:00Z"` (server always appends `:00`)
- Nominal `TICK` from cowork-tick-preflight.sh Step 1: **MINUTE-precision**, e.g. `"2026-07-31T00:00Z"` (no seconds)
- **A literal string `==` compare is ALWAYS FALSE**

This exact landmine was already noted in the original "cheapest correct fix" proposal and PO's re-escalation explicitly flagged it as the reason a naive implementation would "ship green and suppress nothing." **Normalize by stripping the trailing `:SS` from tick_id before comparing.** This is load-bearing on the positive-control regression tests (see AC-3 below).

### Acceptance Criteria
1. **AC-1:** A re-fire of an already-completed nominal tick is SUPPRESSED **before the fire-election claim is attempted** — zero `task_claim` calls on `cron:cowork:<tick>` on a tombstoned tick (not merely zero successful claims; the tool-call never happens at all).
2. **AC-2:** A tick that crashed/died **before Step 6.0** (emit_pressure_state) still re-runs — over-suppression is a bug. Verified by: stale-but-present pressure-state.json (older, non-matching tick_id) must NOT suppress the new tick.
3. **AC-3 — NFR-4 Positive-Control Regression (CRITICAL):** Extend `scripts/agents-flow/cowork-tick-preflight.test.sh` with explicit assertions that the comparison evaluates **TRUE** for the two recorded incident tick_ids:
   - Slot-3: `tick_id="2026-07-30T21:00:00Z"` (second-precision from pressure-state) vs `nominal_tick="2026-07-30T21:00Z"` (minute-precision from script) → assert `true`
   - Slot-4: `tick_id="2026-07-31T00:00:00Z"` vs `nominal_tick="2026-07-31T00:00Z"` → assert `true`
   - **Why this matters:** A future refactor "simplifying" the normalization back to naive `==` will immediately fail these tests. Without explicit positive-control assertions, a regression could ship green.

### Files to Modify (6 total, all tight-coupled, cannot split)

**1. `scripts/agents-flow/cowork-tick-preflight.sh` (264L) — FR-1/FR-3 implementation**
- Insert new pure predicate `_tick_already_ran()` after line 75 (after `_emit_verdict` helper, before `_step8_silent_release`)
- Predicate reads pressure-state.json tick_id, normalizes second-precision to minute-precision, compares against nominal `TICK`
- Do NOT make MCP calls, do NOT throw; all edge cases (missing file, empty/malformed tick_id) collapse to "false" → proceed to normal election
- Call the predicate at **new Step 2.5** (between existing Step 2 presence claim ~L152 and Step 3 election claim ~L154)
- On tombstone match: call `_emit_verdict "TOMBSTONED" ...` (new verdict value, FR-2) and `return 1` (exit early)
- Update file header comments to list Step 2.5, mention new TOMBSTONED verdict in enum and lock-semantics sections
- **Inline comment on the normalization line:** "DO NOT SIMPLIFY THIS AWAY" (literal protection against regression)

**2. `scripts/agents-flow/cowork-tick-preflight.test.sh` (252L) — NFR-4 test extension**
- Add positive-control test cases calling `_tick_already_ran` directly (pure predicate, no wall-clock seam needed):
  - Fixture: `tick_id="2026-07-30T21:00:00Z"` vs `nominal_tick="2026-07-30T21:00Z"` → assert `"true"`
  - Fixture: `tick_id="2026-07-31T00:00:00Z"` vs `nominal_tick="2026-07-31T00:00Z"` → assert `"true"`
- Negative controls: non-matching tick_id, missing file, empty/absent tick_id field, malformed/non-ISO tick_id → all assert `"false"`
- End-to-end TOMBSTONED case via `run_preflight`: compute current tick boundary, write temp pressure-state.json with exact tick at test time, assert `verdict=TOMBSTONED`, `RC=1`, and **`log_count "task_claim|cowork-slot" == 0`** (AC-1 at tool-call level — verify the claim was never attempted)
- NFR-2 regression: write stale-but-present pressure-state.json (older non-matching tick_id), run `run_preflight`, assert verdict stays `SILENT` not `TOMBSTONED` (no over-suppression)

**3. `docs/agents/cowork-team/flow/leader-lock.md` (121L) — FR-1 dual-path mirror**
- Insert new subsection **between** `### compute_tick_boundary` (ends ~L43) and `### Fire claim` (~L45)
- Title: `### Pre-election tombstone check (FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE -- FR-1 mirror)`
- Lead comment: mirrors script's `_tick_already_ran()` in prose; this file is LLM-narrated so doesn't inherit script's result and **MUST re-run the same check** (fixing one path only leaves the other's known double-fire hole live)
- Pseudocode: read PRESSURE_TICK_ID from pressure-state.json, normalize second→minute-precision (strip `:SS`), compare against TICK
- Three branches: (a) file absent/empty/malformed → PROCEED (conservative); (b) normalized match → log and EXIT (don't call task_claim); (c) non-match → PROCEED (tick died before Step 6, allow re-run)

**4. `docs/agents/cowork-team/flow/main.md` (311L) — FR-2/NFR-5(a)**
- Add two new rows to the JUMP-TO table (§ Step 0 Cowork Preflight, L64-72):
  1. `| TOMBSTONED | Done. pressure-state.json tick_id already matched this nominal tick — prior session completed it. Script made ZERO task_claim calls on cron:cowork:<tick> (suppressed before election, FR-1/FR-3). No re-elect, no re-run. EXIT. |`
  2. `| *(any other/unrecognized verdict string)* | **Fail-safe (NFR-5):** do NOT default to WORK continuation. Treat as done/EXIT, same as SILENT/LOST_ELECTION/DEFER — unrecognized verdict means either stale caller or script bug; neither justifies running dispatch body. |`
- Second row is defensive fallback in case cron prompt is stale (NFR-5 worst-case: unrecognized verdict doesn't break, just exits safely)

**5. `docs/agents/cowork-team/flow/telemetry.md` (153L) — NFR-3 ordering-invariant pin (comment-only)**
- Insert HTML comment **after** the existing P3 Fire-Election Release header comment (ends ~L105) and **before** its code block (~L107)
- Purpose: document the ordering invariant that makes the tombstone check correct-by-construction
- Pin: Step 6.0 (emit_pressure_state, above) MUST run strictly BEFORE this release on the happy path
- Warn: the Error Guard (L117-152) deliberately releases WITHOUT calling emit_pressure_state first — that omission is what lets a tick that died before Step 6.0 re-run (NFR-2)
- Warn: do NOT "fix" the Error Guard by adding emit_pressure_state, and do NOT reorder Step 6.0 after this release — either change reopens this exact double-fire defect
- This is a **comment-only change** — no logic modification

**6. `.claude/skills/cron-cowork-team/SKILL.md` (149L) — NFR-5(b)/(c) rollout**
- Extend the Step 2 `CronCreate` `prompt:` string (L61) with a `TOMBSTONED` clause mirroring existing `On verdict=DEFER` clause
- Add trailing defensive default clause (e.g. "On any other verdict: exit safely — unrecognized verdict indicates stale prompt or script bug")
- New subsection (e.g. after "## Notes") documenting: **a bare `/cron-cowork-team` re-run after this fix ships is a no-op** (Step 1 idempotency guard finds entry and stops, doesn't propagate updated prompt to armed cron job)
- Rollout requires **explicit `CronDelete(id=<current-id-from-CronList>)` + Step 2 `CronCreate` re-arm** — this is NOT optional cleanup, it's a required post-merge deployment step
- Note: main terminal or whoever holds `CronCreate`/`CronDelete` access (dispatcher cron is session-scoped, dev-team agents cannot spawn it)

### Dependencies
- None (pre-election check is an orthogonal guard, does not depend on other cowork changes)

### Knowledge Needed
- **Core reading (read in this exact order before coding):**
  1. This handoff (you're reading it now)
  2. The BA spec section starting line 76 of `docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-ba-spec.md` — "[Architect] Brownfield Findings" — full section (lines 76-241)
  3. Original root-cause doc: `docs/handoffs/2026-07-15-cowork-tick-refire-election-lock-does-not-span-its-tick.md`
  4. The board row itself: orch-state.json `.task_board.in_progress[]` with id="FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE" (full fields: note, po_retraction, po_reescalation, architect_review_note)

- **Reference (context, not blocking):**
  - `docs/policies/commit-convention.md` — commit message format (AC trailer required per C2, since this is a sprint-task commit)
  - `docs/standards/gateway-call-contract.md` — if extending test assertions to call MCP tools
  - Project memory items: `feedback_precision_mismatch_normalization` (or similar—search MEMORY.md for "NFR-1" or "landmine")

### Risk Flags

**Highest Priority:**
- **Regression risk (NFR-1 landmine):** Future "simplification" back to naive `==` string compare. Mitigated by: (1) inline "DO NOT SIMPLIFY THIS AWAY" comment on comparison line, (2) two positive-control tests that replay real incident timestamps and fail immediately on regression, (3) **explicit flag to QA:** verify the positive-control assertions **pass**, not just "test suite runs" (per project memory feedback: `feedback_known_failure_shape_pattern_matched_without_reading_call_order` / `feedback_wrong_arg_type_silently_disables_a_verification_predicate`)

**Other Risks (documented, not blocking):**
- **Ordering footgun (NFR-3):** Any future exit path from telemetry.md that releases `cron:cowork:<TICK>` without running Step 6.0 first (or deliberately skipping it like Error Guard) silently reopens defect. Comment is a deliberate written tripwire.
- **Cron re-arm incompleteness:** `/cron-cowork-team` re-run alone won't propagate new prompt to live cron (Step 1 idempotency). Rollout needs explicit `CronDelete` + `CronCreate`. Flag to QA/ops.
- **Presence claim timing (not a bug, documented choice):** New Step 2.5 placed AFTER Step 2 (presence claim still fires unconditionally on tombstoned tick). Rationale: FR-1 text says "before fire-election claim", presence TTL=1800s (2 ticks) comfortably absorbs one skipped renewal on rare re-fire either way. Smaller diff, more literal reading of spec.

### Test Strategy Summary

**Unit:** `_tick_already_ran()` predicate called directly (no wall-clock seam, pure function)
- Positive controls: two real incident fixtures (slot-3 and slot-4 timestamps)
- Negative controls: non-matching tick_id, missing file, empty/malformed fields

**Integration:** `run_preflight()` end-to-end with temp pressure-state.json written at test time
- TOMBSTONED case: assert verdict, RC=1, zero cowork-slot claims
- NFR-2 regression: stale non-matching pressure-state → stays SILENT, not TOMBSTONED

**Flow docs (.md):** No automated harness (only .test.sh files have runners). QA verifies via direct read/diff review against architect design + live post-deploy tick-verdict observation (2-3 ticks) + CronList before/after confirming re-arm.

---

## Handoff Notes

**Resume-lock coordination:** dev-team is holding `task_claim("task:FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE")` across the entire relay chain (po → ba → architect → pm → developer). **Do NOT release it.** It stays held until the task reaches a genuine terminal/review state. Just do your normal developer work (commit per convention, push your branch) and when you're done, the dev-team loop will handle next steps.

**Commit message trailer:** Your commit **must** include an `AC:` trailer listing the three ACs from this handoff (AC-1, AC-2, AC-3). Example:
```
fix(cowork): pre-election tombstone check to suppress already-completed ticks

Implement _tick_already_ran() predicate to compare pressure-state.json tick_id
(second-precision) against nominal TICK (minute-precision) and suppress re-fires
of already-completed ticks before the fire-election claim attempt. Mirror check
in leader-lock.md ERROR-fallback path (FR-1 dual-path requirement).

AC: AC-1 zero task_claim calls on tombstoned tick | AC-2 no over-suppression of ticks dying before Step 6 | AC-3 positive-control regression tests replay both incident timestamps
```

**Post-completion handoff:** When you're done and the branch is ready for review, the dev-team loop will advance the task status and route to QA. You won't close the task or manage its final state — that's the orchestration loop's job.

---

## [Developer] Implementation Record

- **Files modified:**
  - `scripts/agents-flow/cowork-tick-preflight.sh:18-22,35-45,84-104,183-191` — header docs (Step 2.5, TOMBSTONED in verdict/exit-code/lock-semantics), new `_tick_already_ran()` pure predicate (NFR-1 normalization + "DO NOT SIMPLIFY THIS AWAY" comment), new Step 2.5 call site between presence claim (Step 2) and election claim (Step 3)
  - `scripts/agents-flow/cowork-tick-preflight.test.sh:132-165(new),357-384(new),133-141(log_count fix)` — 6 unit tests for `_tick_already_ran()` (2 positive-control incident replays + 4 negative controls), T6 end-to-end TOMBSTONED case (AC-1 zero cowork-slot claims), T7 NFR-2 stale-pressure-state regression, and a `log_count()` bugfix (double "0\n0" emission on true-zero match count, which broke the new AC-1 assertion)
  - `docs/agents/cowork-team/flow/leader-lock.md:45-68(new section)` — prose-pseudocode mirror of `_tick_already_ran()` inserted between `### compute_tick_boundary` and `### Fire claim` (FR-1 dual-path requirement)
  - `docs/agents/cowork-team/flow/main.md:73-74(new rows)` — `TOMBSTONED` + unrecognized-verdict fail-safe rows in the JUMP-TO table
  - `docs/agents/cowork-team/flow/telemetry.md:107-116(new comment)` — NFR-3 ordering-invariant HTML comment before the P3 Fire-Election Release code block (comment-only, no logic change)
  - `.claude/skills/cron-cowork-team/SKILL.md:61(edited),110-128(new section)` — `TOMBSTONED` + defensive-default clause added to the `CronCreate` prompt string; new rollout subsection documenting bare `/cron-cowork-team` re-run is a no-op post-fix (requires explicit `CronDelete`+`CronCreate`)
- **Tests written:** `scripts/agents-flow/cowork-tick-preflight.test.sh` — 8 new unit-predicate assertions (2 positive-control incident replays, 6 negative controls) + 5 new end-to-end assertions (T6 TOMBSTONED ×3, T7 NFR-2 regression ×2) = 13 new assertions, all GREEN. Full suite: 40/40 pass (was 27/27 before this task).
- **Git commits:** (see commit created immediately after this record — `fix(cowork): pre-election tombstone check to suppress already-completed ticks`)
- **tsc status:** N/A — zone `cross-service/`, no `apps/*/src` TypeScript touched (bash + markdown only)
- **Full suite:** `bash scripts/agents-flow/cowork-tick-preflight.test.sh` → 40 pass / 0 fail ✓ (includes both AC-3 positive-control assertions asserted TRUE, not just suite-exit-0 — verified individually in output)
- **Docs updated:** `docs/agents/cowork-team/flow/leader-lock.md`, `main.md`, `telemetry.md`, `.claude/skills/cron-cowork-team/SKILL.md` (all 4 are part of the 6-file design itself, listed above) | `docs/WORK.md` — one-paragraph summary appended
- **Graphify:** SKIPPED — this session has no Skill-tool grant (Read/Edit/Write/Bash only); flagged for the coordinating dev-team session to run `/graphify docs --update --no-viz` on the 4 touched `.md` docs
- **Simplicity gate:** PASS — Q1 scope clean (no feature/flag beyond the 3 ACs), Q2 no single-use abstractions (`_tick_already_ran()` has 1 production call-site + is intentionally standalone-testable per architect design, mirrors existing `_step8_silent_release()` idiom), Q3 senior-test clean (no indirection layers, straightforward regex+compare), Q4 ratio <50% overhead (all added lines trace directly to AC-1/AC-2/AC-3 or the log_count test-harness bugfix needed to assert AC-1)
- **NFR-1 landmine verification (explicit, per Risk Flags):** both positive-control tests in the suite output above assert `true` by name — `U-TOMBSTONE positive control slot-3 incident (21:00:00Z vs nominal 21:00Z)` and `U-TOMBSTONE positive control slot-4 incident (00:00:00Z vs nominal 00:00Z)` — confirmed PASS, not merely "suite exits 0"
- **Out-of-scope note (not fixed, flagged only):** `docs/agents/dev-team/flow/main.md:101` references `_step8_silent_release`/`cowork-tick-preflight.sh lines 74-105` — that line range was already stale before this task (pre-existing drift) and drifted further since the new predicate shifted `_step8_silent_release` to ~107-143; left untouched, outside this task's 6-file scope and not a functional dependency (illustrative prose reference only)
