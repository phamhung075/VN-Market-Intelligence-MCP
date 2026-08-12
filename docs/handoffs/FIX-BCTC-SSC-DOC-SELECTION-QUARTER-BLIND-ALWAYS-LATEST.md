---
sprint: DEVTEAM-20260806
branch: fix/bctc-ssc-quarter-selection
size: M
zone: apps/mcp-server/
priority: P0
depends_on: []
blocks: []
---

## TLDR
BCTC acquisition reports period-mismatch errors because listSscDocuments() has no quarter parameter and fetchParseAndStoreBctc() unconditionally takes docs[0] (the latest). Fix by adding quarter awareness to both functions so the correct document is selected.

## [PM] Planning Context
- **Zone:** apps/mcp-server/
- **Root cause:** 30+ refusals over 3 PO cycles, same tickers repeating 08-04→08-06 with skew LATER (19/19 confirm docs[0] selection picks wrong period)
- **Acceptance Criteria:**
  - [ ] listSscDocuments() accepts optional quarter parameter (null = latest, else "Q1"|"Q2"|"Q3"|"Q4")
  - [ ] fetchParseAndStoreBctc() passes caller's quarter intent to listSscDocuments()
  - [ ] Verify telegram backlog drops on next collector cycle (period-match refusals → 0)
- **Files to modify:**
  - `apps/mcp-server/src/infrastructure/fetchers/ssc.ts` — add quarter param, selection logic
  - `apps/mcp-server/src/infrastructure/fetchers/fetchParseAndStoreBctc.ts` — accept + forward quarter
- **Dependencies:** none
- **Knowledge needed:** BCTC period-matching contract in `docs/analysis-briefs/BCTC-period-semantics.md`; SSC API docs

## Verification
Baseline passes; delivered code must maintain all existing tests + add specific-quarter selection test.

## [Developer] Implementation Record

**Superseded plan note:** the `[PM] Planning Context` above (add a quarter param to `listSscDocuments()`) is the option the architect brief investigated and explicitly REJECTED (would break `checkSscReports.ts:defaultListDocs()`, which depends on getting all quarters back). Implemented the architect's ratified design instead — full detail: `docs/architecture-briefs/2026-08-05-fix-bctc-ssc-doc-selection-quarter-blind.md`.

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/domain/services/financial-reports/documentTitlePeriodExtractor.ts` (NEW, 81L) — pure `extractPeriodFromTitle(title)`, parses Vietnamese "quý N/I..IV năm YYYY" + abbreviated "QN YYYY" title forms into `{year, quarter}` or `null`.
  - `apps/mcp-server/src/application/usecases/bctc/selectSscDocument.ts` (NEW, 100L) — `selectSscDocumentForPeriod(docs, actionCode, year, quarter)`: title-first selection, falls back to `deriveQuarterFromPublishedAt` (checkSscReports.ts) only when the title cannot be parsed; throws named `SscDocumentPeriodNotFoundError` when no candidate matches (never `docs[0]`).
  - `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts:61-108` — Step 1 now calls `selectSscDocumentForPeriod` instead of `doc = docs[0]!`; catches `SscDocumentPeriodNotFoundError`, converts to the function's existing `return null` contract with a debounce-gated Telegram bug (mirrors `parseBctcReport.ts:685-701`'s idiom, distinct debounce key `${year}-Q${quarter}:doc-selection-not-found`). Hoisted the existing `buildFiscalPeriod(year, quarter)` call up-front so both Step 1 and Step 3 reuse one `period` value. Grew 125L→168L (pre-existing size-lint-baseline entry, now carries its own accurate `size-justification:` header).
  - `apps/mcp-server/src/__tests__/293-ocr-fallback-pipeline.test.ts` — 3 pre-existing tests requested Q2/Q3/Q4 against a mock SSC listing containing only a Q1-titled document (previously masked by Step 1 being quarter-blind); corrected `quarter` param to `Q1` to match the fixture (OCR-cache filename key derives from the doc URL, independent of requested quarter — pure fixture-honesty fix, no behavior change).
- **Tests written:** `apps/mcp-server/src/__tests__/FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST.test.ts` (NEW, 322L) — 15/15 pass, 35 expect() calls: domain title-parser unit tests (every live fixture-title shape from `029-ssc-scraper`/`104-job-ssc-check`/`034-telegram-notifier`/`1289f-refinement-direct-api`), `selectSscDocumentForPeriod` unit tests (AC-1 match-among-several; AC-2 named-error-on-no-match incl. empty-candidate-list and empty-publishedAt-never-trusted-as-signal), AC-3 family-A fingerprint regression (Q1 request vs a Q4-first-ordered listing — Q4 doc NOT selected), 3 `fetchParseAndStoreBctc` integration tests (AC-1 real `listSscDocuments()` path selects the period-matching doc, not `docs[0]`; AC-2 no-match returns `null` with exactly 1 debounced Telegram bug across 2 identical calls; `docs.length===0` case stays Telegram-silent, distinct from selection-not-found).
- **Git commits:** pending (staged, about to commit — see RETURN block for hash)
- **Type check:** clean (`bun tsc --noEmit`, 0 errors)
- **bun test:**
  - New test file: 15 pass / 0 fail (35 expect)
  - Targeted (39 files referencing `fetchParseAndStoreBctc`/`ssc.js`/`checkSscReports`/`newsChainFallback`): 376 pass / 0 fail (995 expect)
  - Full suite: 15247 pass / 40 skip / 59 fail / 1 error / 48101 expect across 1271 files (546s) — grep-confirmed ZERO overlap between the 59 fail names and this task's files (`bctc`/`ssc`/`fetchParseAndStoreBctc`/`selectSscDocument`/`documentTitlePeriod`/`293-ocr`); the one superficially-alarming hit, `1405b-bctc-vps-fixes.test.ts`, fails on unrelated `vps_push_log`/news-service assertions and imports none of this task's files. Consistent with today's documented pre-existing flaky-churn band (sibling S85/S86/S87 entries this same day: 60/63/57 fail).
- **Tool count:** 183 tools — matches pre-task baseline (no tool files touched)
- **Scheduler count:** 88 cron.schedule entries — matches pre-task baseline (no scheduler files touched)
- **Gate 2 (tool-suite integrity):** `PORT=3099` clean boot, `/health` → `{"toolCount":183,"sessions":0}`. Dashboard circular-dep check: `/api/bctc-inspect` and `/dashboards/news-fetch/` both HTTP 200.
- **Size-lint:** `size-lint-justification.sh --check` — only pre-existing untouched `apps/mcp-server/src/interface/mcp/transport.ts` fails (baseline=126L actual=265L, unrelated to this task). `fetchParseAndStoreBctc.ts` carries an accurate 168L `size-justification:` header.
- **Simplicity gate:** PASS after simplification — removed a single-call-site `derivePublishedAtSignal` helper (Q2 trigger), inlined the publishedAt-fallback branch directly into `selectSscDocumentForPeriod`'s loop.
- **Docs updated:** `docs/architecture/microservice/mcp-server/usecases.md` (`fetchParseAndStoreBctc.ts` section — new dated addendum + corrected stale "<=120L" claim), `docs/architecture/microservice/mcp-server/financial-reports.md` (domain-services list entry + new invariant 12).
- **Graphify:** SKIPPED — no Skill-tool binding from this subagent context (noted honestly, not claimed — same class of gap as prior sibling entries this sprint).

### AC status

- **AC-1** (request returns content-matching document or fails loud, never a silent wrong-period document): DONE — `selectSscDocumentForPeriod` + integration test.
- **AC-2** (negative control — no match returns the named error, not `docs[0]`): DONE — unit + integration tests, debounce verified (1 Telegram bug across 2 identical calls).
- **AC-3** (regression: family-A fingerprint, Q1 request vs Q4-first listing): DONE — dedicated regression test, Q4 doc confirmed NOT selected.
- **AC-4** (identify/scope family-B): already answered by the architect (brief §5) — `bctcVpsIngestHandler.ts`'s receive-only `/api/push-bctc-pdf` endpoint, confirmed out of scope; no action needed this cycle, not regressed.
- **AC-5** (historical backfill slice, stored rows > 0): BLOCKED on `BCTC-ENRICHER-OLD-QUARTERS` (still BACKLOG, live-checked this cycle — 0-URLs-found blocker unresolved) per the brief's own sequencing note (§7). QA verification step, not a dev-mcp-server deliverable this cycle — do not accept a Telegram-refusal-rate drop as substitute evidence (row's own anti-false-green note rules this out).
