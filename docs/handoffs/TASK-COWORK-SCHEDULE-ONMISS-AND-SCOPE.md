# TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE

**Zone:** `docs/data/` · **Owner:** `agent-father` · **Size:** S (~1.5h) · **Priority:** P1
**Parent row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md` §6 items 3 + 4, §5-Q2, AC-3, R2
**depends_on:** `TASK-COWORK-CATCHUP-SCOPE-PREDICATE`
**blocks:** `TASK-COWORK-STALE-SLOT-DISPOSITION-TABLE`

---

## TLDR
Two schedule-data changes, folded into one task because both edit the same file (`docs/data/cowork-schedule.json`, `_maintained_by: agent-father via architect brief only`): (a) declare a per-dish-type `on_miss` policy; (b) set the new `catchup_scope` field the predicate now reads.

## Acceptance Criteria

### (a) `on_miss` policy — brief §6 item 3
- [ ] **AC-1 — explicit, not accidental.** Add `on_miss: "catchup" | "skip_and_record"` per dish type in `_dish_type_catchup_config`. Today whether a late run is *valid* is decided by accident, via a 1440-minute constant. Whether a late run is valid is a **property of the dish** and must be declared and reviewable.
- [ ] **AC-2 — publish-date-bound dishes get `skip_and_record`.** Chef/digest/fb/market dishes cannot honestly publish Friday's morning output on Sunday. Their misses are recorded and detected (by `TASK-COWORK-MISSED-FIRE-AUDIT`), not replayed.
- [ ] **AC-3 (brief R2) — `on_miss: "catchup"` must not resurrect stale publishes.** Every guaranteed-slot flow already has a published-marker `task_claim` gate (FR-P2-7). Reuse that gate. Adding a second, competing dedup is a defect, not a safeguard.

### (b) `catchup_scope` field — brief §6 item 4
- [ ] **AC-4 — default written to preserve behaviour.** `catchup_scope` defaults to each slot's current `guaranteed` value, so day-1 behaviour is unchanged.
- [ ] **AC-5 — set `true` only for `refine-bctc-*` and `bctc-analyst-*`.** Those are data-refinement jobs with **no publish-date semantics** — a late run is a *correct* run. This also covers the row's originating symptom, `refine-bctc-slot-1`. Do not widen further; do not blanket-enable.
- [ ] **AC-6 (brief AC-3) — verify against the live matcher after the write.** `catchup_raw` must contain the `refine-bctc-*` / `bctc-analyst-*` slots with `catchup_eligible:true` when late, while every publish-date-bound slot still refuses. `catchup_raw` must **NOT** become uniformly non-empty — that would mean the guard was removed rather than narrowed.
- [ ] **AC-7 — sub-hourly market slots stay out.** `news-scout-market`, `market-watcher-market`, `alert-commander-market` remain Layer-B-only with `catchup_scope` at their default. The 2026-07-07 brief §3.5 kept them out on purpose (cost + pile-up risk from a headless `claude -p` every 15 min through market hours) and that is still right. `catchup_scope` is the opt-in mechanism **if** that is ever revisited; this task does not reopen it.
- [ ] **AC-8 — schedule file stays valid.** Any schedule-schema/consumer validation still passes; `cowork-match-slots.js` and `cowork-catchup-predicate.js` both parse the file without error after the edit.

## Ordering
`depends_on: TASK-COWORK-CATCHUP-SCOPE-PREDICATE` — the predicate must read `catchup_scope` before the field means anything, and AC-6's verification requires both halves present. Setting the field earlier would be inert, not harmful, but the verification gate cannot be satisfied out of order.

## Files
- **Modify:** `docs/data/cowork-schedule.json`
- **Read first (do not modify):** `scripts/agents-flow/cowork-catchup-predicate.js` (the shipped `catchup_scope` contract) · `scripts/agents-flow/cowork-match-slots.js` · brief §4, §5-Q2, §6 items 3–4
- **Do NOT modify:** anything under `scripts/` (developer zone)

## Standards
`docs/policies/dev-standards.md` · `.claude/skills/commit-boundary/SKILL.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE` + `AC:` trailer)
