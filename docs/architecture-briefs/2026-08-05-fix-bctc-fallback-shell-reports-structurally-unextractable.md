# FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE — Architecture Brief

**Date:** 2026-08-05 | **Author:** architect | **Zone:** apps/mcp-server/ | **Size:** M | **Priority:** P0

## 1. Root Cause (RAW-verified, not inferred)

The three `report_id`-keyed write endpoints that the async PEK extraction pipeline calls back
into — `pushBctcLayoutHandler.ts` (→ `bctc_layout_units`/`bctc_page_zones`),
`pushBctcTableHandler.ts` (→ `bctc_table_rows`/`bctc_balance_checks`), and
`pushBctcMdTablesHandler.ts` (→ `bctc_md_tables`) — each gate `report_id` through the shared
`isValidUuid()` regex-format check (`bctcInspectHandler.ts:45-50`,
`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) **before accepting any write**:

```ts
// pushBctcLayoutHandler.ts:107-113 (identical shape in the other two files)
const reportId = parsed.report_id;
if (typeof reportId !== "string" || !isValidUuid(reportId)) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "invalid_report_id: must be UUID", report_id: reportId }));
  return;
}
```

This gate shipped with the LF-OVERLAY/BT-3i sprints (commits `2326ebb63`, `d639a478d`, ~weeks
before `fallback-` ids existed) and was never revisited when two later, independent changes made
non-UUID `financial_reports.id` values a first-class, permanent part of the schema:

1. **SPRINT-1330 "DA_NOP fallback"** — `bctcReparseJob.ts::insertFallbackRecord` (mirrored inline
   in `composition-root.ts:199-220`) mints `financial_reports` shell rows with
   `id = "fallback-${ticker}-${year}-${quarter}"` when the raw-text extraction tiers are
   exhausted, to stop QUA_HAN (overdue) false alarms in the earnings calendar.
2. **FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION** wired the async PEK trigger
   (`triggerPekExtractionForReport`, `pekExtractTrigger.ts`) into `bctcExtractReconcileJob.ts`,
   which re-derives `report_id` via a **format-agnostic** lookup —
   `SELECT id, pdf_path FROM financial_reports WHERE action_code = ? AND sort_key = ?`
   (`bctcExtractReconcileJob.ts:386`) — that resolves to a `fallback-` id exactly as readily as a
   UUID one, then re-fires PEK against it every ~30 min, uniformly, up to
   `MAX_RECONCILE_ATTEMPTS = 8`.

The result: PEK genuinely OCRs/extracts these PDFs (real compute spent, real output produced) but
its callback push is **unconditionally rejected** by the id-shape gate, so the reconcile job's own
"did anything land?" success check (`bctc_layout_units`/`bctc_table_rows`/`bctc_md_tables` count for
that `report_id`) is a **mathematical certainty of 0**, for any fallback- row, every single pass —
a tautology, exactly as PO's triage characterized it, now pinned to a specific 5-line `if` block in
3 files rather than a diagnosis.

### Live confirmation (not simulated)

`docker logs vn-market-intelligence-mcp-pdf-extractor-1 --since 96h`:

```
INFO:...pek_engine_adapter:PekEngineAdapter._run_extraction: report_id=fallback-VND-2023-Q4 pdf_path=/app/data/pdfs/VND_2023_Q4.pdf
INFO:...layout_first_push_client:LayoutFirstPushClient.push_layout: report_id=fallback-VND-2023-Q4 units=67 pages=67 endpoint=http://mcp-server:3000/api/push-bctc-layout
ERROR:...layout_first_push_client:LayoutFirstPushClient.push_layout HTTP 400: report_id=fallback-VND-2023-Q4 body={"error":"invalid_report_id: must be UUID","report_id":"fallback-VND-2023-Q4"}
```

20 distinct `fallback-` report_ids rejected this way in the 96h window, 50 total HTTP-400 pushes
(PDR-2023-Q4 ×8, DXG-2025-Q2 ×6, DXG-2025-Q1 ×4, DGC-2024-Q4 ×4, ...) — real page counts extracted
(47/47, 67/67, 43/43, ...) every time, none ever written. mcp-server's OWN container logs have
**zero** trace of any of these — the 400-return branch has no server-side log call, only the HTTP
response body, so this failure mode was invisible from mcp-server's own logs (only the reconcile
job's downstream tautology, and the pdf-extractor VPS side, ever surfaced it). Flag this
observability gap for whoever implements — a one-line `logger.warn` on the 400 branch would have
cut discovery time.

## 2. Fix Design — Option (a): make fallback shells extractable

PO's triage framed two options; (a) is chosen because it is the surgical, low-risk one and it is
what actually recovers the 63 stranded PDFs (option (b) — never mint + backfill-repair — throws
that data away permanently and does not fix the underlying assumption for the *next* non-UUID id
scheme).

**3 files, identical pattern, in `apps/mcp-server/src/interface/mcp/routes/`:**
- `pushBctcLayoutHandler.ts` (validate block ~L107-113)
- `pushBctcTableHandler.ts` (validate block ~L102-108)
- `pushBctcMdTablesHandler.ts` (validate block ~L86-97)

Replace the **format** gate (`isValidUuid`) with an **existence** gate against
`financial_reports.id`. `db: Database` is already dependency-injected into all 3 handler
signatures — zero new plumbing required:

```ts
const reportId = parsed.report_id;
if (typeof reportId !== "string" || reportId.length === 0) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "invalid_report_id: must be a non-empty string", report_id: reportId }));
  return;
}
const knownReport = db.prepare("SELECT 1 FROM financial_reports WHERE id = ?").get(reportId);
if (!knownReport) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "invalid_report_id: no matching financial_reports row", report_id: reportId }));
  return;
}
```

**This is a correction, not a relaxation:**
1. Directly unblocks AC-1/AC-2 — once the write lands, `bctcExtractReconcileJob.ts`'s existing
   3-table OR success-check flips true on its next pass; `pek_triggered → done`; no more
   `enrich_failed` + fail-loud BUG for this cohort. No reconcile-job code change needed.
2. **Strictly tighter than today**, not looser: the current UUID-shape check accepts ANY
   syntactically valid UUID even if it names no real report — an orphan-write path into
   `bctc_layout_units`/`bctc_table_rows`/`bctc_md_tables` that exists today and this closes.
3. Zero injection-risk regression: every write in these 3 handlers is already fully parameterized
   (`db.prepare(...).run(reportId, ...)`); the "Security: report_id validated as UUID" doc-comment
   was never load-bearing for injection safety — it was, incidentally, ALSO gating id-*shape*,
   which became a false invariant the moment SPRINT-1330 started minting non-UUID ids weeks after
   these handlers shipped.
4. `isValidUuid()` itself is untouched — still exported from `bctcInspectHandler.ts`, still
   correctly used by its other ~14 call sites (§4). Zero shared-helper edit, blast radius stays at
   exactly these 3 files (+ their 3 test files, §3).

## 3. Test Strategy

Existing suites (`:memory:` DB, MZH-2-guarded): `1272-push-bctc-layout.test.ts`,
`pushBctcTableHandler.test.ts`, `1270-push-bctc-md-tables.test.ts`.

**Pre-existing fixture gap found while reading them (must fix, not optional):** none of the 3
suites' happy-path fixtures ever `INSERT`s a `financial_reports` row for their own golden UUID
(`FPT_UUID` / `REPORT_UUID` / `VALID_UUID`) before calling the handler — today's happy path only
passes because the old gate is format-only and never checks existence. Under the corrected gate
this becomes a **required** fixture fix:

1. In each suite, seed a minimal `financial_reports` row for the golden id in `beforeEach` (or per
   happy-path test) — reuse the DA_NOP insert's own minimal-column shape as the reference
   (`bctcReparseJob.ts:656-683`: id/action_code/company_name/exchange/domain/period_year/
   period_quarter/period_type/period_start/period_end/sort_key/parsed_at/extraction_confidence/
   data_env + 4 `'{}'` JSON columns).
2. `"invalid UUID returns 400"` (`report_id: "not-a-uuid"`) — its assertion
   (`expect(respObj.error).toContain("invalid")`) survives unchanged (still true: `"not-a-uuid"`
   has no `financial_reports` row either) but now proves the RIGHT thing for a DIFFERENT reason —
   rename/relabel so it doesn't silently keep documenting a stale premise.
3. **New required case per handler** (the actual regression-proof for this fix): seed a
   `fallback-XXX-2025-Q4` row, push with that `report_id`, assert `200` + row lands in the target
   table. A green suite without this case does not prove the bug is fixed.
4. **New case:** a syntactically valid UUID with NO matching `financial_reports` row → `400`
   (proves the gate is tightened, not just relaxed).
5. Optional, higher-confidence: extend `bctc-extract-reconcile-job.test.ts` with a fallback-id
   fixture through one full reconcile pass, asserting `pek_triggered → done` (not `enrich_failed`).
6. **Live verification post-deploy (required — matches this row's own `verification_gate`):**
   re-run PO's raw probe (`SELECT COUNT(*) FROM bctc_layout_units WHERE report_id LIKE
   'fallback-%'`, and same for `bctc_table_rows`) against the live named-volume DB; re-check
   `docker logs vn-market-intelligence-mcp-pdf-extractor-1` for `push_layout HTTP 400` disappearing
   for `fallback-` ids across the AC-2 72h window.

## 4. AC-3 (63-with-pdf_path terminalization) — no new reconcile-job logic needed

`bctcExtractReconcileJob.ts`'s existing terminal path (`enrich_failed` + fail-loud BUG after
`MAX_RECONCILE_ATTEMPTS`, folded into the run-summary circuit breaker at ≥3 concurrent exhausted
rows) is legitimately designed for genuine per-row extraction failures. It only ever misfired for
the `fallback-` cohort because the write was *structurally guaranteed* to fail — once §2 lands,
that guarantee is gone. Any residual `enrich_failed` for a `fallback-` row after the fix becomes a
real signal, no different in kind from the 5 UUID-id rows PO's own cohort evidence already found
stuck at 0/0 for an unrelated, separate cause (GVR/MBB/D2D/NKG/SSI — out of scope for this row).

**Recommendation: do not pre-build a new quiet-terminal path.** Re-probe empirically at the AC-2
72h mark; only add suppression if a real residual population is measured. The 3 shells with
`pdf_path IS NULL` are a distinct, structurally different failure (no source PDF was ever pulled —
a PDF-sourcing gap, not an extraction-write gap) and are correctly out of scope here.

## 5. Out of scope — flagged fast-follow (same pattern, NOT closed by this fix)

Grepping every call site of `isValidUuid()` (the shared helper plus 2 independently-duplicated
local copies) surfaces **~14 more** call sites gating the identical UUID-format assumption on
`financial_reports.id` / `report_id` / `doc_id`:

- `bctcInspectHandler.ts` — 6 sites (doc-detail / page-text / page-image lookups; this is the
  actual surface behind the `get_bctc_page_text` / `get_bctc_page_image` MCP tools and the
  `/api/bctc-inspect` UI)
- `bctcCorrectHandler.ts`, `bctcConfirmHandler.ts` (×2), `bctcEvalPushStageHandler.ts`,
  `bctcInspectMdHandler.ts`, `bctcFlagsHandler.ts`, `bctcEvalDetailHandler.ts`,
  `bctcEvalRecomputeHandler.ts`, `bctcEvalPageHandler.ts`
- `bctcBatchTableBackfillJob.ts:44` and `bctcCorrectionService.ts:71` — own local `isValidUuid`
  copies, same regex

**This fix deliberately does not touch any of these** — PO's AC-1/AC-2/AC-3 only require
`bctc_layout_units`/`bctc_table_rows` to receive writes and the reconcile job to stop firing false
BUGs; none require read-path reachability, and touching 14 more files would push this row from M to
L. But: after §2 ships, the newly-written layout/table data for the 63-cohort will remain
functionally **unreadable** by every human/agent-facing BCTC consumption tool (inspect UI,
`get_bctc_page_text`, `get_bctc_page_image`, correction submission, eval recompute) — they all 400
the same way on a `fallback-` id. PO's own stated upside ("recovers 63 PDFs of real financial data
currently stranded on disk") is only half-true without a same-pattern fast-follow.

**Recommendation:** PO mint a P1/M fast-follow FIX row applying the identical
format-check → existence-check correction to these 14 call sites, sequenced AFTER this row's write-path
fix is verified live (keeps this row's own verification gate crisp and matches its stated AC scope
exactly; a same-day parallel edit would blur which change fixed what).

(Not in scope for this row, noted for completeness: `pushBctcRefinedUnitTool.ts` /
`finalizeBctcRefineTool.ts` / `backfillBctcScalarsTool.ts` — the agent-facing LF-OVERLAY refine
toolchain downstream of `bctc_layout_units` — carry **no** `isValidUuid` gate at all, confirmed by
grep. Once §2 lands, that toolchain is already format-agnostic and will work on `fallback-` ids
without further changes.)

## 6. DDD Layer / BUILD-STANDARD

All 3 changed files already live in `apps/mcp-server/src/interface/mcp/routes/` (interface layer,
HTTP handler) — correct layer, no violation, no new files for the primary fix (test edits stay in
`apps/mcp-server/src/__tests__/`). Extends the existing validation block in place; no new
interface/port needed.

BUG-FIX (in-zone, no new primitives, existing service) → **BUILD-STANDARD: not-applicable** per
the flow's Standard Detection matrix.
