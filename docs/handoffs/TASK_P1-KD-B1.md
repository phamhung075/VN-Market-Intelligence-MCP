---
task_id: "P1-KD-B1"
pilot: "kinh-dich"
phase: "1"
title: "First Primitive: hexagram-resolver + R-FENCE Discovery Gate"
owner: "dev-kinh-dich"
handoff_date: "2026-05-24"
predecessor_task: "P1-A"
successor_task: "P1-B2"
blocker_on: "P1-B2"
estimated_effort: "2 hours"
ac_count: 8
priority: "CRITICAL (R-FENCE discovery gate — blocks Phase 2 G4 enforcement)"
---

# TASK P1-B1 — First Primitive: `hexagram-resolver` + R-FENCE Discovery Gate

## Summary

Extract the **first primitive** `hexagram-resolver` from `apps/kinh-dich-service/src/domain/services.ts` (`resolveHexagram()` at lines 272–281). This task is the **highest-priority** Phase 1 work because:

1. **Standalone pure function** — no cross-primitive dependencies
2. **G4 deliberate-violation target** — chosen for Phase 2 fence enforcement proof (AC-4b)
3. **Unblocks subsequent primitives** — `nuclear-hexagram-computer` depends on it
4. **R-FENCE DISCOVERY GATE** — this task records the exact ESM import style active in the service (critical information for Phase 2 G4 enforcement)

**G12 DoD Gate applies here (streak task #1):** Sandbox must exit 0 all scenarios before task DONE is declared.

---

## Acceptance Criteria

### AC-1: Exported Function Signature

**File:** `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts`

**Requirement:** Function exports `resolveHexagram(signals: number[]): number`

**Details:**
- Accepts a 6-element array of binary values (0 | 1)
- Returns a hexagram number (1–64)
- Throws `Error('Unknown trigram pattern')` on invalid trigram pair
- Includes embedded `TRIGRAM_LINES` (6-line → 3-line trigram codes) and `TRIGRAMS_TO_QUE` (trigram pair → hexagram number) lookup tables
- Zero infrastructure, application, or module imports

**Evidence:** Paste the function signature + first 5 lines of the function body here.

---

### AC-2: Unit Tests with `bun:test`

**File:** `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.test.ts`

**Requirement:** ≥5 test cases covering happy path + edge cases + failure:

1. **Valid 6-signal array, golden case:**
   - Input: `signals=[1,0,1,0,1,0]` (example: Quẻ Thuần Càn trigram pair)
   - Expected: `resolveHexagram(signals)` returns a valid hexagram number (1–64)
   
2. **All-zero signals (Quẻ Thuần Khôn):**
   - Input: `signals=[0,0,0,0,0,0]`
   - Expected: returns hexagram 2 (or whatever is correct for all-khôn)
   
3. **All-one signals (Quẻ Thuần Càn):**
   - Input: `signals=[1,1,1,1,1,1]`
   - Expected: returns hexagram 1 (or whatever is correct for all-càn)
   
4. **Invalid length (failure case):**
   - Input: `signals=[1,0]` (length 2, not 6)
   - Expected: throws `Error` (message TBD)
   
5. **Unknown trigram pattern (failure case):**
   - Input: `signals=[1,1,1,0,0,0]` if this happens to be unmapped
   - Expected: throws `Error('Unknown trigram pattern')`

**Evidence:** Paste `bun test src/primitive/hexagram-resolver/` output showing all tests PASS.

---

### AC-3: Unit Tests Exit 0

**Requirement:**
```bash
cd apps/kinh-dich-service && bun test src/primitive/hexagram-resolver/
```

Must exit with code 0 (all tests pass).

**Evidence:** Paste the full command output, confirming exit 0 and test summary.

---

### AC-4: Sandbox Green (G12 DoD Gate #1)

**Requirement:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```

Must exit 0 with output like:
```
[sandbox] PASS X/X scenarios (hexagram-resolver scenarios all green)
```

**Scenario files created in Phase 1-B1:**
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json`
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-edge.json`
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-failure.json`

**Scenario JSON format example (golden):**
```json
{
  "primitive": "hexagram-resolver",
  "name": "golden-quanh-cahn",
  "input": { "signals": [1, 0, 1, 0, 1, 0] },
  "expected": { "hexagram": 1, "error": null },
  "description": "Standard case: both upper and lower are Càn trigram"
}
```

**Evidence:** Paste the full sandbox output showing exit 0 and PASS count.

---

### AC-5: Zero Cross-Layer Imports (Fence-A Pre-Check)

**Requirement:**
```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/hexagram-resolver/
```

Must return 0 (no matches).

**Details:** The primitive imports ONLY:
- TypeScript/Bun built-ins (if any)
- Internal constants (TRIGRAM_LINES, TRIGRAMS_TO_QUE)
- Optional: domain/models.ts if type definitions live there (domain → domain is Fence-compliant)

**Evidence:** Paste the grep output confirming 0 matches.

---

### AC-6: R-FENCE Discovery Gate — Import Style Audit

**Requirement:** Confirm the exact ESM import style active throughout the service codebase.

**Discovery method:** Read existing files in the service to see which import pattern is used:

```bash
grep -rn "from.*\.js'" apps/kinh-dich-service/src/domain/ \
  apps/kinh-dich-service/src/application/ \
  apps/kinh-dich-service/src/interface/ | head -5
```

**Expected output:** All imports use `.js`-suffixed ESM syntax, e.g.:
```
src/domain/repositories.ts:7: import type { ... } from './models.js';
src/application/usecases.ts:8: import { computeReading } from '../domain/services.js';
src/interface/handlers.ts:9: import type { ReadingUseCase } from '../application/usecases.js';
```

**Record in this handoff:**
- Confirmed import style: `.js`-suffixed ESM (e.g., `from '../../application/dtos.js'`)
- All relative imports throughout domain/application/interface layers follow this pattern
- No ambiguity — the style is uniform and canonical for Bun's `moduleResolution: "bundler"`

**Evidence:** Paste 3–5 representative grep matches showing `.js`-suffixed imports from the service.

---

### AC-7: R-FENCE Discovery Gate — Phase 2 Calibration Record

**Requirement:** Document the Phase 2 G4 deliberate-violation proof strategy based on the import style discovered in AC-6.

**Record the following in this handoff (§R-FENCE Discovery section, below):**

```
## R-FENCE Discovery

Import style confirmed: .js-suffixed ESM (e.g., from '../../application/dtos.js').

Phase 2 G4 deliberate-violation pair (eslint-plugin-boundaries proof):
- Source file: apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
- Violation import: import type { ReadingRequest } from '../../application/dtos.js'
- Expected outcome: bunx eslint src/ --max-warnings 0 exits non-zero with "Fence-A" or similar error in output
- Concrete proof: inject the violation import → run eslint → observe non-zero exit + error message → revert → exit 0

R-FENCE discovery: RECORDED. Phase 2 G4 will use this recorded style for empirical AC-4b proof.
```

**Calibration confidence:** AC-6 import style audit is the source of truth for this record.

**Evidence:** Paste the § R-FENCE Discovery section you wrote into this handoff above.

---

### AC-8: G12 DoD Gate — Sandbox All-Green Before RETURN

**Requirement:** All scenarios green (exit 0) before returning from this task.

**Proof:**
1. Run `bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all`
2. Confirm exit code 0
3. Paste the full stdout summary showing all hexagram-resolver scenarios PASS

**This is a hard rule:** Do not declare task DONE until AC-8 is satisfied. The G12 DoD gate is enforced in the dev-kinh-dich flow (Day 0 bake-in from Phase 0 agent-father task).

**Evidence:** Paste sandbox output showing exit 0 and scenario count.

---

## Files to Create / Modify

| Path | Type | Notes |
|---|---|---|
| `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts` | CREATE | Exports `resolveHexagram(signals)` + embedded TRIGRAM_LINES + TRIGRAMS_TO_QUE |
| `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.test.ts` | CREATE | Unit tests (bun:test) with ≥5 cases |
| `docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json` | CREATE | Golden scenario (valid 6-signal input) |
| `docs/scenarios/kinh-dich/primitives/hexagram-resolver-edge.json` | CREATE | Edge scenario (all-zero or all-one) |
| `docs/scenarios/kinh-dich/primitives/hexagram-resolver-failure.json` | CREATE | Failure scenario (invalid input → error trace) |

---

## Source Reference

**Brownfield source:** `apps/kinh-dich-service/src/domain/services.ts`

- `resolveHexagram()` function: lines 272–281
- `TRIGRAM_LINES` constant table: lines 23–32
- `TRIGRAMS_TO_QUE` map: lines 198–201
- Full context: brownfield inventory `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` §3 (Priority 1, page 49)

---

## Critical Dependencies

**Blocks:** P1-B2, P1-B3, P1-C, P1-D, P1-E, P1-F, P1-G (all downstream Phase 1 tasks)

**Blocked by:** P1-A (Bun sandbox runner must exist before this task's scenarios can run)

**Internal dependency:** `hexagram-resolver` is self-contained. No other primitives depend on it yet. (Note: `nuclear-hexagram-computer` will depend on it in Phase 2, but that is out of scope here.)

---

## R-FENCE Gate (Critical Information — Phase 2 G4 Target)

**Gate status: DISCOVERY MODE**

This task records the actual ESM import style active in the service (AC-6 + AC-7). This discovery is the **critical information gate** for Phase 2 G4 enforcement.

**Phase 2 usage:** The G4 task will inject a Fence-A violation into `hexagram-resolver/index.ts` using the confirmed import style (e.g., `import type { ReadingRequest } from '../../application/dtos.js'`) and verify that `bunx eslint src/ --max-warnings 0` catches the violation (non-zero exit). If the import style differs from what is recorded here, the AC-4b proof will fail and Phase 2 G4 will escalate to architect.

**Fallback (R-2 risk mitigation):** If the eslint-plugin-boundaries element pattern matching does NOT work as expected (R-2 bites), the 5-minute fallback is to add `@typescript-eslint/parser` to devDependencies + add `languageOptions: { parser: tsParser }` to `eslint.config.mjs` — this is a within-Option-A fix. Do NOT drop to Option C.

---

## Acceptance Evidence Checklist

Paste the following evidence into your DONE signal:

- [ ] AC-1: Function signature + first lines of `resolveHexagram()` exported from `index.ts`
- [ ] AC-2: Paste 5 test cases from `index.test.ts` (test names + assertions)
- [ ] AC-3: `bun test src/primitive/hexagram-resolver/` exit 0 output + test summary
- [ ] AC-4: Sandbox output showing exit 0 + "PASS X/X scenarios" for hexagram-resolver
- [ ] AC-5: `grep -rn "from.*application|from.*interface|..."` output = 0 matches
- [ ] AC-6: `grep -rn "from.*\.js'"` output from domain/application/interface (3–5 examples confirming .js suffix)
- [ ] AC-7: §R-FENCE Discovery section (copied from this handoff, recording import style + deliberate-violation pair)
- [ ] AC-8: Final sandbox output showing exit 0 before RETURN (G12 DoD Gate satisfied)

---

## Notes for dev-kinh-dich

1. **Brownfield source is authoritative:** Use lines 272–281 from `apps/kinh-dich-service/src/domain/services.ts` as your exact extraction template. The two lookup tables (TRIGRAM_LINES, TRIGRAMS_TO_QUE) are the critical embedded data — copy them exactly.

2. **Scenario JSON format:** Each scenario is a JSON file with:
   ```json
   {
     "primitive": "hexagram-resolver",
     "name": "<descriptive-name>",
     "input": { "signals": [...] },
     "expected": { "hexagram": N, "error": null },  // or { "hexagram": null, "error": "..." }
     "description": "<explanation>"
   }
   ```
   The sandbox runner will load these, call `resolveHexagram(input.signals)`, and compare the result to `expected`.

3. **Error handling in failure scenarios:** When the input is invalid (e.g., wrong length), the function throws an Error. The scenario should capture the expected error message. The sandbox runner should **not crash** — it should catch the thrown error and record it as a pass (expected error) or fail (unexpected error).

4. **Sandbox runner integration:** The sandbox runner (from P1-A) will automatically discover and load scenario JSON files from `docs/scenarios/kinh-dich/primitives/` when you run:
   ```bash
   bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
   ```

5. **R-FENCE discovery is the gate:** Do not rush through AC-6 + AC-7. The import style you record here is the **concrete data** Phase 2 G4 will use to calibrate its deliberate-violation proof. If you skip this or record it incorrectly, Phase 2 G4 cannot proceed.

6. **Test the failure scenario carefully:** Make sure the scenario that triggers an error is structured correctly — the sandbox should receive the error, not crash. Document the exact error message the function throws.

---

## Gate Rules

**Hard blocks before P1-B2 dispatch:**

1. AC-4 (sandbox green) must exit 0
2. AC-6 + AC-7 (R-FENCE discovery) must be recorded in the handoff's §R-FENCE Discovery section
3. AC-8 (G12 DoD Gate) — sandbox all-green before RETURN

**If any AC fails:** Return a BLOCKED signal with the exact failure reason. Do NOT proceed to P1-B2. PM will escalate to architect if the failure is a design issue (e.g., R-FENCE discovery reveals the import style is incompatible with eslint-plugin-boundaries pattern matching).

---

## Signal to Emit on Completion

**File:** `docs/signals/dev-kinh-dich-p1-b1-done-<UTC>.json`

**Minimal payload:**
```json
{
  "task_id": "P1-KD-B1",
  "pilot": "kinh-dich",
  "status": "DONE",
  "timestamp": "<ISO-UTC>",
  "ac_results": {
    "AC-1": "PASS",
    "AC-2": "PASS",
    "AC-3": "PASS",
    "AC-4": "PASS",
    "AC-5": "PASS",
    "AC-6": "PASS",
    "AC-7": "PASS",
    "AC-8": "PASS"
  },
  "r_fence_discovery": {
    "import_style_confirmed": ".js-suffixed ESM",
    "example_imports": ["from '../domain/services.js'", "from '../../application/dtos.js'"],
    "deliberate_violation_target": "src/primitive/hexagram-resolver/index.ts",
    "deliberate_violation_pair": "import type { ReadingRequest } from '../../application/dtos.js'",
    "phase2_g4_ready": true
  },
  "g12_streak": {
    "task_number": 1,
    "sandbox_all_green": true,
    "scenario_count": 3,
    "comment": "First primitive extracted; G12 DoD Gate satisfied"
  },
  "next": "PM sequences P1-B2 (ngu-hanh-classifier) after confirming AC-6/AC-7 R-FENCE discovery recorded"
}
```

---

## Handoff Signature

**Prepared by:** PM (kinh-dich pilot cycle 2026-05-24)
**Date:** 2026-05-24
**Target agent:** dev-kinh-dich
**Next reviewer:** PM (P1-B1 completion signal) → architect (if AC-6/AC-7 reveal issues)
