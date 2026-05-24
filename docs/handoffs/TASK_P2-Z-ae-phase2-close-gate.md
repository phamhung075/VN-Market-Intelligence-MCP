---
sprint: alert-engine-phase-2-close-gate
branch: none (QA read-only audit task)
size: M
zone: apps/alert-engine/ + audit-only
depends_on: ["P2-M"]
blocks: ["phase-3-po-terminal"]
---

# P2-Z — Phase 2 Close-Gate Verification (QA)

**Owner:** qa
**Blocked by:** P2-M DONE (G10 + G11 chain complete)
**Files touched:** none (read-only audit + signal emit)

## TLDR

Final Phase-2 gate. QA verifies the complete goal evidence chain before emitting the signal that authorizes PM to transition SSOT to phase2=CLOSED and notify PO for Phase 3. NO goal flips in this task — that is a Phase-3 PO-only event. `goalsEarned` stays 0.

## [PM] Planning Context

- **Zone:** apps/alert-engine/ (read-only audit)
- **Acceptance Criteria:** (6 ACs transcribed VERBATIM from phase-2-task-plan-go.md §P2-Z)
  - [ ] AC-1: Sandbox all-green (Phase-2 terminal state)
  - [ ] AC-2: All 6 Phase-2 goal evidence files present
  - [ ] AC-3: G12 streak carry-forward (EARNED-PENDING re-confirmed)
  - [ ] AC-4: Pre-revert tags all present and ordered correctly
  - [ ] AC-5: Frozen anchor INTACT and SSOT not mutated
  - [ ] AC-6: ZERO-CREDS baseline re-confirmed
- **Files to read first:** 
  - docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md (§P2-Z)
  - docs/data/pilot-status-alert-engine.json (phase2 ledger)
  - docs/handoffs/TASK_P2-D-ae-g4-evidence.md (G4 evidence)
  - docs/handoffs/TASK_P2-G-ae-g5-evidence.md (G5 evidence)
  - docs/handoffs/TASK_P2-J-ae-g8-evidence.md (G8 evidence)
  - docs/handoffs/TASK_P2-M-ae-g10-g11.md (G10+G11 evidence)
- **Files to create:** 
  - (this handoff doc — P2-Z evidence transcript)
  - docs/signals/qa-ae-phase2-close-gate-<UTC>.json (close-gate signal)
- **Files to modify:** 
  - docs/data/pilot-status-alert-engine.json (PM updates phase2.status=CLOSED, not QA)
- **Dependencies:** 
  - P2-M DONE (all dev/qa work complete)
  - G4 evidence complete (TASK_P2-D-ae-g4-evidence.md exists)
  - G5 evidence complete (TASK_P2-G-ae-g5-evidence.md exists)
  - G8 evidence complete (TASK_P2-J-ae-g8-evidence.md exists)
  - G10+G11 evidence complete (TASK_P2-M-ae-g10-g11.md exists)
- **Knowledge needed:** 
  - docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md §P2-Z (AC specs)
  - docs/data/pilot-status-alert-engine.json (SSOT ledger for reading only)
  - §4.5 compliance rules (no goal flips, goalsEarned=0, decisionMatrix all-TBD)

---

## Acceptance Criteria (VERBATIM from phase-2-task-plan-go.md §P2-Z)

### AC-1 — Sandbox all-green (Phase-2 terminal state)

```bash
cd apps/alert-engine
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=alert-engine -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```

All three exit 0. QA pastes all three outputs to close-gate doc (§Evidence section below).

**Evidence — AC-1 Sandbox All-Green:**

```
[PASTE OUTPUT FROM ALL THREE SANDBOX RUNS HERE]
```

---

### AC-2 — All 6 Phase-2 goal evidence files present

```bash
ls docs/handoffs/TASK_P2-D-ae-g4-evidence.md \
   docs/handoffs/TASK_P2-G-ae-g5-evidence.md \
   docs/handoffs/TASK_P2-J-ae-g8-evidence.md \
   docs/handoffs/TASK_P2-M-ae-g10-g11.md
```

All 4 files exist.

- **G3 evidence:** composition root clean per P2-H handoff (cmd/server/main.go wired, OpenAPI exists, ≤120 lines).
- **G4 evidence:** TASK_P2-D-ae-g4-evidence.md (ac_4a_ci_job_wired, ac_4b_violation_proof, ac_4c_freeze_sha).
- **G5 evidence:** TASK_P2-G-ae-g5-evidence.md (g5a_deprecated_path, g5b_zero_direct_domain_imports, g5c_zero_todo_migrat).
- **G6 evidence:** finalized dashboard from P2-I handoff (deprecated-notice + Phase-2 wired-state display).
- **G8 evidence:** TASK_P2-J-ae-g8-evidence.md (Test A RED, Test B GREEN, 2 additional primitives, reverted clean).
- **G9 evidence:** PO decision doc from P2-K (docs/po-decisions/<date>-g9-alert-engine-user-confirmation.md).
- **G10+G11 evidence:** TASK_P2-M-ae-g10-g11.md (cycle_count ≤2, Trial-1 outcome-(a), Trial-2 outcome-(a)).

**Verdict:** [ ] PASS

---

### AC-3 — G12 streak carry-forward (EARNED-PENDING re-confirmed)

QA re-verifies: the 3 Phase-1 streak tasks (P1-B1, P1-B2, P1-B3) each have sandbox-green evidence in their Phase-1 handoff docs. Every Phase-2 dev task (P2-B, P2-F, P2-H, P2-I, P2-M) has sandbox-green evidence pasted to its handoff.

G12 DoD gate was applied on every qualifying task. 

Records `g12_streak_carryforward: CONFIRMED` in close-gate doc below.

**Verdict:** [ ] PASS — g12_streak_carryforward: CONFIRMED

---

### AC-4 — Pre-revert tags all present and ordered correctly

```bash
git log --oneline alert-engine-pre-ci alert-engine-pre-delete alert-engine-pre-inject 2>/dev/null
```

All three tags resolve to commits (no "unknown revision" error). Tag ancestry order must be:
`alert-engine-pre-ci` ≤ `alert-engine-pre-delete` ≤ `alert-engine-pre-inject`
(each tags a commit no newer than the next in the sequence).

**Evidence — AC-4 Pre-Revert Tags:**

```
[PASTE OUTPUT FROM git log --oneline FOR ALL 3 TAGS]
```

**Verdict:** [ ] PASS

---

### AC-5 — Frozen anchor INTACT and SSOT not mutated

```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

Non-empty output (anchor is still a proper ancestor of HEAD).

```bash
jq '{phase,goalsEarned,decisionMatrix}' docs/data/pilot-status-alert-engine.json
```

- `goalsEarned` must still be 0
- `decisionMatrix.speed`, `.trust`, `.scale`, `.verdict` must all be `"TBD"`
- `phase` must be `"2"` (already transitioned from Phase 1)
- §4.5 untouched

**Evidence — AC-5 Anchor + SSOT Integrity:**

```
[PASTE ANCESTRY CHECK OUTPUT]

[PASTE jq OUTPUT FOR phase + goalsEarned + decisionMatrix]
```

**Verdict:** [ ] PASS

---

### AC-6 — ZERO-CREDS baseline re-confirmed

```bash
env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"
```

Empty output. Sandbox cred-free baseline is unchanged from Phase-1 close.

**Evidence — AC-6 ZERO-CREDS:**

```
[PASTE OUTPUT FROM env | grep (should be empty)]
```

**Verdict:** [ ] PASS

---

## Evidence Summary

**Evidence — AC-1 Sandbox All-Green:**

[Will be populated by QA during task execution]

---

**Evidence — AC-4 Pre-Revert Tags:**

[Will be populated by QA during task execution]

---

**Evidence — AC-5 Anchor + SSOT Integrity:**

[Will be populated by QA during task execution]

---

**Evidence — AC-6 ZERO-CREDS:**

[Will be populated by QA during task execution]

---

## Close-Gate Verdict

**All 6 ACs PASS:** [ ] YES [ ] NO

**Close-Gate Overall Verdict:**

[ ] PASS — Phase 2 ready for PM transition (phase2.status → CLOSED) and PO Phase 3 dispatch

[ ] BLOCKED — [specify reason]

---

## Signal to Emit (Close-Gate Authority to PM)

**File:** `docs/signals/qa-ae-phase2-close-gate-<UTC>.json`

**Fields (JSON template):**

```json
{
  "pilot": "alert-engine",
  "phase": "2",
  "gate": "CLOSE-GATE",
  "sandbox_all_green": true,
  "goals_evidence_complete": ["G3","G4","G5","G6","G8","G9","G10","G11"],
  "g12_streak_carryforward": "CONFIRMED",
  "pre_revert_tags": ["alert-engine-pre-ci","alert-engine-pre-delete","alert-engine-pre-inject"],
  "anchor_intact": true,
  "ssot_not_mutated": true,
  "goals_earned": 0,
  "decision_matrix": "TBD",
  "zero_creds_baseline": "CONFIRMED",
  "next_actor": "pm",
  "next_action": "transition pilot-status-alert-engine.json phase2=CLOSED, notify PO for Phase-3 atomic close"
}
```

---

## Charter §4.5 Compliance Confirmation

**This task does NOT flip any G-goal fields in SSOT.** The close-gate signal authorizes PM to transition the SSOT `phase2.status` field only (not G-goal fields). PO then executes the 12/12 terminal atomic close (Phase 3) at their cadence, at which point all goal flips and decisionMatrix population occur.

- `goalsEarned` stays 0 ✓
- `decisionMatrix.{speed,trust,scale,verdict}` stay `"TBD"` ✓
- No goal status fields modified ✓

**§4.5 COMPLIANCE:** CONFIRMED

---

## Notes

- This is a **read-only QA audit task** — no code modifications, no commits in the AC procedures themselves.
- All previous Phase-2 task commits are already complete (P2-A through P2-M).
- QA emits ONE signal after all 6 ACs are verified PASS.
- PM receives the signal and updates SSOT phase2.status=CLOSED only (not goals).
- PO then receives PM's signal and executes Phase-3 atomic close (12/12 terminal + decisionMatrix + charter CLOSES).

---
