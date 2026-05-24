---
task_id: "P1-F"
pilot: "kinh-dich"
phase: "1"
title: "P1-F Flex — `reading-scorer` Optional 4th Primitive (if time allows)"
owner: "dev-kinh-dich"
sprint: "2026-05-24"
deadline: "2026-07-05"
status: "READY"
handoff_date: "2026-05-24T04:35:00Z"
handoff_by: "pm"
blocked_by: ["P1-E"]
blocks: ["P1-G"]
zone: "apps/kinh-dich-service"
specialist: "dev-kinh-dich"
language: "TypeScript"
runtime: "bun"
optional: true
phase1_scope_note: "Optional for Phase 1. If Phase 1 time is consumed by B1/B2/B3 + C/D/E, P1-F defers to Phase 2 bucket. PM decision at P1-E close."
---

# TASK P1-F — Reading-Scorer Optional 4th Primitive (Flex)

## Summary

Extract the **reading-scorer primitive** (optional 4th primitive for Phase 1 if schedule allows). Maps line outcome strings and trend text → numeric score and trading action string. If Phase 1 time is exhausted after P1-E completion, this task defers to Phase 2 as part of the `nuclear-hexagram-computer` + `reading-scorer` paired extraction.

**P1-F Trigger:** PM decides at P1-E close whether Phase 1 has ≥1.5 hours remaining. If yes, dispatch P1-F. If no, defer and proceed directly to P1-G. Either path is VALID — P1-F is **optional** by charter.

---

## Files Touched

**Create:**
- `apps/kinh-dich-service/src/primitive/reading-scorer/index.ts` (exported functions + constant tables)
- `apps/kinh-dich-service/src/primitive/reading-scorer/index.test.ts` (unit tests)
- `docs/scenarios/kinh-dich/primitives/reading-scorer-golden.json`
- `docs/scenarios/kinh-dich/primitives/reading-scorer-edge.json`
- `docs/scenarios/kinh-dich/primitives/reading-scorer-failure.json`

**Read (no changes):**
- `apps/kinh-dich-service/src/domain/services.ts` (source: `extractOutcomeScore()` L301–L307, `extractTrendScore()` L309–L315, `extractAction()` L317–L325, `majorityVote()` L327–L332, `OUTCOME_SCORES` L225–L228, `TREND_SCORE_MAP` L230–L234)

---

## Acceptance Criteria

### AC-1: Reading-Scorer Functions Exported

`src/primitive/reading-scorer/index.ts` exports all four functions with zero application/interface/infrastructure imports:

```typescript
export function extractOutcomeScore(outcomeText: string): number;
export function extractTrendScore(trendText: string): number;
export function extractAction(score: number): string;
export function majorityVote(actions: string[]): string;
```

Constant tables `OUTCOME_SCORES` and `TREND_SCORE_MAP` are embedded in the file (copied from domain/services.ts L225–L234).

**Evidence:** Paste the first 20 lines of `index.ts` showing function signatures + constant table definition.

---

### AC-2: Fence-A + R-FENCE Inherited (Zero Cross-Layer Imports)

```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/reading-scorer/
```

Must return 0. R-FENCE discovery recorded in P1-B1; this primitive inherits the .js-suffixed ESM style.

**Evidence:** Paste the command output showing zero matches.

---

### AC-3: Unit Tests Exit 0

```bash
cd apps/kinh-dich-service && bun test src/primitive/reading-scorer/
```

Minimum 5 test cases required:
- `extractOutcomeScore()` with known outcome string → correct numeric score
- `extractTrendScore()` with known trend string → correct numeric score
- `extractAction()` with known score range → correct action string
- `majorityVote()` with array of actions → majority action returned
- Edge case: unknown/invalid input → defined behavior (return null, throw Error, or default value — dev-kinh-dich documents behavior)

Exit code must be 0.

**Evidence:** Paste the test summary (e.g., `6 pass, 0 fail`).

---

### AC-4: Sandbox All-Primitive Tier Green (12/12 scenarios)

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```

Must exit 0 and show `[sandbox] PASS 12/12 scenarios` (all 9 from P1-B1/B2/B3 + 3 new from P1-F).

**Evidence:** Paste the full sandbox output showing all 12 PASS lines + summary.

---

### AC-5: Scenario JSONs Created (3 golden/edge/failure)

Three scenario JSON files in `docs/scenarios/kinh-dich/primitives/`:
- `reading-scorer-golden.json` — input: outcomes=[list of outcome strings], trends=[trend strings], expected scores + actions
- `reading-scorer-edge.json` — input: edge case (e.g., unknown outcome, mixed trends), expected behavior
- `reading-scorer-failure.json` — input: intentionally invalid (e.g., empty array), expected error behavior

**Evidence:** Confirm files exist via `ls -1 docs/scenarios/kinh-dich/primitives/reading-scorer-*`.

---

### AC-6: G12 DoD Gate — Sandbox All-Green Before RETURN

All scenarios (B1+B2+B3+F = 12 primitives total) must show PASS. Paste the `[sandbox] PASS 12/12` summary line into the RETURN block before declaring P1-F DONE.

```
[sandbox] PASS 12/12 scenarios (0 failed, 0 skipped)
```

---

## Key Architecture Decisions

### Decision 1: Function Scope (4 functions vs 5)

The domain source has 5 exportable pieces: `extractOutcomeScore()`, `extractTrendScore()`, `extractAction()`, `majorityVote()`, and the constant tables. Phase 1 extracts all 4 functions (the tables are embedded constants, not separate exports).

### Decision 2: Input Validation Strategy

Dev-kinh-dich decides how to handle unknown outcome/trend strings:
- **Option A:** Return a default numeric value (e.g., score=0, action='HOLD')
- **Option B:** Throw an Error (scenario fails if input invalid)
- **Option C:** Return null (caller handles null)

Document the choice in the failure test case.

### Decision 3: Phase 1 vs Phase 2

P1-F is **optional** because it does NOT unblock Phase 2 critical path. P1-B1 (hexagram-resolver) unblocks P1-B2/B3. P1-C (module) unblocks P1-D. P1-D unblocks P1-E. P1-E unblocks P1-F or P1-G. Phase 2 can proceed with P1-G close-gate verification whether or not P1-F shipped — if P1-F defers, Phase 2 schedules it in a later Phase 2 bucket task.

---

## Notes

1. **Optional nature:** If PM judges Phase 1 has <1.5 hours remaining at P1-E close, dispatch P1-G directly. P1-F defers to Phase 2. Do NOT hold Phase 1 gate for P1-F.

2. **Pairing with nuclear-hexagram-computer:** The 5th primitive (`nuclear-hexagram-computer`) depends on `hexagram-resolver` being stable. If P1-F ships, Phase 2 can extract `nuclear-hexagram-computer` immediately. If P1-F defers, Phase 2 schedules both `reading-scorer` and `nuclear-hexagram-computer` back-to-back.

3. **Sandbox consistency:** The sandbox runner already accepts `--tier=primitive --scenario=all`. Once P1-F files are created, the sandbox auto-discovers the 3 new JSONs and runs all 12 scenarios.

4. **G12 DoD Gate:** This task is a G12 streak candidate (would be streak #5 if shipped). All sandbox green before RETURN block.

---

## Brownfield Source Pointers

**Domain source:** `apps/kinh-dich-service/src/domain/services.ts`
- `extractOutcomeScore()` L301–L307
- `extractTrendScore()` L309–L315
- `extractAction()` L317–L325
- `majorityVote()` L327–L332
- `OUTCOME_SCORES` constant L225–L228
- `TREND_SCORE_MAP` constant L230–L234

**Reference (P1-B1/B2/B3):** `apps/kinh-dich-service/src/primitive/{hexagram-resolver,ngu-hanh-classifier,hao-encoder}/index.ts` — use as pattern for file structure and exports.

---

## Return Checklist

Before writing RETURN block, confirm:

- [ ] AC-1: Four functions exported with zero cross-layer imports
- [ ] AC-2: Fence-A grep returns 0 (zero infrastructure imports)
- [ ] AC-3: Unit tests ≥5 cases, exit 0
- [ ] AC-4: Sandbox `--tier=primitive` exits 0, shows 12/12 PASS
- [ ] AC-5: Three scenario JSONs created (golden/edge/failure)
- [ ] AC-6: G12 DoD gate — sandbox all-green summary pasted before RETURN

---

## Return

**IF P1-F DISPATCHED:**

Completion date: 2026-05-24T05:10:00Z

Status: DONE

Exit code: 0

Sandbox verdict: [sandbox] PASS 12/12 scenarios (0 failed, 0 skipped) — primitive tier
Full-tier verdict: [sandbox] PASS 14/14 scenarios (0 failed, 0 skipped) — all tiers

Commit SHA: 43158e5c

Pre-commit index check: CLEAN — zero foreign files in staged index before commit.

### AC Verdicts

- [x] AC-1: Four functions exported — `extractOutcomeScore`, `extractTrendScore`, `extractAction`, `majorityVote` — with embedded `OUTCOME_SCORES` + `TREND_SCORE_MAP` constant tables. Zero cross-layer imports in `index.ts`.
- [x] AC-2: Fence-A grep returns only 1 JSDoc comment line (not a code import). Code imports: zero. R-FENCE clean.
- [x] AC-3: 26 unit tests pass, exit 0. Covers all four functions + edge cases (empty strings, unknown inputs, tie in majority vote, THAN TRONG keyword).
- [x] AC-4: `--tier=primitive` → `[sandbox] PASS 12/12 scenarios (0 failed, 0 skipped)`. Exit 0.
- [x] AC-5: Three scenario JSONs created — `reading-scorer-golden.json`, `reading-scorer-edge.json`, `reading-scorer-failure.json` in `docs/scenarios/kinh-dich/primitives/`.
- [x] AC-6: G12 DoD gate — `[sandbox] PASS 14/14 scenarios (0 failed, 0 skipped)` (all tiers) confirmed before RETURN.

### Notes

- `extractAction` domain signature is `(actionText: string): string` (not `(score: number)` as the handoff spec stated — the domain caller at L443 passes action text strings, not numeric scores). Primitive preserves the faithful domain contract and documents the discrepancy in JSDoc.
- Input Validation Strategy: Option A (return default, no exceptions thrown for unknown inputs). Documented in primitive JSDoc and failure scenario JSON.
- ESLint is intentionally absent in Phase 1 (no `eslint.config.mjs`). Fence-A verified via grep (AC-2) as specified.

Next actor: qa (P1-G close-gate verification)

---

*Handoff authored 2026-05-24T04:35:00Z by pm for kinh-dich pilot-4 Phase 1, P1-F optional reading-scorer primitive.*
*Return awaiting dev-kinh-dich decision based on Phase 1 time availability at P1-E close.*
