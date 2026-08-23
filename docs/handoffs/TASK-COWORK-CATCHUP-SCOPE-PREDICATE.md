# TASK-COWORK-CATCHUP-SCOPE-PREDICATE

**Zone:** `scripts/agents-flow/` · **Owner:** `developer` · **Size:** S (~1.5h) · **Priority:** P1
**Parent row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md` §6 item 4, AC-3, R5
**depends_on:** none
**blocks:** `TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE`, `TASK-COWORK-STALE-SLOT-DISPOSITION-TABLE`

---

## TLDR
`scripts/agents-flow/cowork-catchup-predicate.js:209` currently reads `if (!sl.guaranteed) continue;`. Replace that with a check on a **new slot field `catchup_scope`, defaulting to the slot's current `guaranteed` value** so day-1 behaviour is byte-identical. This is the **code half only** — setting the field `true` for specific slots is `TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE` (agent-father owns `docs/data/cowork-schedule.json`).

## Why narrow, not blanket (brief §6 item 4)
`guaranteed` is not the right predicate for catch-up eligibility, but **removing line 209 outright is also wrong**. Only `refine-bctc-*` and `bctc-analyst-*` are data-refinement jobs with **no publish-date semantics** — for those a late run is a *correct* run, so `rolled_past_vn_date` should not apply. Every publish-date-bound dish must still refuse. This is the principled widening; a blanket removal would turn a correct guard into no guard.

## Acceptance Criteria
- [ ] **AC-1 — field-driven, not flag-driven.** Line 209's `if (!sl.guaranteed) continue;` becomes a check on `catchup_scope`.
- [ ] **AC-2 — default preserves today's behaviour exactly.** A slot with **no** `catchup_scope` key falls back to its `guaranteed` value. Prove it: with an unmodified `docs/data/cowork-schedule.json`, the predicate's output is byte-identical to the pre-change output (same 8 `catchup_raw` records, same 0 eligible, same refusal reasons).
- [ ] **AC-3 (brief R5) — test the `true` branch end-to-end.** This predicate currently returns **zero-eligible on every path in production** (measured: 8 records, 0 eligible — 6 `rolled_past_vn_date`, 2 `freshness_window_exceeded`), so the eligible branch is effectively untested. Tests must drive a slot with `catchup_scope:true` all the way to `catchup_eligible:true` when late — not just re-assert the refusal branches.
- [ ] **AC-4 (brief AC-3) — the guard must stay a guard.** With `catchup_scope:true` set on the bctc slots, `catchup_raw` must **not** become uniformly non-empty/eligible. Assert that every publish-date-bound slot still refuses. If everything becomes eligible, the change removed the guard instead of narrowing it.
- [ ] **AC-5 — `rolled_past_vn_date` scoping is explicit.** The reason a `catchup_scope` slot may run late is documented in-code as "no publish-date semantics", not left implicit in a boolean.
- [ ] **AC-6 (brief R2) — no second dedup.** Every guaranteed-slot flow already has a published-marker `task_claim` gate (FR-P2-7). Do **not** add a competing dedup mechanism; reuse the existing gate.
- [ ] **AC-7 — tests** in the predicate's existing test file: default-equivalence (AC-2), eligible branch (AC-3), publish-date-bound still refuses (AC-4).

## Files
- **Modify:** `scripts/agents-flow/cowork-catchup-predicate.js` (line ~209 + its test file)
- **Read first (do not modify):** `docs/data/cowork-schedule.json` (`_dish_type_catchup_config`, `catchup_max_lateness_minutes` 60–1440) · brief §4 and §6 item 4
- **Do NOT modify:** `docs/data/cowork-schedule.json` — `_maintained_by: agent-father via architect brief only`. Setting `catchup_scope:true` on `refine-bctc-*` / `bctc-analyst-*` is `TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE`.

## Standards
`docs/policies/dev-standards.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-COWORK-CATCHUP-SCOPE-PREDICATE` + `AC:` trailer)
