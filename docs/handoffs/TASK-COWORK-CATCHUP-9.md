---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-9-documentation
size: S
zone: docs/
depends_on: [TASK-COWORK-CATCHUP-1, TASK-COWORK-CATCHUP-3, TASK-COWORK-CATCHUP-6]
blocks: [TASK-COWORK-CATCHUP-10]
---

## TLDR
FR-10 doc-honesty updates. Five touch points: (1) cowork-schedule.json schema comment on `guaranteed` semantics (delivery within bounded window OR structured miss); (2) match-slots.md documenting `catchup_raw` field contract; (3) spawn-fanout.md noting `is_catchup:true` tag passes through unchanged; (4) durability-brief addendum (body untouched per repo convention) describing implementations + risk flags; (5) partial cron-runbook update (rest in TASK-10 via agent-father).

## [PM] Planning Context
- **Zone:** `docs/`
- **Acceptance Criteria:**
  - [ ] AC-8: Grep confirms all FR-10 touch points updated with correct semantics (historical brief body untouched, addendum-only)
  - [ ] AC-10: No regression

- **Files to modify:**
  - `docs/data/cowork-schedule.json`:
    - Add/update schema comment on `guaranteed` field: "*`guaranteed:true` means the slot is delivered within its bounded catch-up/freshness window even across a host-standby or session-down gap, OR a structured (non-silent) miss is recorded when the VN day has rolled past — it does not mean unconditional delivery regardless of elapsed time.*"
  
  - `docs/agents/cowork-team/flow/match-slots.md`:
    - Document new top-level `catchup_raw` field in matcher's JSON contract: array of catch-up-candidate records (pre-delivery-check) with fields: slot_id, dish_type, scheduled_utc_time, catchup_eligible, reason
  
  - `docs/agents/cowork-team/flow/spawn-fanout.md`:
    - Add note: "Catch-up candidates tagged with `is_catchup:true` pass through this spawn-fanout.md unchanged — they use the identical per-work-item token (`cowork-slot:<slot_id>`) and published-marker gate as on-time fires. The only difference is the candidate routing source (FR-9 catch-up detection vs FR-1 live matching)."
  
  - `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`:
    - Add new **Addendum Section (2026-07-22)** at end (preserve historical body per repo convention):
      - "This sprint (COWORK-GUARANTEED-SLOT-CATCHUP) implements Track A catch-up (FR-1..10) with bounded look-back for guaranteed slots missed during host standby/session-down windows. Key implementations: (1) pure domain predicate module (`cowork-catchup-predicate.js`, FR-1); (2) per-dish-type config (`_dish_type_catchup_config`, FR-2/FR-8); (3) unified delivery-check via `task_list_held` (FR-3); (4) per-caller wiring (dispatcher `catchup-check.md`, tick-preflight.sh Step 6.5, firer.sh; FR-9); (5) reconciliation-based `last_fired` (FR-7). Risk flags: marker-lifecycle bugs (leak/release) remain unfixed (separate rows); digest-daily UTC-date basis mirrored not corrected (scope discipline)."

- **Knowledge needed:**
  - Architecture brief §10 (FR-10 doc touch points)
  - Existing flow doc style (match-slots.md, spawn-fanout.md patterns)
  - Durability-brief addendum convention

## RETURN (after completion)
- [ ] All FR-10 touch points updated with correct semantics (AC-8)
- [ ] Historical brief body untouched, addendum-only
- [ ] No regression (AC-10)
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T9
