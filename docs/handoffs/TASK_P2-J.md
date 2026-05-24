---
task_id: "P2-J"
phase: "2"
pilot: "stock-price"
authored_by: "pm"
authored_at: "2026-05-24T01:43:30Z"
previous_task: "P2-I (DONE 2026-05-24T01:43:02Z, dashboard finalization + SI-2 fleet index genesis)"
next_task: "P2-K (G9 PO Playwright Path B)"

g8_goal_title: "Red/green status is honest"
g8_goal_status: "EARNED-PENDING (Phase 1 — G8 mechanism built in P1-E edit-rerun handler; P2-J re-confirms via deliberate-break proof)"
g8_ownership: "QA deliberate-break test"

owner: "qa"
wip_policy: "WIP=1 sequential; PM dispatches single task; QA executes all ACs before DONE signal"

---

# P2-J — G8 Honest-Red Deliberate-Break Proof

**Pilot:** stock-price (fleet pilot 3)  
**Phase:** 2  
**Blocked by:** P2-I DONE (dashboard finalized — honest-red test requires a working dashboard to show RED when scenarios are corrupted)  
**Blocks:** P2-K  
**Sprint deadline:** 2026-07-04  

---

## Goal Background

**G8 — "Red/green status is honest"**

The stock-price dashboard (`apps/stock-price/dashboard/index.html`) was built in Phase 1 with an edit-rerun handler that refreshes scenario results. G8 proves the dashboard is **not a false-green machine** — when a scenario is deliberately corrupted, the dashboard shows RED; when reverted to golden, it shows GREEN.

This task executes a **deliberate-break proof**: two tests that demonstrate the dashboard's status honestly reflects the sandbox result state.

---

## Charter Context

From `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` §P2-J:

> **G8 honest-red contract.** Two tests prove the dashboard is not a false-green machine:
> - Test A (deliberately corrupted scenario) → dashboard shows RED / non-green status
> - Test B (golden scenario after revert) → dashboard shows GREEN

---

## Acceptance Criteria (5 total)

### AC-1 — Test A: Corrupted Scenario Triggers RED Dashboard State

**Assertion:**
1. Edit one golden scenario JSON file (e.g., `docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json`).
2. Change one expected output field to an intentionally wrong value (e.g., flip the expected winning tier source or change a numeric threshold).
3. Run sandbox:
   ```bash
   cd apps/stock-price && go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
   ```
4. Must exit **non-zero** with ≥1 FAIL for the affected primitive (e.g., `tier-fallback-selector`).
5. Open `apps/stock-price/dashboard/index.html` in a browser — the affected card (e.g., `tier-fallback-selector`) must show RED / FAIL status (or honest non-green state).
6. Capture terminal output + dashboard screenshot/state description.
7. **Immediately revert** the JSON edit:
   ```bash
   git checkout docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json
   ```

**Expected outcome:**
- Sandbox exits non-zero (non-zero exit code visible in terminal)
- Dashboard card shows RED / FAIL / non-green for the corrupted scenario
- Revert completes cleanly

**Rationale:** Proves the dashboard reflects real sandbox failures — not a false-green wall.

**Failure mode:** If dashboard still shows green after corrupting a scenario, the status display is dishonest — STOP and investigate.

**Paste to evidence section:** Terminal output (showing sandbox exit non-zero + FAIL count) + dashboard state description (which card turned RED, how).

---

### AC-2 — Test B: Golden Scenario Triggers GREEN Dashboard State (After Revert)

**Assertion:**
1. After reverting the Test A corruption, run sandbox with all golden scenarios:
   ```bash
   cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
   ```
2. Must exit **0** with all scenarios PASS.
3. Open dashboard — all cards must show GREEN (no RED, no NOT-RUN false greens).
4. Verify: dashboard state is honest GREEN (all passed scenarios visible).

**Expected outcome:**
- Sandbox exits 0
- Dashboard all-green (all cards PASS)
- No false greens on cold-open items

**Rationale:** Proves revert restores dashboard to known-good state. Completes the honest red ↔ green toggle proof.

**Failure mode:** If sandbox passes but dashboard still shows RED, or if NOT-RUN cards appear green, the status mechanism is broken — STOP and investigate.

**Paste to evidence section:** Terminal output (sandbox exit 0 + all PASS count) + dashboard state description (all cards green, counts match sandbox results).

---

### AC-3 — 2 Additional Known-Bad Runs (Different Primitives)

**Assertion:**

QA runs two more deliberately corrupted scenario invocations using **different primitives** than Test A:

1. **Run 1:** Edit `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json` (or another golden file). Change one expected field. Run sandbox (`-tier=primitive`). Must exit non-zero.
2. **Run 2:** Edit `docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json` (or another golden file). Change one expected field. Run sandbox. Must exit non-zero.

Both runs do NOT require full dashboard verification — exit code proof is sufficient. QA reverts each edit immediately.

**Expected outcome:**
- Run 1 sandbox exits non-zero
- Run 2 sandbox exits non-zero
- Both reverts succeed (`git checkout`)

**Rationale:** Proves the corruption-detection mechanism is general (not a fluke on one scenario). Two trials demonstrate the fence is reliable across multiple primitives.

**Failure mode:** If any run exits 0 (sandbox passes unexpectedly), the test is invalid — investigate why the corruption did not trigger a failure.

**Paste to evidence section:**
```
Run 1 (price-quote-normalizer or other): exit <code> (must be non-zero)
Run 2 (price-staleness-classifier or other): exit <code> (must be non-zero)
```

---

### AC-4 — Reverted Files Clean

**Assertion:**
```bash
git status --short | grep "scenarios"
```

**Expected outcome:** Returns empty (zero matches — no staged or unstaged changes to any scenario file).

**Rationale:** All test mutations were reverted before DONE. No corrupted scenario is left in the repo.

**Failure mode:** If any scenario file shows as modified or untracked, revert was incomplete — STOP.

---

### AC-5 — G8 Evidence Compiled

**Assertion:**
QA writes `docs/handoffs/TASK_P2-J-sp-g8-evidence.md` with all AC evidence pasted inline (terminal outputs, dashboard descriptions, revert confirmations). QA emits `docs/signals/qa-sp-P2-J-g8-done-<UTC>.json`.

**Evidence file template:**
```markdown
# P2-J — G8 Honest-Red Evidence

## AC-1 (Test A — Corrupted Scenario)
Terminal output (sandbox exit non-zero + FAIL):
[paste]

Dashboard state (card showing RED):
[description]

## AC-2 (Test B — Golden Revert)
Terminal output (sandbox exit 0 + all PASS):
[paste]

Dashboard state (all cards GREEN):
[description]

## AC-3 (Run 1 — Different Primitive)
Exit code: [non-zero]
Reverted: [YES]

## AC-3 (Run 2 — Different Primitive)
Exit code: [non-zero]
Reverted: [YES]

## AC-4 (Clean Status)
`git status --short | grep scenarios` output: [empty]

## Summary
All 5 ACs PASS. G8 honest-red contract proven.
```

**Signal file (NDJSON-compatible JSON):**
```json
{
  "signal": "qa-sp-P2-J-g8-done",
  "task": "P2-J",
  "pilot": "stock-price",
  "phase": "2",
  "emitted_by": "qa",
  "emitted_at": "<UTC-timestamp>",
  "ac_verdicts": {
    "AC-1": "PASS (Test A corrupted scenario → dashboard RED)",
    "AC-2": "PASS (Test B golden → dashboard GREEN)",
    "AC-3": "PASS (2 additional runs both exit non-zero)",
    "AC-4": "PASS (git status clean — no scenario mutations)",
    "AC-5": "PASS (evidence compiled)"
  },
  "g8_honest_red_proven": true,
  "next_actor": "pm",
  "next_action": "verify P2-J (G8 honest-red proof), then sequence P2-K (G9 PO Playwright)"
}
```

**Rationale:** G8 evidence complete. Ready for PO Playwright verification (P2-K).

**Failure mode:** If any AC fails, QA must debug and re-run the test suite.

---

## Implementation Notes

**Test A scenario target candidates:**
- `docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json` (good target — clear expected tier output)
- `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json`
- `docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json`

**Corruption patterns:**
- Flip a boolean expected field (e.g., `FRESH` ↔ `STALE`)
- Change a numeric comparison (e.g., `freshThreshold: 60` → `99`)
- Flip a string enum (e.g., expected tier: `tier-1` → `tier-2`)

**Dashboard verification method:**
- Cold-open the HTML file in a browser (local `file://` path — no network required)
- Visual inspection: look for color/status badge changes (RED vs GREEN)
- Browser developer tools console: verify no JavaScript errors

**Sandbox invocation:**
All QA invocations use the stock-price sandbox runner:
```bash
cd apps/stock-price && go run ./cmd/sandbox -tier=<primitive|module|all> -module=stock-price -scenario=all
```

---

## G-Goal Posture

**NO goal flips.** Per Charter §4.5:
- `goalsEarned` stays 0 throughout Phase 2
- `decisionMatrix` (speed, trust, scale) stays all-TBD
- Goal state changes are PO-only, atomic with 12/12 terminal close in Phase 3

This task **re-confirms G8** (EARNED-PENDING from Phase 1) via deliberate-break proof but does NOT flip G8 status to YES. PO flips all G-goals together at Phase 3 close.

---

## Constraints & Discipline

| Constraint | Rule |
|-----------|------|
| **WIP=1** | QA completes P2-J before PM dispatches P2-K |
| **No branches** | All work on `main` |
| **Scenario files reverted** | All test mutations must be reverted before DONE; `git status --short` shows clean |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD |
| **SSOT frozen** | PM-owned `docs/data/pilot-status-stock-price.json` not modified by QA |
| **Zone isolation** | QA does not modify `apps/kinh-dich-service/`, `apps/technical-analysis/`, `apps/macro-indicators/` |
| **No destructive git** | No `--force`, no `--amend`, no `--no-verify`, no `git push` |

---

## Next Task

**P2-K** — G9 PO Playwright Path B

Blocked by: P2-J DONE (dashboard honest-red proven — trust contract can now be verified by PO).

---

## References

- **Phase 2 Task Plan:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` §P2-J
- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` (§G8)
- **SSOT:** `docs/data/pilot-status-stock-price.json`
- **Dashboard:** `apps/stock-price/dashboard/index.html`
- **Scenario files:** `docs/scenarios/stock-price/primitives/` (golden JSON files)
- **G8 calibration:** Charter §Goal G8 — defines the honest-red/honest-green contract

---

**Authored by:** pm  
**Authored at:** 2026-05-24T01:43:30Z  
**Charter §4.5 binding:** NO goal flips in Phase 2. PO flips goals only at 12/12 terminal close.
