# HANDOFF — QUE-REFERENCE-PAGE-1a: Extend Codegen

**Task ID:** QUE-REFERENCE-PAGE-1a  
**Owner:** dev-frontend  
**Status:** READY → dispatch-ready-now (no blockers)  
**Zone:** apps/frontend/ (parallel-safe, unblocked)  
**Sprint:** QUE-REFERENCE-PAGE  
**Priority:** medium  
**Parent Brief:** ARCH-QUE-REFERENCE-PAGE (docs/architecture-briefs/2026-06-12-que-reference-page.md)

---

## Task Summary

Extend the existing codegen script `scripts/gen-que-descriptions.ts` to emit a **second** generated artifact `apps/frontend/app/lib/que-descriptions-detail.generated.ts` alongside the existing `apps/frontend/app/lib/que-descriptions.generated.ts`.

This implements **Design Decision D1** from the brief: preserve the existing 2-field `QueDescription` tooltip contract (sealed by AC-2 in `QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts`), while emitting a full 12-field + phases array `QueDetailDescription` type for the new reference page.

---

## Brownfield (Read-Only)

**Existing script:** `scripts/gen-que-descriptions.ts`
- Parses `apps/kinh-dich-service/dashboard/que-reference.js` (SSOT, 64 entries)
- Emits `apps/frontend/app/lib/que-descriptions.generated.ts` with `QueDescription { coreMeaning, marketTrendLabel }`
- Invoked by npm script: `bun run gen:que`

**SSOT source fields (all from que-reference.js live data):**
```
id, name, chinese, upper, lower, upperElement, lowerElement,
coreMeaning{vi}, marketTrendLabel{vi}, stateInterpretation{vi}, 
favorable{vi}, warning{vi}, phases[6]{phase, action, outcome, gloss{vi}}
```

**Existing test that must NOT regress:**
- `apps/frontend/app/__tests__/QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts`
- AC-2: asserts `QueDescription` has exactly 2 fields (`coreMeaning`, `marketTrendLabel`)

---

## Implementation

### File: `apps/frontend/app/lib/que-descriptions-detail.generated.ts`

Create new generated file (committed alongside updated tooltip file).

**New TypeScript interface:**
```typescript
export interface QueDetailDescription {
  id: number;
  name: string;          // Vietnamese romanized name, e.g. "Kiền"
  chinese: string;       // Chinese character, e.g. "乾"
  upper: string;         // upper trigram name, e.g. "Qian"
  lower: string;         // lower trigram name
  upperElement: string;  // e.g. "Kim"
  lowerElement: string;
  coreMeaning: string;        // .vi from SSOT
  marketTrendLabel: string;   // .vi from SSOT
  stateInterpretation: string; // .vi from SSOT
  favorable: string;           // .vi from SSOT
  warning: string;             // .vi from SSOT
  phases: Array<{
    phase: number;    // 1–6
    action: string;   // GIU | TIEN | THAN | LUI (raw code, not label)
    outcome: string;  // CAT | HUNG | LE (raw code, not label)
    gloss: string;    // .vi from SSOT
  }>;
}

export const QUE_DETAIL: Record<number, QueDetailDescription> = {
  1: {
    id: 1,
    name: "Kiền",
    chinese: "乾",
    upper: "Qian",
    lower: "Qian",
    upperElement: "Kim",
    lowerElement: "Kim",
    coreMeaning: "...",  // .vi value from que-reference.js
    marketTrendLabel: "...",
    stateInterpretation: "...",
    favorable: "...",
    warning: "...",
    phases: [
      { phase: 1, action: "GIU", outcome: "CAT", gloss: "..." },
      { phase: 2, action: "TIEN", outcome: "CAT", gloss: "..." },
      // ... 6 phases total
    ]
  },
  // ... 63 more entries (ids 2–64)
};
```

**File header comment (required):**
```typescript
/**
 * AUTO-GENERATED from scripts/gen-que-descriptions.ts
 * Source: apps/kinh-dich-service/dashboard/que-reference.js
 * 
 * Full Kinh Dịch reference set — all 64 hexagrams with extended Vietnamese detail.
 * DO NOT EDIT manually. Re-run: bun run gen:que
 */
```

### Script: `scripts/gen-que-descriptions.ts` — Add Second Output Block

Keep the existing `QueDescription` output block **unchanged**. Add a second block:

```typescript
// === EXISTING BLOCK (unchanged) ===
// Writes apps/frontend/app/lib/que-descriptions.generated.ts with QueDescription type
const tooltipOut = '...';
fs.writeFileSync(tooltipPath, tooltipOut);

// === NEW BLOCK (added) ===
// Writes apps/frontend/app/lib/que-descriptions-detail.generated.ts with QueDetailDescription type
const detailOut = `
/**
 * AUTO-GENERATED from scripts/gen-que-descriptions.ts
 * Source: apps/kinh-dich-service/dashboard/que-reference.js
 * 
 * Full Kinh Dịch reference set — all 64 hexagrams with extended Vietnamese detail.
 * DO NOT EDIT manually. Re-run: bun run gen:que
 */

export interface QueDetailDescription {
  id: number;
  name: string;
  chinese: string;
  upper: string;
  lower: string;
  upperElement: string;
  lowerElement: string;
  coreMeaning: string;
  marketTrendLabel: string;
  stateInterpretation: string;
  favorable: string;
  warning: string;
  phases: Array<{
    phase: number;
    action: string;
    outcome: string;
    gloss: string;
  }>;
}

export const QUE_DETAIL: Record<number, QueDetailDescription> = {
  ${queReference.map(que => {
    const phases = que.phases.map(p => ({
      phase: p.phase,
      action: p.action,
      outcome: p.outcome,
      gloss: p.gloss.vi
    }));
    return JSON.stringify({
      id: que.id,
      name: que.name,
      chinese: que.chinese,
      upper: que.upper,
      lower: que.lower,
      upperElement: que.upperElement,
      lowerElement: que.lowerElement,
      coreMeaning: que.coreMeaning.vi,
      marketTrendLabel: que.marketTrendLabel.vi,
      stateInterpretation: que.stateInterpretation.vi,
      favorable: que.favorable.vi,
      warning: que.warning.vi,
      phases: phases
    }, null, 2);
  }).join(',\n  ')}
};
`;

const detailPath = 'apps/frontend/app/lib/que-descriptions-detail.generated.ts';
[ -s "${detailPath}" ] && fs.writeFileSync(detailPath, detailOut) || throw new Error('Failed to write detail descriptions');
```

**Risk mitigation (R2):** Use `[ -s ]` guard check before write to catch silent 0B writes:
```typescript
if (!detailOut || detailOut.length === 0) {
  throw new Error('Failed to generate detail descriptions — output is empty');
}
fs.writeFileSync(detailPath, detailOut);
```

### npm Script

**No new script needed.** The existing `bun run gen:que` command invokes the extended script and produces both files in one invocation.

---

## Acceptance Criteria

- [ ] `gen:que` script runs without error (both output blocks execute)
- [ ] File `apps/frontend/app/lib/que-descriptions-detail.generated.ts` exists
- [ ] File has **exactly 64 entries** in `QUE_DETAIL` record
- [ ] `QueDetailDescription` interface has all 12 fields + phases array:
  - `id, name, chinese, upper, lower, upperElement, lowerElement`
  - `coreMeaning, marketTrendLabel, stateInterpretation, favorable, warning`
  - `phases[6]` with `{phase, action, outcome, gloss}`
- [ ] Each phase object has exactly 4 fields
- [ ] File includes header comment citing source (que-reference.js)
- [ ] Empty-file guard (`[ -s ]` check) present in script
- [ ] All text values from SSOT, no hardcoded placeholders
- [ ] Existing `QueDescription` type (2 fields) unchanged
- [ ] Both generated files committed together in one commit
- [ ] Existing `QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts` still passes (AC-2 regression check)

---

## Files Modified / Created

| Path | Action |
|------|--------|
| `scripts/gen-que-descriptions.ts` | Extend: add second output block |
| `apps/frontend/app/lib/que-descriptions-detail.generated.ts` | Create: new generated artifact |
| `apps/frontend/app/lib/que-descriptions.generated.ts` | Commit: re-run gen:que (no change expected if source is stable) |

---

## Dependencies

- **Blocks:** QUE-REFERENCE-PAGE-1b (route import), QUE-REFERENCE-PAGE-TEST (test verification)
- **Blocked by:** none (launch-ready)

---

## Test Coverage

This task output will be verified by:
- QUE-REFERENCE-PAGE-TEST (T1, T2, T3, T6): interface shape, count, spot-check, regression guard

---

## Notes

- Do NOT widen the existing `QueDescription` interface (D1 rules this out explicitly to protect AC-2).
- Both files are generated by **one** script invocation — no duplication of parse logic.
- Commit both `.generated.ts` files together in a single commit.
- CI has no `bun run gen:que` step — generated files are committed artifacts. Developers regenerate manually when SSOT changes.

