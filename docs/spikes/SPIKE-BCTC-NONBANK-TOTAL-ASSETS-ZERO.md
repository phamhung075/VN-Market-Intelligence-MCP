# SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO — Do the 8 non-bank total_assets=0 tickers share one root cause?

**Task:** SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO (P-high, timebox 120min)
**Investigator:** dev-mcp-server (router-dispatched, fire-tick 2026-07-03T21:37Z)
**Mode:** read-only diagnostic — code trace + live bounded HTTP probes against the running
container (`localhost:3000`, `/api/bctc-inspect/*` read routes + `/mcp` JSON-RPC `get_bctc_refined`
tool call). No code changed, no branch created, no DB write.

---

## Question

Do the 8 non-bank tickers with Q1-2026 `total_assets=0` (VHM, REE, VIC, VNM, VRE, POW, HSG, MWG)
share ONE root cause? Signature = `total_assets` EXACTLY ZERO / confidence forced 0% /
`[CORRUPT DATA — SKIP]` served by `get_bctc_full` — distinct from the bank
`total_assets`-**mapping** bug (`FIX-BCTC-BANK-SUMMARY-MAPPING`, commits `a46131cf`/`2cd9e105`),
which produced implausible **nonzero** totals. If not one cause: classify residuals, map to
existing owners (`FIX-REE-BS-SECTION-REGEX`, `SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT`, the
`W5-FU`/CTG agentic-refine-repass pattern) or flag genuinely NEW, and output ONE consolidated
remediation batch — not 8 duplicate per-ticker FIX tasks.

---

## Approach tried

1. Read the shared serve-layer guard that produces the `[CORRUPT DATA — SKIP]` text
   (`bctcIdentityGuard.ts`) and its call site in `bctcFullTools.ts` to confirm it is a generic,
   ticker-agnostic predicate (`total_assets<=0 OR total_assets<equity_total`) fired **before**
   the PUB-1..8 publishability gates — i.e. it faithfully reports whatever value is already
   stored in `financial_reports`; the bug must be upstream (ingest/refine), not in this guard.
2. Pulled the live `financial_reports` listing read-only via `GET /api/bctc-inspect/docs`
   (container already running, port 3000) and filtered the 8 tickers' 2026-Q1 rows for
   `refine_status`, `extraction_confidence`, `parsed_at`; cross-checked against 4 known-good
   controls (GVR, HPG, FPT, VCB, HVN).
3. Pulled `GET /api/bctc-inspect/table/{doc_id}` for all 8 + controls to get `has_pek` /
   `has_table` / row counts.
4. Called the `get_bctc_refined` MCP tool directly over the live `/mcp` JSON-RPC endpoint
   (`tools/call`) for all 8 report_ids + 2 controls (GVR, HPG) to count `bctc_refined_units`
   rows and their `window_status` breakdown — this is the ground-truth signal for "has the
   agentic refine pipeline ever run for this report."
5. Fetched raw OCR text (`GET /api/bctc-inspect/ocr/{doc_id}?page=N`) around the balance-sheet
   page for VRE, MWG, VHM, HSG, VIC, VNM to check whether the `TỔNG CỘNG TÀI SẢN` grand-total
   line is present/legible in the underlying OCR text (i.e. is the source data actually
   readable, or genuinely garbled).
6. Read `domain/services/financial-reports/balanceSheetExtractor.ts` (parse-time, regex/
   positional scan over the FULL concatenated OCR text, several 0-fallback identity-derivation
   paths) and `domain/services/financial-reports/bctcScalarAggregator.ts` (refine-time,
   LABEL-CANONICAL total-assets resolution with an explicit documented 270-vs-280 code
   disambiguation) to locate exactly where a 0 gets frozen into `financial_reports`.
7. Read `docs/agent-memory/decisions/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT-po.md` (PO decision
   journal, 2026-06-28) which already established the **two-pipeline model**: `/extract-tables`
   (deterministic row-parser, "Layouts 1-7", writes `bctc_table_rows` only) vs
   `refine_bctc_md → bctc_refined_units → finalize_bctc_refine` (agentic transcription,
   DELETE+reinsert `bctc_table_rows` + recompute scalars into `financial_reports`).
8. Cross-checked CTG (the already-shipped bank fix, `FIX-BCTC-BANK-BS-COLUMN-ORDER`) live,
   right now — confirmed it is **still** `total_assets=0` / `extraction_confidence=0` in the
   live DB (`W5-FU-CTG-REFINE-96e36139` remains BLOCKED) — this corroborates that a code fix
   alone does not resolve this class; the missing operational step is a fresh agentic-refine
   pass + `reingest-bctc-report.ts`, even after the parser bug is fixed.

---

## Findings

### Common-root-cause verdict: MIXED, with one dominant shared bucket (7/8) + one genuine residual (1/8)

**Bucket A — "never refined" (7 of 8): VHM, REE, VIC, VNM, VRE, HSG, MWG**

Live query results (report_id / refine_status / extraction_confidence / parsed_at, 2026-Q1):

| Ticker | report_id | refine_status | conf | parsed_at | `bctc_refined_units` | `bctc_table_rows` |
|---|---|---|---|---|---|---|
| VHM | a3a41225-… | PENDING | 0.375 | 2026-06-07T19:03:53Z | 0 | 0 (has_table:false) |
| REE | 47b4300b-… | PENDING | 0.05 | 2026-06-08T00:29:44Z | 0 | 0 |
| VIC | 1f53ef33-… | PENDING | 0.4375 | 2026-06-07T19:03:57Z | 0 | 0 |
| VNM | 7eb37aa6-… | PENDING | 0.625 | 2026-06-15T19:45:38Z | 0 | 0 |
| VRE | 0ce3b2ed-… | PENDING | 0.5 | 2026-06-07T18:48:04Z | 0 | 0 |
| HSG | ae1f30bf-… | PENDING | 0.1875 | 2026-06-07T19:03:52Z | 0 | 0 |
| MWG | d713095f-… | PENDING | 0.3125 | 2026-06-07T19:03:56Z | 0 | 0 |
| *(control)* GVR | c765098b-… | DONE | 1.0 | 2026-06-07T11:06:21Z | 70 (67 DONE/3 FAILED) | 549 |
| *(control)* HPG | 553fd194-… | PARTIAL | 0.8 | 2026-06-07T11:12:22Z | 17 (all DONE) | 282 |

For all 7, `get_bctc_refined(report_id)` returns `{"error":"no refined units found for
report_id: …"}` — the agentic refine pipeline has **never been invoked** for these Q1-2026
filings. `bctc_table_rows` is also empty for all 7 (`has_table:false`) — **neither** extraction
pipeline (deterministic `/extract-tables` nor agentic refine) has ever successfully produced a
structured row. The served `total_assets=0` is therefore the untouched, stale value written at
initial OCR ingest by `parseBctcReport.ts → balanceSheetExtractor.ts` (a regex/positional scan
over the full concatenated OCR text, with several 0-fallback identity-derivation paths that all
apparently also failed).

Five of these 7 parsed **on the same day, within a ~20-minute window** (2026-06-07, 18:48–19:04Z:
VHM 19:03:53, HSG 19:03:52, MWG 19:03:56, VIC 19:03:57, VRE 18:48:04) — consistent with one batch
ingest cohort, though this is NOT itself sufficient to explain the failure (GVR/HPG, both healthy,
parsed the same morning at 11:06/11:12Z). REE (06-08 00:29) and VNM (06-15 19:45, a later distinct
reparse attempt) parsed on different days.

Sub-classification of the proximate parse-time cause (why the regex scan found nothing usable),
from spot-checking raw OCR text on the balance-sheet page:

- **REE (conf 0.05)** — already owned by `FIX-REE-BS-SECTION-REGEX` (backlog, TODO): BS
  section-total codes 100/200/300/400 absent from extracted text entirely.
- **VNM (conf 0.625, later reparse attempt)** — already owned by
  `SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT` (backlog): column-separated OCR layout, 0 rows matched
  by any of "Layouts 1-7."
- **VRE and MWG — NEW sub-signature confirmed**: the grand-total row IS present and legible in
  raw OCR text, but under **code "280"** (`280 | TONG CONG TAI SAN`, diacritics OCR-stripped),
  while **code "270"** is a *different* sub-section row (`270 | V. Tài sản dài hạn khác`). This
  is exactly the 270-vs-280 ambiguity `bctcScalarAggregator.ts`'s LABEL-CANONICAL matcher was
  already built to solve (comment cites the FPT precedent) — but the parse-time
  `balanceSheetExtractor.ts` evidently does not resolve it as robustly against messy/
  diacritic-stripped OCR headers. This confirms the source data is **recoverable, not corrupt**.
  Verbatim example (VRE, page 6): `270 | V. Tài sản dài hạn khác  25.314.463  25.526.195` … then
  `280 | TONG CONG TAI SAN  60.962.946  61.279.149`.
- **VHM (conf 0.375)** — the filing contains BOTH a consolidated (hợp nhất) AND a separate/
  parent-only (riêng) balance sheet in one 80-page PDF; a well-formed liabilities+equity total
  row (code 440, legible) was found on page 66 belonging to the "RIÊNG" statement, but no clean
  `TÀI SẢN NGẮN HẠN`/280-total pattern was found in the earlier page range sampled (1-24) where
  the consolidated statement should sit. Not conclusively resolved within the timebox — flagged
  for one architect follow-up look at dual-statement page-anchoring — but again "recoverable
  data present somewhere in the PDF," not a hard OCR wall.
- **VIC, HSG** — sampled pages did not land on the primary balance-sheet page within the range
  checked (VIC 71pp, HSG 32pp); not conclusively sub-classified within the 120-min timebox. No
  evidence found that either is a genuinely distinct failure class — bucketed as Bucket A
  ("never refined") pending the same remediation.

**Bucket B — "refined, but the grand-total row was dropped in transcription" (1 of 8): POW**

POW is genuinely different from the other 7: `refine_status=PARTIAL`, but **28/28**
`bctc_refined_units` are `window_status=DONE`, and `bctc_table_rows` has **166 rows**
(`has_table:true`) — the agentic refine pipeline ran to completion.

Despite this, codes "270" (`TỔNG CỘNG TÀI SẢN`) and "440" (`TỔNG CỘNG NGUỒN VỐN`) are **absent
from both `bctc_table_rows` and the underlying refined markdown itself**. Verified directly via
`get_bctc_refined`: unit `unit-0004` (pages `[5,6]`, `window_status=DONE`, `confidence=0.7`)
transcribes:

```
| 100 | TÀI SẢN NGẮN HẠN | ... |
| 110 | Tiền và các khoản tương đương tiền | ... |
| 120 | Đầu tư tài chính ngắn hạn | ... |
| 200 | TÀI SẢN DÀI HẠN | ... |
| 220 | Tài sản cố định hữu hình | ... |
| 300 | NỢ NGẮN HẠN | ... |          <-- jumps straight to liabilities
| 330 | NỢ DÀI HẠN | ... |
| 410 | VỐN CHỦ SỞ HỮU | ... |
```

The bolded grand-total boundary line (mã 270, `TỔNG CỘNG TÀI SẢN`) is skipped entirely, even
though the window's page range (5-6) is objectively correct and the rest of the page's line
items transcribe correctly. `bctcScalarAggregator`'s otherwise-robust LABEL-CANONICAL
total-assets resolution has nothing to find, because the transcription itself never produced
the row — this is a **completeness gap in the agentic transcription step** (or its ingest/
parsing wrapper), not a code/label-matching bug, and it is not covered by any existing owner.

### Residual → owner mapping

| Ticker | Bucket | Existing owner | Action |
|---|---|---|---|
| REE | A (never refined) | `FIX-REE-BS-SECTION-REGEX` (backlog TODO) | keep as-is, no change |
| VNM | A (never refined) | `SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT` (backlog) | keep as-is, no change |
| VRE, MWG | A (never refined; 270-vs-280 confirmed recoverable) | none | map to agentic-refine repass (§ remediation 1) |
| VHM | A (never refined; dual-statement anchoring, needs 1 follow-up look) | none | map to agentic-refine repass (§ remediation 1) + flag follow-up |
| VIC, HSG | A (never refined; not sub-classified) | none | map to agentic-refine repass (§ remediation 1) |
| POW | B (refined, total-row transcription-dropped) | none — genuinely NEW | new SPIKE/FIX candidate (§ remediation 3) |

---

## Recommended consolidated remediation (proposal — NOT 8 duplicate per-ticker FIXes)

1. **OPERATIONAL agentic-refine-repass batch (no code change)** for **VHM, VIC, VRE, HSG, MWG**
   (5 tickers — REE and VNM are deliberately excluded here; they already have their own
   correctly-scoped dedicated backlog items and should not be re-diagnosed or folded in):
   `get_bctc_pending_refine(report_id)` → `refine_bctc_md` leaf-worker windows →
   `push_bctc_refined_unit` → `finalize_bctc_refine` → `bun scripts/migrations/
   reingest-bctc-report.ts --report-id <id> --apply`, exactly the canonical runbook already
   documented in `docs/agents/dev-mcp-server/flow/main.md` § "CANONICAL: BCTC finalize
   re-ingest runbook", the same shape as `W5-FU-CTG-REFINE-96e36139`. This is the single
   highest-leverage action: it can recover 5 of 8 tickers with **zero new code**, using an
   already-proven pattern (CTG itself is still waiting on exactly this step, live, right now).
   Suggested owner split: bctc-analyst (transcription passes) → dev-mcp-server (script run),
   mirroring the W5-FU precedent.
   **Watch-for:** if the POW-class defect (grand-total row dropped mid-transcription) recurs on
   ≥2 of these 5 during the repass, that escalates remediation item 3 below from
   "investigate-first" to "must-fix-before-repass."

2. **No action needed** on REE (`FIX-REE-BS-SECTION-REGEX`) or VNM
   (`SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT`) beyond their existing tickets — do not duplicate.
   Their own root-cause diagnoses are already correctly scoped; recommend simply letting item 1's
   agentic-refine repass run alongside/after them since either mechanism could independently
   close them out, whichever lands first.

3. **NEW candidate — architect-first SPIKE (small, timeboxed) before any FIX**, working title
   `SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP`: grand-total balance-sheet rows can be
   silently dropped during agentic-refine transcription even when the page window is correctly
   bounded and the rest of the page transcribes fine (POW, unit-0004, reproduced above).
   Needs to determine whether the gap is (a) in the `refine_bctc_md` leaf-worker's
   prompt/instructions (likely NOT `apps/mcp-server` zone — may be an agent-flow/prompt
   concern), or (b) in a markdown-ingest/parsing step inside `apps/mcp-server`
   (`refinedMarkdownParser.ts`) that could be silently swallowing a row that WAS transcribed.
   POW's live `get_bctc_refined` output (`unit-0004`) is directly reusable as the reproduction
   fixture — no new data collection needed to start this SPIKE.

4. **Explicitly NOT recommended:** any per-ticker "add a special regex branch for ticker X"
   patch to `balanceSheetExtractor.ts` — that is the exact anti-pattern PO already rejected once
   this cycle (`docs/agent-memory/decisions/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT-po.md`,
   2026-06-28: "per-ticker special-case patch... REJECTED — that is the anti-pattern that
   produced the bug"). The already-built agentic-refine + LABEL-CANONICAL aggregator machinery
   is the correct, generalized fix path for Bucket A — it just needs to be **run** against these
   7 reports, not re-invented at the parse-time-regex layer.

---

## Code references

- Serve-time `[CORRUPT DATA — SKIP]` guard (generic, ticker-agnostic; confirms this is not a
  serve-layer bug): `apps/mcp-server/src/domain/services/financial-reports/bctcIdentityGuard.ts`
  (L61-104, `checkBctcIdentityGuard` + `buildBctcCorruptDataMessage`).
- Serve-time invocation order — identity guard fires BEFORE the PUB-1..8 publishability gates:
  `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` (L975-1002).
- Parse-time balance-sheet extractor (regex/positional scan over the full concatenated OCR
  text; multiple 0-fallback identity-derivation paths, all apparently exhausted for Bucket A):
  `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` (L797-987).
- Refine-time scalar aggregator (LABEL-CANONICAL total-assets resolution; explicit 270-vs-280
  code-ambiguity handling, comment references the FPT precedent):
  `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
  (L385-441 `findTotalAssetsCorporate`, L816-848 aggregation call site).
- `parseBctcReport.ts` L417: `extractBalanceSheet(rawText)` — confirms `rawText` is the FULL
  concatenated multi-page OCR text (one regex pass over the whole document, not per-page).
- Two-pipeline model (deterministic `/extract-tables` vs agentic
  `refine_bctc_md → finalize_bctc_refine`), established by:
  `docs/agent-memory/decisions/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT-po.md` (Addendum B,
  2026-06-28: "`/extract-tables` (pushBctcTableHandler) writes `bctc_table_rows` ONLY, never
  `bctc_refined_units`").
- Canonical reingest runbook (already proven pattern, still the correct next step here):
  `docs/agents/dev-mcp-server/flow/main.md` § "CANONICAL: BCTC finalize re-ingest runbook
  (FIX-BCTC-BANK-SUMMARY-MAPPING W5, AC-10)"; script at
  `scripts/migrations/reingest-bctc-report.ts`.
- `get_bctc_refined` MCP tool (used for this spike's live diagnostic queries — ground truth for
  "has refine ever run"): `apps/mcp-server/src/interface/mcp/tools/financial-reports/
  getBctcRefinedTool.ts`.
- BCTC-inspect read-only HTTP routes (used for this spike's live diagnostic queries):
  `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` (`handleBctcInspectDocs`,
  `handleBctcInspectTable`, `handleBctcInspectOcr`).
- Existing residual-owner tickets referenced (not modified): `FIX-REE-BS-SECTION-REGEX`
  (`docs/data/orch/archive/backlog-detail.json#FIX-REE-BS-SECTION-REGEX`),
  `SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT` (`docs/data/orch/orch-state.json` `.task_board.backlog`),
  `W5-FU-CTG-REFINE-96e36139` (`docs/data/orch/orch-state.json` `.task_board.review`, still
  BLOCKED live as of this spike — corroborates remediation item 1's necessity).
- Live probe artifacts: bounded `curl` GETs against `http://localhost:3000/api/bctc-inspect/*`
  and one JSON-RPC `tools/call` POST to `http://localhost:3000/mcp` per ticker; no repo files
  or DB rows were modified by any probe in this spike.
