# Architect Review — Sprint 1909 (Rubber-Stamp)

**Cycle:** c94
**Date:** 2026-05-14
**Reviewer:** architect
**Status:** APPROVED — rubber-stamp track
**Authority brief:** `docs/architecture-briefs/2026-05-14-bctc-val07-extractor-rethink.md`

---

## Verdict

RUBBER-STAMP APPROVED. BA decomp aligns with authority brief (1908c Option B). No new
architecture brief required. No architect block.

---

## SD resolution (4 items)

**SD-1 — VN cash flow PDF line codes:** CONFIRMED. VN BCTC cash flow PDFs consistently
carry numeric line codes (e.g. "20" operating, "30" investing, "40" financing totals) in
the standard MOF-prescribed format. `balanceSheetExtractor.ts` uses code-based
`extractSplitBlockAll` as primary + keyword as secondary fallback — same dual strategy is
the correct approach for `cashFlowExtractor.ts`. No fallback-strategy gap. BA recommendation
(dual strategy) is correct.

**SD-2 — `extraction_method` DB column:** CONFIRMED REAL COLUMN. `extraction_method` exists
in `financial_reports` table (confirmed via test files `1294b-bctc-fallback.test.ts` and
`1352a-async-extraction-race.test.ts` which query/assert it directly). Known enum values:
`pdf-parse`, `ocr-200`, `ocr-300`, `news_inference`. It was simply omitted from
`CashFlowRow` interface in `cashFlowTool.ts` (interface under-declares, which is valid TS).
**Action for dev:** add `extraction_method: string | null` to the new `getBctcOcfTool.ts`
row type and SELECT it from DB. Do NOT hardcode `"ocr_parsed"` — read the real column value.

**SD-3 — Sequence constraint after 1890a-B:** STALE. Confirmed SHIPPED-c90 (TASKS.md row:
`1890a-B-SHIPPED-c90`, commit `915763a2`). `agentBootstrap.ts` + `SKILL_MANIFEST.md` +
`financial-analyst.md` are free to edit. No merge-conflict risk from in-flight 1890a-B.
Sequence constraint does not apply.

**SD-4 — TASKS.md 80L cap:** PM action, not architect. No architectural impact.

---

## DDD layer map — confirmed

| Sub-task | Layer | Verdict |
|---|---|---|
| 1909a FR-1/2/3/4 | domain | Correct — pure function, zero I/O, domain layer |
| 1909a FR-5 | domain (tests) | Correct |
| 1909b FR-6/7 | interface | Correct — DB read-only, no domain service |
| 1909b FR-8 | infrastructure | Correct |
| 1909b FR-9 | application | Correct |
| 1909c FR-11 | infrastructure (trigger) | Correct — no new cron, existing job |

---

## Risk flags

**R1 (medium) — `extraction_method` column read:** Do NOT default to `"ocr_parsed"`. Read
actual DB column. Some rows may carry `"pdf-parse"` if pdfTextOverride path was used during
parse. Hardcoding would surface false method labels in forensic-gate output.

**R2 (low) — E-4 zero-value guard:** BA correctly identified `operatingCF = 0` must not
trigger drift override. Guard condition `stated_total > 0 AND sub-item sum > 0` is
sufficient. Verify this is explicit in implementation (not implicit).

No additional risks beyond spec §6 (OCF page-split variability). Already mitigated by
`extractSplitBlockAll` + dual strategy.

---

## No-new-brief confirmation

Authority brief `2026-05-14-bctc-val07-extractor-rethink.md` fully covers the 1909 pattern.
Sprint 1909 applies Option B upstream plausibility override to `cashFlowExtractor.ts` —
same structural decision as 1908c on `balanceSheetExtractor.ts`. Fix-pattern reuse across
extractors is intentional. No new architectural decision required.
