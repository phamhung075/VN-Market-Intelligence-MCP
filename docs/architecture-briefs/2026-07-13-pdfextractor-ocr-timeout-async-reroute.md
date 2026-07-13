# Architect Design Touch — FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT

**Zone:** apps/mcp-server/ (single-zone, BUG-FIX — BUILD-STANDARD: not-applicable)
**Task:** bounded design touch (dispatcher-driven, PO-blessed AC below) — async-vs-sync sub-decision before dev implements.
**Scope discipline:** this is a routing/state-machine fix that REUSES 4 already-existing subsystems verbatim (pekExtractTrigger.ts, bctcExtractReconcileJob.ts, ensureFinancialReportShellRow.ts, pdf.ts's confidence classifier). No new services, no new cron, no new DB columns, no new HTTP endpoints.

---

## PO's 2-part AC (decided — designing around these)
1. **FAIL-LOUD:** `push-bctc-pdf` must not return `ok:true` / mark queue row `done` when OCR/all-tiers fail. Row stays retryable, staleness surfaced.
2. **LARGE-PDF PATH:** route large/scanned PDFs through async `/api/trigger-pek-extract` instead of the sync 3-tier gauntlet; queue row flips `done` ONLY when the reflow lands real data.

## Verified code paths (read, not inferred)
- `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts:65-70` — Tier-1/2 shared `extractViaMicroservice()`, raw `AbortSignal.timeout(120_000)`, NOT routed through the shared `withDeadline()` bounded-fetch helper.
- `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts:149-285` — `triggerPushBctcExtraction()`, the legacy 3-tier gauntlet (pdf_path service call → URL service call → local pdf-parse) feeding `fetchParseAndStoreBctc` (writes `financial_reports` SCALAR columns via `parseBctcReport`). Documented "never throws… non-fatal" — **this is the root cause**: it swallows both "all 3 tiers exhausted" and "pipeline returned null" as silent no-ops.
- `apps/mcp-server/src/interface/mcp/routes/bctcVpsIngestHandler.ts:150-174` (`handlePushBctcPdf`) — `setImmediate` callback `await`s the above with no throw ⇒ unconditionally sets `bctc_vps_queue.status='done'`. The `catch` block never fires for the silent-swallow case (nothing thrown), which is exactly why `push-bctc-pdf` returns `{ok:true}` on a fully-failed OCR.
- `apps/mcp-server/src/interface/mcp/routes/bctcVpsIngestHandler.ts:194-265` (`handleTriggerPekExtract`, route `POST /api/trigger-pek-extract`) → shared helper `triggerPekExtractionForReport()` (`infrastructure/fetchers/pekExtractTrigger.ts`) → `POST pdf-extractor:5001/pek-extract`, 30s deadline via `withDeadline` (compliant with the codebase's <60s bounded-fetch NFR). Discriminated outcome union: `queued`(202) / `market_hours`(503) / `pdf_extractor_error`(502) / `unreachable`(502) — never throws.
- `apps/pdf-extractor/interface/handlers.py:420-478` — `POST /pek-extract` (`status_code=202`) fires background task `_run_pek_extract`, writes `bctc_layout_units` / `bctc_table_rows` / `bctc_md_tables`.
- `apps/mcp-server/src/scheduler/financial-reports/bctcExtractReconcileJob.ts` (already shipped, FIX-BCTC-D3A/B/C) — cron `5,35 * * * *`, scans **ALL** `bctc_vps_queue WHERE status='pek_triggered'` origin-agnostically, re-derives `report_id` via `(action_code, sort_key)`, success = rows landed in the 3 tables above → `done`; else re-fires (uniform policy, documented rationale in-file) up to `MAX_RECONCILE_ATTEMPTS=8` (~4h) → `enrich_failed` + fail-loud `sendTelegramBug`. **Already used by `bctcPdfPullJob.ts` (the VPS-pull cron path) — this fix only needs to make the VPS-push path (`push-bctc-pdf`) feed the same machine.**
- `apps/mcp-server/src/application/usecases/bctc/ensureFinancialReportShellRow.ts:110-124` — idempotent upsert, `pdf_path = excluded.pdf_path WHERE financial_reports.pdf_path IS NULL` — **deliberately never clobbers an existing pdf_path.** (Risk flag below.)
- `apps/mcp-server/src/infrastructure/fetchers/pdf.ts:35,213-223,247-275` — `PDF_CONFIDENCE_HIGH_THRESHOLD = 200` (exported), `extractPdfText()` (pure pdf-parse, no OCR) returns `confidence: 1.0` when `text.trim().length >= 200`, else `0.3`/`0` — own docstring: "treat as a scanned/image PDF with minimal text." **Already the exact classifier this task needs.**

---

## Decision 1 — async-reroute vs sync-timeout-bump

**Recommendation: async-reroute.** Confirms PO's lean; a bare bump is rejected outright.

- Evidence already in the signal: a **direct 480s call still did not return** (tesseract ran 17+ min continuously). No fixed bump is a durable bound — OCR duration is a function of scan quality/page count, not a constant this codebase controls.
- The codebase's own bounded-fetch convention (`infrastructure/fetchers/fetchDeadline.ts`, FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE, NFR-2: "all [withDeadline] callers… must be < 60_000ms") already treats >60s synchronous holds as an anti-pattern for every other mcp-server fetch site. `pdfExtractorClient.ts`'s raw `AbortSignal.timeout(120_000)` is already an outlier to this rule; bumping it to 480s+ doubles down on the violation instead of curing it.
- Extending the async pattern is `always_extend_not_duplicate`, not new surface: `bctcPdfPullJob.ts` (VPS-pull path) has **already fully migrated** off the sync gauntlet onto `/pek-extract` + `bctcExtractReconcileJob.ts` (FIX-BCTC-D3A/B/C, shipped). `push-bctc-pdf` (VPS-push path) is the **only remaining caller** of the sync 3-tier gauntlet for large docs. This fix brings it into line with the already-battle-tested precedent — zero new state machine to design.

## Decision 2 — the threshold

**Rejected: raw byte-size or page-count cutoff.** Empirical check against the live `data/pdfs/` corpus (256 files, 2.2GB) falsifies it: the failing HPG file is 7,135,524 B / 33pp (confirmed all-scanned), yet dozens of already-fine, already-served files are 2-3x larger — `MWG_2025_Q4.pdf` 15.4MB, `VCI_2026_Q1.pdf` 15.2MB, `GAS_2025_Q4.pdf` 17.5MB, `HUT_2025_Q2.pdf` 23.2MB (all served without incident). These are large because of embedded appendix images/signature scans on otherwise text-native filings. Any size cutoff low enough to catch HPG (7.1MB) would misroute a large fraction of the currently-healthy population into the slower async path; a cutoff set above HPG would miss smaller-but-fully-scanned reports. Byte-size is not a reliable OCR-need proxy in this corpus.

**Adopted: reuse the existing `extractPdfText()` confidence classifier — zero new constant.**

Rule: before any pdf-extractor tier call, run the already-injected `extractText()` dep (`infrastructure/fetchers/pdf.ts::extractPdfText`, pure pdf-parse structural pass, no OCR, sub-second even on 20MB files) on the just-saved buffer:
- `confidence === 1.0` (`text.trim().length >= PDF_CONFIDENCE_HIGH_THRESHOLD` = **200 chars**, already-exported constant) → text-native → keep the existing sync Tier1→Tier2→Tier3 gauntlet **unchanged**.
- `confidence < 1.0` (0 or 0.3) → scanned/minimal-text → **async re-route** (Decision 3).

Default value = 200 (already codified in `pdf.ts:35`, not invented for this task). This is the `always_extend_not_duplicate` answer PO's "pick a defensible default" ask requires — direct signal (does this PDF have a real text layer), not a size/page proxy.

## Decision 3 — the async state machine (confirm wiring + new-branch spec)

`bctcExtractReconcileJob.ts` needs **zero changes** — it already treats `pek_triggered` origin-agnostically. New wiring is entirely on the push-path producer side:

1. **`pushBctcExtraction.ts`** — add the Decision-2 gate ahead of Tier 1. On scanned:
   a. **RISK (must-fix, not optional):** do NOT call `ensureFinancialReportShellRow()` alone. Its upsert is `pdf_path = excluded.pdf_path WHERE financial_reports.pdf_path IS NULL` — it deliberately never clobbers an existing pdf_path. `push-bctc-pdf`'s use case is explicitly **corrective** (e.g. HPG: replacing a stale standalone PDF with the real consolidated one) — an already-existing `financial_reports` row for `(action_code, sort_key)` is the **common** case here, not the exception. The no-op branch would fire, `/pek-extract` would be triggered against the STALE `pdf_path`, and this fix would silently reproduce its own bug class.
      → Fix: call `ensureFinancialReportShellRow()` first (handles brand-new ticker/quarter, gives a stable `id`), **then** an explicit unconditional `UPDATE financial_reports SET pdf_path = ? WHERE action_code = ? AND sort_key = ?` (no `IS NULL` guard) — mirrors what the legacy pipeline's own `ON CONFLICT DO UPDATE` write already does unconditionally on every successful run.
   b. Call `triggerPekExtractionForReport(reportId, newPdfPath)` — same helper, zero new HTTP code.
   c. Return outcome uniformly regardless of the 202/503/502/unreachable result — do NOT special-case per-outcome here; that discrimination is `bctcExtractReconcileJob.ts`'s job (its own doc comment: "ADOPTED: uniform always re-fire… bounded by MAX_RECONCILE_ATTEMPTS" — re-litigating that policy here is out of scope).
2. **`bctcVpsIngestHandler.ts`** (`handlePushBctcPdf`'s `setImmediate`) — switch on the new outcome:
   - `"done"` → `status='done'` (unchanged; now only reachable when `runPipeline()` proved a non-null result).
   - `"async_routed"` → `status='pek_triggered', last_attempt=datetime('now')` — reconcile job owns the rest of the lifecycle (`done` / `enrich_failed` + fail-loud BUG, already shipped, no changes).
   - `"failed"` → `status='failed'` (attempts already incremented at push-time by the existing initial upsert) + `sendTelegramBug(...)` (same mechanism the reconcile job's `enrich_failed` path already uses) so staleness is surfaced immediately, not just left silently retryable.

## Root cause fix (AC1 — applies regardless of Decision 2/3 branch)

`triggerPushBctcExtraction()` currently returns `Promise<void>` and is documented "never throws… non-fatal." The caller assumes no-throw ⇒ success and marks `done` unconditionally. Fix: change the return type to a discriminated union `"done" | "async_routed" | "failed"` so the caller can no longer default to `done`. This also closes a **second latent instance of the same bug class already in the file today**: a `runPipeline()` call that returns `null` (parse succeeded reading tiers but the pipeline itself rejected the report) currently ALSO falls through to `done` — must become `"failed"` too.

---

## Files/functions dev-mcp-server touches

1. `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts`
   - `PushBctcExtractionDeps`: add `ensureShellRow` + `triggerPekExtraction` optional deps (mirrors `bctcPdfPullJob.ts`'s own dep-injection pattern); reuse existing `extractText`/`readFile` deps for the new pre-check gate (Decision 2).
   - `triggerPushBctcExtraction()`: `Promise<void>` → `Promise<PushBctcExtractionOutcome>` (`{outcome:"done", reportId}` | `{outcome:"async_routed", reportId}` | `{outcome:"failed", reason}`). Add the confidence gate ahead of Tier 1; scanned branch per Decision 3 §1; every existing "tiers exhausted" / "pipeline null" / "pipeline threw" exit returns `"failed"` instead of an implicit void-success.
   - `makeProductionDeps()`: wire `ensureFinancialReportShellRow` (`application/usecases/bctc/ensureFinancialReportShellRow.js`) + `triggerPekExtractionForReport` (`infrastructure/fetchers/pekExtractTrigger.js`).
2. `apps/mcp-server/src/interface/mcp/routes/bctcVpsIngestHandler.ts`
   - `handlePushBctcPdf()`'s `setImmediate` callback: switch on the new outcome instead of blind `status='done'`; add `sendTelegramBug` fail-loud call on `"failed"`.
3. **No changes needed** (reused as-is): `pdfExtractorClient.ts` (its 120s constant becomes non-binding for the scanned branch; still exercised only by the now-guaranteed-fast text-native branch — optional cosmetic hardening only, see Open Risks), `pekExtractTrigger.ts`, `bctcExtractReconcileJob.ts`, `ensureFinancialReportShellRow.ts`.
4. Tests: extend/add unit coverage for `pushBctcExtraction.ts` (scanned-branch routing, discriminated outcome, explicit-pdf_path-overwrite-not-silently-skipped assertion) and `bctcVpsIngestHandler.ts` (queue status transition per outcome, `sendTelegramBug` fires on `"failed"`). Naming convention: `FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT.test.ts` (or split per touched file) — dev's call.

## Implementation checklist mapped to PO's AC

**AC1 — FAIL-LOUD**
- [ ] `triggerPushBctcExtraction` returns a discriminated outcome; "no throw" no longer implies success.
- [ ] `handlePushBctcPdf` marks `done` ONLY on `{outcome:"done"}`.
- [ ] `"failed"` outcome → status stays `failed`/retryable (attempts already incremented at push time), never `done`.
- [ ] `"failed"` outcome → `sendTelegramBug` fail-loud signal fires.

**AC2 — LARGE-PDF PATH**
- [ ] Confidence gate (`extractPdfText` / `PDF_CONFIDENCE_HIGH_THRESHOLD`) added ahead of Tier 1, reusing existing dep injection.
- [ ] `confidence < 1.0` branch: `ensureFinancialReportShellRow` **+ explicit unconditional `pdf_path` UPDATE** (do not rely on the shell-row upsert alone — see Risk 1) **+** `triggerPekExtractionForReport`.
- [ ] Queue row → `pek_triggered` (never `done` directly) on the async branch; `bctcExtractReconcileJob.ts` untouched, now also serves push-originated rows.
- [ ] `confidence === 1.0` branch: existing Tier1→2→3 gauntlet unchanged.

## Post-deploy (ops-owned — already tracked in `docs/agent-memory/decisions/po-decisions.md`, FYI only)
Reset `bctc_vps_queue` row 223 (HPG 2025 Q4) `done`→`pending` once the fix ships + mcp-server rebuilds, to re-trigger the consolidated reflow.

## Open risks

1. **Must-fix:** the `ensureFinancialReportShellRow` "don't clobber pdf_path" no-op (flagged in Decision 3 §1a) — if skipped, this fix silently reproduces its own bug class on every corrective (non-first-time) push.
2. **Scope boundary, not a defect:** "done" for the async/PEK-routed branch means "real TABLE data landed in `bctc_layout_units`/`bctc_table_rows`/`bctc_md_tables`" (the reconcile job's existing, unchanged bar) — **not** that `financial_reports` SCALAR columns (`net_revenue` etc.) are populated. Scalar population for PEK-routed reports depends on a separate, already-existing, host-cron-driven agentic pipeline (`push_bctc_refined_unit` → `finalize_bctc_refine` → `aggregateScalars`, "Option-Y") that this fix does not touch and does not gate on. This gap already exists identically for `bctcPdfPullJob.ts`'s rows today — this fix extends the same accepted precedent to push-originated rows, it does not introduce a new gap. Flagging so PO/QA don't assume "queue done" ⇒ "financial_reports scalar reflowed" for PEK-routed reports; a stricter scalar-population gate would be a separate, larger cross-pipeline task, out of scope here.
3. **Optional hardening (not required for AC):** tighten `pdfExtractorClient.ts`'s remaining 120s constant toward the <60s `withDeadline` convention (only exercised by the now-guaranteed-fast text-native branch after this fix) — cosmetic, no behavior risk either way, dev's call.
