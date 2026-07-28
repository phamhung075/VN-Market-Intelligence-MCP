# mcp-server — Use Cases

**File:** `apps/mcp-server/src/application/usecases/`

## Market Operations

### scanMarket.ts
- **Input:** `ScanMarketDeps { watchlistRepo, marketPriceRepo, fetchPrices? }`
- **Output:** `MarketScanResult { scanned, signals, alerts }`
- **Flow:** watchlist → fetch prices (HOSE/HNX/UPCOM) → store market_prices + history → compute avgVolume (20-day) → detectSignals → generateAlerts

### syncVnstockData.ts
Maintains vnstock reference data (company names, exchanges)

### pollNews.ts
RSS/news API polling with deduplication

### syncSectorPeers.ts
Sector classification sync from static mappings

## Financial Reports

### parseBctcReport.ts
BCTC PDF text extraction & field validation.

**FIX-BCTC-D1-STABILIZE-REPORT-ID (2026-07-10):** `storeReport()` (`parseBctcReport.ts:219,275-372`)
persists to `financial_reports` (`UNIQUE(action_code, sort_key)`, `bctc-schema.ts:727-822`) via
`INSERT ... ON CONFLICT(action_code, sort_key) DO UPDATE SET <all columns except id>` — NOT
`INSERT OR REPLACE`. `id` is deliberately absent from the `DO UPDATE SET` clause, so SQLite never
touches it on conflict: the row's `id` is stable across every re-parse of the same
(action_code, sort_key). Before this fix, `INSERT OR REPLACE` resolved the unique-key conflict via
DELETE-then-INSERT, minting a fresh `randomUUID()` id on every re-parse — silently orphaning any
`bctc_layout_units`/`bctc_page_zones` rows a prior PEK extraction had already written against the old
id (those tables reference `financial_reports.id` by plain TEXT column, no real FK). `parseBctcReport()`
(`parseBctcReport.ts:673-679`) also pre-checks for an existing row (`SELECT id FROM financial_reports
WHERE action_code = ? AND sort_key = ?`) before assembling the returned `FinancialReport`, so the
in-memory `report.id` handed back to the caller matches the DB-persisted id on a re-parse too (not
just the SQL-column-level guarantee). Test: `src/__tests__/FIX-BCTC-D1-STABILIZE-REPORT-ID.test.ts`.

**FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP (2026-07-21):** two write-back
invariants added to `storeReport()`'s same `ON CONFLICT` UPSERT, closing the
mechanism behind a live incident where a same-day reprocess flipped 16
watchlist tickers' filing dates to the processing day and zeroed out
previously-good financials:
1. **`published_at` (the BCTC filing date / "NGÀY NỘP" in `get_earnings_calendar`)
   is immutable after first insert.** `published_at = excluded.published_at`
   was removed from the `DO UPDATE SET` clause — SQLite now keeps the
   existing row's filing date untouched on every re-parse, same pattern as
   the `id` column. `parseBctcReport()` also gained an optional
   `publishedAt` param (real filing date, e.g. `doc.publishedAt` from
   `listSscDocuments()`) threaded in from `fetchParseAndStoreBctc.ts` BEFORE
   the DB write — previously the caller patched `report.source.publishedAt`
   on the in-memory object AFTER `parseBctcReport()` had already persisted,
   so the correction never reached SQLite and every row's stored
   `published_at` was always the processing timestamp. `parsedAt` (the
   processing timestamp) remains the fallback ONLY for a genuine first-ever
   insert with no known filing date.
2. **A failed/corrupt extraction can never overwrite a previously-good
   stored report.** New pre-write guard in `storeReport()`: if an existing
   row for `(action_code, sort_key)` has `total_assets > 0` (a servable
   report) and the new extraction's `balanceSheet.totalAssets <= 0` (the
   exact OCR-corruption fingerprint `bctcIdentityGuard.ts` checks at serve
   time), the write is skipped entirely, a `sendTelegramBug` alert fires,
   and the existing good row is left untouched. This closes a gap the
   pre-existing `extractionConfidence===0` skip-guard (1196) missed: a
   PARTIAL extraction failure (balance-sheet page missed, other statements
   extracted fine) scores a nonzero-but-low confidence and previously sailed
   through the UPSERT, wiping out good totals.

Both invariants were also applied to `tryNewsChainFallback()` (see below) —
an independent second writer to the same table with the identical two
defects. Root-cause note: PO's initial attribution of `bctcReparseJob.ts` as
the write-back path was explicitly UNVERIFIED; investigation traced the
actual persistence choke point to `storeReport()` (and its
`tryNewsChainFallback()` sibling), which every known upstream caller
(`bctcReparseJob.ts` recovery path, the VPS push handler chain
`bctcVpsIngestHandler.ts` → `pushBctcExtraction.ts` → `fetchParseAndStoreBctc.ts`,
and the `composition-root.ts` §4b post-OCR bootstrap reparse hook) funnels
through — the fix protects against all of them uniformly, regardless of
which upstream trigger fires. `composition-root.ts` also gained an
env-gated kill switch (`DISABLE_BOOTSTRAP_OCREPARSE=1`) as an additional
operational lever for that specific hook.
No test regressions: `src/__tests__/FIX-BCTC-D1-STABILIZE-REPORT-ID.test.ts`
(scalar UPSERT still applies on a genuinely better re-parse) and
`src/__tests__/1196-bctc-reparse-pipeline.test.ts` pass unchanged.

**FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP arm (b2) (2026-07-21,
po_acceptance_reconciliation_20260721T1649):** PO's full 16-ticker cohort
audit found ZERO confirmed good→corrupt transitions (arm b1, above) —
the actual observed transition was ABSENT → manufactured zero-row: the
guard above only ever evaluated when an existing row's `total_assets > 0`,
so for a ticker with NO stored row at all the condition never fired and a
`total_assets<=0` row was inserted anyway. Fix: the guard in `storeReport()`
now evaluates `report.balanceSheet.totalAssets <= 0` UNCONDITIONALLY — a
failed/partial extraction refuses to write whether that means preserving an
existing good row (b1) or leaving the ticker ABSENT with NO row created at
all (b2, `get_bctc_full` keeps returning "Chưa có dữ liệu BCTC" rather than
"[CORRUPT DATA — SKIP] total_assets=0"). Proven via RED-before/GREEN-after
against a forced partial-failure extraction (balance-sheet section stripped,
other statements intact — confidence lands >0, so the pre-existing 1196
all-zero-confidence guard does not already cover it) with zero ingest
dependency. Test: `src/__tests__/FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts`
AC-2b.
**Scope decision — `tryNewsChainFallback()` NOT extended to arm (b2):**
tried and reverted. That writer's `balanceSheet.totalAssets` is hardcoded to
`0` on every call (never a real figure), so an unconditional `<=0` guard
there blocks 100% of its writes — it broke the still-active
`1294b-bctc-fallback.test.ts` feature suite (4 tests) and
`FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts` (2 tests). That writer is
also currently production-unreachable (`enableBctcFallback` defaults
`false` and no live caller sets it `true` — grep-verified), so it is not
part of the 16-ticker incident's actual write-back path. Left as a known,
reported gap for a follow-up scope decision (see the matching note under
`fetchParseAndStoreBctc.ts` below) rather than folded into this task.

**FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT (2026-07-28):**
`period_year`/`period_quarter` (and therefore `sort_key`, the
`(action_code, sort_key)` UPSERT conflict-target identity) were entirely
caller-supplied — `bctcVpsIngestHandler.ts` reads them straight off multipart
form fields with only SHAPE validation (year 2000–2099, quarter enum), never
checked against the PDF's own content. Concrete incident: report_id
`5b0dad71-…` was ingested keyed `(DPM, 2025-Q4)` from a VPS-side
listing-association bug, but its content was unambiguously Q1-2026 — a
`(action_code, sort_key)` slot occupied by the wrong document is a durable
data-loss condition (the real filing for that slot can never land while the
wrong row holds it), not a display bug. Class parallel: memory lesson
`feedback_pressure_state_caller_supplied_fields_dead_server_computed_live`
(UC-CDC-P1) — compute the correct value server-side at the boundary, gate the
caller override.

Remedy: new domain module `domain/services/financial-reports/
periodContentExtractor.ts` — `extractPeriodFromContent(rawText)` scans for
repeated VAS quarter-boundary date statements (balance sheet "Tại ngày …" /
income-cashflow "Từ ngày … đến ngày …", plus a `DD/MM/YYYY` fallback) and
derives the (year, quarter) the DOCUMENT claims to cover. Diacritic/OCR-font
corruption tolerant by design (anchors on digit groups + short ASCII stems
"ng"/"th"/"n", not on the accented letters themselves — verified against the
actual report `5b0dad71` PDF's mangled pdf-parse extraction). Conservative:
a candidate only counts once it reaches `MIN_SIGNAL_COUNT=3` independent
occurrences AND strictly dominates the runner-up; otherwise returns `null`
("cannot determine" — never a guess). `checkPeriodContentConsistency()`
compares that signal to the caller-supplied period; `consistent: false` is
returned ONLY on a confident disagreement (annual reports and inconclusive
signals are always `consistent: true` — the negative control that keeps a
poor-OCR filing ingesting normally, exactly as before).

`parseBctcReport()` runs this check as Step 0, before any statement
extraction or DB write. On a confident mismatch it throws
`BctcPeriodContentMismatchError` (naming both periods) — the report is
written under NEITHER key. This propagates through the EXISTING fail-loud
paths with zero plumbing changes: `fetchParseAndStoreBctc.ts`'s Step 3
`try/catch` already returns `null` on any `parseBctcReport` throw, and
`pushBctcExtraction.ts`'s `runPipeline` `try/catch` already turns any throw
into `{outcome:"failed", reason: err.message}`, which
`bctcVpsIngestHandler.ts`'s `applyPushBctcExtractionOutcome` already routes to
a `sendTelegramBug` alert. A dedicated, debounced (`bctc_signal_debounce`,
1h cooldown, same mechanism as the 1792 low-confidence alert) Telegram bug is
also fired directly from `parseBctcReport()` so the alert fires unconditionally
regardless of caller path. Test: `src/__tests__/
FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT.test.ts` (domain unit
tests incl. the real diacritic-corruption fingerprint, + integration tests
proving AC-2 rejection, AC-3 negative controls, AC-4 slot-recovery, AC-5
regression). Zero net-new failures verified base-vs-head across the full
70-file / 670-test pre-existing BCTC test corpus.

**AC-1 (DATA, applied 2026-07-28):** report_id `5b0dad71-…` was a
byte-identical duplicate (`md5sum` confirmed) of `3e2a26d9-…`
(correctly-labelled `DPM_2026_Q1`) — root cause traced in `bctc_vps_queue`:
the VPS-side `(DPM, 2025, Q4)` backfill target associated the wrong SSC
listing URL (the newest DPM filing, actually Q1-2026) with an old empty
backfill slot. One-shot migration `scripts/migrations/
dedupe-mislabeled-bctc-period.ts` (dry-run default, `--apply` to execute;
decision-table gated — refuses on source already-finalized, target
confirmed, action_code mismatch, same sort_key, target-has-units, or pdf-hash
mismatch) re-parented the 23 completed `bctc_refined_units` windows from the
duplicate onto the correct row, deleted the duplicate `financial_reports`
row, and reset the freed `bctc_vps_queue` row to `pending` so the real
Q4-2025 filing can be genuinely re-discovered. Applied BEFORE the row's
`refine_status` reached `DONE` (verified live immediately before the run),
satisfying the task's `time_gate` — `get_bctc_report_id(code="DPM",
year=2025, quarter="Q4")` now correctly returns nothing.

### bctc/ensureFinancialReportShellRow.ts

**FIX-BCTC-D2-ENSURE-SHELL-ROW (2026-07-10):** idempotent upsert that ensures a
`financial_reports` shell row exists for a PDF the pull job has just saved to
disk, decoupled from the legacy OCR-confidence scalar-parse pipeline. Called
from `bctcPdfPullJob.ts` (Step 4b) immediately after `deps.savePdf()` succeeds,
before Step 5 `triggerExtraction`. `ON CONFLICT(action_code, sort_key) DO
UPDATE SET pdf_path = excluded.pdf_path WHERE financial_reports.pdf_path IS
NULL` — sets `pdf_path` at PDF-save time without ever clobbering a value a
later scalar/legacy write already set. First-insert rows carry
`validation_status='pending_extraction'` (new additive enum value, distinct
from `pending|passed|failed|passed_with_warnings|low_confidence`) and empty
JSON statement columns (`'{}'`) — a shell with no scalar data yet. Reuses
D1's id-stability pattern (pre-check `SELECT id FROM financial_reports WHERE
action_code = ? AND sort_key = ?`) so the returned id matches whatever
`parseBctcReport.ts::storeReport()`'s own `ON CONFLICT DO UPDATE` would reuse
for the same row later — one shared id-stability contract, not two. `db` is
an optional injected parameter (default `getDb()` singleton), matching the
sibling `backfillBctcPdfPaths(db, pdfDir)` pattern for this same table —
`bctcPdfPullJob.ts` always passes its own `db` (`opts.db ?? getDb()`)
explicitly so the write lands in the same database the job (and its test
suite's dedicated `:memory:` instance) reads back from.
Test: `src/__tests__/FIX-BCTC-D2-ENSURE-SHELL-ROW.test.ts`.

### fetchParseAndStoreBctc.ts
VPS PDF pull → OCR → parser → DB storage. FACTORY-APP-split-fetchParseAndStoreBctc
(2026-07-08): this file is now a thin Step 1/3/4 sequencer (<=120L); split into
`bctc/types.ts` (shared param/insert-fn types), `bctc/resolvePdfText.ts` (Step 2
PDF download + OCR-cache fallback, Task 293), `bctc/newsChainFallback.ts`
(Task 1294b news-chain fallback + `buildFiscalPeriod`/`buildAnalysisSummary`,
carries the named `NEWS_FALLBACK_BASELINE`/`TEMPORAL_DISCOUNT`/`FALLBACK_CONF_MIN`/
`FALLBACK_CONF_MAX` confidence-tuning constants), and `bctc/insertBctcAnalysis.ts`
(Step 4 LanceDB embed). Arithmetic/behavior unchanged — pure relocation + naming.

**FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN (2026-07-13):** `tryNewsChainFallback()`
(`bctc/newsChainFallback.ts:239-252,373-474`) is the SECOND `financial_reports`
call site carrying the same id-orphaning defect D1 fixed in `parseBctcReport.ts`
(same file, same `UNIQUE(action_code, sort_key)` target, `bctc-schema.ts:727-822`)
— D1's design doc/files[] covered only `parseBctcReport.ts`, so this call site
was missed at the time. Same fix applied: `INSERT ... ON CONFLICT(action_code,
sort_key) DO UPDATE SET <all columns except id>` replaces `INSERT OR REPLACE`,
and a pre-check (`SELECT id FROM financial_reports WHERE action_code = ? AND
sort_key = ?`) supplies the existing row's `id` before assembling the returned
`fallbackReport` — mirrors D1's `parseBctcReport()` pre-check so the in-memory
id handed back to the caller matches what's persisted. Closes the same
`bctc_layout_units`/`bctc_page_zones` orphan risk for reports whose FIRST
successful write was a news-chain fallback (not a scalar OCR parse).
Test: `src/__tests__/FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts`.

**FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP (2026-07-21):** this
function ALWAYS writes `total_assets=0` (hardcoded — it reconstructs
directional hints from `agent_signals`, never real balance-sheet figures)
and previously set `published_at: new Date().toISOString()` unconditionally
on every call, with its own independent `ON CONFLICT ... DO UPDATE SET
published_at = excluded.published_at` — i.e. this second writer carried the
SAME two defects fixed in `parseBctcReport.ts::storeReport()` above,
discovered while establishing the actual write-back path for a live
corruption incident. Same two fixes applied here: `published_at` removed
from the `DO UPDATE SET` clause (immutable after first insert), and a guard
added before the INSERT — if an existing row already has `total_assets > 0`,
the fallback write is skipped entirely (`fallback: false`, reason logged)
rather than clobbering good data with the hardcoded zero. A same-ticker
re-run after a first fallback write (`total_assets` already 0, not `> 0`)
is unaffected — the guard only blocks overwriting a row that was already
servable. Test: `src/__tests__/FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts`
(unchanged, still passes — its re-run scenario starts from `total_assets=0`).
**Arm (b2) NOT applied here (2026-07-21):** the same "no-prior-row" fix
shipped in `storeReport()` (arm b2, above) was tried against this writer too
and reverted — since `totalAssets` is hardcoded `0` on every single call, an
unconditional guard here refuses 100% of writes, which broke the
still-active `1294b-bctc-fallback.test.ts` suite (4 tests) and this file's
own `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts` (2 tests) that
legitimately exercise a first-ever fallback write succeeding. This writer is
also currently unreachable from any live caller (`enableBctcFallback`
defaults `false`, never set `true` outside tests — grep-verified across
`apps/mcp-server/src`), so it is not part of the 16-ticker incident's actual
write-back path. Known open gap, intentionally left for a separate scope
decision rather than folded into FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.

### discoverBctcPdfUrlBrowser.ts / discoverBctcPdfUrlDirectApi.ts
PDF discovery strategies (browser scraping vs direct API)

### bctcQueueEnricher.ts
Enrich pending BCTC records from news corpus

### checkSscReports.ts
SSC official disclosure polling

## Analysis & Intelligence

### assembleBriefing.ts
Morning intelligence synthesis: market context + alerts + sector insights + news.
`_assembleBriefingImpl` is a thin 19-step sequencer (FACTORY-APP-split-assembleBriefing);
each step's query/compute logic lives in its own module under `usecases/briefing/`
(e.g. `queryTopStories.ts`, `queryWatchlistSummary.ts`, `defaultComputeTa.ts`,
`queryUpcomingDeadlines.ts`, `queryGlobalSnapshot.ts`, ...). Public exports
(`DailyBriefing`, `defaultComputeTa`, `queryForeignFlowSummary_TEST`,
`BEARISH_WARNING_THRESHOLD`) are re-exported from `assembleBriefing.ts` unchanged.

### assembleEveningSummary.ts
Daily close summary generation

### orchestrateRecapCommand.ts
Telegram `/recap`/`/recapw`/`/recapm` orchestration (FACTORY-INFRA-split-telegramCommands):
thin wrappers around `assembleEveningSummary`/`generatePeriodicSummary`,
invoked by `interface/mcp/routes/webhookHandler.ts` and injected into
`infrastructure/notifiers/telegramCommands.ts`'s `RecapResolvers` DI contract
so the infrastructure layer never imports `application/usecases/` directly.

### assembleAlertDigest.ts
Alert aggregation & notification formatting

### getPatternSummary.ts
RAG vector search for similar historical patterns

### getCrisisEarlyWarning.ts
Detect systemic stress signals

### getReputationWarnings.ts
Analyst/broker credibility scoring

## Backtesting & Simulations

### runBacktest.ts
Historical signal performance evaluation

### runImpactChain.ts
Cascade effect simulation: catalyst → price move → sector spillover

### generatePeriodicSummary.ts
Report generation (daily/weekly/monthly)

## System & Health

### getCycleBootstrap.ts
Agent session initialization state

### getOhlcvPipelineHealth.ts
Data freshness checks

### getPipelineHealth.ts
System component health snapshot

### computeMarketEarningYield.ts
Market valuation metric (1/PE ratio)

## Cron Status Compute (DASH-CRON-RECHECK-TABLE, TASK-DASH-CRON-1)

### apps/mcp-server/src/application/cron/cronStatusCompute.ts
Orchestrates one Layer-A row (per `CRONS` map key) for `GET /api/cron-status`:
- `resolveJobNameDb(cronsKey, distinctDbJobNames)` — CN-1 hybrid 3-tier: static 16-pair reverse-map (WATCHDOG_MANIFEST-covered jobs) → normalized-match against a runtime `DISTINCT job_name` scan → honest fallback (CRONS key itself).
- `deriveCadenceMs(cronExpr, nowMs)` — CN-2 MIN-of-6-samples via `cron-parser`; one generic algorithm handles restricted-hour windows, weekday-only jobs, and comma-lists uniformly.
- `buildLayerARow(...)` — resolve → `getLastRunForJob` → `classifyCronLiveness` (domain) → assemble; populates `reason` for non-ON_TIME rows.
- **Memoization contract (load-bearing, risk R1):** `cadenceMs`/`thresholdMultiplier`/`human_schedule`/`job_name_db` computed once per CRONS key into a module-level `Map`, reused for process lifetime (test hooks: `_staticMetaComputeCountForTests`, `_resetStaticMetaCacheForTests`).
- **Fence-B compliance:** does NOT import `src/scheduler/` (eslint-plugin-boundaries forbids application→scheduler). Accepts `WATCHDOG_MANIFEST`/`CRONS` as plain parameters from the interface layer (`CadenceManifest` structural type) instead.
