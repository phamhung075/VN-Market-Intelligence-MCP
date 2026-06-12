# [Architect] BCTC Refine State-Machine Ruling
# Sprint BCTC-ANALYTICS-LAYER · Tasks FIX-FINALIZE-STATUS-STUCK-PARTIAL / FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE / FIX-PENDING-REFINE-TICKER-TARGETING

**Date:** 2026-06-12
**Zone:** apps/mcp-server/src/
**Owner:** dev-mcp-server
**BUILD-STANDARD:** not-applicable (bug-fix, no new primitives)
**Recurring-bug gate:** 18 prior touches of finalize/refine path — architect ruling REQUIRED before patch

---

## Brownfield Index

Files read:

- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` (1154 L) — Phase 4 tool handler
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` (269 L) — queue query
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` (517 L) — orchestration helpers + fetchAllPageTexts
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` (lines 577–810) — checkPublishability + PUB-5
- `apps/mcp-server/src/domain/services/financial-reports/bctcSectionCompleteness.ts` (76 L) — checkSectionCompleteness
- `apps/mcp-server/src/application/usecases/parseBctcReport.ts` (line 279 context) — extraction_confidence written at parse
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` (line 780 context) — INSERT OR REPLACE writes extraction_confidence

---

## BUG 1 — FIX-FINALIZE-STATUS-STUCK-PARTIAL [P0]

### Root Cause (confirmed from code, not hypothesis)

The override is in `finalizeBctcRefineTool.ts` lines 328–341, the **BEQ-7 section guard**:

```typescript
// lines 128–131: caller status accepted into mutable variable
const { report_id, report_status: callerReportStatus } = parsed.data;
let report_status: "DONE" | "PARTIAL" | "FAILED" = callerReportStatus;

// lines 328–341: BEQ-7 override
if (report_status === "DONE") {
  const completeness = checkSectionCompleteness(finalRows);
  if (!completeness.isComplete) {
    report_status = "PARTIAL";   // ← overwrites caller's DONE
  }
}
```

`checkSectionCompleteness` (domain layer, pure) requires rows in ALL THREE sections:
`balance_sheet/general` AND `income_statement` AND `cash_flow`. If any one section is absent,
`isComplete = false` → status is silently overridden to PARTIAL before the DB write.

**Why ACB fea19bae stays PARTIAL despite 27/27 windows DONE:**
`finalRows` is built by parsing only DONE windows via `parseRefinedMarkdown`. If the refined
markdown across those 27 windows does not contain all three statement sections — or if
`checkSectionCompleteness` has a section-label mismatch against the actual parser output
(e.g. all rows tagged `general` rather than `income_statement` / `cash_flow`) — the guard
fires, overrides DONE → PARTIAL, and writes PARTIAL to `financial_reports.refine_status`.
On the very next cron tick, `get_bctc_pending_refine` queries:

```sql
WHERE refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
```

PARTIAL satisfies that predicate → ACB is re-served as queue head. With 27/27 windows
already DONE in `bctc_refined_units`, the refine fleet reprocesses them, calls finalize
again with `report_status=DONE`, BEQ-7 fires again → same PARTIAL write. Infinite loop.

The response `{ ok: true, rows_parsed: 106 }` is truthful — rows were parsed and inserted.
But the `ok:true` response does NOT reflect the effective written status, which can be PARTIAL
due to BEQ-7. The caller has no way to know the override fired.

### State Machine Ruling

**Server owns the DONE/PARTIAL/FAILED decision.** The caller supplies a signal ("I believe
this is DONE") but the server's BEQ-7 completeness gate is the authoritative guard. This is
correct architecture — the server must defend against false-DONE from a caller that doesn't
have section visibility. Do NOT remove or bypass BEQ-7.

**The bug is not in who owns the decision — it is in the feedback loop and queue predicate.**

#### Required transitions:

| Current state | Condition | Transition |
|---|---|---|
| PARTIAL | BEQ-7 fires on re-finalize AND all windows DONE | stays PARTIAL (correct) |
| PARTIAL | All windows DONE AND BEQ-7 fires | → must exit pending queue |
| PARTIAL | Genuine partial (some windows FAILED) | stays in queue (correct) |

The core invariant violated: **a report where ALL windows are in `window_status=DONE`
in `bctc_refined_units` MUST exit the pending queue regardless of section completeness.**
Section incompleteness is a data quality issue, not a refine completion issue.

#### Ruling: two independent fixes required

**Fix A — Queue predicate fix (load-bearing):**
`get_bctc_pending_refine` must exclude reports where all pushed windows are DONE.
The correct SQL predicate is:

```sql
WHERE text_status = 'COMPLETE'
  AND refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
  AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
  AND NOT (
    refine_status = 'PARTIAL'
    AND (
      SELECT COUNT(*) FROM bctc_refined_units u
      WHERE u.report_id = financial_reports.id
        AND u.window_status != 'DONE'
    ) = 0
    AND (
      SELECT COUNT(*) FROM bctc_refined_units u
      WHERE u.report_id = financial_reports.id
    ) > 0
  )
```

Interpretation: exclude a PARTIAL report when it has at least one unit AND all units
are DONE (i.e., nothing left to refine — the PARTIAL is a data-quality PARTIAL, not
a refine-work-remaining PARTIAL).

**Fix B — Response transparency (observability fix):**
`finalizeBctcRefineTool` must return the effective written status, not just `ok:true`.
The response must include the actual `refine_status` written:

```typescript
// Current (opaque):
return { ok: true, rows_parsed: totalRows }

// Required (transparent):
return { ok: true, rows_parsed: totalRows, effective_status: report_status, beg7_override: callerWasDone && report_status === "PARTIAL" }
```

The `beg7_override: true` flag allows the fleet cron to detect and log the override,
and prevents it from re-queuing blindly.

**Fix C — Introduce `DONE_PARTIAL` or extend queue predicate (alternative to Fix A):**
An alternative to the SQL exclusion is a new status value `DONE_PARTIAL` for "all windows
processed but section-incomplete." This is cleaner semantically but requires a schema
migration + all callers of refine_status. **RULING: use Fix A (SQL predicate only).**
No schema change — PARTIAL retains its meaning; the queue just excludes "fully-processed PARTIAL."

#### DDD layer assignment:
- Fix A: interface layer (`getBctcPendingRefineTool.ts`) — SQL query change only
- Fix B: interface layer (`finalizeBctcRefineTool.ts`) — response shape change
- No domain layer change (BEQ-7 guard in finalizeBctcRefineTool stays intact)

#### Verification gate (carry-forward per PO spec):
After Fix A lands: `get_bctc_pending_refine(limit:1)` returns a report with `id != fea19bae-2b7a-4954-b3e0-e09d7bfc7390`. A subsequent refine cron tick processes a PENDING report from the 34-report queue.

---

## BUG 2 — FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE [P1]

### Root Cause (confirmed from code)

`extraction_confidence` is written at OCR-parse time in:
- `parseBctcReport.ts:279` — primary parse path
- `fetchParseAndStoreBctc.ts:780` — secondary/fallback path

Neither path is called after finalize. `finalizeBctcRefineTool.ts` has no write to
`extraction_confidence` in any of its BLOCK-1 through BLOCK-4 steps. `checkPublishability`
reads `extraction_confidence` from the `financial_reports` row passed in as `row` (the
`latestRow` query in bctcFullTools). The column is frozen at OCR-parse time and never
updated. For ACB the OCR parse returned 0.375 (37.5%) and that value persists forever.

PUB-5 (`bctcFullTools.ts:728–738`) evaluates before PUB-3 in call order but
`checkPublishability` checks them in PUB-1→PUB-2→PUB-3→PUB-4→PUB-5 order. PUB-5 fires
at line 733 and returns `publishable: false` for any report where
`extraction_confidence < 0.5`, regardless of refine quality.

### Ruling: Recompute confidence at finalize from refined-row coverage

**Chosen: recompute at finalize.** Do NOT make PUB-5 coverage-aware.

Rationale:
1. `extraction_confidence` is a persistent column read by multiple consumers
   (validation in BLOCK-4, PUB-8 parent-only heuristic, Telegram alert formatting,
   reports.ts display). Making PUB-5 coverage-aware would fix only the serve path;
   the frozen value would remain wrong everywhere else.
2. The refined row set is the ground truth after finalize. Row coverage over
   the total OCR page count is a more accurate confidence signal than the
   OCR extraction heuristic used at parse time.
3. Recompute-at-finalize is the same pattern as BLOCK-3 (ratio re-derive) and
   BLOCK-4 (validation_status refresh) — consistent with the existing finalize contract.
4. Making PUB-5 "refine-aware" requires threading refine state into checkPublishability,
   adding a second source-of-truth for coverage assessment, and risks PUB-5 becoming
   dead code when all reports are eventually refined.

#### Formula (new confidence signal at finalize time):

```
refined_confidence = refined_rows_with_non_null_value / total_possible_financial_fields
```

Simpler and more auditable: use coverage ratio from the refined row set:

```
refined_confidence = min(1.0, count_of_non_null_value_current_rows / expected_rows_floor)
```

Where `expected_rows_floor` is a constant (e.g. 30 — approximate minimum for a complete
BCTC with balance sheet + income + cash flow). If `refined_rows >= expected_rows_floor`,
confidence = 1.0. This is a coarse but honest signal that a refinement was successful.

**More precise alternative (preferred):** compute confidence from section completeness
fractions. The bctcSectionCompleteness service already detects presence; extend it to
return row counts per section, then compute:

```typescript
const refinedConfidence = (
  (hasBalanceSheet ? 0.4 : 0) +
  (hasIncomeStatement ? 0.4 : 0) +
  (hasCashFlow ? 0.2 : 0)
);
// If all 3 present → 1.0 (forces above PUB-5 gate cleanly)
// If 2/3 present → 0.6–0.8 (still above threshold)
// If 1/3 present → 0.2–0.4 (stays below threshold — correct)
```

**RULING: implement weighted section-presence confidence.** This is semantically correct
(a report with all 3 sections present after refine IS highly confident), requires no new
dependencies, and uses the already-invoked `checkSectionCompleteness` result.

#### DDD layer assignment:
- `checkSectionCompleteness` already returns `hasBalanceSheet`, `hasIncomeStatement`,
  `hasCashFlow` — no change to domain service needed.
- New computation in `finalizeBctcRefineTool.ts` (BLOCK-1 region, after the
  section-completeness check): write `SET extraction_confidence = ? WHERE id = ?`
  using the weighted formula.
- One new DB UPDATE after the main transaction. Non-fatal (same pattern as BLOCK-1..4).

#### Guard: only overwrite if the refined_confidence EXCEEDS the current OCR-parse value.
If OCR was 0.9 and refine only got 2/3 sections (0.6–0.8), preserve the higher OCR value.
A downward rewrite would incorrectly penalize a good extraction.

#### DDD layer assignment:
- All changes in `finalizeBctcRefineTool.ts` — interface layer (stays consistent)
- Domain: `bctcSectionCompleteness.ts` is already invoked; no change required

#### Verification gate:
After Fix B for BUG 2 (dependent on BUG 1 fixing the deadlock): `get_bctc_full(ACB)`
serves real financial scalars (not withheld by PUB-5). VNM consolidated control must
remain servable (confidence must not regress for a correctly extracted report).

---

## BUG 3 — FIX-PENDING-REFINE-TICKER-TARGETING [P2]

### Root Cause (confirmed from code)

`getBctcPendingRefineTool.ts` Zod InputSchema (lines 78–86) accepts only `limit`:

```typescript
const InputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional()
    .describe("Maximum reports to return (default: no limit, max 100)"),
});
```

No `ticker` or `report_id` parameter exists. When the fleet cron calls
`get_bctc_pending_refine({ ticker: "CTG", limit: 1 })`, Zod's `safeParse` strips unknown
fields silently — `ticker` is dropped, the query runs without any ticker filter, and the
oldest PARTIAL/PENDING report (currently ACB fea19bae) is returned. No error is surfaced.

The SQL query (lines 119–129) has no WHERE clause condition for ticker. The `financial_reports`
table has an `action_code` column (the ticker symbol) which is populated at parse time.

### Ruling: add optional `ticker` and `report_id` parameters to the existing tool

**Do NOT create a new tool.** The existing tool covers the need once the schema is extended.
Creating a second tool would duplicate the page-text fetch + window partition logic.

#### Parameter design:

```typescript
const InputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  ticker: z.string().optional().describe("Filter by ticker symbol (action_code)"),
  report_id: z.string().optional().describe("Fetch a specific report by ID (returns array of 1 or 0)"),
});
```

`report_id` takes precedence over `ticker` when both are supplied.

#### SQL change (in getBctcPendingRefineTool.ts):

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

Note: when `report_id` is used, skip the `text_status`/`refine_status` filter — the caller
knows exactly which report they want and the `confirm_status` guard is sufficient. This enables
on-demand targeting of any report regardless of status (e.g. a report stuck at PARTIAL that the
cron would normally serve, but the caller wants to force-re-verify).

#### Schema compliance:
Must add the parameters to `docs/standards/mcp-tools.md` parameter registry. Dev-mcp-server
to confirm before merge.

#### DDD layer assignment:
- Interface layer: `getBctcPendingRefineTool.ts` — Zod schema + SQL query change only
- No domain or application layer change

#### Verification gate:
`get_bctc_pending_refine({ ticker: "CTG" })` returns a CTG report (c6b17c36).
`get_bctc_pending_refine({ report_id: "c6b17c36-1f4f-48bc-a367-b48afc163ceb" })` returns
that specific report.

---

## Risk Flags

**RF-1 (HIGH) — BUG 1 Fix A regression risk:** The SQL exclusion subquery runs on every
call to `get_bctc_pending_refine`. At scale (35+ reports), this adds two correlated
subqueries per report in the main results set. Add `CREATE INDEX IF NOT EXISTS
idx_bctc_refined_units_report_status ON bctc_refined_units(report_id, window_status)` to
ensure the subqueries are O(log n) not O(n). Dev-mcp-server must verify EXPLAIN QUERY PLAN.

**RF-2 (MEDIUM) — BUG 2 confidence rewrite clobbers good OCR signal:** The guard
(only overwrite if refined_confidence > current value) prevents regression on well-extracted
reports. Must be a hard invariant in the implementation, not a soft check.

**RF-3 (MEDIUM) — BUG 3 report_id bypass skips refine_status filter:** This is intentional
(targeted fetch ignores queue eligibility). Dev must add a comment in code and ensure the
tool description is updated to document this behavior clearly.

**RF-4 (LOW) — BUG 1 Fix B response shape change:** The fleet cron (orchestration in Claude
agent flow) currently pattern-matches `{ ok: true, rows_parsed: N }`. Adding `effective_status`
and `beg7_override` fields is additive (non-breaking). Fleet cron can optionally read the new
fields to log overrides.

---

## Implementation Order

1. **FIX-FINALIZE-STATUS-STUCK-PARTIAL** (Fix A + Fix B together in one commit)
   — Unblocks the 34-report queue immediately. Must land first — BUG 2 and BUG 3 depend on it.

2. **FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE**
   — Can proceed once BUG 1 is DONE and refine can run cleanly on the queue.
   — Requires a full finalize run on ACB fea19bae to verify confidence update.

3. **FIX-PENDING-REFINE-TICKER-TARGETING**
   — Independent of BUG 2 but should land after BUG 1 (queue drain) so CTG can be
     verified via the new ticker filter on a clean queue. S-size, low risk.

---

## Scan Clean

No new interfaces. No new services. No DDD violations. All changes confined to
interface-layer tool handlers (`getBctcPendingRefineTool.ts`, `finalizeBctcRefineTool.ts`).
One potential index addition (infrastructure layer, additive). No domain layer changes.

**Scan clean: true**
