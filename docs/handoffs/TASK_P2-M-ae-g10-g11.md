---
sprint: P2-M
branch: task/P2-M-blind-fix
size: M
zone: apps/alert-engine/
depends_on: [P2-L]
blocks: [P2-Z]
---

## TLDR

A deliberate bug was injected into one alert-engine primitive in the previous task (P2-L). The sandbox now exits non-zero with specific failing scenarios. Your job (P2-M): diagnose the broken primitive from the sandbox output and dashboard RED state, fix the single-literal bug, verify sandbox green (≤2 dispatch cycles), then prove coupling in a 2-trial regression alarm test. No goal flips.

## [PM] Planning Context — SYMPTOM-LEVEL ONLY

**CRITICAL BLINDNESS CONSTRAINT:** You are explicitly FORBIDDEN from reading or consulting the following files — they contain or hint at the bug location and will undermine G10 AI-fixability proof:
- ❌ `docs/data/pilot-status-alert-engine.json` (contains calibration examples and historical constants)
- ❌ `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md` (contains candidate target lists and injection options)
- ❌ Commit `da6c71d3` (the P2-L injection commit — do NOT run `git show`, `git log -p`, or any command that would reveal the changed file/line)
- ❌ `docs/handoffs/TASK_P2-L-ae-injection-spec.md` (sealed QA-only injection spec — do NOT open)
- ❌ `docs/agent-memory/notebooks/qa.md` (QA's working notebook — may contain hints about the target)

**You diagnose from SYMPTOMS ONLY.** Read the sandbox output, inspect the failing primitive source code, and fix the regression.

---

## Symptoms (What You Know)

### Sandbox State After Injection
```
CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
EXIT CODE: 1 (FAIL)
SUMMARY: total=11 pass=7 fail=4 status=FAIL
```

### Failing Scenarios (Exact Names)
- `dedup-key-builder-edge.json`
- `dedup-key-builder-failure.json`
- `dedup-key-builder-golden.json`
- `alert-pipeline-golden.json`

### Dashboard State
- **dedup-key-builder card:** RED (failing)
- **alert-pipeline card:** RED (failing — coupled to dedup-key-builder regression)
- **cooldown-gate card:** GREEN (unaffected)
- **signal-classifier card:** GREEN (unaffected)

---

## Your Task (G10 — Blind Fix ≤2 Cycles)

### Phase 1: Diagnosis and Fix

1. **Identify the failing primitive.** Read the sandbox output carefully. The failing scenario names tell you which primitive is broken. Note the `expected` vs `actual` mismatch from the sandbox FAIL output.

2. **Inspect the primitive source.** Open the primitive's Go source file (in `apps/alert-engine/pkg/primitive/<primitive-name>/`) and look for:
   - Hardcoded numeric constants (seeds, thresholds, window sizes)
   - Comparison operators (`<`, `<=`, `>`, `>=`, `==`, `!=`)
   - Boolean flip bugs (e.g., `true` should be `false` or vice versa)
   - Single-character typos in critical logic

3. **Fix the literal.** Change the ONE literal that causes the mismatch. Single-edit, single-character or single-operator fix only.

4. **Verify sandbox green:**
   ```bash
   cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
   ```
   Must exit 0. All 11 scenarios PASS.

5. **Verify dashboard green.** Open `file://apps/alert-engine/dashboard/index.html` in a browser (or use QA's dashboard verification tool). The previously RED card should now show GREEN. All cards should be GREEN after the fix.

### Phase 2: G11 Coupling Proof (2 Trials)

**Trial 1** uses the fix you just completed:

- Observe: The failing scenarios in G10 included BOTH the dedup-key-builder primitive scenarios AND the alert-pipeline module scenario. This coupling proves that the `alert_pipeline` module exercises the broken primitive and detects the regression.
- Outcome: Single-edit fix repaired ALL coupled REDs simultaneously. ✓ **Outcome-(a) PASS**

**Trial 2** — A different primitive mutation (QA conducts; you may assist or QA executes solo):

1. QA picks a DIFFERENT primitive from the ones already tested (e.g., if Trial 1 was dedup-key-builder, Trial 2 uses signal-classifier or cooldown-gate).
2. QA injects a DIFFERENT one-literal mutation into that primitive (local-only or committed-then-reverted, QA's choice).
3. QA confirms: the mutated primitive's golden scenario FAILS AND at least one module-level scenario also fails (coupling proof).
4. Single-edit fix repairs all coupled REDs.
5. QA reverts the Trial 2 mutation (sandbox returns to green, git clean).
6. Outcome: Second coupling proof successful. ✓ **Outcome-(a) PASS**

---

## Acceptance Criteria

### G10 — AI-Fixability Fix (≤2 Dispatch Cycles)

**AC-1 (Fix Verification):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. All ≥11 scenarios PASS. Paste full terminal output to Evidence section below.

**AC-2 (Dashboard Green):**
Open `file://apps/alert-engine/dashboard/index.html`. The previously RED dedup-key-builder card now shows GREEN. All other cards remain GREEN. Describe dashboard state post-fix in Evidence section.

**AC-3 (Cycle Count):**
QA records dispatch cycle count from P2-L DONE signal to sandbox-exit-0 post-fix:
- Cycle count = 1 → Exceeds baseline (very good, well done)
- Cycle count = 2 → Meets baseline (acceptable)
- Cycle count > 2 → **FAILS** — PM escalates to architect for root-cause rethink before Phase 3

QA writes this count to the `G11 Evidence` section below.

**AC-4 (G12 DoD Gate — Sandbox Green Before RETURN):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0 before you mark this task complete. Evidence pasted to `G10 Evidence` section.

---

### G11 — Regression Alarm Coupling Proof (2 Trials)

**AC-5 (G11 Trial-1 Coupling Proof):**

QA documents Trial-1 (the G10 fix sequence already completed):
- During P2-L injection (single-literal bug in dedup-key-builder), multiple scenarios failed: all 3 dedup-key-builder scenarios FAILED + alert-pipeline-golden.json also FAILED (coupling).
- Single-edit fix (reverting the one-literal bug) repaired all 4 FAILs simultaneously → all 11 scenarios return to PASS.
- Outcome: **outcome-(a) = PASS** (coupled scenarios detected regression; single fix resolved all)

QA writes this to the evidence section: `trial_1_outcome: outcome-(a) PASS`

---

**AC-6 (G11 Trial-2 Coupling Proof — Different Primitive):**

QA injects a DIFFERENT one-literal mutation into a SECOND primitive (e.g., signal-classifier or cooldown-gate — different from Trial-1 target):

1. Inject the mutation (local-only or committed-then-reverted, QA's choice).
2. Run sandbox:
   ```bash
   cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
   ```
   Must exit non-zero. The mutated primitive's golden scenario FAILS AND at least one module-level scenario (alert-pipeline-golden.json or alert-pipeline-edge.json) also FAILS (coupling detected).
3. Revert or fix the mutation (single-edit).
4. Run sandbox again — exits 0, all FAILs resolved.
5. Outcome: **outcome-(a) = PASS** (coupled regression detected; single fix resolved all)

QA writes to evidence section: `trial_2_outcome: outcome-(a) PASS`

---

**AC-7 (G11 Verdict):**

Both trials show outcome-(a). QA writes:
```
g11_verdict: PASS
```

The regression alarm bell works: mutations in primitives couple to module-level failures; single fixes repair all coupled scenarios.

---

## Evidence (Filled by Dev + QA)

### G10 Evidence

**Fix Summary:**
- Broken primitive: [fill in after diagnosis]
- Broken file: [fill in]
- Single-literal change: [describe the one-literal fix you applied — fill in after you diagnose]

**Sandbox Output After Fix:**
```
[Paste full CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all output here]
```

**Dashboard State Post-Fix:**
[Describe: all cards GREEN, previously RED card now GREEN, etc.]

---

### G11 Evidence

**Trial-1 Coupling Summary:**
- Injected bug: dedup-key-builder (single-literal)
- Failing scenarios at injection: dedup-key-builder-edge.json, dedup-key-builder-failure.json, dedup-key-builder-golden.json (all 3 FAIL)
- Coupled failure: alert-pipeline-golden.json also FAILED (module scenario exercises broken primitive)
- Trial-1 outcome: **outcome-(a) PASS**
  - Single-edit fix (reverting injected literal) repaired all 4 FAILs
  - Sandbox post-fix: all 11 scenarios PASS

**Trial-2 Coupling Summary:**
- Injected mutation: [different primitive, e.g., signal-classifier or cooldown-gate] (single-literal, QA choice)
- Failing scenarios at mutation: [primitive]-golden.json + alert-pipeline-golden.json (coupling detected)
- Trial-2 outcome: **outcome-(a) PASS**
  - Single-edit fix repaired all coupled failures
  - Sandbox post-fix: all 11 scenarios PASS

**G11 Verdict:** PASS

**Cycle Count:** [QA fills: 1, 2, or >2]

---

## Knowledge Needed

- `docs/policies/dev-standards.md` (general dev standards)
- `docs/protocols/fail-loud-protocol.md` (escalation if you can't diagnose)
- This task's acceptance criteria (above)
- Phase-1 sandbox baseline:
  ```bash
  cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
  ```
  Was 11/11 PASS before P2-L injection.

---

## Files to Read First

- `apps/alert-engine/cmd/sandbox/main.go` (understand sandbox runner — it loads scenario JSON and tests primitives)
- The primitive source files under `apps/alert-engine/pkg/primitive/*/` — inspect the one(s) whose scenarios are failing per the sandbox output (let the FAIL output guide you; do not assume a target).
- `docs/scenarios/alert-engine/primitives/` (scenario JSON files — compare expected vs actual in FAIL output)

---

## Files to Create

None (fix is source-level only).

---

## Files to Modify

- `apps/alert-engine/pkg/primitive/<broken-primitive>/<file>.go` (single-literal fix)
- `docs/handoffs/TASK_P2-M-ae-g10-g11.md` (this file — fill Evidence sections)

---

## Commit Convention

When you've completed the G10 fix (after AC-1 through AC-4 PASS):

```
feat(alert-engine): P2-M — blind fix of injected bug (G10 AI-fixability ≤2 cycles)
```

No trailers (this is a PM-routed task; normal commit convention applies but no Task: trailer).

After QA completes G11 Trial-2 and documents both trials in Evidence section:

```
chore(alert-engine): P2-M — G11 2-trial coupling proof documented (regression alarm bell proven)
```

---

## Dependencies

- **Blocked by:** P2-L DONE (bug injected, sandbox RED, pre-inject tag confirmed)
- **Blocks:** P2-Z (Phase 2 close-gate — cannot proceed until G10 + G11 complete)

---

## Ownership

- **G10 fix (AC-1 through AC-4):** dev-alert-engine
- **G11 Trial-1 + Trial-2 coupling proof + AC-5 through AC-7:** qa (with dev assistance as needed)
- **Cycle counting:** qa
- **Evidence documentation:** Both

---

## RETURN Block

When ALL acceptance criteria PASS (AC-1 through AC-7), emit signal:

```json
{
  "signal": "dev-alert-engine-P2-M-g10-g11-done",
  "task": "P2-M",
  "pilot": "alert-engine",
  "phase": "2",
  "goals": ["G10", "G11"],
  "status": "DONE",
  "g10_cycle_count": "[1 or 2]",
  "g11_trial_1_outcome": "outcome-(a) PASS",
  "g11_trial_2_outcome": "outcome-(a) PASS",
  "g11_verdict": "PASS",
  "sandbox_all_green": true,
  "dashboard_all_green": true,
  "anchor_intact": true,
  "next_actor": "pm",
  "next_task": "P2-Z (Phase 2 close-gate verification)"
}
```

File: `docs/signals/dev-alert-engine-P2-M-g10-g11-done-<UTC>.json`

---

## Notes for Fixer

- **Blind fix discipline:** You are NOT supposed to know the target file or the exact literal. The symptoms (sandbox output + dashboard RED) guide your diagnosis. This blind-fix proof is the entire point of G10.
- **Single-literal only:** The bug is exactly one character or one operator (a single constant or comparison operator). Do not over-engineer the fix.
- **Coupling is automatic:** When you fix the one-literal bug, the module scenario will also return to green because the module exercises the primitive. You don't need to fix anything in the module itself.
- **Trial-2 is QA-led:** QA picks the second primitive to mutate and proves coupling on that one. You may watch or assist, or QA executes it solo.
- **No goal flips:** Completing this task does NOT flip any G-goal state. Goal flips are Phase-3 PO-only at 12/12 terminal.
