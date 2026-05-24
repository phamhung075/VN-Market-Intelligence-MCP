---
pilot: "kinh-dich-service"
phase: "2"
task_id: "P2-KD-Z"
title: "Phase 2 Close-Gate Verification (QA)"
owner: "qa"
type: "close-gate"
zone: "apps/kinh-dich-service"
depends_on: "P2-KD-N"
blocks: "Phase 3 (PO atomic close)"
est_hours: 0.5
ac_count: 7
---

## TLDR

Final Phase-2 gate. QA verifies complete goal evidence chain (G3, G4, G5, G6, G8, G9, G10, G11, G12) and sandbox all-green before emitting signal authorizing PM to transition SSOT to phase2=CLOSED. NO goal flips — that is Phase-3 PO-only. Signal directs PM to notify PO for Phase-3 terminal atomic close.

## Background

P2-KD-Z is a read-only audit + signal emission task. No code changes. All evidence files must exist from prior tasks (P2-KD-D, P2-KD-H, P2-KD-K, P2-KD-N, P2-KD-J, P2-KD-L). QA assembles attestation that all Phase-2 goals have evidence and sandbox is stable at 17/17 scenarios green.

## Acceptance Criteria

### AC-1 — Sandbox all-green (Phase-2 expanded baseline)

**Step A:** Run primitive-tier sandbox
```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```
Must exit 0. Paste full output to close-gate doc.

**Step B:** Run module-tier sandbox
```bash
bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all
```
Must exit 0. Paste full output.

**Step C:** Run all-tiers sandbox (combined)
```bash
bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Must exit 0. Paste full output showing ≥17 primitive + ≥2 module scenarios (≥19 total; P2-KD-J adds 3 nuclear-hexagram-computer scenarios).

### AC-2 — All Phase-2 goal evidence files present

Verify these files exist:
```bash
ls docs/handoffs/TASK_P2-KD-D-g4-evidence.md \
   docs/handoffs/TASK_P2-KD-H-g5-evidence.md \
   docs/handoffs/TASK_P2-KD-K-g8-evidence.md \
   docs/handoffs/TASK_P2-KD-N-g10-g11.md
```

All 4 must exist.

**Supporting evidence locations:**
- **G3:** composition root clean per P2-KD-I handoff ACs 1-3 (≤80 lines, zero domain-op, OpenAPI exists)
- **G6:** P2-KD-J dashboard finalization handoff (5 primitives, module card, microservice card, OpenAPI link, deprecated notice)
- **G9:** `docs/po-decisions/<date>-g9-kinh-dich-user-confirmation.md` from P2-KD-L (PO Playwright verdict)

### AC-3 — G12 streak carry-forward (EARNED-PENDING re-confirmed)

QA verifies:
- Phase-1 streak tasks (P1-B1, P1-B2, P1-B3) each have sandbox-green evidence in their handoffs
- Every Phase-2 dev task producing sandbox-runnable artefacts (P2-KD-B, P2-KD-F, P2-KD-G, P2-KD-I, P2-KD-J, P2-KD-N) has sandbox-green evidence pasted to its handoff

Record `g12_streak_carryforward: CONFIRMED` in close-gate doc.

### AC-4 — Pre-revert tags all present and correctly ordered

```bash
git log --oneline kinh-dich-pre-ci kinh-dich-pre-delete kinh-dich-pre-inject 2>/dev/null
```

All three tags must resolve (no "unknown revision" error). Tag ancestry order must be:
`kinh-dich-pre-ci` ≤ `kinh-dich-pre-delete` ≤ `kinh-dich-pre-inject`

Record tag SHAs in close-gate doc.

### AC-5 — ESLint fence still active and clean

```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

Must exit 0. Record `eslint_fence_clean: YES` in close-gate doc.

### AC-6 — Frozen anchor INTACT and SSOT not mutated

**Anchor check:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

Must return non-empty output (anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` is still a proper ancestor of HEAD).

**SSOT check:**
```bash
jq '{phase,goalsEarned,decisionMatrix}' docs/data/pilot-status-kinh-dich.json
```

- `goalsEarned` must still be 0 (no goals flipped by any Phase-2 task)
- `decisionMatrix.speed`, `.trust`, `.scale` must all be `"TBD"`
- No mutations to §4.5 matrix-authorship rule

Record these values in close-gate doc.

### AC-7 — SI-2 boundary held throughout Phase 2

```bash
git log --oneline docs/dashboards/index.html | grep -v "stock-price\|P2-I"
```

Must return empty (no kinh-dich commits touched the fleet index; only stock-price's P2-I commit is in the log for that file).

## Evidence Submission

QA writes `docs/handoffs/TASK_P2-KD-Z-close-gate-evidence.md` containing:

- **Sandbox outputs:** Full output from all three tiers (AC-1)
- **Evidence file audit:** Listing of all 7 required handoff evidence files (AC-2)
- **G12 streak confirmation:** List of all Phase-2 dev tasks with sandbox-green evidence (AC-3)
- **Tag ancestry:** `git log` output showing all three pre-revert tags in correct order (AC-4)
- **ESLint status:** `bunx eslint src/ --max-warnings 0` exit code 0 output (AC-5)
- **Anchor verification:** `git log --ancestry-path` output confirming anchor is ancestor (AC-6)
- **SSOT snapshot:** `jq` output showing `goalsEarned=0`, `decisionMatrix={speed,trust,scale}="TBD"` (AC-6)
- **SI-2 audit:** `git log docs/dashboards/` filtered output (AC-7)

## Signal Emission

QA emits `docs/signals/qa-kd-phase2-close-gate-<UTC>.json`:

```json
{
  "agent": "qa",
  "task": "P2-KD-Z",
  "pilot": "kinh-dich-service",
  "phase": "2",
  "gate": "CLOSE-GATE",
  "completed_at": "<ISO-8601>",
  "sandbox_all_green": true,
  "sandbox_scenario_count": "≥17 primitive + ≥2 module",
  "goals_evidence_complete": ["G3","G4","G5","G6","G8","G9","G10","G11"],
  "g1_evidence": "P2-KD-J (nuclear-hexagram-computer 5th primitive + 3 scenarios)",
  "g12_streak_carryforward": "CONFIRMED",
  "pre_revert_tags": ["kinh-dich-pre-ci","kinh-dich-pre-delete","kinh-dich-pre-inject"],
  "eslint_fence_clean": true,
  "anchor_intact": true,
  "ssot_not_mutated": true,
  "goals_earned": 0,
  "decision_matrix": "TBD (no PO flip)",
  "si2_boundary_held": true,
  "next_actor": "pm",
  "next_action": "transition phase2.status=CLOSED in pilot-status-kinh-dich.json, notify PO for Phase-3 atomic close"
}
```

## Constraints

- **NO goal flips in P2-KD-Z.** All goal state remains TBD until Phase-3 PO atomic close.
- **Charter §4.5 SSOT untouched.** No modifications to `decisionMatrix`, `goalsEarned`, or goal status fields.
- **Read-only audit.** No code changes, no file creations except handoff doc and signal JSON.
- **Anchor discipline:** debba8eaff0724d1fb32fc9d28640201cc32d1cc remains ancestor throughout Phase 2.

## Handoff Files to Review First

- `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md` (full §P2-KD-Z spec at line 1144+)
- `docs/data/pilot-status-kinh-dich.json` (current SSOT — verify `phase2.current_task`, `goalsEarned`, `decisionMatrix`)
- `docs/handoffs/TASK_P2-KD-D-g4-evidence.md` (G4 fence evidence)
- `docs/handoffs/TASK_P2-KD-H-g5-evidence.md` (G5 migration evidence)
- `docs/handoffs/TASK_P2-KD-K-g8-evidence.md` (G8 honest-red evidence)
- `docs/handoffs/TASK_P2-KD-N-g10-g11.md` (G10 fix + G11 coupling evidence)

## Knowledge Needed

- `docs/policies/dev-standards.md` (commit conventions)
- `docs/protocols/fail-loud-protocol.md` (escalation on blocker)
- Charter §P2-KD-Z acceptance criteria (transcribed above in full)
