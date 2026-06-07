# BEQ-9 Handoff — Dispatch Agentic Refine for Recoverable Tickers

**Task ID:** BEQ-9  
**Title:** Dispatch agentic refine (refine_bctc_md) for recoverable tickers VNM, FPT-2025Q4, HPG, SHB  
**Owner:** bctc-analyst  
**Size:** S (~4–6h elapsed, excluding off-hose gate)  
**Sprint:** BCTC-EXTRACT-QUALITY Phase-2  
**Arch Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md (§5, Decision C)

---

## Context

After BEQ-5/6/7/8 ship and the mcp-server image is rebuilt, four tickers are **immediately recoverable** by agentic refine because:

1. Their legacy `bctc_table_rows` are balance-sheet-only fragments (PARTIAL status)
2. Their `pdf_extracted_text` contains complete OCR text with all three sections confirmed
3. The agentic refine pipeline (`refine_bctc_md` flow) can parse the OCR text, extract sectioned markdown, and produce complete rows

**Tickers:**
- **VNM** — 61 pages, 116K chars; "doanh thu thuần" + "lưu chuyển tiền" confirmed
- **FPT (2025-Q4)** — 46 pages, 104K chars; income + CF sections confirmed
- **HPG** — OCR text present; BALANCE_VIOLATION on legacy backfill; agentic refine can re-compute balance check
- **SHB** — Bank form; legacy extractor produced balance-sheet-only; agentic refine will produce Roman-code rows; discriminator will re-classify correctly

---

## Acceptance Criteria

### AC-1: Prerequisites Complete Before Dispatch
Before spawning ANY bctc-analyst refine task, PM must verify:
- [ ] BEQ-5 GREEN: bctcSectionCompleteness function shipped
- [ ] BEQ-6 GREEN: backfillBctcScalarsTool guarded; dry-run re-run shows status=SKIPPED for balance-sheet-only tickers
- [ ] BEQ-7 GREEN: finalizeBctcRefineTool guarded; test shows PARTIAL override
- [ ] BEQ-8 GREEN: isBankPath uses isBankFormFromRows; test shows corporate rows → false
- [ ] BEQ-8b GREEN: /docs guard extended to PARTIAL; test shows net_profit=NULL
- [ ] mcp-server image rebuilt post-merge: `docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server`
- [ ] All 84+ tests passing
- [ ] mcp-server health verified: GET /health → 200 OK, 154+ tools

### AC-2: Agentic Refine Dispatch Constraints
- **Tool:** `refine_bctc_md` flow (agents-bctc-analyst)
- **Off-hose gate:** OFF-HOSE ONLY (no extraction Mon–Fri 02:00–08:59 UTC) — do NOT run during daytime hose hours
- **Sequencing:** One ticker at a time to avoid parallel DB contention; SHB last (bank form edge-case)
- **Ticker order:** VNM → FPT → HPG → SHB
- **Proof of section completeness:** Before refining each ticker, bctc-analyst must verify:
  - `get_bctc_full(ticker)` → check `refine_status=PARTIAL` (or PENDING if 0 rows)
  - `SELECT COUNT(*) FROM bctc_table_rows WHERE action_code='<ticker>' AND statement_section IN (...)` → confirm only balance_sheet or incomplete sections
  - `SELECT pdf_extracted_text FROM bctc_pdfs WHERE action_code='<ticker>'` → confirm OCR text length > 10K chars

### AC-3: Refine Tool Invocation Template
- **Flow entry:** `refine_bctc_md` (mcp-server hosted; agent runs it)
- **Input parameters (agent notebook):**
  ```
  ticker: "VNM"
  mode: "full"
  focus: "income_statement + cash_flow (balance sheet exists legacy)"
  markdown_format: "sectioned"
  ```
- **Expected output:**
  - Complete bctc_table_rows inserted with all three statement_sections
  - refine_status transitioned to DONE (if full three sections) or PARTIAL (if some gaps remain)
  - scalars re-aggregated via finalizeBctcRefineTool guard
- **Success marker:** get_bctc_full(ticker) returns non-empty dict with sane finance values
- **Failure mode:** If refine produces balance-sheet-only rows again → remains PARTIAL (not an error, just incomplete recovery)

### AC-4: Off-Hose Gate Enforcement
- **Do NOT** dispatch during hose hours (02:00–08:59 UTC Mon–Fri)
- **Do dispatch** during off-hose: 09:00–01:59 UTC any day
- **Cron pattern:** NOT a cowork cron item; bctc-analyst is dispatched by PM once, runs the flow for 4 tickers one at a time
- **Session tracking:** Each refine run logs to bctc-analyst notebook with ticker, start_time, refine_status result

### AC-5: Verification After Each Refine
After each ticker completes refine:
1. **Direct DB verify:** `SELECT COUNT(*), statement_section FROM bctc_table_rows WHERE action_code='<ticker>' GROUP BY statement_section` → confirm rows exist for all three sections
2. **API verify:** `GET /api/bctc-inspect/full?ticker=<ticker>` → confirm non-empty response, no "Chua co du lieu" message
3. **Scalar verify:** Confirm scalars (operating_profit, ebitda, etc.) are non-zero for non-zero PDFs
4. **BEQ-4a/4b verify:** Confirm /docs returns `net_profit` (DONE) or `null` (PARTIAL), never garbage legacy value
5. **Notebook append:** Log result: ticker, row count by section, refine_status, scalar sample (operating_profit), success/partial/fail

### AC-6: Fail-Safe: Do NOT Re-Run Backfill
- **Important:** Do NOT run `backfill_bctc_scalars(dry_run=false)` during BEQ-9
- The agentic refine uses `finalizeBctcRefineTool` to write scalars, not backfill
- Backfill is only for legacy balance-sheet-only tickers that remain unrefined
- If you run backfill, it will hit the BEQ-6 section guard and return PARTIAL, which is correct but redundant

---

## Dependencies

- **Requires:** BEQ-5 + BEQ-6 + BEQ-7 + BEQ-8 + BEQ-8b all GREEN
- **Requires:** mcp-server image rebuilt and verified live
- **Blocks:** BEQ-10 (verification of other tickers depends on this completing first)
- **Parallel independence:** No code changes in BEQ-9 (pure agentic extraction); can run during any off-hose window

---

## Implementation Notes

- **Agent:** bctc-analyst (fleet-Claude)
- **Tool used:** refine_bctc_md MCP tool from mcp-server
- **No code changes:** Just dispatch and monitor
- **No git commits required:** Extraction results are stored in market.db, not code
- **Risk R-4 mitigation:** DHG is NOT in BEQ-9 because OCR rows are keyed by filename, not action_code; requires separate verification (BEQ-10)
- **Risk R-5 mitigation:** SHB is last because it's a bank form; after agentic refine produces Roman-code rows, isBankPath will correctly re-classify

---

## Handoff Checklist

- [ ] BEQ-5..8b all GREEN and mcp-server rebuilt
- [ ] Off-hose timing verified (not during 02:00–08:59 UTC Mon–Fri)
- [ ] bctc-analyst briefed on four tickers, order, and verification steps
- [ ] Refine tool parameters documented in handoff
- [ ] Verification queries prepared (DB count, API response, scalar sample)
- [ ] Each ticker refine logged to notebook with success/partial/fail status
- [ ] All four tickers complete before BEQ-10 dispatch

---

## Commit Format

N/A — BEQ-9 is agentic execution, no code commits. Extraction results stored in market.db, logged to bctc-analyst notebook.

---

## RETURN

**Status:** Ready for bctc-analyst dispatch (after BEQ-5..8b GREEN + image rebuilt)  
**Blocker:** BEQ-5..8b completion  
**Next:** bctc-analyst runs refine_bctc_md for VNM, FPT, HPG, SHB (off-hose); then seq unblock BEQ-10  
