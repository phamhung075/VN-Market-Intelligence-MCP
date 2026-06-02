---
task_id: FOU-2-REQ1
title: REQ1: Kinh Dich hexagram-name hover tooltip on the 'Que' column
owner: dev-frontend
priority: medium
depends:
  - FOU-1-DESIGN
zone: apps/frontend/
status: TODO
---

## Summary

Implement a hoverable tooltip on hexagram names in the Kinh Dich section of dashboard.analysis.tsx that displays the hexagram meaning and trading interpretation. Follows seam A1 decision from FOU-1-DESIGN brief: static frontend-generated hexagram-id→description map derived from QUE_DATA (no mcp-server rebuild).

## Acceptance Criteria

1. **SSOT Factory Component**: Create `apps/frontend/app/components/QueName.tsx` as the single render site for all hexagram name + tooltip logic. Zero duplicated name/tooltip rendering anywhere else in codebase (OPERATOR MANDATE).

2. **Generated Description Map**: Implement `scripts/gen-que-descriptions.ts` that:
   - Imports `QUE_DATA` and `QUE_META` from `apps/mcp-server/src/domain/services/kinhDich/hexagramLibrary.ts`
   - Generates `apps/frontend/app/lib/que-descriptions.generated.ts` with `QUE_DESCRIPTIONS: Record<number, QueDescription>`
   - Auto-generated header comment warns DO NOT EDIT
   - Added to `package.json` scripts as `"gen:que": "bun run scripts/gen-que-descriptions.ts"`
   - Generated file committed to repo (not gitignored)

3. **Description Type** (`QueDescription`):
   ```typescript
   interface QueDescription {
     coreMeaning: string;           // Primary hover text
     judgment_interpretation: string; // Secondary — trading judgment
     image_action: string;          // Action guidance
     state_trend: string;           // Market trend state
   }
   ```

4. **Refactor All 4 Render Sites**:
   - `dashboard.analysis.tsx` L673–674: `KinhDichMarketPanel` → replace 2 spans with `<QueName>`
   - `dashboard.analysis.tsx` L796–797: `StockTable` row cell → replace 2 spans with `<QueName>`
   - `dashboard.analysis.tsx` L1066: `InfoSourcePanel` buildRows string literal → replace with `<QueName>` as ReactNode
   - `dashboard.analysis.tsx` L1393–1396: `KinhDichDetailPanel` Row value → replace inner span with `<QueName>`
   - **Critical**: Incomplete refactor violates factory mandate.

5. **UI/UX**:
   - Hovering the hexagram name shows tooltip with `coreMeaning` + `state_trend`
   - Keyboard/focus accessible (shadcn Tooltip auto-wires `aria-describedby`, Escape to dismiss)
   - No layout shift on hover
   - Graceful no-op if hexagram id has no description entry
   - Vietnamese description text (source is already Vietnamese in QUE_DATA)
   - `max-w-xs` on TooltipContent with `leading-relaxed` for 1–2 line Vietnamese prose

6. **Dependencies**:
   - `bun add @radix-ui/react-tooltip`
   - Create `apps/frontend/app/components/ui/tooltip.tsx` (shadcn pattern with Radix re-exports + cn() styling)

7. **Build & Test**:
   - `bun run gen:que` produces correct generated file before frontend build
   - `typecheck` passes
   - Frontend tests pass (228 tests in suite)
   - No regressions in existing renders

8. **Deployment & Verification**:
   - ops rebuilds frontend container after merge
   - Router live-verifies: hover a spot hexagram (e.g. "Kiền"), tooltip text matches QUE_DATA.coreMeaning for that hexagram id

## Technical Details

**QueName Component Signature**:
```typescript
interface QueNameProps {
  hexagram: number;      // 1–64
  name: string;          // Vietnamese name from API
  className?: string;    // Optional CSS class for trigger span
}

function QueName({ hexagram, name, className }: QueNameProps): ReactNode
```

**Trigger rendering**: `#{hexagram} — {name}` with `cursor-help` + `underline decoration-dotted` to signal interactivity.

**Tooltip**: Shows only if `QUE_DESCRIPTIONS[hexagram]` exists; graceful fallback to plain span if not.

## Anti-Patterns to Avoid

- Do NOT hand-copy the 64 entries into multiple files (drift risk — 3 prior bugs in this repo)
- Do NOT duplicate tooltip logic across render sites
- Do NOT render hexagram names outside the `QueName` component
- Do NOT skip refactoring any of the 4 sites

## Files Modified

### New
- `apps/frontend/app/components/QueName.tsx`
- `apps/frontend/app/components/ui/tooltip.tsx`
- `apps/frontend/app/lib/que-descriptions.generated.ts` (generated)
- `scripts/gen-que-descriptions.ts`

### Modified
- `apps/frontend/app/routes/dashboard.analysis.tsx` (4 render sites L673, L796–797, L1066, L1393–1396)
- `apps/frontend/package.json` (add gen:que script + @radix-ui/react-tooltip dependency)

## Definition of Done

- [ ] Codegen script written and tested (`gen:que` produces valid TS)
- [ ] QueName.tsx implements SSOT factory component
- [ ] ui/tooltip.tsx created (shadcn pattern)
- [ ] All 4 render sites refactored to use `<QueName>`
- [ ] No hexagram name/tooltip logic exists outside QueName.tsx
- [ ] typecheck passes, 228 tests green
- [ ] frontend container rebuilt
- [ ] Router live-verifies tooltip text matches QUE_DATA for spot hexagram
