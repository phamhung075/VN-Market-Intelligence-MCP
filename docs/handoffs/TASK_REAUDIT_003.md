<!-- DEV-REAUDIT-3 — NFR-C-5 foreign-flow stale_fields — generated 2026-06-11 by PM -->

## Task: DEV-REAUDIT-3 — Add stale_fields to foreign-flow handler

**Task ID:** REAUDIT-003  
**Title:** NFR-C-5 foreign-flow stale_fields: mcp-server implementation  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/mcp-server/  
**Owner:** dev-mcp-server  
**Priority:** HIGH  
**Depends on:** none  
**Paired with:** FE-REAUDIT-2 (frontend column badge)  
**Est. effort:** 1–1.5 hours  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 3. NFR-C-5

---

## Problem Statement

**Item A-02:** `currentHoldingRatio`, `maxHoldingRatio`, `marketCapBn` are null on 100% of ~103 foreign-flow rows (live probe 2026-06-11). Fields are correctly passed through as null by `shapeRow()`. However, the response has no indication that these fields are **structurally unavailable** (not "missing today" but "not ever populated"). Frontend shows "—" in every cell, which looks like missing data for that ticker when actually the field is not available upstream.

**NFR-C-5 ruling:** Add `stale_fields: string[]` to response contract. Populate by scanning rows after `buildSummary()`: if >50% of items have null for a field, add that field name to the array. Frontend uses this to show a column-header badge "Không có dữ liệu" instead of row-by-row "—".

---

## Acceptance Criteria

1. **Add `stale_fields: string[]` to `ForeignFlowResponse` type**
   - Root-level field (not per-item)
   - Initialize as empty array `[]`
   - Represents column-level unavailability

2. **Implement stale_fields population logic in `foreignFlowHandler.ts`**
   - After `buildSummary(allItems)` returns
   - Scan allItems for null-count per field:
     ```typescript
     const fieldNullCounts = {
       currentHoldingRatio: 0,
       maxHoldingRatio: 0,
       marketCapBn: 0
     };
     allItems.forEach(item => {
       if (item.currentHoldingRatio === null) fieldNullCounts.currentHoldingRatio++;
       if (item.maxHoldingRatio === null) fieldNullCounts.maxHoldingRatio++;
       if (item.marketCapBn === null) fieldNullCounts.marketCapBn++;
     });
     ```
   - Threshold: >50% of items have null
     ```typescript
     const threshold = allItems.length * 0.5;
     const staleFields = [];
     if (fieldNullCounts.currentHoldingRatio > threshold) staleFields.push("currentHoldingRatio");
     if (fieldNullCounts.maxHoldingRatio > threshold) staleFields.push("maxHoldingRatio");
     if (fieldNullCounts.marketCapBn > threshold) staleFields.push("marketCapBn");
     response.stale_fields = staleFields;
     ```

3. **Verify contract integrity**
   - Existing fields unchanged
   - Response still returns all items with null values intact (no filtering)
   - Only the stale_fields array signals unavailability to client

4. **Unit tests**
   - Empty items: `stale_fields === []`
   - All items have null for field: field added to array
   - 50% items have null: field NOT added (threshold is >50%, not ≥50%)
   - 51% items have null: field added
   - Mixed scenario: some fields hit threshold, others don't

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` | interface | Add stale_fields scan + array population |
| `apps/mcp-server/src/interface/mcp/types/ForeignFlowResponse.ts` (or inline) | types | Add `stale_fields: string[]` to response type |
| `apps/mcp-server/src/interface/mcp/routes/*.test.ts` | test | Unit tests for stale_fields logic |

---

## Decision Journal

**Why column-level unavailability vs. row-level staleness?**  
The values are structurally absent (source API doesn't populate them), not stale (absent today but present yesterday). This is a data-source limitation, not a staleness issue. Separate concept from NFR-C-1 (which flags aged data). Field-level "not available" is more accurate.

**Why >50% threshold?**  
If most items lack the field, the column is effectively unusable for decision-making. Threshold balances signal clarity (don't flag if only 1 outlier is null) with usability (flag if column is mostly empty).

**Performance impact?**  
~103 items * 3 fields = 309 null checks. O(N) scan is negligible and happens post-summary (not in hot path).

---

## Dependent Tasks

- **FE-REAUDIT-2:** Frontend reads stale_fields array and renders column-header badge. Start after this task merged.

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-02
- Zone standard: `docs/policies/dev-standards.md`
