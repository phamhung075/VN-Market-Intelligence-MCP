---
task: P2-Z
pilot: stock-price
phase: 2
gate_type: Phase-2 Close-Gate Verification (QA)
owner: qa
status: READY
readiedAt: 2026-05-24T02:13:53Z
readiedBy: pm
blockedBy: P2-M (DONE 2026-05-24T02:13:53Z)
blocks: Phase 3 PO terminal close
---

# P2-Z — Phase 2 Close-Gate Verification (QA)

**Owner:** qa  
**Blocked by:** P2-M DONE (2026-05-24T02:13:53Z)  
**Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Phase 2 skeleton  
**Task plan reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md §P2-Z (page 883–960)

---

## Background

P2-Z is the **Phase-2 close-gate — a read-only verification task that confirms ALL Phase-2 goal evidence is COMPLETE and the pilot is READY for the Phase-3 PO terminal close-gate (atomic 12/12 goal flip).**

**CRITICAL CONSTRAINT (Charter §4.5):**
- P2-Z does **NOT** flip any G-goal state
- P2-Z does **NOT** populate the decisionMatrix
- Both of those are **PO-only events**, executed in ONE atomic Phase-3 close commit
- `goalsEarned` **stays 0** through P2-Z
- `decisionMatrix` **stays all-TBD** through P2-Z
- This handoff attests **READINESS**, not completion

---

## Acceptance Criteria

### AC-1 — Sandbox All-Green (Phase-2 State)

**Requirement:** Run sandbox at all three tiers (primitive, module, all) and confirm exit 0 on all three.

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

All three must exit 0.

**Evidence (to be pasted by QA):**

```
[QA to paste: Primitive-tier sandbox output]
[QA to paste: Module-tier sandbox output]
[QA to paste: All-tier sandbox output]
```

---

### AC-2 — All 6 Phase-2 Goal Evidence Files Present

**Requirement:** Verify that evidence for all 6 Phase-2 goals (G3, G4, G5, G8, G9, G10–G11) is documented and committed.

Files checklist:
- [ ] `docs/handoffs/TASK_P2-H.md` (G3 composition root cleanup + OpenAPI contract) — handoff contains AC-1..AC-6 verdicts
- [ ] `docs/handoffs/TASK_P2-D-sp-g4-evidence.md` (G4 fence + violation proof + freeze anchor) — evidence file
- [ ] `docs/handoffs/TASK_P2-G-sp-g5-evidence.md` (G5 _deprecated/ + zero-domain-imports + zero-TODO-migrat) — evidence file
- [ ] `docs/handoffs/TASK_P2-J-sp-g8-evidence.md` (G8 honest-red deliberate-break proof) — evidence file
- [ ] `docs/po-decisions/2026-05-24-g9-stock-price-user-confirmation.md` (G9 PO Playwright Path B) — PO decision doc
- [ ] `docs/handoffs/TASK_P2-M-sp-g10-g11.md` OR integrated in signal file (G10 fix cycles + G11 trial proof) — evidence from P2-M

**Verification commands:**

```bash
test -f docs/handoffs/TASK_P2-H.md && echo "G3: FOUND" || echo "G3: MISSING"
test -f docs/handoffs/TASK_P2-D-sp-g4-evidence.md && echo "G4: FOUND" || echo "G4: MISSING"
test -f docs/handoffs/TASK_P2-G-sp-g5-evidence.md && echo "G5: FOUND" || echo "G5: MISSING"
test -f docs/handoffs/TASK_P2-J-sp-g8-evidence.md && echo "G8: FOUND" || echo "G8: MISSING"
test -f docs/po-decisions/2026-05-24-g9-stock-price-user-confirmation.md && echo "G9: FOUND" || echo "G9: MISSING"
test -f docs/signals/dev-sp-P2-M-done-20260524T021353Z.json && echo "G10/G11: SIGNAL FOUND" || echo "G10/G11: SIGNAL MISSING"
```

**Evidence (to be pasted by QA):**

```
[QA to paste: Output of above test commands]
```

**AC-2 PASS criterion:** All 6 files/evidence exist.

---

### AC-3 — G12 Streak Carry-Forward (EARNED-PENDING Re-Confirmed)

**Requirement:** Verify that the G12 DoD gate (sandbox-green-before-RETURN) was applied on EVERY Phase-2 dev task that produces sandbox-runnable artifacts. Confirm the 3/3 streak from Phase 1 carries forward with evidence.

**G12 streak tasks (Phase 1):**
- P1-B1: DONE 2026-05-24T00:53:00Z — sandbox GREEN
- P1-B2: DONE 2026-05-24T01:00:46Z — sandbox GREEN
- P1-B3: DONE 2026-05-24T01:08:00Z — sandbox GREEN (streak 3/3 complete)

**G12 re-applied tasks (Phase 2):**
- P2-B: DONE 2026-05-24T02:08:41Z — AC-5 PASS (sandbox 11/11)
- P2-F: DONE 2026-05-24T02:37:46Z — AC-5 PASS (sandbox 11/11)
- P2-H: DONE 2026-05-24T01:29:51Z — AC-6 PASS (sandbox 11/11 exit 0)
- P2-I: DONE 2026-05-24T01:43:02Z — AC-7 PASS (sandbox 11/11 exit 0)
- P2-M: DONE 2026-05-24T02:13:53Z — AC-4 PASS (G12 DoD gate CONFIRMED)

**Verification:** All 5 Phase-2 dev tasks have sandbox-green evidence pasted to their handoffs OR embedded in signal files.

**Evidence (to be pasted by QA):**

```
G12 Streak Phase 1 (3/3 complete): CONFIRMED
G12 DoD re-applied Phase 2 (5 dev tasks): CONFIRMED
Streak status: CONTINUOUS (no task skipped the gate)
g12_streak_carryforward: CONFIRMED
```

---

### AC-4 — Pre-Revert Tags All Present and Ordered Correctly

**Requirement:** Verify that all three pre-revert tags exist and are ancestry-ordered (each must be ≤ the next in temporal order).

```bash
git log --oneline stock-price-pre-ci stock-price-pre-delete stock-price-pre-inject 2>/dev/null | head -20
```

Must return all three tag names (no "unknown revision" error). Ancestry order check:

```bash
git merge-base --is-ancestor stock-price-pre-ci stock-price-pre-delete && echo "ci ≤ delete: OK" || echo "ci ≤ delete: FAIL"
git merge-base --is-ancestor stock-price-pre-delete stock-price-pre-inject && echo "delete ≤ inject: OK" || echo "delete ≤ inject: FAIL"
```

Both must echo OK.

**Evidence (to be pasted by QA):**

```
[QA to paste: git log output for three tags]
[QA to paste: Merge-base ancestry checks]
```

**AC-4 PASS criterion:** All three tags resolve; ancestry order confirmed (ci ≤ delete ≤ inject).

---

### AC-5 — Frozen Anchor INTACT and SSOT Not Mutated

**Requirement:** Verify the frozen anchor is still an ancestor of HEAD, and the SSOT was not modified by any Phase-2 task (goalsEarned=0, decisionMatrix all TBD).

```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

Must return non-empty output (anchor is ancestor of HEAD).

```bash
jq '{phase: .phase, goalsEarned: .goalsEarned, decisionMatrix: .decisionMatrix}' docs/data/pilot-status-stock-price.json
```

Must return:
```json
{
  "phase": "2",
  "goalsEarned": 0,
  "decisionMatrix": {
    "speed": "TBD",
    "trust": "TBD",
    "scale": "TBD",
    "verdict": "TBD"
  }
}
```

**Evidence (to be pasted by QA):**

```
[QA to paste: git log --ancestry-path output]
[QA to paste: jq SSOT query output]
```

**AC-5 PASS criterion:** Anchor is ancestor; `goalsEarned=0`; `decisionMatrix` all TBD; §4.5 untouched.

---

## Close-Gate Signal

After all 5 ACs are verified PASS, QA emits:

**File:** `docs/signals/qa-sp-phase2-close-gate-<UTC>.json`

**Content template:**

```json
{
  "signal": "qa-sp-phase2-close-gate",
  "pilot": "stock-price",
  "phase": "2",
  "gate": "CLOSE-GATE",
  "emitted_at": "<ISO8601 UTC timestamp>",
  "emitted_by": "qa",
  
  "ac_verdicts": {
    "ac1_sandbox_all_green": "PASS",
    "ac2_goal_evidence_complete": "PASS (G3/G4/G5/G8/G9/G10-G11)",
    "ac3_g12_streak_carryforward": "PASS (3/3 Phase-1 + 5 Phase-2 dev tasks)",
    "ac4_pretags_ordered": "PASS (stock-price-pre-ci ≤ stock-price-pre-delete ≤ stock-price-pre-inject)",
    "ac5_anchor_ssot_intact": "PASS (anchor=debba8ea ancestor; goalsEarned=0; decisionMatrix all TBD)"
  },
  
  "goals_evidence_complete": ["G3", "G4", "G5", "G8", "G9", "G10", "G11"],
  "g1_g2_g6_g7_g12_carryforward": ["G1", "G2", "G6", "G7", "G12"],
  "all_12_goals_ready_for_terminal": true,
  "g12_streak_carryforward": "CONFIRMED",
  "pre_revert_tags": ["stock-price-pre-ci", "stock-price-pre-delete", "stock-price-pre-inject"],
  "anchor": "debba8eaff0724d1fb32fc9d28640201cc32d1cc",
  "anchor_intact": true,
  "ssot_not_mutated": true,
  "goals_earned": 0,
  "decision_matrix": "TBD (all fields)",
  
  "readiness_attestation": "Phase 2 close-gate VERIFIED. All goal evidence complete. Pilot ready for Phase 3 PO terminal atomic close.",
  "next_actor": "pm",
  "next_action": "pm transitions SSOT phase2=CLOSED, notifies PO for Phase-3 terminal close (atomic 12/12 goal flip + decisionMatrix population)"
}
```

---

## Handoff Notes for QA

1. **Read-only audit:** This task requires NO code changes, NO commits from QA beyond the close-gate signal.
2. **Signal timing:** Emit the close-gate signal AFTER all ACs verified PASS and evidence compiled in this handoff.
3. **Goal flip warning:** Do NOT flip any goal status in this task. Goal flips are Phase-3 PO-only events.
4. **SSOT freeze:** Verify `goalsEarned` stays 0 and `decisionMatrix` all TBD; pass the file through the dup-key validation script before PM commits.
5. **Charter §4.5 binding:** This task attests READINESS — the actual goal transitions happen in Phase 3, in one atomic PO commit.

---

## Verification Checklist (for QA + PM)

- [ ] AC-1: Sandbox all-green (primitive, module, all tiers)
- [ ] AC-2: All 6 goal evidence files present (G3, G4, G5, G8, G9, G10–G11)
- [ ] AC-3: G12 streak carry-forward confirmed (Phase 1 3/3 + Phase 2 5 tasks)
- [ ] AC-4: Pre-revert tags present + ancestry-ordered
- [ ] AC-5: Anchor intact + SSOT untouched (goalsEarned=0, decisionMatrix TBD)
- [ ] Close-gate signal emitted
- [ ] PM validates signal and updates SSOT phase2=CLOSED (no goal flips in PM commit)
- [ ] PO notified for Phase-3 terminal close

---

## References

- **Phase 2 Task Plan:** docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md §P2-Z (§983–1000)
- **Charter:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §4.5 (matrix-authorship rule)
- **SSOT:** docs/data/pilot-status-stock-price.json
