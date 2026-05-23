---
task_id: "P1-KD-B2"
pilot: "kinh-dich"
phase: "1"
title: "Second Primitive: ngu-hanh-classifier + R-FENCE Inherited"
owner: "dev-kinh-dich"
handoff_date: "2026-05-24"
predecessor_task: "P1-B1"
successor_task: "P1-B3"
blocker_on: "P1-B3"
estimated_effort: "1 hour"
ac_count: 5
priority: "HIGH (lowest-extraction-complexity primitive; unblocks P1-B3)"
---

# TASK P1-B2 — Second Primitive: `ngu-hanh-classifier` + R-FENCE Inherited

## Summary

Extract the **second primitive** `ngu-hanh-classifier` from `apps/kinh-dich-service/src/domain/services.ts` (`classifyNguHanh()` at lines 340–369). This task is the **lowest-extraction-complexity** primitive in the Phase 1 set because:

1. **Already exported from domain** — `classifyNguHanh()` is a public API in the current `domain/services.ts`, not an internal helper
2. **Pure table lookup** — maps lower/upper trigram element strings → `NguHanhResult` (dynamic + score + interpretation) via two constant tables: `GENERATION` and `DESTRUCTION`
3. **Clearest boundary** — minimal entanglement with other functions
4. **G12 DoD Gate applies** (streak task #2): Sandbox must exit 0 all scenarios (now covering both P1-B1 + P1-B2 scenarios) before task DONE is declared

**R-FENCE Discovery is inherited from P1-B1:** The import style (`.js`-suffixed ESM) and Fence-A rules are now established. This task applies the same Fence-A discipline (zero cross-layer imports in primitives) without re-discovering the style.

---

## Acceptance Criteria

### AC-1: Exported Function Signature

**File:** `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts`

**Requirement:** Function exports `classifyNguHanh(lower: string, upper: string): NguHanhResult`

**Details:**
- Accepts two strings representing lower and upper trigram elements (e.g., "Water", "Wood")
- Returns a `NguHanhResult` object with fields: `dynamic` (string: 'SINH' | 'KHAC' | 'BINH' | ...), `score` (number), `interpretation` (string)
- Includes embedded `GENERATION` and `DESTRUCTION` lookup tables (from source lines 236–239 and 240–242)
- Zero application, interface, or infrastructure imports
- `NguHanhResult` type may be defined inline or imported from `src/domain/models.ts` (domain → domain is Fence-compliant)

**Evidence:** Paste the function signature + first 5 lines of the function body here.

---

### AC-2: Unit Tests with `bun:test`

**File:** `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.test.ts`

**Requirement:** ≥5 test cases covering happy path + edge cases + failure:

1. **Generation relationship (e.g., Water→Wood):**
   - Input: `lower="Water", upper="Wood"`
   - Expected: `result.dynamic === 'SINH'` (or verified from GENERATION table)
   
2. **Destruction relationship (e.g., Wood→Earth):**
   - Input: `lower="Wood", upper="Earth"`
   - Expected: `result.dynamic === 'KHAC'` (or verified from DESTRUCTION table)
   
3. **Neutral relationship (same element):**
   - Input: `lower="Metal", upper="Metal"`
   - Expected: `result.dynamic === 'BINH'` (or appropriate neutral classification)
   
4. **Unknown element string:**
   - Input: `lower="UnknownElement", upper="Wood"` (or similar invalid input)
   - Expected: defined behavior (either returns `dynamic: 'BINH'` or throws Error — dev-kinh-dich documents the choice)
   
5. **Score range validation:**
   - Any valid input → `result.score` is a number (no NaN, no undefined)

**Evidence:** Paste `bun test src/primitive/ngu-hanh-classifier/` output showing all tests PASS.

---

### AC-3: Unit Tests Exit 0

**Requirement:**
```bash
cd apps/kinh-dich-service && bun test src/primitive/ngu-hanh-classifier/
```

Must exit with code 0 (all tests pass).

**Evidence:** Paste the full command output, confirming exit 0 and test summary.

---

### AC-4: Zero Cross-Layer Imports (Fence-A Inherited)

**Requirement:**
```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/
```

Must return 0 (no matches).

**Details:** The primitive imports ONLY:
- TypeScript/Bun built-ins (if any)
- Internal constants (GENERATION, DESTRUCTION)
- Optional: domain/models.ts if type definitions live there (domain → domain is Fence-compliant)

**R-FENCE note:** The import style (`.js`-suffixed ESM) is inherited from P1-B1 discovery. Apply the same style to any domain imports in this primitive.

**Evidence:** Paste the grep output confirming 0 matches.

---

### AC-5: Sandbox Green (G12 DoD Gate #2)

**Requirement:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```

Must exit 0 with output like:
```
[sandbox] PASS X/X scenarios (hexagram-resolver + ngu-hanh-classifier scenarios all green)
```

**Scenario files created in Phase 1-B2:**
- `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json`
- `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-edge.json`
- `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-failure.json`

**Scenario JSON format example (golden):**
```json
{
  "primitive": "ngu-hanh-classifier",
  "name": "golden-water-wood",
  "input": { "lower": "Water", "upper": "Wood" },
  "expected": { "dynamic": "SINH", "score": 0.8, "interpretation": "...", "error": null },
  "description": "Generation relationship: Water generates Wood"
}
```

**Sandbox G12 gate requirement:** All scenarios across both P1-B1 (hexagram-resolver ×3) and P1-B2 (ngu-hanh-classifier ×3) must be green (6 scenarios total) before RETURN block is written.

**Evidence:** Paste the full sandbox output showing exit 0 and PASS count.

---

## Files to Create / Modify

| Path | Type | Notes |
|---|---|---|
| `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts` | CREATE | Exports `classifyNguHanh(lower, upper)` + embedded GENERATION + DESTRUCTION tables |
| `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.test.ts` | CREATE | Unit tests (bun:test) with ≥5 cases |
| `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json` | CREATE | Golden scenario (valid generation or destruction relationship) |
| `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-edge.json` | CREATE | Edge scenario (neutral relationship or boundary condition) |
| `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-failure.json` | CREATE | Failure scenario (invalid input → error trace) |
| `apps/kinh-dich-service/src/sandbox/runner.ts` | MODIFY | Add ngu-hanh-classifier dispatch + executor to sandbox runner |

---

## Source Reference

**Brownfield source:** `apps/kinh-dich-service/src/domain/services.ts`

- `classifyNguHanh()` function: lines 340–369
- `GENERATION` constant table: lines 236–239
- `DESTRUCTION` constant table: lines 240–242
- Full context: brownfield inventory `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` §3 (Priority 3, page 52)

**Key note from brownfield:** `classifyNguHanh()` is **already exported** from `domain/services.ts` — it is the cleanest extraction boundary in the entire codebase. This is why it is the lowest-complexity primitive.

---

## Critical Dependencies

**Blocks:** P1-B3, P1-C, P1-D, P1-E, P1-F, P1-G (all downstream Phase 1 tasks)

**Blocked by:** P1-B1 (R-FENCE discovery gate must be recorded before this task executes; sandbox runner must support hexagram-resolver scenarios)

**Internal dependency:** `ngu-hanh-classifier` is standalone. No other primitives depend on it in Phase 1. (Note: `reading_composer` module will import it in P1-C, but that is downstream.)

---

## R-FENCE Inheritance

**Gate status: DISCOVERY RECORDED (inherited from P1-B1)**

The import style (`.js`-suffixed ESM) and deliberate-violation pair are now established from P1-B1 §R-FENCE Discovery. This task inherits that discovery and applies the same Fence-A discipline:

- No new import style discovery needed
- All relative imports use `.js` suffix (e.g., `from '../../domain/models.js'` if importing types from domain)
- Zero cross-layer imports
- Phase 2 G4 will use the calibrated import style to prove fence enforcement

**AC-4 enforces Fence-A:** The grep command confirms zero application/interface/infrastructure imports. This primitives is in the pure compute zone alongside hexagram-resolver.

---

## Acceptance Evidence Checklist

Paste the following evidence into your DONE signal:

- [ ] AC-1: Function signature + first lines of `classifyNguHanh()` exported from `index.ts`
- [ ] AC-2: Paste 5 test cases from `index.test.ts` (test names + assertions)
- [ ] AC-3: `bun test src/primitive/ngu-hanh-classifier/` exit 0 output + test summary
- [ ] AC-4: `grep -rn "from.*application|from.*interface|..."` output = 0 matches
- [ ] AC-5: Sandbox output showing exit 0 + "PASS X/X scenarios" (now covering both P1-B1 ×3 + P1-B2 ×3 = 6 total)

---

## Notes for dev-kinh-dich

1. **Brownfield source is authoritative:** Use lines 340–369 from `apps/kinh-dich-service/src/domain/services.ts` as your exact extraction template. The two lookup tables (`GENERATION`, `DESTRUCTION`) are the critical embedded data — copy them exactly.

2. **Already exported:** Unlike hexagram-resolver (which was an internal helper), `classifyNguHanh()` is already a public API. This simplifies the extraction — you are formalizing an existing boundary.

3. **Scenario JSON format:** Each scenario is a JSON file with:
   ```json
   {
     "primitive": "ngu-hanh-classifier",
     "name": "<descriptive-name>",
     "input": { "lower": "<element>", "upper": "<element>" },
     "expected": { "dynamic": "<classification>", "score": N, "interpretation": "<text>", "error": null },
     "description": "<explanation>"
   }
   ```
   The sandbox runner will load these, call `classifyNguHanh(input.lower, input.upper)`, and compare the result to `expected`.

4. **Error handling in failure scenarios:** When the input is invalid (e.g., unknown element string), the function's behavior is dev-kinh-dich's choice: either return a neutral classification (e.g., `dynamic: 'BINH'`) or throw an Error. Document this choice in the failure scenario and in the test suite.

5. **Sandbox runner integration:** The sandbox runner (already created in P1-A and updated in P1-B1) will automatically discover and load scenario JSON files from `docs/scenarios/kinh-dich/primitives/` when you run:
   ```bash
   bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
   ```
   You need to add the `ngu-hanh-classifier` dispatch + executor to the runner (follow the same pattern as hexagram-resolver).

6. **R-FENCE inheritance is automatic:** Do not re-discover the import style or re-record it. The import style is locked in from P1-B1. Just apply it consistently here.

7. **G12 DoD Gate:** This is the SECOND task in the 3-task streak. Sandbox must show all scenarios green (both primitives) before RETURN block. The gate rule applies identically to P1-B1.

---

## Gate Rules

**Hard blocks before P1-B3 dispatch:**

1. AC-3 (unit tests exit 0)
2. AC-4 (zero cross-layer imports)
3. AC-5 (sandbox green covering all P1-B1 + P1-B2 scenarios) — G12 DoD Gate #2
4. All 3 scenario JSON files present in `docs/scenarios/kinh-dich/primitives/`

**If any AC fails:** Return a BLOCKED signal with the exact failure reason. Do NOT proceed to P1-B3. PM will escalate to architect if the failure is a design issue (unlikely, since brownfield confirms pure extraction).

---

## Signal to Emit on Completion

**File:** `docs/signals/dev-kinh-dich-p1-b2-done-<UTC>.json`

**Minimal payload:**
```json
{
  "task_id": "P1-KD-B2",
  "pilot": "kinh-dich",
  "status": "DONE",
  "timestamp": "<ISO-UTC>",
  "ac_results": {
    "AC-1": "PASS",
    "AC-2": "PASS",
    "AC-3": "PASS",
    "AC-4": "PASS",
    "AC-5": "PASS"
  },
  "sandbox_verdict": {
    "command": "cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all",
    "exit_code": 0,
    "scenario_count": 6,
    "scenarios": [
      "hexagram-resolver-golden.json (PASS)",
      "hexagram-resolver-edge.json (PASS)",
      "hexagram-resolver-failure.json (PASS)",
      "ngu-hanh-classifier-golden.json (PASS)",
      "ngu-hanh-classifier-edge.json (PASS)",
      "ngu-hanh-classifier-failure.json (PASS)"
    ],
    "comment": "Second primitive extracted; G12 DoD Gate #2 satisfied: all 6 scenarios (2 primitives) green"
  },
  "g12_streak": {
    "task_number": 2,
    "position": "2/3",
    "sandbox_all_green": true,
    "scenario_count": 6,
    "comment": "Second consecutive primitive task with sandbox-green before RETURN"
  },
  "files_created": [
    "apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts",
    "apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.test.ts",
    "docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json",
    "docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-edge.json",
    "docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-failure.json"
  ],
  "files_modified": [
    "apps/kinh-dich-service/src/sandbox/runner.ts (added ngu-hanh-classifier dispatch + executor)"
  ],
  "next": "PM sequences P1-B3 (hao-encoder, third primitive + final streak task)"
}
```

---

## Handoff Signature

**Prepared by:** PM (kinh-dich pilot cycle 2026-05-24)
**Date:** 2026-05-24
**Target agent:** dev-kinh-dich
**Next reviewer:** PM (P1-B2 completion signal) → architect (if any Fence-A violations detected)
