# Architect Design Brief — G5b Consolidation Plan
## pdf-extractor service as extraction owner / unified BCTC write-path

**Date:** 2026-05-24
**Author:** architect
**Pilot:** pdf-extractor (SCALE, Phase 2)
**Task:** P2-G5b-unblock recurring-bug rethink
**Supersedes:** p2-g5b-clearance.md (BLOCKED verdict — this document is the rethink commissioned by recurring-bug-escalation policy)
**Status:** GO — implementable, QA-verifiable offline

---

## §1 — Root-Cause Verdict: CODE or INFRA/VPS?

### 1953-G-FAIL "BCTC stale 78h" — INFRA/DATA issue OR CODE defect?

**VERDICT: BOTH, and they are separable.**

Evidence chain (from bctc-write-chain-rca.md + code verification):

**INFRA/VPS layer** (the part code CANNOT fix):
- The Vinahost VPS (`vn-bctc-fetch.service`) is the authoritative PDF acquisition agent. Fresh PDFs arrive ONLY when the VPS is up, the SSC portal is reachable from Vietnam, and the 6h cron fires.
- "78h stale" = VPS pipeline gap OR SSC portal downtime. No code change on the mcp-server side can produce fresh BCTC data if the VPS is not pushing PDFs.
- This component requires ops verification: `ssh root@$VINAHOST_IP /root/vps-status.sh` and VPS service health. Architect does NOT own this.

**CODE layer** (the part the consolidation CAN fix):
- Failure A: `backfillBctcQ12026.ts:53` column name mismatch (`ticker/year/quarter` vs `action_code/period_year/period_quarter`) — queue never seeded for new earnings seasons. **This is a code defect.** Fix: correct column names.
- Failure B: OCR cache race — `extractAndStorePdfPagesWithRetry` completes, then `getCachedPdfText` is called in the same function with zero retry, but if the SQLite commit lagged the read the cache appears empty. Four independent callers each implement this pattern differently, none with a retry loop. **This is a code defect.** Fix: single canonical path with a 500ms cache-read retry.
- Failure C: EIB/DHG under-extraction (3/40, 3/36 pages) — scanned PDF + container OOM kill producing exit 137. **Mixed.** The 2s/page yield is code debt; OOM is an infra concern. The consolidation addresses the code debt.

**What the consolidation (1954c) fixes vs what it cannot fix:**
- Fixes: eliminates the 4-path duplication so the cache-read retry is implemented ONCE in the canonical pull-job path.
- Fixes: backfill column names (Failure A).
- Does NOT fix: VPS pipeline being down. Does NOT fix: scanned PDF quality.

**For the recurring-bug-escalation policy:** 1953-G-FAIL's fixCycles=6 are explained by the code defects compounding with infra gaps. Fixing the code defects eliminates the code contribution to stale data. Residual staleness after the fix would be purely VPS/infra-driven and would be correctly surfaced by the vpsProxyWatchdogJob — which is the right escalation path, not another code fix.

---

## §2 — Are 1954c and G5b the Same Refactor?

**YES. They are structurally identical, achievable in one atomic commit set.**

**1954c target:** "4 BCTC write paths → 1 pull-job owner." The 4 paths are:
1. `bctcPdfPullJob.ts:triggerExtraction()` (pull path from VPS queue — the CORRECT primary owner)
2. `server.ts setImmediate → triggerPushBctcExtraction()` (push path from VPS agent)
3. `bctcReparseJob.ts:reparseSingle()` (daily recovery path)
4. `checkSscReports.ts:pipelineFn` (SSC nightly check, currently disabled by `enableLocalBctcFetch=false`)

**G5b target:** "MCP server routes ALL BCTC extraction through the pdf-extractor service (port 5001) as the single extraction owner, removing the duplicate in-process pdf-parse + Tesseract OCR."

**Unification:** if the pdf-extractor service becomes the extraction owner at Step 2 (OCR), then paths 1–4 all converge on calling the service via HTTP instead of spawning local Tesseract processes. The `fetchParseAndStoreBctc` use case (Step 4, parsing + SQLite write) remains in mcp-server — it processes the TEXT returned by the service, not the raw PDF. The service boundary is: give me a PDF URL or PDF bytes → return structured text + tables + confidence. mcp-server keeps: parse text → store SQLite → embed LanceDB.

**The single refactor that satisfies both:**
1. The pdf-extractor service at port 5001 becomes the PRIMARY extraction method, not the fallback.
2. `downloadAndExtractPdf` in `pdf.ts` is demoted / deprecated: its fallback logic (`if confidence < 0.5 → call microservice`) is inverted to `call microservice first → fallback to pdf-parse only if service unavailable`.
3. The 4 live cron callers are consolidated: they all pass the PDF URL (or a pre-downloaded buffer) to `pdfExtractorClient.extractViaMicroservice()` as the canonical path, then hand the returned text to `fetchParseAndStoreBctc` with `pdfTextOverride`.
4. The in-process Tesseract OCR spawner (`ocrPdfBuffer` in `pdf.ts:102`) is moved to `_deprecated/` once the service is the owner.

---

## §3 — Unified Consolidation Design

### Architecture after consolidation

```
VPS push/pull PDF bytes (Vinahost VPS pipeline — unchanged)
  │
  ├─ bctcPdfPullJob.ts (pull path — canonical primary owner, unchanged role)
  ├─ server.ts /api/push-bctc-pdf handler → triggerPushBctcExtraction.ts
  ├─ bctcReparseJob.ts (daily recovery, disk-scan stranded)
  └─ sscCheckerJob → checkSscReports.ts (disabled by flag, unchanged)
         │
         │  ALL converge on ONE extraction call:
         ▼
  pdfExtractorClient.extractViaMicroservice(url, "bctc")
  → POST http://pdf-extractor:5001/extract
  → Returns: { textContent, tables, ocrConfidence, status }
         │
         │  Then:
         ▼
  fetchParseAndStoreBctc({ actionCode, year, quarter, pdfTextOverride: textContent })
  → parseBctcReport → storeReport (SQLite) → ragIndex (LanceDB)
```

### Contract at the service boundary

**Request (existing, unchanged):**
```json
POST /extract
{
  "url": "http://125.212.251.27:8765/bctc-files/<TICKER>/<filename>.pdf",
  "source_type": "bctc"
}
```

**Response (existing, unchanged):**
```json
{
  "document_id": "<uuid>",
  "tables": [...],
  "text_content": "<extracted text>",
  "ocr_confidence": 0.85,
  "status": "success"
}
```

The `pdfExtractorClient.ts` interface already exists and is correct. No service-side changes needed.

### Files to modify (mcp-server zone)

| File | Change | DDD Layer |
|---|---|---|
| `apps/mcp-server/src/infrastructure/fetchers/pdf.ts` | Invert primary/fallback: call `extractViaMicroservice` FIRST; fall back to pdf-parse only if service returns null or unavailable. Remove `ocrPdfBuffer` production call path (keep function body, wrapped in `// @deprecated` JSDoc, move to `_deprecated/pdfOcr.ts` on completion). Export `PDF_MICROSERVICE_FALLBACK_THRESHOLD` stays (callers may reference it). | infrastructure/fetchers |
| `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` | `triggerExtraction()` deps: replace `extractAndStorePdfPagesWithRetry` + `getCachedPdfText` pattern with direct call to `pdfExtractorClient.extractViaMicroservice(url, "bctc")`. On success: pass `textContent` as `pdfTextOverride` to `fetchParseAndStoreBctc`. On service null: log warn, return (no silent fail). | interface/scheduler |
| `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts` | Same consolidation: replace `extractPages` + `getCache` with `extractViaMicroservice(pdfUrl, "bctc")`. Service returns text → `runPipeline({ pdfTextOverride: text })`. Service null → log warn. | interface/scheduler |
| `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` | In `makeProductionDeps()` and `reparseSingleWithOcrFallback()`: consolidate Tier 1 (pdf-parse) and Tier 2 (OCR cache) into a single Tier 1 = service call. The injectable `extractText` dep becomes `extractViaService(url) → Promise<{text, confidence}>`. Tier 2 OCR cache fallback becomes Tier 2 = local `extractPdfText` (pdf-parse only, no OCR spawning) as a service-unavailable fallback. `extractHighDpiRetry` dep is removed (OCR is owned by the service now). | interface/scheduler |
| `apps/mcp-server/src/scheduler/financial-reports/backfillBctcQ12026.ts` | Fix column names: `(ticker, year, quarter)` → `(action_code, period_year, period_quarter)`. This is Failure A from bctc-write-chain-rca.md §2, independent of the service consolidation but must ship in the same task sequence. | interface/scheduler |
| `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` | Mark `extractAndStorePdfPagesWithRetry` as `@deprecated` — not called post-consolidation. Keep the module to avoid breaking any test imports. Move to `_deprecated/pdfOcrWorker.ts` at task completion (G5a-equivalent for this module). | infrastructure/fetchers |

### Files NOT to modify

- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` — the parse+store orchestration is correct and stays. Only the extraction call sites above change.
- `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` — the HTTP client is already correct. No changes.
- `apps/pdf-extractor/` — the Python service is already the correct extraction engine. No changes.
- `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` — already rewired (d29da3a8). No changes.

### How this satisfies 1954c ("4 write paths → 1 owner")

The 4 paths do NOT collapse into 1 CALLER — that would be wrong. Instead:
- The 4 callers (pull job, push handler, reparse job, SSC checker) KEEP their independent triggers and queue management.
- They LOSE their independent OCR implementations (extractAndStorePdfPagesWithRetry, pdf-parse+cache pattern).
- They ALL delegate OCR extraction to ONE SERVICE (pdf-extractor port 5001) via ONE CLIENT (`pdfExtractorClient.extractViaMicroservice`).
- The write terminus (`fetchParseAndStoreBctc → storeReport`) remains singular and unchanged.

This is the correct "single owner" architecture: the service owns extraction, mcp-server owns parsing+storage.

### How this satisfies G5b ("service owns extraction, callers rewired to HTTP, old in-process code → _deprecated/")

- pdf-extractor service is the PRIMARY extraction route for all 4 callers.
- `ocrPdfBuffer` (in-process Tesseract spawner in `pdf.ts:102`) is deprecated and moved to `_deprecated/`.
- `extractAndStorePdfPagesWithRetry` (in-process OCR cache writer in `pdfOcrWorker.ts`) is deprecated.
- All 4 callers call HTTP port 5001 via the existing `pdfExtractorClient.extractViaMicroservice`.
- Charter G5 intent "all callers route to the new microservice" = MET.

---

## §4 — Risk Assessment + Feasibility

### Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | pdf-extractor service unavailable in production (Docker container down, network timeout) | MEDIUM | Implement `pdfExtractorClient` null-return path: on null → fall through to in-process `extractPdfText` (pdf-parse only, no OCR) as graceful degradation. bctcReparseJob already handles this pattern. |
| R-2 | Service response time for large PDFs (GAS 76 pages) — 2-min timeout in `pdfExtractorClient` already configured. bctcPdfPullJob awaits extraction synchronously. | LOW | 2-min timeout already set at `pdfExtractorClient.ts:54`. If service times out → null → fall through to pdf-parse. No regression vs current OCR path (which takes 31 min for GAS). |
| R-3 | Test coverage: existing tests inject `extractText` + `getOcrCache` deps; after consolidation those deps are replaced by `extractViaService`. Tests that mock the OCR path must be updated. | MEDIUM | The injectable deps pattern is already in place for all 4 callers. Updating `makeProductionDeps()` in each file is the only test-visible change. Existing tests that inject mocks continue to work — they inject a mock `extractViaService` instead of `extractText`. |
| R-4 | `backfillBctcQ12026.ts` fix is independent and safe but touches the same zone. | LOW | Column name fix is additive (INSERT OR IGNORE, idempotent). Ship as Task 1 before the main consolidation. |
| R-5 | `checkSscReports.ts` calls `fetchParseAndStoreBctc` with `pdfUrl` (no pdfTextOverride), meaning it would still trigger the `downloadAndExtractPdf` path if `enableLocalBctcFetch=true`. | LOW | This caller is already disabled by `enableLocalBctcFetch=false` in production (VPS-only mode per task 1281-fix). After consolidation, the `downloadAndExtractPdf` function inverts to call the service first, so even if the flag is re-enabled, it routes through the service. |

### Regression risk on frozen write-chain code

The frozen surface (1953-G-FAIL + 1954c) is the in-process OCR + multi-write-path pattern. The consolidation does not ADD behavior to the frozen paths — it REMOVES the in-process OCR (the root cause of the duplication and race). This is the correct direction for a recurring-bug-escalation: the fix is structural simplification, not yet another patch on the existing paths.

**The risk of regression is LOW** because:
- `fetchParseAndStoreBctc` (the parse+store terminus) is untouched.
- The service endpoint (`/extract`) is already operational and has been tested (Phase 1).
- The `pdfTextOverride` pattern is already in place in all 4 callers — consolidation just changes WHAT produces that text (service HTTP call vs local OCR cache read).

### Test coverage without a live VPS

**Offline QA validation is fully achievable:**

1. **Unit tests (bun test) — inject mock service client:**
   Each caller (`bctcPdfPullJob`, `pushBctcExtraction`, `bctcReparseJob`) already accepts injectable deps. The `extractViaService` dep is mocked to return a `PdfExtractorResult` fixture (same shape as the existing `PdfExtractorResult` interface in `pdfExtractorClient.ts`).

2. **Integration test — service call via fixture:**
   Create a `__tests__/bctc-consolidation.test.ts` that:
   - Spins up a local mock server at `http://localhost:5001/extract` (using Bun's built-in HTTP server) returning a fixture response.
   - Calls `downloadAndExtractPdf` with a PDF URL pointing to the mock.
   - Asserts: response is service result (not pdf-parse result), `extraction_method = 'pybctc_tables'`.
   - Asserts: service null return falls through to pdf-parse.
   This does NOT require a live VPS or live pdf-extractor container.

3. **Contract test — `/extract` endpoint:**
   The pdf-extractor service has its own unit tests (`apps/pdf-extractor/tests/`). The mcp-server integration test mocks the HTTP layer. The contract (request/response JSON shape) is already frozen in `pdfExtractorClient.ts` and `interface/serializers.py`.

4. **Regression guard — existing BCTC tests must still pass:**
   All existing tests in `apps/mcp-server/src/__tests__/` that test `fetchParseAndStoreBctc` inject `pdfTextOverride`, bypassing extraction entirely. They are unaffected by this consolidation.

---

## §5 — Atomic Task Plan

**Pre-condition:** Pre-revert tag `bctc-consolidation-pre-merge` created before any code changes.

### Task 1 — Backfill column fix (independent, ship first)
- File: `apps/mcp-server/src/scheduler/financial-reports/backfillBctcQ12026.ts:53-54`
- Change: column names `ticker → action_code`, `year → period_year`, `quarter → period_quarter` + matching `stmt.run()` parameters.
- AC: INSERT no longer fails with "no such column: ticker"; `bctc_vps_queue` gets seeded rows on backfill call.
- Test: unit test with in-memory SQLite (existing pattern).
- Risk: ZERO — INSERT OR IGNORE, idempotent.
- Owner: dev-mcp-server | Est: 2h

### Task 2 — Service-first extraction in pdf.ts
- File: `apps/mcp-server/src/infrastructure/fetchers/pdf.ts`
- Change: in `downloadAndExtractPdf`, move the `extractViaMicroservice` call to the TOP of the pipeline (before pdf-parse). On service success → return service result. On service null (unavailable) → fall through to existing pdf-parse + OCR fallback chain.
- AC-1: `downloadAndExtractPdf` calls `extractViaMicroservice` first (confirm with unit test mock).
- AC-2: service null → pdf-parse result returned (regression guard: existing low-confidence tests pass).
- AC-3: `extraction_method` field stamped correctly (`pybctc_tables` / `pybctc_text` / absent for pdf-parse).
- Test: extend `pdf.test.ts` with mock microservice client fixture.
- Note: `ocrPdfBuffer` function stays in file (not yet deleted — deletion is G5a equivalent, sequenced last).

### Task 3 — Consolidate bctcPdfPullJob.triggerExtraction
- File: `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`
- Change: in `makeProductionDeps().triggerExtraction()`, replace `extractAndStorePdfPagesWithRetry` + `getCachedPdfText` with `pdfExtractorClient.extractViaMicroservice(url, "bctc")`. On success: `fetchParseAndStoreBctc({ pdfTextOverride: result.textContent, ... })`. On null: log warn + return.
- AC-1: `triggerExtraction` no longer calls `extractAndStorePdfPagesWithRetry` (verify by grep).
- AC-2: mock service returning fixture → `fetchParseAndStoreBctc` called with `pdfTextOverride`.
- AC-3: mock service returning null → warn logged, pipeline not called.
- AC-4: cache-read retry loop removed (single call to service, no 500ms retry needed — service is synchronous).
- Test: `bctcPdfPullJob.test.ts` injects mock `triggerExtraction` (existing pattern, unchanged interface).

### Task 4 — Consolidate pushBctcExtraction.ts
- File: `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts`
- Change: in `makeProductionDeps()`, replace `extractPages` + `getCache` with `pdfExtractorClient.extractViaMicroservice`. Injectable `PushBctcExtractionDeps` interface updated: `extractViaService(url: string) → Promise<PdfExtractorResult | null>` replaces `extractPages` + `getCache`.
- AC-1: `triggerPushBctcExtraction` no longer calls `extractAndStorePdfPagesWithRetry` (grep: 0 matches).
- AC-2: mock service → `runPipeline` called with `pdfTextOverride: result.textContent`.
- AC-3: mock service null → pipeline not called, warn logged.

### Task 5 — Consolidate bctcReparseJob.ReparseDeps
- File: `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`
- Change: update `ReparseDeps` interface: `extractText` dep becomes `extractViaService(url: string) → Promise<{text: string; confidence: number} | null>`. Remove `extractHighDpiRetry` dep (owned by service now). Tier 1 in `reparseSingleWithOcrFallback` = service call. Tier 2 (fallback when service null) = local `extractPdfText` (pdf-parse, no OCR spawning). `getOcrCache` dep KEPT as Tier 3 (existing cached text from previous OCR runs still usable).
- AC-1: `reparseSingleWithOcrFallback` calls `extractViaService` in Tier 1 (mock in test).
- AC-2: service null → Tier 2 (pdf-parse) → Tier 3 (OCR cache). Regression: existing tier-fallback unit tests pass with updated dep interface.
- AC-3: `makeProductionDeps()` wires `extractViaMicroservice` from `pdfExtractorClient`.
- AC-4: `extractHighDpiRetry` dep removed from `ReparseDeps` interface + `makeProductionDeps`.

### Task 6 — Deprecation + integration test
- Files: `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts`, `pdf.ts`
- Change: mark `ocrPdfBuffer` (pdf.ts:102) and `extractAndStorePdfPagesWithRetry` (pdfOcrWorker.ts) as `@deprecated` with JSDoc. Do NOT delete (risk: test imports may break). Create `_deprecated/pdfOcrWorker.ts` note file pointing to the deprecated source.
- Test: create `apps/mcp-server/src/__tests__/bctc-consolidation.test.ts`:
  - Spin up Bun mock HTTP server at port 5001 returning fixture `PdfExtractorResult`.
  - Set `PDF_EXTRACTOR_URL=http://localhost:5001` in test env.
  - Call `downloadAndExtractPdf(mockUrl)` → assert result is from service (not pdf-parse).
  - Shut mock server → call again → assert falls back to pdf-parse result.
- AC: integration test passes offline (no live VPS, no live container).

### Task 7 — QA gate
- Run full test suite: `bun test` from `apps/mcp-server/` — assert zero regressions.
- Grep: `extractAndStorePdfPagesWithRetry` called outside deprecated module and test files → expect 0.
- Grep: `ocrPdfBuffer` called outside `pdf.ts` → expect 0.
- Signal: `qa-bctc-consolidation-PASS-<UTC>.json` with test counts + grep results.
- When QA PASS: architect emits 1954c-clearance signal + G5b-clearance signal.

---

## §6 — QA Validation Without a Live VPS

All 7 tasks above are verifiable offline:

| Validation | Method | Live VPS required? |
|---|---|---|
| Unit tests (Tasks 1–5) | Bun test with injectable mock deps | NO |
| Integration test (Task 6) | Bun mock HTTP server at localhost:5001 | NO |
| Regression guard | `bun test` full suite; existing `fetchParseAndStoreBctc` tests use `pdfTextOverride`, bypass extraction | NO |
| Contract verification | `pdfExtractorClient.ts` interface unchanged; service serializers unchanged | NO |
| Service availability path | Mock service returning null triggers fallback — tested in unit tests | NO |
| End-to-end with real PDF | OPTIONAL: only needed for production confidence, not for QA gate | Optional |

---

## §7 — G5 → YES / 12/12 Path

After Tasks 1–7 complete and QA APPROVED:

1. **Architect emits:** `docs/signals/architect-bctc-consolidation-1954c-clearance-<UTC>.json`
   - Contains: commit SHA, grep counts (0 OCR spawner calls), test counts, service-as-owner evidence.
2. **Architect emits:** `docs/signals/architect-pdf-extractor-g5b-clearance-<UTC>.json` (updated verdict: GO)
   - 1954c landed: YES (Tasks 1–6 merged).
   - 1953-G-FAIL: CODE defects eliminated. Residual staleness is VPS/infra — not a code bug. fixCycles interpretation: the 6 prior cycles fixed symptoms of the OCR race; this consolidation removes the race. Bug resolved at code level.
3. **PO emits:** freeze-lift signal → `pilot-status-pdf-extractor.json` `phase2.bctc_freeze_gate.lift_status` = LIFTED.
4. **PM dispatches** P2-G5b-dispatch (the signal, not a new code task — the code IS the consolidation above).
5. **PO evaluates G5:** G5a DONE + G5c PASS + G5b DONE (service is extraction owner, in-process OCR deprecated, 4 callers rewired) → G5 → YES.
6. **G5 YES → 12/12 matrix close → PO terminal grade.**

---

## §8 — Commit Discipline

Per commit-mutex skill:
- Pre-revert tag: `git tag bctc-consolidation-pre-merge` before first code change.
- Per-task commit: one commit per task (7 commits total + 1 tag).
- Commit format: `feat(mcp-server/bctc): 1954c task-N — <description>` with `Task: 1954c-task-N` trailer.
- Staging: explicit file list per task, never `git add .`.
- commit-mutex: acquire task_claim `commit-mutex:main` before `git add`, release after `git commit`.
- No --force, no --no-verify, on main branch only.

---

## §9 — BUILD-STANDARD Tag

**BUILD-STANDARD: lean** (existing service modified, no new microservice)
**Zone:** multi — `apps/mcp-server/` (primary) + `apps/pdf-extractor/` (no changes, reference only)
**Dev agent:** dev-mcp-server
**Clearance authority:** architect (this document) → QA → PO

---

## APPENDIX — Brownfield Snapshot

| File | Role | Status after consolidation |
|---|---|---|
| `apps/mcp-server/src/infrastructure/fetchers/pdf.ts` | In-process pdf-parse + OCR (primary) + service (fallback) | MODIFIED: service → primary; pdf-parse → fallback |
| `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` | HTTP client to port 5001 | UNCHANGED (already correct) |
| `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` | In-process OCR worker (writes pdf_extracted_text table) | DEPRECATED: marked @deprecated; no callers post-consolidation |
| `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` | Pull path canonical owner | MODIFIED: triggerExtraction uses service |
| `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts` | Push path handler | MODIFIED: uses service |
| `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` | Daily recovery | MODIFIED: Tier 1 = service call |
| `apps/mcp-server/src/scheduler/financial-reports/backfillBctcQ12026.ts` | Queue seeding | MODIFIED: column name fix |
| `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` | Parse + store terminus | UNCHANGED |
| `apps/pdf-extractor/` (all files) | Python extraction service | UNCHANGED |
