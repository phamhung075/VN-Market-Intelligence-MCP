---
task_id: "P1-C"
pilot: "kinh-dich"
phase: "1"
title: "Module Stub: reading_composer + MarkovPort"
owner: "dev-kinh-dich"
sprint: "2026-05-24"
deadline: "2026-07-05"
status: "READY"
handoff_date: "2026-05-24T11:42:00Z"
handoff_by: "pm"
blocked_by: ["P1-B3"]
blocks: ["P1-D"]
zone: "apps/kinh-dich-service"
specialist: "dev-kinh-dich"
language: "TypeScript"
runtime: "bun"
---

# TASK P1-C — Module Stub: reading_composer + MarkovPort

## Summary

Orchestrate the 3 extracted primitives (`hexagram-resolver`, `ngu-hanh-classifier`, `hao-encoder`) into a module stub (`reading_composer`) via the **MarkovPort** (dependency injection, zero infrastructure imports in module path). The module executes the 10-step pipeline documented in the brownfield inventory (encode haos → resolve hexagram → compute hoQue → compute bienQue → classify nguHanh → score reading → majority vote → confidence blend). Steps 8–10 (reading-scorer, nuclear-hexagram-computer) are NOT yet extracted — module stub either delegates to `domain/services.ts` helpers inline OR stubs the output; dev-kinh-dich chooses. The module produces a structurally valid `KinhDichReading` for sandbox verification.

**Fence-B:** module may import `src/primitive/**` and `src/domain/**`. Zero imports from `src/application/**`, `src/interface/**`, `src/infrastructure/**`.

**G12 DoD Gate (streak task #3 successor):** Sandbox all-green (both `--tier=primitive` and `--tier=module`) before RETURN block. Evidence pasted.

---

## Files Touched

**Create:**
- `apps/kinh-dich-service/src/module/reading_composer/ports.ts`
- `apps/kinh-dich-service/src/module/reading_composer/index.ts`
- `apps/kinh-dich-service/src/module/reading_composer/index.test.ts`
- `docs/scenarios/kinh-dich/module/reading-composer-golden.json`
- `docs/scenarios/kinh-dich/module/reading-composer-edge.json`

---

## Acceptance Criteria

### AC-1: ports.ts — MarkovPort Interface

Define or re-export a `MarkovPort` interface with the signature:
```typescript
export interface MarkovPort {
  getMarkovData(hexagramNumber: number): MarkovData | null;
}
```

**Options (both Fence-B compliant):**
- **Option A (simpler for Phase 1):** Re-export the existing `KinhDichRepositoryPort` from `src/domain/repositories.ts`:
  ```typescript
  export type { KinhDichRepositoryPort as MarkovPort } from '../../domain/repositories.js';
  ```
- **Option B (cleaner separation):** Define a slimmer inline interface in `ports.ts` (TypeScript structural typing ensures infra impl satisfies it).

**Evidence:** Paste `grep -n "MarkovPort" apps/kinh-dich-service/src/module/reading_composer/ports.ts` output showing the interface definition or re-export.

---

### AC-2: index.ts — Module Composition Function

Export a function or class that composes the 3 primitives via the MarkovPort:

```typescript
// Module stub structure (dev-kinh-dich may adjust class vs function style)
export interface ReadingComposerDependencies {
  markov: MarkovPort;
}

export async function composeReading(
  stockCode: string,
  scores: number[],
  deps: ReadingComposerDependencies
): Promise<KinhDichReading> {
  // Step 1: encode haos
  const haos = encodeHaos(scores);
  
  // Step 2: convert haos → binary signals
  const signals = haos.map(h => h.binary);
  
  // Step 3: resolve hexagram
  const queChinhNumber = resolveHexagram(signals);
  
  // Step 4: get queMeta
  const queMeta = QUE_META.find(m => m.id === queChinhNumber);
  
  // Step 5-6: compute ho que & bien que (from domain/services.ts or stub)
  const hoQueNumber = computeHoQue(signals);
  const bienQueNumber = computeBienQue(haos);
  
  // Step 7: classify ngu hanh
  const upper = TRIGRAMS[queMeta.upper];
  const lower = TRIGRAMS[queMeta.lower];
  const nguHanhResult = classifyNguHanh(lower.element, upper.element);
  
  // Step 8-10: scoring, majority vote, confidence (inline from domain/services.ts or stub)
  const baseScore = computeBaseScore(haos, queMeta); // inline helper or domain call
  const tradingSignal = determineSignal(baseScore);
  
  // Step 11: Markov blending
  const markovData = await deps.markov.getMarkovData(queChinhNumber);
  const confidence = blendConfidence(baseScore, markovData);
  
  return {
    stockCode,
    haos,
    queChinhNumber,
    hoQueNumber,
    bienQueNumber,
    queMeta,
    nguHanh: nguHanhResult.dynamic,
    tradingSignal,
    confidence,
  };
}
```

**Notes:**
- Steps 8–10 (reading-scorer helpers, nuclear-hexagram-computer) are NOT extracted yet. Module may:
  - Call `domain/services.ts` helpers directly (import from domain — Fence-B compliant), OR
  - Stub them (return hardcoded values for Phase 1 proof-of-concept)
- MarkovPort is injected via constructor / function params — NOT imported from infrastructure
- Return type is `KinhDichReading` (from `src/domain/models.ts`)

**Evidence:** Paste output of:
```bash
grep -n "export.*compose\|export.*ReadingComposer\|export.*class" \
  apps/kinh-dich-service/src/module/reading_composer/index.ts
```

---

### AC-3: index.test.ts — Unit Tests Exit 0

Create unit tests with `bun:test`. Test cases:
- Compose with `scores=[0.8, -0.3, 0.6, 0.1, -0.7, 0.4]`, `markovData=null` → returns `KinhDichReading` with all fields populated
- Compose with same scores, `markovData` non-null → confidence differs from base (Markov blending)
- Edge case: scores at thresholds (boundary conditions)
- Fixture scenario: matching the golden JSON input/output

**Command:**
```bash
cd apps/kinh-dich-service && bun test src/module/reading_composer/ --timeout 5000
```
Must exit 0. Paste output.

---

### AC-4: Fence-B Critical — Zero Application/Interface/Infrastructure Imports

```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure" \
  apps/kinh-dich-service/src/module/reading_composer/
```

Must return 0 (no matches). Module imports only:
- `src/primitive/**` (the 3 extracted primitives)
- `src/domain/**` (models, services helpers if called inline)
- Stdlib / bun:test

**Evidence:** Paste full grep output (should be empty).

---

### AC-5: No Cross-Module Imports

```bash
grep -rn "from.*src/module" apps/kinh-dich-service/src/module/reading_composer/
```

Must return 0. Module does NOT import other modules.

---

### AC-6: Module-Level Sandbox Tiers Exit 0

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```
Must exit 0 (baseline from P1-B1 + P1-B2 + P1-B3 = 9 scenarios).

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all
```
Must exit 0 (module-level golden + edge scenarios).

**Evidence:** Paste both outputs.

---

### AC-7: Module Scenario JSONs (reading-composer-golden.json, reading-composer-edge.json)

**Location:** `docs/scenarios/kinh-dich/module/`

**reading-composer-golden.json** (happy path):
```json
{
  "name": "reading-composer-golden",
  "input": {
    "stockCode": "VCB",
    "scores": [0.8, -0.3, 0.6, 0.1, -0.7, 0.4],
    "markovData": null
  },
  "expected": {
    "queChinhNumber": 11,
    "hoQueNumber": 55,
    "bienQueNumber": 19,
    "haosLength": 6,
    "tradingSignal": "BUY",
    "confidenceRange": [0.0, 1.0]
  }
}
```

**reading-composer-edge.json** (Markov blended):
```json
{
  "name": "reading-composer-edge",
  "input": {
    "stockCode": "VCB",
    "scores": [0.8, -0.3, 0.6, 0.1, -0.7, 0.4],
    "markovData": { "transitionProb": 0.75, "historicalConfidence": 0.8 }
  },
  "expected": {
    "queChinhNumber": 11,
    "hoQueNumber": 55,
    "bienQueNumber": 19,
    "haosLength": 6,
    "tradingSignal": "BUY",
    "confidenceRangeWithMarkov": [0.7, 0.95]
  }
}
```

**Evidence:** Paste `ls -la docs/scenarios/kinh-dich/module/` output showing both JSON files.

---

### AC-8: All-Tier Sandbox Exit 0

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

Must exit 0 (all 11 scenarios: 9 primitive + 2 module).

**Evidence:** Paste output showing `[sandbox] PASS X/X scenarios`.

---

### AC-9: G12 DoD Gate — Sandbox All-Green Before RETURN

Both sandbox tiers must exit 0 before this handoff's RETURN block is written:
- `--tier=primitive --scenario=all` → exit 0
- `--tier=module --scenario=all` → exit 0

**Evidence (paste below):**

```
[G12 DOORKILL GATE EVIDENCE — replace this line with actual sandbox output]

PRIMITIVE TIER:
[output of: bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all]

MODULE TIER:
[output of: bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all]

RESULT: PASS (all scenarios green) or FAIL (any scenario red)
```

---

## Browfield Source Pointers

**10-step reading_composer pipeline:** `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` §4 (lines 64–83)

**computeReading() reference (Phase 1 predecessor logic):** `apps/kinh-dich-service/src/domain/services.ts` lines 375–512

**MarkovPort signature (existing in domain):** `apps/kinh-dich-service/src/domain/repositories.ts`

**Primitive module structures (P1-B1, P1-B2, P1-B3 outputs):**
- `apps/kinh-dich-service/src/primitive/hexagram-resolver/`
- `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/`
- `apps/kinh-dich-service/src/primitive/hao-encoder/`

---

## Key Architecture Decisions

### Decision 1: MarkovPort Implementation (Option A vs Option B)

**Option B selected** (inline slim interface)

**Rationale:** `KinhDichRepositoryPort` exposes `getLatestReading()` which the module does not need. More importantly, the module-tier `MarkovData` shape (`transitionProb + historicalConfidence`) is distinct from the domain's `MarkovData` shape (`nextMostLikely + nextName + probability`). Inlining the interface avoids leaking the infrastructure DB row schema into the module tier. TypeScript structural typing ensures any concrete infra adapter wired at the composition root satisfies the interface without modification. Phase 2 wires the adapter — this boundary remains stable.

---

### Decision 2: Steps 8–10 Stub Strategy

**Inline delegation selected** — call `domain/services.ts computeReading()` for the full pipeline.

**Rationale:** `extractOutcomeScore()`, `majorityVote()`, `computeHoQue()`, `computeBienQue()` are all private functions in `domain/services.ts` (not exported). The only exported orchestrator is `computeReading()`. Rather than duplicate the scoring logic or export private helpers (which would pollute the domain API), the module calls `computeReading(stockCode, scores)` for steps 5–10, then post-processes confidence with the MarkovPort data. This is Fence-B compliant (domain import permitted at module tier). Phase 2 will extract `reading-scorer` and `nuclear-hexagram-computer` as standalone primitives and replace the `computeReading()` delegation here.

---

## Notes

1. **Threshold constant correction:** P1-B3 handoff noted `THIEU_DUONG_THRESHOLD ≈ 0.25`, but the source-of-truth `src/domain/services.ts` L206 uses `0.10`. The dev correctly implemented `0.10` (source is authoritative). This note is recorded for the Phase 2 deletion-chain phase when domain/services.ts logic is deprecated.

2. **G12 DoD Gate:** This task is NOT a G12 streak candidate (P1-B1, P1-B2, P1-B3 complete the streak). However, the DoD gate rule still applies: sandbox must be all-green before RETURN.

3. **No new devDependencies:** Phase 1 adds zero new npm packages. Module uses existing `bun:test` and the 3 extracted primitives.

4. **SI-2 ownership:** Do NOT create `docs/dashboards/index.html` — that is stock-price's G6 deliverable. kinh-dich G6 (P1-D) will create `apps/kinh-dich-service/dashboard/index.html` only.

---

## SSOT Update

In `docs/data/pilot-status-kinh-dich.json`:
- `phase1.current_task` = "P1-C"
- `phase1.current_task_status` = "READY"
- `phase1.current_task_handoff` = "docs/handoffs/TASK_P1-KD-C.md"
- Progress note added: P1-B3 DONE, G12 streak complete (3/3), P1-C sequenced

---

## Return Checklist

Before writing RETURN block, confirm:

- [ ] AC-1: MarkovPort interface defined or re-exported
- [ ] AC-2: Composition function exported (class or function style)
- [ ] AC-3: Unit tests exit 0
- [ ] AC-4: Fence-B grep returns 0 (no infra/app/interface imports)
- [ ] AC-5: No cross-module imports (grep returns 0)
- [ ] AC-6: Module sandbox tiers exit 0 (primitive + module)
- [ ] AC-7: Scenario JSONs created in docs/scenarios/kinh-dich/module/
- [ ] AC-8: All-tier sandbox exits 0
- [ ] AC-9: G12 DoD Gate evidence pasted (both tiers green)
- [ ] Architecture decisions documented (MarkovPort option, steps 8–10 strategy)

---

## RETURN

Document completion date and status below:

**Completed:** 2026-05-24T01:55:00Z

**Status:** DONE

**Exit code:** 0

**Sandbox verdict:** PASS 11/11 (9 primitive + 2 module)

**Commit SHA:** 50069d69

**G12 DoD Gate Evidence:**

PRIMITIVE TIER:
```
[PASS] hao-encoder-edge.json
[PASS] hao-encoder-failure.json
[PASS] hao-encoder-golden.json
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] hexagram-resolver-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] ngu-hanh-classifier-golden.json
[sandbox] PASS 9/9 scenarios (0 failed, 0 skipped)
```

MODULE TIER:
```
[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json
[sandbox] PASS 2/2 scenarios (0 failed, 0 skipped)
```

ALL TIER: `[sandbox] PASS 11/11 scenarios (0 failed, 0 skipped)`

RESULT: PASS (all scenarios green)

**Unit tests:** 74/74 pass (6 new in reading_composer). `bun tsc --noEmit` clean.

**AC evidence:**
- AC-1: `grep -n "MarkovPort" ports.ts` → line 39: `export interface MarkovPort`
- AC-2: `grep -n "export.*compose"` → line 58: `export async function composeReading`
- AC-3: `bun test src/module/reading_composer/` → 6 pass, 0 fail, exit 0
- AC-4: No actual imports from application/interface/infrastructure (only comments)
- AC-5: No cross-module imports (only comment reference)
- AC-6: primitive 9/9 + module 2/2, both exit 0
- AC-7: `ls -la docs/scenarios/kinh-dich/module/` → reading-composer-golden.json + reading-composer-edge.json
- AC-8: all-tier 11/11, exit 0
- AC-9: evidence above

**Blocker notes:** None.

---

*Handoff authored 2026-05-24T11:42:00Z by pm for kinh-dich pilot-4 Phase 1.*
