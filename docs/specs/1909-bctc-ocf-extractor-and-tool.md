# Sprint 1909 — BCTC OCF Extractor Expansion + `get_bctc_ocf` Tool

**Sprint:** 1909
**Status:** PO-AUTHORED (awaiting BA decomposition)
**Priority:** CRITICAL (TNB c50 bottleneck — Layer 7 G-step permanently dark)
**Owner (suggested):** dev-pdf-extractor (extractor) + dev-mcp-server (tool handler) — BA decides split shape
**Zone:** `apps/mcp-server/src/domain/services/financial-reports/` + `apps/mcp-server/src/interface/mcp/tools/financial-reports/`
**Date:** 2026-05-14
**Source proposal:** `docs/handoffs/tnb-data-equip-proposal-2026-05-14.md` §B1 + §C4
**Analog pattern:** Sprint 1908c (`balanceSheetExtractor.ts` positional drift override — SHIPPED c92, merge `b6db5ef3`)
**Methodology epigraph (bottom-up):** `docs/standards/tnb-methodology.md` L4-6 — *"do we understand the business behind the ticker?"*

---

## 1. Objective

Make Layer 7 G-step (`NI vs OCF` forensic gate) **executable** for every BCTC-extracted ticker. Two coupled deliverables:

1. **Extractor expansion** — bring `cashFlowExtractor.ts` (currently 129 LOC, thin) to parity with `balanceSheetExtractor.ts` (814 LOC) for multi-layout VN BCTC PDF coverage. Apply the same positional-drift override pattern that 1908c shipped for `balanceSheetExtractor.ts:716` (`computedFromSubtotals / target > 5x` → override with sub-total sum).
2. **MCP tool** — register `get_bctc_ocf(code, period_year, period_quarter)` returning `{ source_tier: 1, ocf_operating, ocf_investing, ocf_financing, confidence, extraction_method }` so financial-analyst + report-analyzer can consume OCF at the signal level without parsing the full BCTC payload.

**Completion (per `feedback_ship_completion.md`):** sprint ships when (a) extractor passes 38 baseline + new OCF fixture tests, (b) tool registered in tool-registry + financial-analyst SKILL_MANIFEST + package doc, (c) container deployed, (d) reparse job run on watchlist (37 stocks Q1-2026), (e) at least 1 ticker (suggest VNM or VCB Q1-2026) shows OCF + NI both populated and G-step gate-pass logged in financial-analyst notebook end-to-end.

---

## 2. Bottom-up philosophy alignment (mandatory section)

Per the tnb-methodology epigraph: *"Họ bán gì, kiếm tiền ra sao..."*

- **"Kiếm tiền ra sao" (how does this business actually make money):** OCF vs NI is the direct test of whether reported earnings are real cash generation or accounting construction. Without OCF, every financial-analyst opinion is unverified accounting profit. For the Q1-2026 banking cohort (ACB, BID, CTG, EIB, MBB, VCB, VPB) where net interest income flows through complex accruals, OCF is the closest proxy to real cash generation.
- **"Ban lãnh đạo có đủ năng lực lẫn đạo đức" (management capability + ethics):** Once OCF is exposed, downstream M-Score / F-Score / accruals (Sprint TBD post-1909) become executable. NI inflated while OCF deteriorates = forensic red flag on both capability and ethics dimensions.
- **Why this strengthens "understand the business behind the ticker":** the methodology epigraph explicitly calls accounting profit "an opinion" and OCF "the fact." Without OCF in the data layer, the framework cannot test the central question.

---

## 3. Scope (BA to decompose into sub-tasks)

### 3.1 Extractor expansion (`cashFlowExtractor.ts`)

In-scope:
- Multi-layout PDF handling parity with `balanceSheetExtractor.ts` (page-spanning OCF tables, sub-total vs grand-total disambiguation, unit-multiplier detection per `JANITOR-014` shared helpers).
- Positional-drift override guard mirroring the 1908c pattern (`b6db5ef3`): if `extractSplitBlockAll` mapping captures a sub-item value when grand-total expected, ratio test (`sum(subtotals) / target > 5`) → override with sub-total sum.
- Confidence scoring: align with existing `BCTC-1345b` schema. `confidence < 0.2` → low_confidence flag (per `reference_low_confidence_handling.md`). `confidence = 0` → skip insert.
- Ship inline OCR mock fixtures (no PDF in repo) for VNM, DIG, and one bank (suggest VCB) Q4-2025 OCF blocks — same fixture-style as 1908c's 8 new tests.

Out of scope:
- M-Score / F-Score / accruals computation — separate downstream sprint (depends on this one).
- Full forensic gate `get_ocf_vs_ni` tool (proposal §C1) — separate sprint when this lands.

### 3.2 MCP tool (`get_bctc_ocf`)

In-scope:
- Tool handler `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcOcfTool.ts` (or BA's preferred placement; mirror `cashFlowTool.ts` from 1890a-A).
- Signature: `get_bctc_ocf(code: string, period_year: number, period_quarter: number) → { source_tier: 1, ocf_operating: number, ocf_investing: number, ocf_financing: number, confidence: number, extraction_method: string }`.
- `source_tier` = 1 invariant (SSC portal direct disclosure per source-tier SSOT 1881a).
- Register in tool-registry.json (toolCount bump per SSOT pointer convention — no hardcoded total).
- Add to `financial_analyst` SKILL_MANIFEST in `agentBootstrap.ts` + mirror in `docs/SKILL_MANIFEST.md`.
- Update `.claude/tools/package/financial-analyst.md` + `.claude/tools/package/report-analyzer.md` (if report-analyzer package exists).

Out of scope:
- New cron job — extractor runs under existing `bctcReparseJob`.

### 3.3 End-to-end validation (the "completion" gate)

- Reparse trigger on watchlist (per `BCTC Low Confidence Handling` policy).
- At least 1 watchlist ticker (Q1-2026) returns populated OCF via `get_bctc_ocf` and is consumed by the financial-analyst Layer 7 G-step in a real cycle. Notebook entry confirming G-step ran (not skipped) is the acceptance signal.
- BUG-channel report if reparse surfaces >5 watchlist stocks at confidence < 0.2 (signals systemic OCF extraction gap requiring follow-up).

---

## 4. Acceptance criteria (PO sign-off gate)

- AC-1: `cashFlowExtractor.ts` LOC and structural parity with `balanceSheetExtractor.ts` (override guard present, multi-layout handling demonstrated by ≥3 fixture tests for VNM/DIG/bank Q4-2025).
- AC-2: All baseline 38 BCTC tests still PASS + new OCF fixture tests PASS, tsc 0 errors.
- AC-3: `get_bctc_ocf` tool live in container, tool-registry pointer updated, financial-analyst SKILL_MANIFEST updated, package doc updated.
- AC-4: `bctcReparseJob` re-run; at least 30 of 37 watchlist Q1-2026 tickers have non-zero OCF (or BUG-channel record explaining the residual gap with per-ticker root cause).
- AC-5: At least 1 financial-analyst cycle log shows Layer 7 G-step **passed** (not skipped) consuming OCF from the new tool — captured in agent notebook.
- AC-6: Architecture brief / docs updated where applicable; `/graphify docs --update --no-viz` run post-merge per `feedback_dev_doc_graphify.md`.

---

## 5. Recurring-bug-rule check (PO compliance)

Per `feedback_recurring_bug_escalation.md` (≥2 fix commits on same module → architect rethink before new fix):

`git log --oneline -- '*cashFlowExtractor*'` shows:
- `66737cdf` — `task(044): implement cash flow extractor` (build-out, not fix)
- `830a4962` — `refactor(JANITOR-014b–014e): migrate BCTC extractors to canonical extractorHelpers.ts` (refactor, not fix)
- `fd7cbe44` — `feat(mcp/fa): add get_cash_flow tool` (1890a-A feature add, not fix)

**Result: 0 prior FIX commits on `cashFlowExtractor.ts`. Recurring-bug rule does NOT trigger. No architect block.**

Note: the *pattern* (positional drift) is recurring across BCTC extractors (1908c just shipped same fix on `balanceSheetExtractor.ts`). Architect brief `2026-05-14-bctc-val07-extractor-rethink.md` already documents Option B (upstream plausibility override) as the canonical pattern. Sprint 1909 applies that already-architected pattern to a different extractor — fix-pattern reuse, not new architectural decision. **No new architect brief required**; existing brief is the authority.

---

## 6. Dependencies + risk

- Hard dep: `bctcReparseJob` infra exists (per `reference_pdf_ocr_vps_architecture.md`). Confirmed live (1908c reparse triggered c92).
- Hard dep: SSC portal BCTC PDFs landing for Q1-2026 — banking cohort deadline 2026-04-30 (now 14 days overdue per TNB §B1). Some PDFs may still be missing; that is a separate signal (TASK-BCTC-3 backlog), not a blocker for this sprint — extractor passes its tests on whatever PDFs are available.
- Risk: cash flow PDF layouts more variable than balance sheet (3 sections OCF/ICF/FCF often page-split). 1908c override pattern is the mitigation; if extractor lift exceeds M effort, BA escalates back to PO.
- Soft dep: 1890a-A `get_cash_flow` tool (already SHIPPED c90) — `get_bctc_ocf` is a focused subset for forensic gate use. Do NOT remove `get_cash_flow`; both coexist.

---

## 7. Hand-off

- **Next step:** BA reads this spec + `docs/handoffs/tnb-data-equip-proposal-2026-05-14.md` §B1 + §C4 + analog `1908c` brief, then decomposes into sub-tasks (suggested split: 1909a-extractor + 1909b-tool + 1909c-reparse-validation, but BA owns the call) and writes BA spec.
- **PO sign-off:** against AC-1 through AC-6 above. PO will not sign off on a "smallest-slice" deliverable per `feedback_ship_completion.md` — sprint ships only when end-to-end G-step pass is observed in a real financial-analyst cycle.
