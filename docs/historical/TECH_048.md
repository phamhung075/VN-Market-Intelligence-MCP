# TECH-048: OCR + PDF Pipeline Fix

status: APPROVED_BY_ARCHITECT
req_ref: REQ-048
sprint: 048

---

## Brownfield Impact

- **Files modified** (4):
  - `src/infrastructure/db/schema.ts` — add `pdf_extracted_text` DDL block
  - `src/infrastructure/fetchers/pdfOcrWorker.ts` — DPI fix, confidence guard, isOcrAvailable cache
  - `src/infrastructure/fetchers/pdf.ts` — DPI fix in inline `ocrPdfBuffer`
  - `src/infrastructure/fetchers/ssc.ts` — Promise-chain semaphore around `defaultBrowserFactory`
  - `src/application/usecases/fetchParseAndStoreBctc.ts` — OCR fallback after empty pdf-parse

- **Files created** (1):
  - `src/__tests__/296-ocr-pipeline-e2e.test.ts` — end-to-end smoke test

- **Files deleted**: none

- **Breaking changes**: no — all changes are additive or internal behaviour fixes; public function signatures are unchanged.

---

## Architecture Decision

All five bugs are infrastructure-layer defects that block the existing application-layer pipeline from completing successfully. The design therefore fixes each defect in-place within its current file, preserving the existing call graph and DDD layering. No new interfaces, no new domain services, and no new infrastructure modules are needed. The one application-layer change (FR-5) adds a conditional fallback branch inside `fetchParseAndStoreBctc`; it imports `getCachedPdfText` and `extractAndStorePdfPages` from the existing `pdfOcrWorker.ts` — a valid infra import from the application layer.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `pdf_extracted_text` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `ocrOnePage` DPI fix | infrastructure | `src/infrastructure/fetchers/pdfOcrWorker.ts` | MODIFY |
| `isOcrAvailable` cache | infrastructure | `src/infrastructure/fetchers/pdfOcrWorker.ts` | MODIFY |
| confidence guard + double-insert fix | infrastructure | `src/infrastructure/fetchers/pdfOcrWorker.ts` | MODIFY |
| `ocrPdfBuffer` DPI fix | infrastructure | `src/infrastructure/fetchers/pdf.ts` | MODIFY |
| `withBrowserLock` semaphore | infrastructure | `src/infrastructure/fetchers/ssc.ts` | MODIFY |
| SSC selector probe | infrastructure | `src/infrastructure/fetchers/ssc.ts` | MODIFY |
| OCR fallback in pipeline | application | `src/application/usecases/fetchParseAndStoreBctc.ts` | MODIFY |
| e2e smoke test | test | `src/__tests__/296-ocr-pipeline-e2e.test.ts` | NEW |

---

## Exact Bugs Found During Brownfield Analysis

### Bug 1 — `pdf_extracted_text` table missing from schema (schema.ts:98-546)

`initDatabase()` never creates `pdf_extracted_text`. The table only exists on machines where `pdfOcrWorker.ts` has previously run successfully against a real database. On a `:memory:` DB in tests, or a fresh `market.db`, the first call to `getCachedPdfText` or `extractAndStorePdfPages` throws `no such table: pdf_extracted_text`.

**Fix location**: Insert the DDL block after the `portfolio_targets` block and before the watchlist-seed block at line 449 in `schema.ts`.

### Bug 2 — DPI 150 in `ocrOnePage` (pdfOcrWorker.ts:41)

```
"-r", "150", tmpPdf,
```
Must be `"200"`.

### Bug 3 — DPI 150 in `ocrPdfBuffer` (pdf.ts:95)

```
"-r", "150", tmpPdf,
```
Must be `"200"`. Note: `pdf.ts` has its own inline OCR path that duplicates much of `pdfOcrWorker.ts`. Both must be fixed independently.

### Bug 4 — Double-insert + poisoned guard (pdfOcrWorker.ts:162-182)

Current code path for a page producing `pageText.length > 0` but `pageText.length <= 10`:

```typescript
// line 165: confidence = 0.1  (because pageText.length <= 10)
insert.run(filename, page, pageText, confidence);   // first insert (with text "x", confidence 0.1)
if (pageText.length > 0) {
  extractedPages++;
  totalChars += pageText.length;
} else {
  insert.run(filename, page, "", 0);                // second insert only for pageText === ""
}
```

Wait — the `else` branch (second insert) only fires when `pageText.length === 0`, not `> 0`. So the double-insert only affects the `pageText === ""` case. Regardless, the deeper problem is:

- A page producing 1-9 chars inserts a row with `confidence = 0.1` and 1-9 chars of noise text.
- The guard at line 114 reads `COUNT(*) > 0`. After one pass, every page (including blank/cover pages) has a row. On the second call, `existing.c >= threshold (0.8 * totalPages)` fires and the function returns early as if fully extracted.
- The 80% threshold (`Math.max(expectedPages * 0.8, 5)`) at line 123 is hit even when all rows contain junk, because `COUNT(*)` counts all rows regardless of content quality.

**Fix**: Do not insert rows for pages producing fewer than 10 chars. This makes the `COUNT(*)` guard meaningful: only pages with real text increment the count. The completeness threshold must also become `Math.max(expectedPages * 0.5, 3)` (50% of pages, minimum 3) per the REQ spec.

Also: remove the duplicate `insert.run(filename, page, "", 0)` in the `catch` block at line 179.

### Bug 5 — `isOcrAvailable()` called in hot path without caching (pdfOcrWorker.ts:20-29)

`isOcrAvailable()` runs two synchronous `execSync("which ...")` calls. It is invoked inside `extractAndStorePdfPages` at line 133, which is called in the 15-minute intelligence cycle. The fix is a module-level cache variable.

### Bug 6 — No browser semaphore in `ssc.ts`

`listSscDocuments` and `downloadSscDocument` both call `defaultBrowserFactory()` without any concurrency gate. `_activeBrowsers` (line 126) is a Set used only for forced shutdown cleanup — it does not prevent concurrent launches.

### Bug 7 — OCR gap in `fetchParseAndStoreBctc` (fetchParseAndStoreBctc.ts:180-187)

After `downloadAndExtractPdf()` returns, the pipeline only checks `rawText.trim().length === 0`. It never calls `getCachedPdfText`. If the PDF is scanned and the inline OCR in `pdf.ts` also fails (e.g. `pdftoppm` not installed on the VPS), `rawText` is empty and the pipeline returns `null`. The `pdfOcrWorker.ts` cache built by the startup job is never consulted.

**Pre-existing type mismatch (out of scope)**: `fetchParseAndStoreBctc.ts:158` passes `sscHttpClient` (typed `HttpClient | undefined`) as the 4th arg to `listSscDocuments`, which expects `BrowserFactory | undefined`. TypeScript does not catch this because the Puppeteer path is separate and there are no type imports from `ssc.ts` for `BrowserFactory` at the call site. This is a silent runtime no-op (the factory parameter is ignored when `undefined` is passed, and a real call always provides the default factory). Flagged for a future cleanup sprint — not changed in 048.

---

## Interface Contracts

No new exported interfaces. The existing `CachedPdfTextResult` returned by `getCachedPdfText` is already correct:

```typescript
// Already in pdfOcrWorker.ts — no change needed
interface /* implicit */ {
  text: string;
  pages: number;
  confidence: number;
}
```

The `FetchParseAndStoreBctcParams` interface gains no new fields — the fallback uses `doc.url` and `doc.pdfFilename` which are already on `SscDocument`.

---

## Detailed Implementation Specs per Task

### Task 292 — OCR audit (FR-1, FR-2, FR-3, FR-4)

**292-A: schema.ts — add pdf_extracted_text DDL**

Insert after the `portfolio_targets` block (after line 445) and before the watchlist-seed guard at line 449:

```typescript
// ── PDF OCR Cache (Task 292 / FR-1) ──────────────────────────────────────────
// Created here so the table exists on fresh installs before pdfOcrWorker runs.
db.exec(`
  CREATE TABLE IF NOT EXISTS pdf_extracted_text (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    filename     TEXT    NOT NULL,
    page_number  INTEGER NOT NULL,
    text_content TEXT    NOT NULL DEFAULT '',
    confidence   REAL    NOT NULL DEFAULT 0,
    extracted_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(filename, page_number)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_filename ON pdf_extracted_text(filename, page_number)`);
```

**292-B: pdfOcrWorker.ts — isOcrAvailable caching (FR-4)**

Replace the current `isOcrAvailable` function with:

```typescript
let _ocrAvailableCache: boolean | null = null;

export function isOcrAvailable(): boolean {
  if (_ocrAvailableCache !== null) return _ocrAvailableCache;
  try {
    execSync("which pdftoppm", { stdio: "ignore" });
    execSync("which tesseract", { stdio: "ignore" });
    _ocrAvailableCache = true;
  } catch {
    _ocrAvailableCache = false;
  }
  return _ocrAvailableCache;
}
```

**292-C: pdfOcrWorker.ts — DPI 150 → 200 in ocrOnePage (FR-2)**

Line 41: change `"-r", "150"` to `"-r", "200"`.

**292-D: pdfOcrWorker.ts — confidence guard + no-insert for sparse pages (FR-3)**

The inner loop in `extractAndStorePdfPages` currently (lines 162-184):

```typescript
for (let page = 1; page <= maxPages; page++) {
  try {
    const pageText = await ocrOnePage(tmpPdf, page);
    const confidence = pageText.length > 50 ? 0.8 : pageText.length > 10 ? 0.5 : 0.1;

    insert.run(filename, page, pageText, confidence);
    if (pageText.length > 0) {
      extractedPages++;
      totalChars += pageText.length;
    } else {
      insert.run(filename, page, "", 0);   // <-- second insert for empty pages
    }
    ...
  } catch {
    insert.run(filename, page, "", 0);     // <-- insert on error
  }
  ...
}
```

Replace with:

```typescript
for (let page = 1; page <= maxPages; page++) {
  try {
    const pageText = await ocrOnePage(tmpPdf, page);
    if (pageText.length >= 10) {
      const confidence = pageText.length > 50 ? 0.8 : 0.5;
      insert.run(filename, page, pageText, confidence);
      extractedPages++;
      totalChars += pageText.length;
    }
    // Pages with < 10 chars are silently skipped — no row inserted.
  } catch {
    // Error on a page: skip silently. Do NOT insert an empty row.
  }
  ...
}
```

**292-E: pdfOcrWorker.ts — fix completeness guard threshold (FR-3)**

The guard at lines 115-131 uses `Math.max(expectedPages * 0.8, 5)`. Change to `Math.max(expectedPages * 0.5, 3)` to match REQ-048 FR-3 spec:

```typescript
const threshold = Math.max(expectedPages * 0.5, 3);
if (expectedPages === 0 || existing.c >= threshold) {
```

**292-F: pdf.ts — DPI 150 → 200 in ocrPdfBuffer (FR-2)**

Line 95: change `"-r", "150"` to `"-r", "200"`.

---

### Task 293 — OCR fallback in fetchParseAndStoreBctc (FR-5)

Add import at top of `fetchParseAndStoreBctc.ts`:

```typescript
import {
  getCachedPdfText,
  extractAndStorePdfPages,
  isOcrAvailable,
} from "../../infrastructure/fetchers/pdfOcrWorker.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
```

Replace the Step 2 block (lines 171-187) with the following. The existing `pdfTextOverride` fast-path is preserved unchanged; the OCR fallback is inserted only in the `else` branch after `downloadAndExtractPdf`:

```typescript
// ── Step 2: Download & extract PDF text ────────────────────────────────────
logger.info(`${tag} step 2: extracting PDF text`);

let rawText: string;

if (pdfTextOverride !== undefined) {
  rawText = pdfTextOverride;
} else {
  const extraction = await downloadAndExtractPdf(doc.url, pdfHttpClient);
  rawText = extraction.text;

  if (rawText.trim().length < 100) {
    // --- OCR fallback ---
    // Derive filename from URL or from SscDocument.pdfFilename field.
    const rawFilename = doc.pdfFilename
      ?? decodeURIComponent(basename(new URL(doc.url, "https://example.com").pathname));
    const filename = rawFilename || `${actionCode}_${year}_${quarter}.pdf`;

    logger.info(`${tag} pdf-parse returned < 100 chars — checking OCR cache`, { filename });

    let cached = getCachedPdfText(filename);

    if (cached === null && isOcrAvailable()) {
      // Cache miss: download PDF to disk and run OCR synchronously.
      logger.info(`${tag} OCR cache miss — downloading and extracting`, { filename });
      try {
        const pdfDir = join(process.cwd(), "data", "pdfs");
        mkdirSync(pdfDir, { recursive: true });
        const pdfPath = join(pdfDir, filename);
        // Re-download the PDF to disk (reuse the buffer already in extraction if available,
        // but downloadAndExtractPdf does not expose the raw buffer — re-fetch is safest).
        const { default: axios } = await import("axios");
        const resp = await axios.get<ArrayBuffer>(doc.url, {
          responseType: "arraybuffer",
          timeout: 60_000,
          headers: { "User-Agent": "VN-Market-Intelligence/1.0" },
        });
        writeFileSync(pdfPath, Buffer.from(resp.data));
        await extractAndStorePdfPages(pdfPath, filename);
        cached = getCachedPdfText(filename);
      } catch (err) {
        logger.warn(`${tag} OCR extraction failed`, {
          filename,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (cached !== null && cached.confidence >= 0.3) {
      if (cached.confidence < 0.5) {
        logger.warn(`${tag} using OCR cache with low confidence`, {
          filename,
          confidence: cached.confidence,
        });
      } else {
        logger.info(`${tag} using OCR cache for ${filename}`, {
          confidence: cached.confidence,
          pages: cached.pages,
        });
      }
      rawText = cached.text;
    } else if (cached !== null && cached.confidence < 0.3) {
      logger.warn(`${tag} OCR confidence too low — aborting`, {
        filename,
        confidence: cached.confidence,
      });
      return null;
    }
    // else: cached === null means OCR not available — fall through to empty-text guard below
  }
}

if (!rawText || rawText.trim().length === 0) {
  logger.warn(`${tag} PDF extraction yielded empty text — aborting`);
  return null;
}
```

---

### Task 294 — SSC Puppeteer semaphore (FR-6)

Insert the semaphore implementation as a module-level declaration in `ssc.ts`, immediately after the `_activeBrowsers` Set and `cleanupBrowsers()` export (after line 134):

```typescript
// ── Browser concurrency lock (capacity = 1) ───────────────────────────────
// Prevents concurrent Chrome launches on memory-constrained VPS servers.
// Pattern: Promise-chain mutex — no external library required.
let _browserLock: Promise<void> = Promise.resolve();

async function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const prev = _browserLock;
  _browserLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
```

Then wrap the body of both `listSscDocuments` and `downloadSscDocument` with `withBrowserLock`. The current structure of each function is:

```typescript
let browser: SscBrowser | null = null;
try {
  browser = await factory();
  ...
} catch (err) {
  ...
} finally {
  if (browser) await browser.close().catch(() => {});
}
```

Replace with:

```typescript
return withBrowserLock(async () => {
  let browser: SscBrowser | null = null;
  try {
    browser = await factory();
    ...
    return docs;   // or null for downloadSscDocument
  } catch (err) {
    ...
    return [];     // or null
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});
```

The `factory` variable assignment must happen **inside** the `withBrowserLock` callback so the lock is held for the entire browser lifetime including `browser.close()`.

---

### Task 295 — SSC selector probe (FR-7)

This task requires a live network check. The developer must:

1. Run `listSscDocuments("VNM", "all")` in a Node/Bun REPL with the production Chrome path.
2. If it returns 0 results, add a temporary `page.evaluate(() => document.documentElement.outerHTML)` call after the 5-second wait to capture the live DOM.
3. Search the DOM for the search input and result table selectors:
   - Current input selector: `input[id$="it8112::content"]`
   - Current row selector: `tr[_afrRK]`
4. If the selectors have drifted, extract the updated attribute names or ID suffixes from the DOM dump and update the string constants in `ssc.ts`.
5. If the portal is unreachable (timeout or 5xx), document in the task report and mark FR-7 as BLOCKED.

The architect cannot probe the live portal. The developer owns this task fully. No code change is prescribed here beyond what the probe reveals.

---

### Task 296 — End-to-end smoke test (FR-8)

Create `src/__tests__/296-ocr-pipeline-e2e.test.ts` following the same pattern as `291-bctc-smoke-vnm.test.ts`. Key structural decisions:

- Use `DB_PATH=":memory:"` by setting `process.env["DB_PATH"] = ":memory:"` before importing `getDb`.
- Call `closeDb()` first to reset any singleton, then `initDatabase()` to create the fresh schema including `pdf_extracted_text`.
- Locate a VNM PDF in `data/pdfs/` by scanning the directory for a filename matching `/vnm/i`.
- Guard the entire test body with `if (!isOcrAvailable()) { console.log("skip: OCR not available"); return; }`.
- Assert `result.totalChars >= 5000` from `extractAndStorePdfPages`.
- Assert `cached.confidence >= 0.5` from `getCachedPdfText`.
- The range assertion `totalAssets in [50_000_000, 100_000_000]` is a broadened version of the Task 291 range (50M–70M) to account for OCR text quality variation. The REQ spec specifies 100M as the upper bound.

---

## Task Breakdown (for PM)

Dependency chain:

```
292 (schema DDL + DPI + confidence guard + isOcrAvailable cache)
  └──→ 293 (fetchParseAndStoreBctc OCR fallback)
         └──→ 296 (e2e smoke test)

294 (browser semaphore — independent)
  └──→ 295 (selector probe — needs stable single browser)
```

| # | Title | Depends on | Layer |
|---|---|---|---|
| 292 | OCR audit: schema DDL, DPI 200, confidence guard, cache | — | infrastructure |
| 293 | Pipeline fallback: OCR cache wiring | 292 | application |
| 294 | SSC Puppeteer semaphore | — | infrastructure |
| 295 | SSC selector probe | 294 | infrastructure |
| 296 | e2e smoke test | 292, 293 | test |

TDD convention: each task starts with a failing test file `src/__tests__/NNN-*.test.ts`. Tests for 292 and 293 can be written against a `:memory:` DB with a mock PDF buffer.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `pdf_extracted_text` rows from a broken prior run (all empty) persist on existing DBs | Medium | Medium | The new completeness guard (50% threshold) will detect stale runs; `DELETE WHERE filename=?` + re-extract handles cleanup automatically |
| OCR fallback in Task 293 double-downloads the PDF (once in `downloadAndExtractPdf`, once in the axios re-fetch) | High | Low | Acceptable in Sprint 048 — network overhead is acceptable for a fix sprint; a buffer-cache refactor can be deferred |
| SSC portal unreachable during Task 295 probe (Vietnamese public holiday, maintenance) | Medium | Medium | Developer retries once; if still blocked, mark FR-7 as BLOCKED and defer selector fix to Sprint 049 |
| `withBrowserLock` queue grows unbounded if callers never time out | Low | Medium | Caller-level timeouts (60s `goto`, 30s `waitForSelector`) are already in place; the lock queue drains as soon as each browser closes |
| DPI 200 increases OCR time per page beyond 45s on slow VPS | Low | Medium | The 45s per-page `setTimeout` safety net is unchanged; if a page exceeds it, `ocrOnePage` returns `""` and the page is skipped |
| `decodeURIComponent` on a non-encoded URL path segment throws | Low | Low | Wrap in try/catch; fall back to raw `basename` string |
| Existing test 291 bypasses pdfOcrWorker — it reads the text layer via pdf-parse, not OCR | N/A | N/A | Task 291 tests the text-layer path; Task 296 tests the OCR path. Both are needed. No conflict. |

---

## Security Review

- SQL parameterized? Yes — all SQLite statements in schema.ts and pdfOcrWorker.ts use `?` placeholders or `db.prepare().run()`.
- File paths validated (no `../`)? The `pdfPath` in `extractAndStorePdfPages` is a local path derived from `data/pdfs/<filename>`. The `filename` is derived from a URL `basename` call — developer must verify `basename` strips leading slashes and path segments. Add `path.basename(filename)` normalisation in Task 293 implementation.
- External HTTP rate-limited? The re-fetch in the OCR fallback (Task 293) uses a 60s timeout. No rate-limiting for the single retry call — acceptable for fix sprint.
- Secrets via Bun.env only? Yes — no new secrets introduced.
- Chrome process leak? The `withBrowserLock` semaphore serialises launches. The `BROWSER_MAX_LIFETIME_MS` force-kill (45s) and `_activeBrowsers` shutdown hook remain in place.
