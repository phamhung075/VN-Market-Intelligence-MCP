---
sprint: QUE-TOOLTIP-DRY
branch: task/QUE-TOOLTIP-DRY-1b-fr1-nfr
size: M
zone: apps/frontend/
depends_on: ["QUE-TOOLTIP-DRY-1a"]
blocks: []
---

## TLDR
Migrate SnapshotRow in dashboard.kinh-dich-signals.tsx to use QueName component (3-line change: import + component swap). Run NFR-1/2/3 grep gates to verify zero tooltip markup duplication, zero hardcoded Vietnamese text in routes, and no regression in fallback logic.

## [PM] Planning Context
- **Zone:** apps/frontend/ (routes + NFR verification)
- **Acceptance Criteria:**
  - [ ] SnapshotRow (dashboard.kinh-dich-signals.tsx L484–L489) replaced: `<span>{item.hexagramName}</span><span>#{item.hexagramNumber}</span>` → `<QueName hexagram={item.hexagramNumber} name={item.hexagramName} />`
  - [ ] Import added: `import { QueName } from "~/components/QueName"`
  - [ ] No tooltip markup duplicated in dashboard.kinh-dich-signals.tsx
  - [ ] Hover on any snapshot row hexagram shows description tooltip (manual test)
  - [ ] Fallback renders plain text on missing desc (no crash on hexagram=0 or undefined)
  - [ ] NFR-1 grep gate passes: `grep -rn "TooltipProvider\|TooltipContent\|TooltipTrigger" apps/frontend/app/routes/` returns 0 matches (tooltip logic confined to QueName.tsx and ui/tooltip.tsx)
  - [ ] NFR-2 grep gate passes: `grep -rn "Thuận lợi\|Bất lợi\|Trung tính\|THUẬN LỢI\|BẤT LỢI\|TRUNG TÍNH" apps/frontend/app/routes/` returns 0 matches (no hardcoded VN hexagram text in routes, only in generated file)
  - [ ] NFR-3 no-op verified: QueName.tsx L40–L45 fallback logic not broken by FR-2 interface change

- **Files to read first:**
  - apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx (SnapshotRow location: L484–L489, data contract: KinhDichSnapshotItem)
  - apps/frontend/app/components/QueName.tsx (target component + interface check)
  - docs/architecture-briefs/2026-06-12-que-tooltip-dry.md (FR-1 requirement + test strategy)

- **Files to modify:**
  - apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx — L484–L489 in SnapshotRow: component swap + import add

- **Files to create:**
  - None

- **Dependencies:**
  - QUE-TOOLTIP-DRY-1a must complete first (QueDescription interface must be stable before SnapshotRow uses it via QueName)

- **Knowledge needed:**
  - docs/handoffs/QUE-TOOLTIP-DRY-BA-spec.md (FR-1 requirement + NFR-1/2/3 spec)
  - docs/architecture-briefs/2026-06-12-que-tooltip-dry.md (render-site inventory + test strategy)

---

## Implementation Notes

### SnapshotRow Migration (3 changes)

**File:** apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx

1. **Add import** (near top of file with other component imports):
```typescript
import { QueName } from "~/components/QueName"
```

2. **Replace SnapshotRow render logic** at L484–L489:
```typescript
// BEFORE
<span>{item.hexagramName}</span>
<span>#{item.hexagramNumber}</span>

// AFTER
<QueName hexagram={item.hexagramNumber} name={item.hexagramName} />
```

3. **Verify data contract:** `KinhDichSnapshotItem` (defined at L67) has:
   - `hexagramNumber: number` (1–64)
   - `hexagramName: string`
   Both are required for the QueName component.

### NFR-1: Zero Tooltip Markup Duplication

Run this grep to verify no Radix tooltip primitives appear outside the QueName component:
```bash
grep -rn "TooltipProvider\|TooltipContent\|TooltipTrigger" apps/frontend/app/routes/
# Should return 0 matches (all tooltip logic is in QueName.tsx)
```

If any matches found, it indicates a hardcoded tooltip in a route — remove it and use QueName instead.

### NFR-2: No Hardcoded Vietnamese Hexagram Text

Run this grep to verify no Vietnamese hexagram interpretation text is hardcoded in routes:
```bash
grep -rn "Thuận lợi\|Bất lợi\|Trung tính\|THUẬN LỢI\|BẤT LỢI\|TRUNG TÍNH" apps/frontend/app/routes/
# Should return 0 matches
```

These strings MUST come from QUE_DESCRIPTIONS (the generated file), not hardcoded.

### NFR-3: Fallback Logic Not Broken

QueName.tsx has logic at L40–L45 to handle missing hexagram entries:
```typescript
if (!QUE_DESCRIPTIONS[props.hexagram]) {
  return <span>{props.name}</span>
}
```

Verify this still works after FR-2 interface change (QueName should still render plain text if no description found).

### Manual Test: SnapshotRow Tooltip

1. Navigate to `/dashboard/kinh-dich-signals`
2. Hover over any hexagram name in the snapshot table
3. Verify a tooltip appears with:
   - **Primary:** coreMeaning (1 clause in Vietnamese)
   - **Secondary label:** marketTrendLabel (e.g., "Thuận lợi (THUẬN LỢI)")

---

## Risk Flags

- **RF-2 (LOW):** Field rename may affect undiscovered consumers. Mitigation: grep `QUE_DESCRIPTIONS` in frontend to verify only QueName uses it.
- **RF-3 (LOW):** hexagramLibrary.ts runtime consumers unchanged (no impact on kinhDichTools.ts).

---

## Note

This task depends on QUE-TOOLTIP-DRY-1a completing first. Once 1a is merged, 1b can proceed immediately. The NFR gates are pass/fail — if any grep returns non-zero matches, fail the task and route back to dev-kinh-dich for remediation.
