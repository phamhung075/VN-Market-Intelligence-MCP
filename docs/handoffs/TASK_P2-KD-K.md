---
task_id: P2-KD-K
title: "G8 Honest-Red Deliberate-Break Proof"
owner: qa
phase: 2
goal_advanced: ["G8"]
date_created: 2026-05-24
blocked_by: P2-KD-J
blocks: P2-KD-L
est_hours: 0.5
ac_count: 5
---

# TASK_P2-KD-K: G8 Honest-Red Deliberate-Break Proof

**Owner:** qa  
**Blocked by:** P2-KD-J DONE (dashboard finalized — honest-red test requires a working dashboard with all 5 primitive cards + module + microservice panels)  
**Blocks:** P2-KD-L  
**Est:** 30m  
**ACs:** 5

---

## Background

G8 honest-red contract. Two tests prove the dashboard is NOT a false-green machine:
- **Test A (deliberately corrupted scenario)** → bun sandbox RED + dashboard shows non-green for affected card
- **Test B (golden scenario after revert)** → bun sandbox GREEN + dashboard shows green + no false greens on NOT-RUN items

Both scenario edits are LOCAL-ONLY, reverted before any commit. `git status` must be clean after all tests.

---

## Acceptance Criteria

### AC-1 — Test A: Sandbox RED on Corrupted Scenario

**Procedure:**

1. Edit one golden scenario JSON file (e.g., `docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json`).
   Change one expected output field to a wrong value (e.g., flip the expected hexagram number to a different value).

2. Run sandbox primitive tier:
   ```bash
   cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
   ```
   Must exit **non-zero** with ≥1 **FAIL** for the corrupted primitive (e.g., `hexagram-resolver`).

3. Open `apps/kinh-dich-service/dashboard/index.html` in browser via `file://` — the affected primitive card must show **FAIL/RED**.
   Capture terminal output + screenshot showing dashboard state.

4. Revert the JSON edit:
   ```bash
   git checkout docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json
   ```

**Verdict:** Sandbox exits non-zero AND dashboard shows non-green for the affected card.

**Evidence:** Paste full ESLint output showing FAIL, then describe dashboard state (card color, scenario count).

---

### AC-2 — Test B: Sandbox GREEN after Revert

**Procedure:**

1. Confirm git status clean (no staged or uncommitted scenario changes):
   ```bash
   git status --short | grep "scenarios/kinh-dich"
   ```
   Must return empty.

2. Run sandbox (all tiers):
   ```bash
   cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
   ```
   Must exit **0** with all scenarios **PASS**.

3. Open dashboard — all 5 primitive cards + module card + microservice card must show **GREEN**.
   Verify NO false greens on NOT-RUN items (only GREEN where sandbox-run with PASS).

**Verdict:** Sandbox exits 0 AND dashboard shows green for all cards.

**Evidence:** Paste sandbox summary (17/17 scenarios PASS), then describe dashboard state (all cards green).

---

### AC-3 — 2 Additional Known-Bad Runs

**Procedure:**

QA runs 2 MORE deliberately corrupted scenario invocations using different primitives:

1. **Run 2a:** Corrupt `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json` (e.g., flip expected state mapping).
   ```bash
   cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
   ```
   Must exit non-zero. Revert:
   ```bash
   git checkout docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json
   ```

2. **Run 2b:** Corrupt `docs/scenarios/kinh-dich/primitives/hao-encoder-golden.json` (e.g., flip expected score).
   ```bash
   cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
   ```
   Must exit non-zero. Revert:
   ```bash
   git checkout docs/scenarios/kinh-dich/primitives/hao-encoder-golden.json
   ```

**Verdict:** Both runs exit non-zero.

**Evidence:** Paste exit codes (1, non-zero) for both 2a and 2b.

---

### AC-4 — Reverted Files Clean

**Procedure:**

After all corruption + revert cycles:

```bash
git status --short | grep "scenarios/kinh-dich"
```

Must return **empty** (no staged or unstaged changes to any scenario file).

**Verdict:** No corruptions remain. All test edits reverted.

**Evidence:** Paste git status output confirming zero changes to scenario files.

---

### AC-5 — G8 Evidence Compiled

**Procedure:**

QA writes two evidence files:

1. **Handoff evidence:** `docs/handoffs/TASK_P2-KD-K-g8-evidence.md` containing:
   - §Test A evidence: corrupted scenario exit code + dashboard state
   - §Test B evidence: reverted scenario exit code + dashboard state
   - §AC-3 evidence: exit codes for ngu-hanh-classifier and hao-encoder corruption runs
   - G8 assessment: dashboard is honest (RED on corrupted, GREEN on golden, no false greens)

2. **Signal:** `docs/signals/qa-kd-P2-KD-K-g8-done-<UTC>.json` with fields:
   - `task_id: P2-KD-K`
   - `timestamp: <ISO>`
   - `test_a_result: PASS` (sandbox RED + dashboard RED)
   - `test_b_result: PASS` (sandbox GREEN + dashboard GREEN)
   - `ac3_runs: 2 (ngu-hanh-classifier + hao-encoder)`
   - `g8_ready_to_grade: YES`
   - `next_actor: pm`
   - `next_action: verify P2-KD-K (G8 honest-red), then sequence P2-KD-L (G9 PO Playwright)`

**Verdict:** Evidence files written and committed; signal emitted.

**Evidence:** List the two files.

---

## Files to Touch

- `docs/handoffs/TASK_P2-KD-K-g8-evidence.md` (CREATE — evidence log)
- `docs/scenarios/kinh-dich/primitives/*.json` (MODIFY locally only, reverted — NO commits)
- `docs/signals/qa-kd-P2-KD-K-g8-done-<UTC>.json` (CREATE — signal emit)

---

## Commit Pattern

**Handoff evidence + signal:** Commit the evidence file and signal together.

```
chore(qa/kinh-dich): P2-KD-K — G8 honest-red deliberate-break proof complete (sandbox RED/GREEN validated, dashboard honest)
```

---

## G-Goal Posture

**NO goal flips.** §4.5 SSOT untouched. G8 evidence is complete but PO flips G8 only at 12/12 terminal Phase-3 close.

---

## Notes

- **Test scope:** G8 proves dashboard accurately reflects sandbox status — no false greens, RED on failures
- **Reverted edits:** All scenario JSON changes are LOCAL-ONLY test artifacts, reverted before commit. Zero scenario files committed.
- **G12 integrity:** G12 DoD gate (17/17 sandbox PASS) must remain intact after all reverts — no regressions introduced by test edits
- **Phase-2 §4.5:** Never flip decisionMatrix or goalsEarned. All goal flips happen atomically in Phase-3 close by PO only
