---
sprint: BCTC-ANALYTICS-LAYER
task_id: FIX-PENDING-REFINE-TICKER-TARGETING
size: S
priority: low
depends_on:
  - FIX-FINALIZE-STATUS-STUCK-PARTIAL
blocks: []
---

## TLDR

The `get_bctc_pending_refine` tool silently ignores `ticker` and `report_id` arguments. Zod's safeParse strips unknown fields, so the queue always returns the oldest PENDING/PARTIAL report regardless of the intended filter. This blocks on-demand refine of specific tickers (e.g. CTG for the REFINE-CRON-ARM verification gate). Fix: add optional `ticker` and `report_id` parameters to the tool's InputSchema and extend the SQL query to honor them. When `report_id` is supplied, bypass queue-eligibility filters and return the exact report (enables force-re-verify).

## [PM] Planning Context

**Acceptance Criteria:**

- [ ] AC-1-1: `get_bctc_pending_refine({ ticker: "CTG" })` returns a CTG report (action_code='CTG')
- [ ] AC-1-2: `get_bctc_pending_refine({ ticker: "CTG", limit: 5 })` returns up to 5 CTG reports in refine queue
- [ ] AC-2-1: `get_bctc_pending_refine({ report_id: "c6b17c36-1f4f-48bc-a367-b48afc163ceb" })` returns that specific CTG report (c6b17c36)
- [ ] AC-2-2: When `report_id` is supplied, the query skips `text_status`/`refine_status` filters (returns report even if not PENDING/PARTIAL)
- [ ] AC-2-3: `report_id` takes precedence when both `ticker` and `report_id` are supplied
- [ ] AC-3-1: Zod InputSchema includes both `ticker` and `report_id` parameters with correct descriptions
- [ ] AC-3-2: SQL query has three branches: default (unchanged), ticker-filtered, report_id-direct
- [ ] AC-4-1: `confirm_status` guard remains for both paths (don't return CONFIRMED reports)
- [ ] AC-5-1: `docs/standards/mcp-tools.md` parameter registry updated with new parameters
- [ ] AC-6-1: `bun test` baseline remains >8800 pass / <=1 fail after changes
- [ ] AC-6-2: No new test files created; verification gates in section below

**Files to read first:**

- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — InputSchema (lines 78–86), SQL query (lines 119–129), handler logic
- `docs/standards/mcp-tools.md` — parameter registry format (find existing `get_bctc_pending_refine` entry)
- Architect brief: `docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md` §BUG 3 — full design + risk flag RF-3

**Files to modify:**

1. **`apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`**
   - Lines 78–86 (InputSchema): extend Zod object to include:
     ```typescript
     ticker: z.string().optional().describe("Filter by ticker symbol (action_code)"),
     report_id: z.string().optional().describe("Fetch a specific report by ID (returns array of 1 or 0)"),
     ```
   - Lines 119–129 (SQL query): replace with conditional logic:
     - If `report_id` is provided: `WHERE id = ? AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')`
     - Else if `ticker` is provided: add `AND action_code = ?` to the existing predicate
     - Else (default): use existing query unchanged
   - Bind parameters correctly for each branch

2. **`docs/standards/mcp-tools.md`**
   - Find the `get_bctc_pending_refine` entry in the parameter registry
   - Add documentation for the two new parameters:
     - `ticker` (optional, string) — filter by ticker symbol (action_code)
     - `report_id` (optional, string UUID) — fetch a specific report; takes precedence over ticker

**Verification gates (mandatory before merge):**

1. **Ticker filter test:**
   - Call `get_bctc_pending_refine({ ticker: "CTG", limit: 1 })`
   - Verify response is an array with one report (or empty if no CTG in queue)
   - If returned, verify `action_code === "CTG"`

2. **Report ID direct fetch test:**
   - Call `get_bctc_pending_refine({ report_id: "c6b17c36-1f4f-48bc-a367-b48afc163ceb" })`
   - Verify response includes the CTG report c6b17c36 with all window/page data
   - Call with a non-existent report_id → verify response is an empty array (not an error)

3. **Precedence test:**
   - Call `get_bctc_pending_refine({ report_id: "c6b17c36-...", ticker: "ACB" })`
   - Verify response is the CTG report (report_id takes precedence over ticker mismatch)

4. **Confirm status guard:**
   - Identify a report with `confirm_status = 'CONFIRMED'`
   - Call with `report_id` pointing to that report
   - Verify it's NOT returned (confirm_status guard must still apply)

5. **Regression test:**
   - Call `get_bctc_pending_refine()` with no parameters
   - Verify it still returns the oldest PENDING/PARTIAL/FAILED report (default behavior unchanged)
   - Call `get_bctc_pending_refine({ limit: 3 })`
   - Verify it returns up to 3 oldest reports (default behavior with limit unchanged)
   - Run `bun test` — must pass existing baseline

**Risk flags (from brief):**

- **RF-3 (MEDIUM) — report_id bypass skips refine_status filter:** When `report_id` is supplied, the query skips `refine_status IN ('PENDING','PARTIAL','FAILED')` check. This is intentional (targeted fetch for on-demand verification). Dev must:
  1. Add a code comment explaining this behavior
  2. Update tool description in the handler to document that `report_id` parameter bypasses queue-eligibility filters
  3. Ensure this doesn't create a security issue (any report can be fetched by ID; confirm this is acceptable UX)

**Dependencies:**

Depends on FIX-FINALIZE-STATUS-STUCK-PARTIAL (P0). This task can be implemented in parallel with FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE (P1), but its verification gates (ticker CTG, report_id c6b17c36) assume P0 has drained the queue.

---

## Architecture Reference

Full design in `docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md` §BUG 3. Key decisions:

**Do NOT create a new tool.** Extend the existing tool with optional parameters. The page-text fetch + window partition logic is complex and reusable; creating a separate tool would duplicate it.

**Parameter design:**

```typescript
const InputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  ticker: z.string().optional().describe("Filter by ticker symbol (action_code)"),
  report_id: z.string().optional().describe("Fetch a specific report by ID (returns array of 1 or 0)"),
});
```

`report_id` takes precedence over `ticker` when both are supplied.

**SQL branches:**

```sql
-- When report_id supplied:
WHERE id = ?
  AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')

-- When ticker supplied:
WHERE text_status = 'COMPLETE'
  AND refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
  AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
  AND action_code = ?
  [LIMIT n]

-- Default (unchanged):
WHERE text_status = 'COMPLETE'
  AND refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
  AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
  [LIMIT n]
```

**DDD layer assignment:**

- Interface layer: `getBctcPendingRefineTool.ts` — Zod schema + SQL query change only
- No domain or application layer change

**Schema compliance:**

Update `docs/standards/mcp-tools.md` to document the new parameters. No change to tool count (same tool, extended schema).

---

## Implementation Notes

- **Zone:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/` — getBctcPendingRefineTool.ts only
- **DDD:** interface-layer changes only; no domain layer changes
- **Parallel ready:** Can implement in parallel with P1 (FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE), but both depend on P0 for verification
- **Code comment:** RF-3 requires a comment in the handler explaining why `report_id` bypasses refine_status filter

---

## Dispatch

**Agent:** `dev-mcp-server`

**Ready now:** No (blocked by FIX-FINALIZE-STATUS-STUCK-PARTIAL for queue drain + verification)

**Can start in parallel with:** FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE (both are P1/P2 and both depend on P0)

**Estimated effort:** ~1h (schema extension + SQL branches + docs update)
