---
sprint: P2-J
task: P2-J
pilot: alert-engine
phase: 2
title: "G8 Honest-Red Deliberate-Break Proof"
owner: qa
size: M
zone: apps/alert-engine/
depends_on: ["P2-I"]
blocks: ["P2-K"]
status: SEQUENCED
sequencedAt: "2026-05-24T07:56:21Z"
---

## TLDR

QA proves the alert-engine dashboard does NOT show false-green (honest-red contract).
Two tests: (A) deliberately corrupt a scenario JSON → sandbox fails, dashboard RED; (B) revert → sandbox green, dashboard GREEN. 
No scenario files are committed; test edits are reverted and clean. Evidence compiled to handoff file.

---

## [PM] Planning Context

- **Task:** G8 honest-red deliberate-break proof
- **Zone:** apps/alert-engine/
- **Owner:** qa
- **Blocked by:** P2-I DONE (dashboard finalized — honest-red test requires a working dashboard)
- **Blocks:** P2-K (G9 PO Playwright Path B)
- **Files to read first:**
  - `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md` §P2-J
  - `docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json` (or signal-classifier/dedup-key-builder)
  - `apps/alert-engine/dashboard/index.html` (view rendered state after each sandbox run)

- **Files to modify:**
  - None committed. Test edits to `docs/scenarios/alert-engine/primitives/*.json` are reverted.

- **Files to create:**
  - `docs/handoffs/TASK_P2-J-ae-g8-evidence.md` — evidence document compiled during this task (committed as proof)

- **Dependencies:** P2-I DONE (dashboard finalized + operational)

- **Knowledge needed:**
  - `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md` §P2-J (ACs, test procedures)
  - `docs/policies/dev-standards.md` (G8 honest-red pattern, fail-loud protocol)

---

## Acceptance Criteria (VERBATIM from phase-2-task-plan-go.md §P2-J)

### Background
G8 honest-red contract. Two tests prove the dashboard is not a false-green machine.
Pattern inherited verbatim from stock-price P2-J — scenario JSON corruption + revert.

### Test A — Corrupted scenario
1. Edit one golden scenario JSON (e.g. `docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json`).
   Change one expected output field to a wrong value (e.g. flip `suppress: false` to `suppress: true`).
2. Run sandbox:
   ```bash
   cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
   ```
   Must exit non-zero with ≥1 FAIL for `cooldown-gate`.
3. Open `apps/alert-engine/dashboard/index.html` — `cooldown-gate` card must show RED / FAIL status.
4. Capture terminal output + dashboard state description in handoff.
5. Revert: `git checkout docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json`

### Test B — Golden scenario (after revert)
1. Run sandbox:
   ```bash
   cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
   ```
   Must exit 0 with all scenarios PASS.
2. Open dashboard — all cards show GREEN (after sandbox run). No false greens on NOT-RUN items.

---

## Acceptance Criteria Details

**AC-1 (Test A):** Sandbox exits non-zero on corrupted scenario AND dashboard shows non-green for the affected card. Evidence (terminal output) pasted to handoff `§Evidence — G8 Test A`.

**AC-2 (Test B):** Sandbox exits 0 after revert AND dashboard shows green for all cards. Evidence pasted to `§Evidence — G8 Test B`.

**AC-3 — 2 additional known-bad runs:** QA runs 2 more deliberately corrupted scenario invocations using different primitives (e.g. `signal-classifier-golden.json` then `dedup-key-builder-golden.json`). Both return exit non-zero. Evidence: paste exit codes.

**AC-4 — Reverted files clean:**
```bash
git status --short | grep "scenarios"
```
Returns empty (no staged or unstaged changes to any scenario file after all reverts).

**AC-5 — G8 evidence compiled:** QA writes `docs/handoffs/TASK_P2-J-ae-g8-evidence.md` and emits `docs/signals/qa-ae-P2-J-g8-done-<UTC>.json`.

---

## Goal Posture

**NO goal flips.** G8 evidence complete. §4.5 SSOT untouched.
- `goalsEarned` stays 0.
- `decisionMatrix` stays all-TBD.
- No G-goal field is modified.

---

## Hard Constraints (Phase 2 binding)

| Constraint | Rule |
|---|---|
| **G12 DoD gate** | `cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all` exits 0 BEFORE DONE. Baseline: 11/11. |
| **ZERO-CREDS** | No TELEGRAM_* vars, no scenario JSON credential strings. |
| **SI-2 boundary** | `docs/dashboards/index.html` MUST NOT be touched. |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor. |
| **SSOT freeze** | Do NOT modify goal fields or decisionMatrix. `goalsEarned` stays 0. |

---

## Evidence Section Template

When completing this task, populate the sections below:

### § Evidence — G8 Test A (Corrupted Scenario)

```
Scenario file edited: [PATH]
Expected field changed: [FIELD_NAME] from [OLD_VALUE] to [NEW_VALUE]

Sandbox run (corrupted):
[PASTE TERMINAL OUTPUT showing exit non-zero + FAIL count]

Dashboard state (corrupted):
[DESCRIBE: card color, displayed status, affected primitive name]

File reverted: git checkout [PATH]
```

### § Evidence — G8 Test B (Golden Scenario After Revert)

```
Sandbox run (golden/reverted):
[PASTE TERMINAL OUTPUT showing exit 0 + all scenarios PASS]

Dashboard state (golden/reverted):
[DESCRIBE: all cards GREEN, status honestly reflects last sandbox run]
```

### § Evidence — Additional Bad Runs (AC-3)

```
Run 1 (e.g. signal-classifier-golden.json corruption):
Sandbox exit code: [NON-ZERO]
[PASTE TERMINAL OUTPUT]

Run 2 (e.g. dedup-key-builder-golden.json corruption):
Sandbox exit code: [NON-ZERO]
[PASTE TERMINAL OUTPUT]
```

### § Evidence — Git Status After All Reverts (AC-4)

```bash
$ git status --short | grep "scenarios"
[PASTE: should be EMPTY]
```

### § Signal Emission (AC-5)

File created: `docs/signals/qa-ae-P2-J-g8-done-<UTC>.json`

JSON template:
```json
{
  "signal": "qa-ae-P2-J-g8-done",
  "task": "P2-J",
  "pilot": "alert-engine",
  "phase": "2",
  "status": "DONE",
  "timestamp": "<UTC>",
  "evidence": {
    "AC-1": "PASS — sandbox non-zero on corrupt, dashboard RED",
    "AC-2": "PASS — sandbox exit 0 on golden, dashboard GREEN",
    "AC-3": "PASS — 2 additional runs both non-zero",
    "AC-4": "PASS — all scenario files reverted, git status clean",
    "AC-5": "PASS — G8 evidence compiled"
  },
  "g8_contract_verdict": "PASS — dashboard is NOT false-green",
  "next_actor": "pm",
  "next_task": "P2-K — G9 PO Playwright Path B"
}
```

---

## Commit

After all ACs PASS and evidence is compiled:

```bash
git add docs/handoffs/TASK_P2-J-ae-g8-evidence.md docs/signals/qa-ae-P2-J-g8-done-<UTC>.json
git commit -m "test(alert-engine): P2-J — G8 honest-red proof (sandbox RED on corrupt, GREEN on golden)"
```

**No scenario JSON files are staged or committed.** All test edits are reverted before completion.

---

## Next Steps

After P2-J DONE:
1. QA emits signal `docs/signals/qa-ae-P2-J-g8-done-<UTC>.json` with all AC verdicts.
2. PM receives signal, verifies SSOT integrity, updates `phase2.current_task` P2-J→P2-K.
3. PM sequences P2-K (G9 PO Playwright Path B) and dispatches to `po`.
