# TASK hotfix_bctc_integrity — DONE

**Type:** hotfix
**Commit:** 1b8fdfd3
**Files changed:**
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`
- `apps/mcp-server/src/__tests__/hotfix-bctc-integrity.test.ts` (new — 10 tests)

---

## Bug 1 Fixed: Cross-ticker contamination

**Root cause:** `makeProductionDeps().triggerExtraction` in `bctcPdfPullJob.ts`
was a stub that called `runBctcReparseJob` with a `reparseFn` returning
`payload.filePath === params.filePath` — a boolean comparison, no extraction.
`runBctcReparseJob` marked `agent_feedback` rows as `resolved` with zero work
done. The next daily `bctcReparseJob` cycle found those rows gone, fell to
disk-scan, and called the real `reparseSingle` — which hit Bug 2.

**Fix:** `triggerExtraction` now calls `extractAndStorePdfPagesWithRetry` to
populate the OCR cache for the specific PDF being processed, then calls
`fetchParseAndStoreBctc` with `pdfTextOverride` from `getCachedPdfText`. The
`file://` URL is still passed as `pdfUrl` for `source.pdfPath` stamping, but
since `pdfTextOverride` is set the download step is bypassed entirely — axios
never sees the `file://` URL.

## Bug 2 Fixed: FPT / any ticker silent extraction failure

**Root cause:** `makeProductionDeps().pipeline` in `bctcReparseJob.ts` passed
`pdfUrl: "file:///..."` directly to `fetchParseAndStoreBctc`. That function
calls `downloadAndExtractPdf` which uses axios — axios silently returns
`{ text: "", confidence: 0 }` for `file://` URLs with no error logged at the
call site. FPT's PDF was on disk but never parsed.

**Fix:** In `makeProductionDeps().pipeline`, when `pdfUrl` starts with
`file://` and `pdfTextOverride` is absent, the file is read locally via
`extractPdfText`. If text is usable (≥100 chars, confidence ≥0.3), it is
passed as `pdfTextOverride`. If not, `fetchParseAndStoreBctc` is called
anyway (its own OCR fallback may succeed). A warning is logged when the
local file path does not exist.

## Tests

10 new tests in `hotfix-bctc-integrity.test.ts`:
- Ticker isolation: 4-ticker sequential calls each get their own `actionCode`
- Extraction-before-pipeline: `extractText` called before `pipeline`
- `pdfTextOverride` always populated when extraction succeeds
- OCR cache text used as `pdfTextOverride` when pdf-parse yields < 100 chars
- `pdfUrl` still carries the file path for `source.pdfPath` stamping
- Silent failure returns `false` (not `true`) on all-empty extraction
- `insertFallbackRecord` called for FPT when all extraction paths fail
- `insertFallbackRecord` NOT called when VCB extraction succeeds

## Pre-existing failures (not introduced)

- `1343e-bctc-pipeline-integration.test.ts`: 2 watchlist count failures (pre-existing)
- `1294b-bctc-fallback.test.ts`: Bun OOM crash (pre-existing, unrelated to this fix)

---

## QA verification checklist

1. `get_bctc_full('VCB')` and `get_bctc_full('HPG')` return different financials
2. `get_bctc_full('FPT')` returns data (no longer empty)
3. `bun test src/__tests__/hotfix-bctc-integrity.test.ts` → 10 pass, 0 fail
4. `bun test src/__tests__/bctc-pdf-pull-job.test.ts src/__tests__/1019-bctc-reparse-job.test.ts` → all pass
