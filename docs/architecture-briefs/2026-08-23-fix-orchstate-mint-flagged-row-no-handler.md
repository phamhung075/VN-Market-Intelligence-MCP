<!-- size-justification: single-decision brief (enforcement point + phased fatal-promotion plan)
     with the supporting live evidence that justifies not going straight to fatal. -->
# Architecture Brief — FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER

**Task:** FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER | **Zone:** cross-service/ (`scripts/orch-validate.mjs` — no `apps/` code changes this phase) | **BUILD-STANDARD:** not-applicable (validation-gate bug-fix)

---

## Decision: enforcement point = **phased**, not a single choice

The row asks architect to pick ONE of (1) non-fatal REPORT in `orch-validate.mjs`, (2) fatal `superRefine` in `orchStateSchema.ts`, or (3) auto-derive `next_agent` at mint time. **Answer: (1) now, with an explicit, dated promotion path to (2) — this is not a hedge, it is this codebase's own established pattern for exactly this kind of invariant.** `orchStateSchema.ts` already carries a live precedent doing exactly this: a DONE-stragglers check is deliberately "a standalone function (not a superRefine) so the validator CLI can call it... Promote to a superRefine once SHG-2 + SHG-4 land" (own in-file comment, `orchStateSchema.ts:658-661`). This task is the same shape: land detection first, prove zero false positives over real write traffic, then flip to fatal. (3) is rejected outright — see §3.

**Why not straight to fatal today, given the baseline already reads 0 violators:** the baseline (`bounded1-supervised-lane-report.sh`, 2026-08-14T03:32:12Z) proves 0 violators **for the report's own read-only replay**, not for `orch-validate.mjs`'s write-time position in the pipeline. A fatal gate sits earlier and more universally — every `orch-apply.sh` write, including ones the report has never modeled (e.g. a targeted single-field patch that lands `supervised:true` on a row an unrelated jq transform is mid-composing, one write ahead of the same transform's own `next_agent:` line, if a future author ever splits what should be one atomic transform into two). A REPORT-first landing observes real write traffic for a burn-in period without any risk of rejecting a write PO/dev-team didn't anticipate; only after that period is a fatal flip evidence-based rather than baseline-based.

---

## 1. Design — Stage addition to `scripts/orch-validate.mjs` (non-fatal, Stage-1g shaped)

New stage (numbering TBD by dev — lands after the existing Stage 1g/1h, same "REPORT, never fails the write" contract):

- **Predicate, reused not reinvented:** the row's own instruction is explicit — "reuse the report script's own predicates." `scripts/audits/bounded1-supervised-lane-report.sh`'s inline `dispatch_lane($detail_items; $roster_map)` (itself built from `scripts/lib/devteam-eligibility.jq`'s `effective_supervised`/`effective_plan_only`/`effective_owner`/`effective_next_agent`) is the SSOT: `lane = effective_next_agent || effective_owner || ""`; `lane == ""` → `"none"`. `orch-validate.mjs` is plain JS with no jq subprocess dependency today — port ONLY the two small detail-first/board-fallback lookups (`effective_owner`, `effective_next_agent` — 7 lines of jq each, reading `docs/data/orch/archive/backlog-detail.json`'s per-id `owner`/`next_agent` override, falling back to the board row's own inline field) into equivalent JS. This is NOT the "reimplement lane resolution" the row warns against — that warning is about inventing a DIFFERENT resolution algorithm; mirroring the identical 2-line detail-then-board fallback, with a code comment citing `scripts/lib/devteam-eligibility.jq` as the algorithm's SSOT, is the same discipline `orch-validate.mjs` already applies to its own Stage 1g/1h dependency-resolution logic (also a JS mirror of jq-domain concepts, not a fork).
- **Scope (lanes):** `backlog[]`, `ready[]`, `review[]` — matches the live report script's own coverage exactly (it grew from backlog-only to also ready/review via the 2026-07-30 AC-5 extension; mirror that scope, do not invent a wider one). `in_progress[]`/`qa[]` are excluded (an owner is a structural precondition of being in either lane); `active_sprints[]` excluded for the same reason Stage 1g already excludes it (WIP-normal intra-sprint noise); `done[]`/`done_verified[]` excluded (terminal, no dispatch need).
- **Trigger condition:** `(effective_supervised === true || effective_plan_only === true) && dispatch_lane === "none"`. This is the SECONDARY-or-wider set (either flag alone), not PRIMARY-only (both flags) — the row's own evidence includes 3 of 4 live-repaired violators with only ONE flag set (`AUDIT-FETCH-COMPLETE` sup-only, `UC-RDL-P4` sup-only, `DEBT-SCRIPTS-MIGRATIONS-TSC-COVERAGE` plan_only-only), so a both-flags-only predicate would have missed 3/4 of the very cohort this task exists to catch.
- **Output:** same shape as Stage 1g's `process.stdout.write` REPORT block — non-fatal, printed, does not change `orch-validate.mjs`'s exit code.

## 2. Negative control (mandatory per the row's own AC)

Add a fixture-driven unit test asserting: (a) a row with `supervised:true`, `owner:null`, `next_agent:null` → reported; (b) a row with `supervised:false`, `plan_only:false`, `owner:null`, `next_agent:null` (the Step A2 row-4 "genuinely parked, no handler yet" legal state) → **NOT reported** — this is the row's own explicit invariant ("owner:null + next_agent:null is a LEGITIMATE documented state... the invariant is NOT 'every row needs a handler'"); (c) a row resolved ONLY via `backlog-detail.json`'s override (inline board fields both empty, detail carries a real owner) → NOT reported (proves the detail-fallback port didn't regress into a false positive on a legitimately-stubbed row — this is the exact failure class `orch-backlog-stub.sh`-cold-migrated rows would otherwise trip).

## 3. Why NOT auto-derive `next_agent` from zone at mint time (option 3, rejected)

Zone-derivable rows are already the CONFIRMED-fixable subset (the row's own evidence: "EVERY one of the 4 live rows carried a zone that deterministically implies its handler via zone-routing.md Step A, so the missing field was derivable at mint time") — but auto-deriving silently on write would remove the one signal that currently makes a mis-set flag combination visible at all, and would do so unconditionally for every future row regardless of whether the zone inference is actually correct for that row's specific intent (zone-detect's own Tier-2/Tier-3 fallback already acknowledges it is not always right — "route to `developer` (generic), emit warning" is its own last-resort branch, not a confident default suitable for silent auto-fill on a DELIBERATE-dispatch-asserting row). A supervised/plan_only row is, by construction, one the mint author wanted a human or the design-router to look at — auto-filling `next_agent` defeats that intent even when the guess happens to be right. **REPORT (visible, correctable by the minting agent) is the correct response to a mint-time gap; SILENT AUTO-FILL is not**, especially on a lane the row's own `question` text says exists precisely so someone deliberately signs off on the dispatch target.

## 4. Promotion path to fatal (explicit follow-up, not open-ended)

Recommend a follow-up backlog row: `FIX-ORCHSTATE-SUPERVISED-LANE-REPORT-PROMOTE-TO-FATAL`, gated on **N consecutive clean orch-apply.sh write cycles with zero Stage-N REPORT hits** (suggest N = 14 days of live traffic, long enough to span a normal PO/dev-team triage cadence at least twice) — at that point, promote the SAME predicate into a `superRefine` in `orchStateSchema.ts`, following the exact "standalone-report-first, superRefine-second" migration `orchStateSchema.ts:658-661` already documents as this codebase's own pattern. Do not create this follow-up row as blocking or urgent — it is a scheduled hardening step, not a defect.

## Test Strategy

Unit: 3 fixture cases per §2, run via whatever harness `orch-validate.mjs`'s existing Stage 1g/1h tests use (co-locate, do not invent a new test runner). Live: re-run `bounded1-supervised-lane-report.sh` post-ship as the acceptance instrument (already exists, already the row's own `baseline_pass` — 0 unresolved in both PRIMARY/SECONDARY) to confirm the new Stage's live output count matches that script's count on the same board snapshot (cross-check between the ported JS predicate and its jq source of truth).

## Risk Flags

- **Predicate drift risk:** the JS port and the jq original could silently diverge over time (two implementations of the same 2-line rule). Mitigate with the cross-check test in §Test Strategy above, re-run whenever either file changes — flag this coupling in both files' header comments so a future editor of one remembers the other exists.
- **No DDD/domain-layer involvement** — this is board-tooling validation, `apps/` untouched this phase.

## Task-board disposition

`FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER`: `architect_design_complete=true`, `architect_handoff` → this file, `next_agent=developer` (zone-detect Tier-1: sole target file `scripts/orch-validate.mjs` is `scripts/`, a single-owner change — no split needed, unlike the other two rows in this session).

## NEXT

**developer** — implement §1 (Stage addition + JS port of the two effective_* lookups) + §2 (fixture tests) in `scripts/orch-validate.mjs`. Do not touch `orchStateSchema.ts` this phase (§4 is a separate, later, gated follow-up).
