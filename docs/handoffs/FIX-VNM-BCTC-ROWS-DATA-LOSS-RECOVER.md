# Handoff — FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER

**Sprint:** data-loss-incident (origin: TASK_332 QA 2026-06-28)
**Task:** FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER (P1)
**Zone:** apps/mcp-server/
**Status:** REVIEW

---

## Context

During QA of TASK_332, the POST /extract-tables (pushBctcTableHandler) call on VNM report `4316f6d1-51ba-4912-a48c-dab5a64a2c81` (VNM 2025Q4) overwrote `bctc_table_rows` from 94 rows → 0. The column-separated OCR layout in the QA flow produced 0 rows from the parser, which then atomically deleted the live rows and inserted nothing.

Recovery path confirmed by PO: `bctc_refined_units` are not touched by `pushBctcTableHandler` — only `bctc_table_rows` is written. Re-running `finalize_bctc_refine` re-materialises from the surviving refined units.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:** NONE — pure data recovery via production code path (no code changes)
- **Tests written:** NONE — no code modified; recovery uses existing finalize_bctc_refine pathway
- **Git commits:** none (no code changed)
- **Type check:** clean (bun tsc --noEmit — 0 errors; verified pre-recovery, no source touched)
- **bun test:** 13613 pass / 49 pre-existing fail (pre-existing: network timeouts, vps_push_log schema, orch-state SHG — none related to this recovery)
- **Tool count:** 166 — matches pre-task baseline (no tool changes)
- **Scheduler count:** 3 cron.schedule entries — matches pre-task baseline
- **Docs updated:** docs/handoffs/FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER.md (this file)
- **Graphify:** skipped (no docs impacted — no architectural change)

---

## Recon Findings (Read-Only Phase)

**Report:** VNM 2025Q4 — `financial_reports.id = 4316f6d1-51ba-4912-a48c-dab5a64a2c81`

**bctc_refined_units for 4316f6d1-51ba-4912-a48c-dab5a64a2c81:**
```json
[
  { "unit_id": "unit-0001", "row_count": 46, "window_status": "DONE", "confidence": 0.82, "refined_at": "2026-06-02 10:32:17" },
  { "unit_id": "unit-0002", "row_count": 49, "window_status": "DONE", "confidence": 0.82, "refined_at": "2026-06-02 10:33:26" }
]
```

**RECON VERDICT: INTACT.** Both units window_status=DONE. Refined truth survived the overwrite. Recovery path is safe.

**bctc_table_rows state pre-recovery:** 0 rows (confirmed overwrite).

---

## Recovery Executed

Called `finalize_bctc_refine` via gateway (MCP SSE session THX7CDWDNKHBUTFRW5SULWDJOF):

```
call_tool(server="vn-market", tool="finalize_bctc_refine", arguments={
  "report_id": "4316f6d1-51ba-4912-a48c-dab5a64a2c81",
  "report_status": "DONE"
})
```

**Gateway response:**
```json
{ "ok": true, "rows_parsed": 94, "effective_status": "DONE", "beg7_override": false }
```

- `ok: true` — finalize completed without error
- `rows_parsed: 94` — 94 rows materialized from refined units (exact pre-loss count)
- `effective_status: "DONE"` — all 3 sections present; BEQ-7 section guard did NOT override
- `beg7_override: false` — DONE is correct; no partial-section downgrade

---

## Live Verification

**bctc_table_rows post-recovery (by section):**
```json
[
  { "statement_section": "balance_sheet",    "cnt": 46 },
  { "statement_section": "cash_flow",        "cnt": 26 },
  { "statement_section": "income_statement", "cnt": 22 }
]
Total rows: 94
```

**Section split:** BS=46, IS=22, CF=26 — matches pre-loss shape exactly.

**Sample rows (real labels, not fabricated):**
- income_statement: "Doanh thu bán hàng và cung cấp dịch vụ" (code=01, value=63,723,520,008,574)
- cash_flow: "Lợi nhuận kế toán trước thuế" (code=01, value=11,649,985,224,938)

**Duplicate check:** 1 duplicate pair (Hàng tồn kho / balance_sheet, cnt=2) — matches pre-loss exact_dup_count=2. VNM remains Stage 4 RED with dup=2 (as expected; no attempt to change this separate SPIKE).

**financial_reports status post-finalize:**
```json
{ "refine_status": "DONE", "extraction_confidence": 1, "validation_status": "passed" }
```

Note: `extraction_confidence` was elevated from 0.9375 → 1.0 by BLOCK-5 (all 3 sections present → 0.4+0.4+0.2=1.0, which exceeds old OCR value). This is expected finalize behavior, not fabrication.

---

## G12 DoD Gate Evidence

| Gate | Result |
|---|---|
| bun test | 13613 pass / 49 pre-existing fail (0 regressions from recovery) |
| bun tsc --noEmit | 0 errors |
| Server startup | toolCount:166 confirmed (logs show `[createBunServer] Tools registered toolCount:166`) |
| Tool count (gen-project-stats) | 166 — matches baseline |
| Scheduler count | 3 cron.schedule — matches baseline |

No code changed. Gate evidence is from pre-existing healthy state (no regressions introduced).

---

## NEXT AGENT

QA — verify:
1. `bctc_table_rows` for report `4316f6d1-51ba-4912-a48c-dab5a64a2c81` = 94 rows with BS=46, IS=22, CF=26
2. Labels are real Vietnamese financial terms (not fabricated)
3. `financial_reports.refine_status = 'DONE'` for VNM 2025Q4
4. No other report's rows were touched (query total bctc_table_rows count before/after matches)
5. VNM 2025Q4 BCTC data is serveable via `/api/bctc-inspect?id=4316f6d1-51ba-4912-a48c-dab5a64a2c81`
