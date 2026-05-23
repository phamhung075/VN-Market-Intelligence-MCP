---
task_id: "P1-KD-B3"
task_title: "Extract third primitive: hao-encoder"
phase: "1"
pilot: "kinh-dich"
owner: "dev-kinh-dich"
status: "READY"
assignedAt: "2026-05-24T08:40:00Z"
assignedBy: "pm (P1-B2 DONE verification cycle)"
dependencies: ["P1-B2"]
blockers: []
estimated_effort: "1.5h"
acceptance_criteria_count: 6
brownfield_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md (§3, priority 2)"
source_service_facts: "docs/data/system-map.json (zone=apps/kinh-dich-service, port=5005, language=ts, runtime=bun)"
---

# TASK_P1-KD-B3 — Extract Third Primitive: `hao-encoder`

**This is the final streak task (G12 #3).** After P1-B3 DONE, the G12 DoD gate streak is complete: all 3 primitives shipped with sandbox green. g12Streak.completed=3 and streakComplete=true (still EARNED-PENDING, not flipped YES until terminal).

---

## Background

`classifyHao()` (L245–L249) + `encodeHaos()` (L252–L266) map 6 raw float scores in [-1, +1] → 6 `HaoReading` objects (state + binary + isChanging). The primitive co-locates all threshold constants: `LAO_DUONG_THRESHOLD` (L205), `THIEU_DUONG_THRESHOLD` (L206), `LAO_AM_THRESHOLD` (L207), and the `STATE_TO_BINARY` / `STATE_TO_CHANGING` / `HAO_LABELS` lookup tables (L209–L223). Pure threshold math — no I/O.

**Source:** `apps/kinh-dich-service/src/domain/services.ts` lines 245–266 + threshold constants lines 205–223.

---

## Files to Create

- `apps/kinh-dich-service/src/primitive/hao-encoder/index.ts` (CREATE)
- `apps/kinh-dich-service/src/primitive/hao-encoder/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hao-encoder-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hao-encoder-edge.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hao-encoder-failure.json` (CREATE)

---

## Exported Interface

```typescript
// src/primitive/hao-encoder/index.ts
export interface HaoReading {
  state: string;      // 'LAO_DUONG' | 'THIEU_DUONG' | 'LAO_AM' | 'THIEU_AM'
  binary: number;     // 0 | 1
  isChanging: boolean;
  label: string;
}

export function classifyHao(score: number): HaoReading;
export function encodeHaos(scores: number[]): HaoReading[];
// scores: 6-element array of floats in [-1, +1]
// throws if scores.length !== 6
```

All threshold constants embedded. Zero application/interface/infrastructure imports.

---

## Acceptance Criteria

### AC-1: Export Interface + Functions

`index.ts` exports:
- `HaoReading` interface with all four fields (state, binary, isChanging, label)
- `classifyHao(score: number): HaoReading` — maps a single score to its classification
- `encodeHaos(scores: number[]): HaoReading[]` — maps 6 scores to an array of 6 HaoReadings

All threshold constants embedded inline (not imported from domain):
- `LAO_DUONG_THRESHOLD` (≈0.75, exact value per source)
- `THIEU_DUONG_THRESHOLD` (≈0.25, exact value per source)
- `LAO_AM_THRESHOLD` (≈-0.75, exact value per source)

And all lookup tables:
- `STATE_TO_BINARY` mapping state strings to 0 | 1
- `STATE_TO_CHANGING` mapping state strings to boolean
- `HAO_LABELS` mapping state strings to Vietnamese labels

Zero application/interface/infrastructure imports confirmed.

**Evidence:** Paste output of `grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" apps/kinh-dich-service/src/primitive/hao-encoder/` (should return 0 lines).

---

### AC-2: Unit Tests

`cd apps/kinh-dich-service && bun test src/primitive/hao-encoder/` → all tests pass.

**Test cases (≥6 required):**
1. Score > LAO_DUONG_THRESHOLD → state='LAO_DUONG', binary=1, isChanging=true
2. THIEU_DUONG_THRESHOLD < score ≤ LAO_DUONG_THRESHOLD → state='THIEU_DUONG', binary=1, isChanging=false
3. score < LAO_AM_THRESHOLD → state='LAO_AM', binary=0, isChanging=true
4. Remaining range (between LAO_AM and THIEU_DUONG threshold) → state='THIEU_AM', binary=0, isChanging=false
5. `encodeHaos([1, 0, -1, 0.5, -0.5, 0.8])` → array of 6 HaoReadings, each correct for its score
6. `encodeHaos` with length !== 6 → throws Error (input validation)

Paste test output:
```
bun test src/primitive/hao-encoder/ → PASS
```

---

### AC-3: Bun Test Exit 0

```bash
cd apps/kinh-dich-service
bun test src/primitive/hao-encoder/
```

Exit code must be 0. All tests pass.

**Evidence:** Paste command and exit code.

---

### AC-4: Fence-A + R-FENCE Inherited

```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/hao-encoder/
```

Must return 0 matches (no cross-layer imports). R-FENCE discovery already recorded in P1-B1; P1-B3 inherits the `.js`-suffixed ESM import style.

**Evidence:** Paste grep output (empty).

---

### AC-5: Sandbox All-Green (9 Scenarios)

```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```

**Expected output:**
```
[PASS] hexagram-resolver-golden.json
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] ngu-hanh-classifier-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] hao-encoder-golden.json
[PASS] hao-encoder-edge.json
[PASS] hao-encoder-failure.json

[sandbox] PASS 9/9 scenarios (0 failed, 0 skipped)
```

Exit code: 0. All 9 scenarios (P1-B1×3 + P1-B2×3 + P1-B3×3) must be green.

**Evidence:** Paste full sandbox output.

---

### AC-6: G12 DoD Gate (Streak Task #3)

Sandbox all-green (all 9 scenarios across B1 + B2 + B3 primitives) confirmed before RETURN block is written. This task **completes the G12 streak #3**. 

After this task DONE signal returns to PM:
- g12Streak.completed=3
- g12Streak.streakComplete=true
- G12 status transitions to EARNED-PENDING (PO will flip YES at 12/12 terminal atomic close)

**Acceptance:** Sandbox output above (AC-5) is the evidence. All 9 scenarios must show [PASS].

---

## Scenario JSON Files

Create three JSON files in `docs/scenarios/kinh-dich/primitives/`:

### hao-encoder-golden.json

```json
{
  "name": "hao-encoder-golden",
  "primitive": "hao-encoder",
  "description": "Happy path: typical scores mapping across all four states",
  "test_input": {
    "method": "encodeHaos",
    "scores": [0.8, 0.4, -0.8, 0.1, -0.5, 0.6]
  },
  "expected_output": {
    "length": 6,
    "states": ["LAO_DUONG", "THIEU_DUONG", "LAO_AM", "THIEU_AM", "THIEU_AM", "THIEU_DUONG"],
    "binaries": [1, 1, 0, 0, 0, 1],
    "all_have_labels": true
  },
  "notes": "Covers all four state buckets in a single call."
}
```

### hao-encoder-edge.json

```json
{
  "name": "hao-encoder-edge",
  "primitive": "hao-encoder",
  "description": "Boundary conditions: scores at exact thresholds",
  "test_input": {
    "method": "encodeHaos",
    "scores": [0.75, 0.25, -0.75, 0, 0.5, -0.5]
  },
  "expected_output": {
    "length": 6,
    "all_numeric_binaries": true,
    "all_have_boolean_isChanging": true,
    "all_have_non_empty_states": true
  },
  "notes": "Scores at threshold boundaries; verify correct state assignment at each boundary."
}
```

### hao-encoder-failure.json

```json
{
  "name": "hao-encoder-failure",
  "primitive": "hao-encoder",
  "description": "Error case: input array length !== 6",
  "test_input": {
    "method": "encodeHaos",
    "scores": [0.8, 0.4, -0.8, 0.1, -0.5]
  },
  "expected_output": {
    "error": true,
    "error_message_pattern": "length|6"
  },
  "notes": "Array length 5 (invalid); expect Error to be thrown, not process crash."
}
```

---

## Blockers & Dependencies

**Dependencies:** P1-B2 DONE (ngu-hanh-classifier)

**Blockers:** None expected. If sandbox fails on any scenario, debug and record the failure in this handoff before RETURN.

---

## Handoff Completion Checklist

- [ ] AC-1: All exports present; grep returns 0 cross-layer imports
- [ ] AC-2: ≥6 unit tests, all passing
- [ ] AC-3: `bun test src/primitive/hao-encoder/` exits 0
- [ ] AC-4: Fence-A grep returns 0
- [ ] AC-5: Sandbox all-green (9/9 scenarios PASS, exit 0)
- [ ] AC-6: Sandbox output pasted as evidence
- [ ] Three scenario JSON files created (golden, edge, failure)
- [ ] G12 streak #3 milestone reached (ready for PM to mark complete)

---

## Return Block (Do Not Write Until All ACs Pass)

Once all above ACs are verified green:

```
P1-B3 DONE
Commit: [dev-kinh-dich provides SHA]
Sandbox: 9/9 green (hexagram-resolver×3 + ngu-hanh-classifier×3 + hao-encoder×3)
G12 Streak: 3/3 COMPLETE
Evidence: [paste full sandbox output]
Next: P1-C (module stub: reading_composer)
```

---

## Notes

- This is the **final primitive of the G12 streak**. Once DONE, g12Streak.completed=3 and streakComplete=true.
- The sandbox gate (AC-6) must show all 9 scenarios green before PM updates the SSOT.
- P1-B3 unblocks P1-C (module stub), which may be dispatched immediately after P1-B3 signal is received.
- No changes needed to `domain/services.ts` — the source functions remain untouched.
