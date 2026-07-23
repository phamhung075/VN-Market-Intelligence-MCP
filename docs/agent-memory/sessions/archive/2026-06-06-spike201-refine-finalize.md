# SPIKE_201 — DV-push-4 Finalize Invariant + Pending-Refine Contract Gap

**Date:** 2026-06-06 | **Zone:** apps/mcp-server/

---

## PART 1 — DV-push-4 Failing Unit Test (pre-existing)

### (a) Exact BLOCK-4 error

Test fails at line 571: `expect(getRefineStatus()).toBe("DONE")` → received `"PARTIAL"`.

BEQ-7 (finalizeBctcRefineTool.ts L328–341) overrides caller `report_status="DONE"` to
`"PARTIAL"` because `checkSectionCompleteness(finalRows).isComplete = false`. BLOCK-4
subsequently records `validation_status="failed"` `error_count=1` (empty-balance-sheet
CRITICAL from all-null fixture scalars).

### (b) Fixture drift vs. finalize contract

TEST FIXTURE drifted. `MARKDOWN_2_ROWS` and `MARKDOWN_1_ROW` have no Vietnamese section
headers. `parseRefinedMarkdown` falls through all `SECTION_HEADERS` patterns → every row
gets `statement_section = "general"`. Confirmed:
```
sections: ["general","general"]   (MARKDOWN_2_ROWS → 2 rows)
```
`checkSectionCompleteness` returns:
```
{ hasBalanceSheet:true, hasIncomeStatement:false, hasCashFlow:false, isComplete:false }
```
BEQ-7 fires correctly. The guard is right; the fixture is wrong. BEQ-7 was added after
DV-push-4 was written → pre-existing gap, not a regression.

### (c) Is table_rows=sum(windows) still the correct contract?

YES. Invariant survives Phase-0 (172999f0) and DB-driven windows (86038f04). BEQ-7 changes
only the status string — row insertion still completes. The `fin.rows_parsed == 5` and
`tableRowCount == 5` assertions both pass; only `refine_status == "DONE"` fails.

### (d) Minimal fix + owner file

**Owner:** `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts`

Add section headers to the three markdown windows in DV-push-4 so all three statement
types are present (`balance_sheet` + `income_statement` + `cash_flow`). No production
code change. Do NOT suppress BEQ-7 — the guard is correct contract.

---

## PART 2 — get_bctc_pending_refine Flow-Contract Mismatch (report id 3052)

### (a) Tool vs. flow

Tool (`getBctcPendingRefineTool.ts`, commit 172999f0) returns 7 fields:
`{ id, filename, page_count, refine_status, text_status, confirm_status, windows[] }`.

Flow (`docs/agents/refine_bctc_md/flow/main.md`, Phase 0 L43) comment says:
`Returns: [{ id, filename, page_count, windows }]` — 4-field stale doc. Flow mechanics
at step 3b and step 5 correctly read `confirm_status` and `text_status`; only the comment lags.

### (b) SSOT

Tool is SSOT. `PendingRefineReport` TypeScript interface is the wire contract. Flow comment
is stale documentation from pre-172999f0.

### (c) Does it break the 13:00Z fire?

**No — functional gap was fixed in 172999f0 (today).** The real blocker at 14:00Z
(refine-bctc-slot-2) is all 9 eligible reports have `pdf_path = null` → `filename = ""` →
no pdf_extracted_text rows → `windows = []`. Flow hits Phase 0 step 6:
`windows empty → release claim → WARN → EXIT cleanly`. No crash, no DB mutation.

### (d) Minimal fix + owner file

**Owner (doc only):** `docs/agents/refine_bctc_md/flow/main.md`, line 43.
Update Returns comment to list all 7 fields. No code change needed.

---

## 13:00Z SAFE/AT-RISK Verdict

**SAFE.**

DB-write pathway: `finalize_bctc_refine` is called only in Phase 4b, after all windows
pushed. With `windows = []` the flow exits at Phase 0 step 6 — Phase 4b is never reached.
No `bctc_refined_units` inserts. No `bctc_table_rows` mutations. No `refine_status` update.

Phase-0 (172999f0) is file-only (docs/refine-output/) per old contract? No — the new
Option-Y flow explicitly states `NO file I/O. NO docs/refine-output/ writes.` All output
goes DB-only via push_bctc_refined_unit + finalize_bctc_refine, neither of which is called
in a no-window run. Finalize DB corruption is structurally unreachable today.

Slot-1 (09:00Z) already fired at 09:04Z today (cowork-schedule.json `last_fired`) with
identical outcome: graceful no-op. Slot-2 at 14:00Z behaves identically.

DV-push-4 failure is test-scope only; it does not block the cron.

---

## Actions (priority)

1. **P1** Fix DV-push-4 fixture: add section headers covering all 3 statement types.
   File: `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts`
2. **P2** Fix stale comment main.md L43 to 7-field schema.
   File: `docs/agents/refine_bctc_md/flow/main.md`
3. **P3** Data pipeline: 9 eligible reports have pdf_path=null — permanent no-op for refine.
   pdf_path must be populated before text_status=COMPLETE.
