---
sprint: (deferred — future sprint)
branch: task/QUE-TOOLTIP-DRY-FLIP-ROW-future
size: S
zone: apps/mcp-server/ + apps/frontend/
depends_on: []
blocks: []
---

## TLDR
Add numeric hexagram IDs to KinhDichFlip DTO (API + frontend interface), then migrate FlipRow in dashboard.kinh-dich-signals.tsx to use QueName component. Out of scope for QUE-TOOLTIP-DRY sprint per PO-Q4 ruling (DTO lacks ids today).

## Context

**Status:** DEFERRED — Explicitly out of QUE-TOOLTIP-DRY sprint per PO-Q4 and architect findings.

**Reason:** FlipRow currently renders action strings (fromAction, toAction) without hexagram numeric IDs. QueName requires a numeric hexagram prop. Adding the ids to KinhDichFlip DTO requires:
1. API change in mcp-server (KinhDichFlip type)
2. Frontend interface update (KinhDichFlip interface)
3. Then the FlipRow → QueName migration

This is a separate concern from the tooltip SSOT alignment and can be delivered in a follow-up sprint.

## Detailed Scope (for future sprint planning)

### Files to modify (when ready):
- `apps/mcp-server/src/interface/mcp/types/kinhDich.ts` — add `fromHexagramNumber: number`, `toHexagramNumber: number` to KinhDichFlip interface
- `apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx` — KinhDichFlip interface, FlipRow render logic L452–L471

### Changes to FlipRow render:
Replace the action-string badges with hexagram-aware rendering once the DTO has the IDs. Example:
```typescript
// BEFORE (action badges only)
<span>{flip.fromAction}</span> → <span>{flip.toAction}</span>

// AFTER (hexagrams via QueName + action as annotation)
<QueName hexagram={flip.fromHexagramNumber} name={flip.fromHexagramName} />
<span className="mx-1 text-gray-400">→</span>
<QueName hexagram={flip.toHexagramNumber} name={flip.toHexagramName} />
```

### Acceptance Criteria (when implemented):
- [ ] KinhDichFlip DTO carries `fromHexagramNumber` and `toHexagramNumber` (number, 1–64)
- [ ] FlipRow renders both hexagrams via QueName component
- [ ] Hover shows tooltip for each hexagram name
- [ ] NFR gates re-verified (zero hardcoded text, zero duplicate markup)

### Risk:
- Requires coordination with mcp-server API change
- May impact kinhDichTools.ts signal generation (if those signals populate the DTO)

---

## Backlog Entry

Schedule this for a future sprint after QUE-TOOLTIP-DRY is shipped and verified live. Track as a low-priority follow-up (Info severity, not blocking).
