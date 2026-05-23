---
task_id: P2-F1
title: "G8 Honest-Red Proof (Test A Corrupted + Test B Golden)"
owner_agent: qa
goal_linkage:
  - G8 (Red/green status is honest)
pre_conditions:
  - P2-G1 DONE (all 3 goals G1/G2/G3 terminal verified, 6/6 ACs PASS)
  - Dashboard live at apps/macro-indicators/dashboard/index.html
  - Sandbox operational: go run ./cmd/sandbox -tier=all -scenario=all exits 0
  - Anchor 1776df8e held as ancestor
critical_path: true
estimate_hours: 0.5
ac_count: 5
---

# TASK P2-F1 — G8 Honest-Red Proof (Test A Corrupted + Test B Golden)

**Goal advancement:** G8 verification: prove that the dashboard's red/green status is honest — when a scenario is corrupted, the dashboard shows RED; when golden, it shows GREEN. No false greens on corrupted data.

**Background:** P2-G1 and prior tasks created a real macro-indicators service with 6 primitives, 1 module, and 1 microservice all shipping with sandbox tiers and dashboard visualization. G8 requires proof that the dashboard doesn't lie — it correctly reflects actual data validity. This proof has two parts:

1. **Test A (corrupted scenario):** Introduce a deliberate data corruption (e.g., empty indicator name) into a primitive scenario JSON. Verify the sandbox exits non-zero (fails), and the dashboard shows RED for the affected primitive.
2. **Test B (golden scenario):** Confirm that all golden scenarios pass the sandbox and the dashboard shows all-green.

**DDD zone:** `apps/macro-indicators/` (read-mostly; scenario JSON mutations are temporary, always reverted)

---

## Acceptance Criteria

**AC-1: Test A (Corrupted Scenario) — Sandbox fails + Dashboard shows RED**

1. Edit one existing primitive scenario JSON file (e.g., `docs/scenarios/macro-indicators/primitives/macro-investment-clock/macro-investment-clock-golden.json`).
2. Introduce a single data corruption: change one required field to an invalid value:
   - Option 1: set `"indicatorName"` to empty string `""` or null
   - Option 2: set a numeric field to a semantically invalid value (e.g., `"vndUsdRate": -999.0`)
   - Document which field was changed in the evidence section
3. Run sandbox on that single scenario: `cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=docs/scenarios/macro-indicators/primitives/macro-investment-clock/macro-investment-clock-golden.json`
4. Verify exit code is **non-zero** (failure).
5. Verify output contains `FAIL` string or error description identifying the scenario failure.
6. _(Optional but recommended)_ Open `apps/macro-indicators/dashboard/index.html` in a browser (file:// protocol). Locate the macro-investment-clock card. Verify the card shows a **RED or FAIL status**, not green.
7. Revert the JSON edit: `git checkout docs/scenarios/macro-indicators/primitives/macro-investment-clock/macro-investment-clock-golden.json`
8. Confirm `git status` is clean (no staged or unstaged changes to scenario files).
9. Re-run sandbox on the reverted file: `go run ./cmd/sandbox -tier=primitive -scenario=docs/scenarios/macro-indicators/primitives/macro-investment-clock/macro-investment-clock-golden.json` — must exit 0 (golden scenario passes again).

**Proof required:**
- Paste sandbox output showing exit non-zero + FAIL message from step 4-5
- Dashboard screenshot or terminal description showing RED for affected primitive (from step 6)
- Paste sandbox output showing exit 0 after revert (from step 9)
- Confirm `git status` clean before submission

---

**AC-2: Test B (Golden Scenarios) — Sandbox all green + Dashboard shows all GREEN**

1. Run full sandbox suite: `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all`
2. Verify exit code is **0** (all tests pass).
3. Verify output shows `total=20 pass=20 fail=0 status=OK` (or higher numbers if new scenarios added).
4. _(Optional but recommended)_ Open `apps/macro-indicators/dashboard/index.html` in browser. Verify all primitive cards (6), module card (1), and microservice card (1) show **GREEN or PASS status**. No red cards visible. No false greens on NOT-RUN items.

**Proof required:**
- Paste last 5 lines of sandbox output showing `total=20 pass=20 fail=0 status=OK` and exit 0
- Dashboard screenshot or terminal description of all-green state (optional)

---

**AC-3: Test A Variant — Repeat Corruption on 2 Different Primitives (G8 Robustness)**

To ensure the honest-red proof generalizes beyond one scenario, test at least 2 different primitive corruption patterns:

1. First corruption (already demonstrated above): macro-investment-clock field mutation.
2. Second corruption: pick a different primitive (e.g., macro-carry-trade-signal) and corrupt one of its scenario files (e.g., `macro-carry-trade-signal-golden.json`). Possible mutations:
   - Set `"carrySpread"` to NaN, Infinity, or extreme value (e.g., 999.0)
   - Set `"vndDepositRate"` to negative value
   - Remove a required field entirely (e.g., set it to null)
3. Run sandbox on corrupted scenario 2: `go run ./cmd/sandbox -tier=primitive -scenario=docs/scenarios/macro-indicators/primitives/macro-carry-trade-signal/macro-carry-trade-signal-golden.json`
4. Verify exit non-zero + FAIL output
5. _(Optional)_ Open dashboard, verify macro-carry-trade-signal card is RED
6. Revert corruption 2, confirm sandbox green again on that primitive

**Proof required:**
- Paste sandbox exit non-zero + FAIL for corruption 2
- Paste sandbox exit 0 after revert 2
- Confirm `git status` clean

---

**AC-4: No Residual Mutations**

Before submission, ensure no scenario JSON files have uncommitted mutations:
```bash
git diff docs/scenarios/macro-indicators/
git status
```
Both must return zero changes. Any scenario mutation used for testing must be reverted.

**Proof required:**
- Paste output of `git diff docs/scenarios/macro-indicators/` (must be empty)
- Paste output of `git status` (no unstaged changes on scenario files)

---

**AC-5: G8 Grade Summary**

Write a brief G8 evidence summary to the evidence section:
- AC-1 corrupted scenario(s) and exit codes
- AC-2 golden suite all-green
- AC-3 generalization across multiple primitives
- Conclusion: Dashboard status is honest (RED on failure, GREEN on success). No false positives.

---

## Hard Gates (QA must verify all before PASS)

1. **Anchor held:** `git merge-base --is-ancestor 1776df8e HEAD && echo 0` (must return 0 pre+post)
2. **R-1 defensive:** No intentional randomization mutations. Corruptions are data-only, not code.
3. **No code changes:** Mutations are ONLY to scenario JSON files, and all are REVERTED before DONE. Zero source code changes to pkg/, cmd/, or interface/.
4. **Dashboard reachable:** `file://apps/macro-indicators/dashboard/index.html` opens (no network required).
5. **Sandbox operational:** `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -scenario=all` exits 0 at submission time.

---

## Out-of-Scope (QA must NOT modify)

- Any `.go` source files (read-only inspection only)
- `docs/data/pilot-status-macro-indicators.json` (PM-owned SSOT)
- `docs/handoffs/` (PM-owned)
- Charter or architecture briefs
- Other applications (`apps/technical-analysis/`, `apps/mcp-server/src/` source)

---

## Acceptance Evidence to Record

In the completion signal, provide:

1. **AC-1 output:** 
   - Corrupted scenario file path and field mutation description
   - Sandbox exit non-zero + FAIL message output (paste 3-5 lines)
   - _(Optional)_ Dashboard screenshot or description of RED card for affected primitive
   - Sandbox re-run output post-revert showing exit 0

2. **AC-2 output:** 
   - Last 5 lines of `go run ./cmd/sandbox -tier=all ...` showing `total=20 pass=20 fail=0 status=OK` exit 0
   - _(Optional)_ Dashboard screenshot or description of all-green state

3. **AC-3 output:**
   - Second primitive name and corruption pattern
   - Sandbox exit non-zero + FAIL for corruption 2
   - Sandbox exit 0 post-revert 2
   - Confirm generalization: "Tested macro-investment-clock + macro-carry-trade-signal. Both honest-red proven."

4. **AC-4 output:** 
   - Paste of `git diff docs/scenarios/macro-indicators/` (empty)
   - Paste of `git status` (no scenario mutations)

5. **AC-5 output:** 
   - G8 evidence summary: "Dashboard shows RED on {N} corrupted scenarios, GREEN on all golden scenarios. Honest-red proof PASS. G8 ready for flip YES."

6. **All hard gates results:** 
   - Anchor 1776df8e held (exit 0 both pre+post)
   - No code mutations (data-only)
   - Dashboard file:// opens
   - Sandbox exits 0 at submission

---

## Signal Output (QA Responsibility)

**On PASS:** Create signal file `docs/signals/qa-p2-f1-macro-GREEN-<UTC>.json`

**Required fields:**
```json
{
  "task_id": "P2-F1",
  "cycle": "c282-cycle-50",
  "verdict": "GREEN",
  "timestamp_utc": "<ISO8601>",
  "qa_agent": "qa",
  "qa_method": "honest-red dashboard proof — Test A corrupted scenarios exit non-zero + RED on dashboard, Test B golden scenarios exit 0 + all GREEN on dashboard",
  "ac_results": {
    "ac1": { "verdict": "PASS", "evidence": "<corrupted scenario + exit nonzero + dashboard RED>" },
    "ac2": { "verdict": "PASS", "evidence": "<golden suite all-green exit 0>" },
    "ac3": { "verdict": "PASS", "evidence": "<2+ primitives tested for generalization>" },
    "ac4": { "verdict": "PASS", "evidence": "<git diff + git status clean>" },
    "ac5": { "verdict": "PASS", "evidence": "<G8 summary ready for flip YES>" }
  },
  "hard_gates": {
    "anchor_held": { "verdict": "PASS", "exit_code": 0 },
    "r1_defensive": { "verdict": "PASS", "note": "Data-only mutations, no code randomization" },
    "no_code_changes": { "verdict": "PASS", "note": "Only scenario JSON mutations, all reverted" },
    "dashboard_reachable": { "verdict": "PASS", "note": "file:// protocol works" },
    "sandbox_operational": { "verdict": "PASS", "exit_code": 0, "total": 20, "pass": 20, "fail": 0 }
  },
  "g8_terminal_ready": true,
  "g8_recommendation": "Dashboard honestly reflects data validity. Corrupted scenarios show RED, golden scenarios show all-GREEN. G8 ready for flip YES.",
  "notes": "QA verified: dashboard shows RED for {N} intentional data corruptions (exit non-zero, FAIL in output), GREEN for all golden scenarios (exit 0), no false positives. Honest-red proof PASS. G8 terminal complete."
}
```

**On FAIL:** Create signal file `docs/signals/qa-p2-f1-macro-RED-<UTC>.json` with specific failed AC.

---

## Commit (QA)

**Commit subject:**
```
chore(qa): P2-F1 macro-indicators G8 honest-red proof — GREEN
```

**Files to stage explicitly (L84):**
- `docs/signals/qa-p2-f1-macro-GREEN-<UTC>.json`

**NO `git add -A`, NO `git add .`, NO `--force`, NO `--no-verify`, NO `--no-gpg-sign`, NO `git push`.**

---

## Reference Documents

- Charter: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` §G8
- Phase 2 task plan: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` §P2-F1
- P2-G1 handoff (prerequisite): `docs/handoffs/TASK_P2-G1-macro.md`
- P2-G1 qa signal (prerequisite): `docs/signals/qa-p2-g1-macro-GREEN-20260523T163600Z.json`
- SSOT: `docs/data/pilot-status-macro-indicators.json` (PM to update post-QA PASS)

---

## Next Task (Unblocked by This)

After P2-F1 PASS signal lands and PM cycles-50 atomic close commits:

**P2-C1:** G9 PO Playwright Short-Circuit (Path B default) — 30m estimate
- Blocked by: P2-F1 PASS
- Owner: po
- Playwright headless verification of dashboard rendering (all 3 panels visible, no console errors)

---

## Charter Reference

**Goal G8 (Red/green status is honest):** Dashboard displays fail/not-run/pass status that accurately reflects scenario execution. Corrupted scenarios trigger dashboard red/fail status, not false greens. Test A (corrupted scenario inputs) produces fail status; Test B (golden scenario inputs) produces pass status. Verification method: manually corrupt one scenario JSON (e.g., invalid field value), run sandbox with that scenario, confirm exit non-zero and dashboard shows fail/red. Then run golden suite, confirm all scenarios pass and dashboard all-green. No false positives.
