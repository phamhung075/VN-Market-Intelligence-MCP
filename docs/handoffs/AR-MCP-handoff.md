# AR-MCP — Refine Orchestration + Tools + Parser (dev-mcp-server)

**Sprint:** BCTC-AGENTIC-REFINE | **Owner:** dev-mcp-server | **Date:** 2026-05-30  
**Status:** READY | **Blocker:** AR-OPS-PRE | **Blocks:** AR-AGENT-B (ESC-5 gate needs `bctc_refined_units.confidence`)

---

## Summary

Implement the refine orchestrator (fan-out + collect-then-write), deterministic markdown→rows parser, three MCP tools (`get_bctc_page_text`, `get_bctc_page_image`, `get_bctc_refined`), schema migrations, and page classification logic. This is the highest-risk / highest-value component.

**Scope:** FR-3 through FR-13 (requirements). Amended by §0.6 (fan-out orchestration).  
**DDD layers:** infrastructure (schema, DB write), application (orchestrator, parser, page classifier), interface (MCP tools).

---

## Acceptance Criteria

### AC-FR3: `get_bctc_page_text` MCP Tool

**New file:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts`

- [ ] Input schema: `{ report_id: string, page_number: number (int, ≥1) }`
- [ ] Output: `{ text: string, source: "sqlite_ocr" | "mistral_ocr" }` or `{ error: string }`
- [ ] Resolves `report_id` → `filename` via `financial_reports` table.
- [ ] Calls pdf-extractor `GET /api/page-text?filename={filename}&page_number={page_number}`.
- [ ] Returns result or `{ error }` — never throws.
- [ ] DDD: interface layer (zero DB writes).
- [ ] Registered in `tools/registry.ts` (one `import` + one array entry).

**Test:**
- [ ] Integration: call tool on a known report → returns non-empty text.

### AC-FR4: `get_bctc_page_image` MCP Tool

**New file:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageImageTool.ts`

- [ ] Input schema: `{ report_id: string, pages: Array<number> (int, ≥1, max BCTC_IMAGE_PAGE_CAP) }`
- [ ] Output: `{ images: Array<{ page: number, base64_png: string }> }` or `{ error: string }`
- [ ] Hard cap on pages: `BCTC_IMAGE_PAGE_CAP` env var (default 3). Over-limit → `{ error }`.
- [ ] Implementation chain:
  1. Query `financial_reports` by `id = report_id` → get `filename`.
  2. Read PNGs from `data/bctc-page-images/{report_id}/page_{N:04d}.png`.
  3. If PNG missing → call `POST /api/rasterize` on pdf-extractor (on-demand).
  4. Base64-encode each PNG.
  5. Return array. If a page fails after rasterize attempt → include `{ error }` for that page, do not fail whole call.
- [ ] DDD: interface (read-only file access acceptable for interface layer).
- [ ] Registered in `tools/registry.ts`.

**Test:**
- [ ] Integration: call tool on a 2-page window → returns two base64 PNGs.
- [ ] Edge case: missing PNG → triggers rasterize → returns PNG.

### AC-FR5: `classify_page_for_image_load` Function

**File:** `apps/mcp-server/src/application/utils/pageClassifier.ts` (or embedded in `bctcRefineOrchestrator.ts`)

- [ ] Pure function: `classifyPageForImageLoad(ocrText: string, prevPageWasImage: boolean) -> boolean`
- [ ] Returns `true` if OCR text contains table-structural tokens:
  - `|` character (pipe, table delimiters)
  - Sequences of digits with whitespace (numeric columns)
  - Vietnamese column keywords: `Mã số`, `Thuyết minh`, `Số cuối`, `Số đầu`, `chỉ tiêu` (case-insensitive)
- [ ] Returns `true` if `prevPageWasImage && /tiếp theo|continued/i.test(ocrText)` (continuation window).
- [ ] Returns `false` for prose-only pages.
- [ ] Unit test file: `src/__tests__/AR-page-classifier.test.ts`
  - AC-FR5-1: page with `|` → true.
  - AC-FR5-2: page with `Mã số` → true.
  - AC-FR5-3: pure prose, `prevPageWasImage=false` → false.
  - AC-FR5-4: integration test: refine orchestrator only calls `get_bctc_page_image` when classification is true.

### AC-FR9: `bctc_refined_units` Schema

**File to modify:** `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`

Within `initFinancialReportsTables()`:

- [ ] Create table:
  ```sql
  CREATE TABLE IF NOT EXISTS bctc_refined_units (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id        TEXT NOT NULL,
    unit_id          TEXT NOT NULL,
    page_numbers_json TEXT NOT NULL,
    markdown         TEXT NOT NULL,
    row_count        INTEGER NOT NULL DEFAULT 0,
    confidence       REAL NOT NULL DEFAULT 0.0,
    flags            TEXT,
    window_status    TEXT NOT NULL DEFAULT 'DONE',
    refined_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(report_id, unit_id)
  );
  ```
- [ ] Create index: `CREATE INDEX IF NOT EXISTS idx_bru_report ON bctc_refined_units(report_id)`
- [ ] Add `text_status` column to `financial_reports` (idempotent migration):
  - If column exists → skip.
  - Else → add with default `'COMPLETE'` (existing rows have completed OCR).
- [ ] Add `refine_status` column to `financial_reports` (idempotent migration):
  - If column exists → skip.
  - Else → add with default `'PENDING'` (existing rows need refine).
- [ ] Idempotency test: run migration twice → no error, no dupes.

**Test:** `src/__tests__/AR-schema-migration.test.ts`
- [ ] After migration, both `text_status` and `refine_status` exist on `financial_reports`.
- [ ] Second run of migration → no error.

### AC-FR10: Markdown → `bctc_table_rows` Parser

**New file:** `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts`

**Contract:** Deterministic, pure function. Same input → same output always.

```typescript
export interface BctcTableRow {
  report_id: string;
  statement_section: string;  // "balance_sheet", "income_statement", "cash_flow", "notes", "general"
  row_order: number;
  code: string | null;
  label: string;              // NOT row_label — live schema column
  period_current: string;
  value_current: number | null;
  period_prior: string | null;
  value_prior: number | null;  // NOT value_previous — live schema column
  unit: string;               // default "billion_vnd"
  page_number: number;
  source_confidence: number;  // 0.0–1.0
  is_summary_row: number;     // 0 or 1
}

export interface ParseResult {
  rows: BctcTableRow[];
  errors: string[];
}

export function parseRefinedMarkdown(
  markdown: string,
  report_id: string,
  page_numbers: number[],
): ParseResult;
```

**Algorithm (binding, deterministic, no ML):**

1. **Section header detection:** scan for Vietnamese statement headers.
   - `BẢNG CÂN ĐỐI KẾ TOÁN` → `balance_sheet`
   - `BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH` → `income_statement`
   - `BÁO CÁO LƯU CHUYỂN TIỀN TỆ` → `cash_flow`
   - `THUYẾT MINH BÁO CÁO TÀI CHÍNH` → `notes`
   - Default: `general`

2. **Pipe-table row parsing:** for each line matching `/^\|.+\|$/`:
   - Split on `|`, trim cells.
   - Skip header rows (detect by `---` separator or all-numeric absence).
   - Assume columns: `[code?, label, value_current, value_prior?]`.

3. **Vietnamese number normalization:**
   ```typescript
   function parseVnNumber(raw: string): number | null {
     const cleaned = raw.trim().replace(/\./g, "").replace(/,/g, ".");
     const n = parseFloat(cleaned);
     return isNaN(n) ? null : n;
   }
   ```
   (Vietnamese uses `.` as thousands separator, `,` as decimal.)

4. **Trust flag parsing:**
   - `[ĐỘ TIN CẬY THẤP — {reason}]` in any cell → `source_confidence = 0.2`, append `"high_discrepancy:{reason}"` to flags.
   - `[độ tin cậy thấp]` in any cell → `source_confidence = 0.4`, append `"minor_discrepancy"` to flags.
   - No flag → `source_confidence = 1.0`.
   - Strip flag from cell value before numeric parsing.

5. **Error handling:** malformed row (wrong column count, non-numeric value) → record in `errors[]`, skip row. NEVER insert partial rows.

6. **`is_summary_row`:** if `code` is null and `label` is ALL-CAPS → `1`. Otherwise `0`.

7. **`page_number`:** use `page_numbers[0]` (unit's first page).

- [ ] DDD: application (pure function, no I/O, unit-testable).
- [ ] Schema names: use LIVE columns (`label`, `value_prior`, `period_prior`) — NOT spec names (`row_label`, `value_previous`).
- [ ] Test file: `src/__tests__/AR-parser-dv.test.ts` (DV = Design Verification)
  - [ ] DV-1 (malformed): missing value columns → empty rows + non-empty errors[].
  - [ ] DV-2 (well-formed): 5-row table → exactly 5 rows, correct values.
  - [ ] DV-3 (red flag): `[ĐỘ TIN CẬY THẤP — ...]` → `source_confidence = 0.2`.
  - [ ] DV-4 (yellow flag): `[độ tin cậy thấp]` → `source_confidence = 0.4`.
  - [ ] DV-5 (Vietnamese numbers): "1.234.567" → 1234567.
  - **BINDING:** DV test must be committed with `RED_BEFORE = true` guard comment. Implementation makes it GREEN.

### AC-FR11: `get_bctc_refined` MCP Tool

**New file:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcRefinedTool.ts`

- [ ] Input: `{ report_id: string }`
- [ ] Output: `{ units: Array<{ unit_id: string, page_numbers: number[], markdown: string, flags: string[] }> }` or `{ error: string }`
- [ ] Reads from `bctc_refined_units` for the given `report_id`.
- [ ] Returns `{ error }` when no refined units exist.
- [ ] DDD: interface (read-only).
- [ ] Registered in `tools/registry.ts`.

### AC-FR12: Refine Orchestration + Cron (CRITICAL, AMENDED per §0.6)

**New file:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`

**State machine (4 sequential phases, BINDING per §0.6):**

**Phase 0: Claim + readiness gate**
- [ ] Claim task: `task_claim(db, "bctc-refine-{reportId}", "sprint-task", "refine-orchestrator", 3600)`.
- [ ] If claim fails → skip, return.
- [ ] Gate: if `text_status` is `IN_PROGRESS` or `PARTIAL` → log skip, return (do not write garbage).
- [ ] Set `refine_status = 'IN_PROGRESS'` on `financial_reports`.

**Phase 1: Window partition (sequential, O(n) pages, COMPLETES BEFORE ANY SPAWN)**
- [ ] Fetch all page texts via `get_bctc_page_text` (one call per page).
- [ ] Partition into windows: `partitionIntoWindows(pageTexts, { maxWindowPages: REFINE_MAX_WINDOW_PAGES })`.
  - **CRITICAL INVARIANT:** continuation tables MUST NOT be split across window boundaries.
  - Sequential scan for continuation markers (`tiếp theo` / `continued`).
  - Standalone page → 1-page window.
  - Continuation table N, N+1 → 1 two-page window.
  - Multi-page ≥ `REFINE_MAX_WINDOW_PAGES` capped at max (with `truncated_continuation` flag).
- [ ] Output: `windows: Array<{ unit_id, page_numbers, texts, needsImage[] }>`
- [ ] Classify each page for image load: `classifyPageForImageLoad(ocrText, prevWasImage)`.

**Phase 2: Fan-out (BOUNDED CONCURRENCY, NO DB WRITES)**
- [ ] Spawn one `refine_bctc_md` Haiku subagent per window.
- [ ] Bounded concurrency pool: cap at `REFINE_FANOUT_CONCURRENCY` (default 5).
  - Use semaphore or p-limit-style queue.
  - Never spawn more than cap simultaneously.
- [ ] Per-window timeout: `REFINE_WINDOW_TIMEOUT_S` (default 120s).
- [ ] Each subagent receives:
  - Window's OCR text(s).
  - Base64-encoded image(s) only for pages where `classifyPageForImageLoad` is true.
  - Relevant sub-flow reference.
  - Refine contract (static, cached).
- [ ] Subagent output: `{ unit_id, page_numbers_json, markdown, confidence, flags, status: "DONE"|"FAILED" }`
- [ ] On timeout/error: `{ ...win, markdown: "", confidence: 0.0, flags: ["timeout"|"agent_error:..."], status: "FAILED" }`
- [ ] Never throws — failure captured in status.
- [ ] Output exchange: each subagent writes to `docs/refine-output/{report_id}/{unit_id}.json`; orchestrator reads + deletes.

**Phase 3: Aggregate (DETERMINE REPORT-LEVEL STATUS)**
- [ ] Collect results: `rawResults: Array<result>`
- [ ] Determine report status:
  - All DONE → `DONE`
  - Some DONE, some FAILED → `PARTIAL`
  - All FAILED → `FAILED`

**Phase 4: Collect-then-write (SINGLE-THREADED, TRANSACTIONAL, NO SUBAGENT DB WRITES)**
- [ ] DELETE-then-INSERT to `bctc_refined_units` (all windows, including FAILED):
  ```typescript
  db.transaction(() => {
    db.exec("DELETE FROM bctc_refined_units WHERE report_id=?", [reportId]);
    for (const r of rawResults) {
      db.exec(`INSERT INTO bctc_refined_units
        (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, window_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [reportId, r.unit_id, JSON.stringify(r.page_numbers), r.markdown,
         r.markdown ? countRows(r.markdown) : 0,
         r.confidence, JSON.stringify(r.flags), r.status]
      );
    }
  })();
  ```
- [ ] Parse markdown → `bctc_table_rows` (DONE windows only, FAILED windows contribute nothing):
  ```typescript
  db.transaction(() => {
    db.exec("DELETE FROM bctc_table_rows WHERE report_id=?", [reportId]);
    for (const r of rawResults.filter(r => r.status === "DONE")) {
      const parsed = parseRefinedMarkdown(r.markdown, reportId, r.page_numbers);
      for (const tableRow of parsed.rows) {
        db.exec("INSERT INTO bctc_table_rows ...", [...fields...]);
      }
    }
  })();
  ```
- [ ] Update report: `UPDATE financial_reports SET refine_status=? WHERE id=?` (DONE / PARTIAL / FAILED).
- [ ] Release task: `task_release(db, "bctc-refine-{reportId}", "refine-orchestrator")`.

**Cron schedule:** `'0 9,14,20 * * *'` UTC (09:00, 14:00, 20:00 UTC).
- [ ] All three times outside 02:00–08:59 UTC Mon–Fri OFF-HOSE window. ✓
- [ ] Registered in `cronConfig.ts` as `bctcRefineJob` key.

**On-demand path:** `POST /api/refine-bctc/{report_id}` calls `refineOneReport()` directly.

**Idempotency proof (AC-FR9-2, AC-FR12-2):**
- [ ] DELETE-then-INSERT covers ALL windows. Re-run (including PARTIAL → DONE) produces stable state.
- [ ] Test: `AR-refined-units-idempotency.test.ts`
  - Run `refineOneReport()` 3 times on FPT → `COUNT(*) FROM bctc_refined_units WHERE report_id='FPT'` stable after each run.
  - Scenario: first run all-DONE → second run PARTIAL (inject failure mock) → third run DONE. COUNT always = windows.length.

**Test files:**
- [ ] `src/__tests__/AR-refine-readiness-gate.test.ts`
  - AC-FR12-1: `text_status = IN_PROGRESS` → skips, no write.
- [ ] `src/__tests__/AR-refined-units-idempotency.test.ts`
  - AC-FR12-2: ≥3× runs → COUNT stable.
  - Covers all-DONE, some-FAILED→PARTIAL, PARTIAL→DONE scenarios.

### AC-FR13: Refine Contract Enforcement

- [ ] Agent prompt (FR-13 scope for agent-father task) encodes the three-tier contract in system prompt.
- [ ] Orchestrator verifies (optional, architect decision): no unflagged numeric discrepancies by re-reading OCR text post-refine.
- [ ] Balance catch-net runs AFTER trust-flag parsing, not before.
- [ ] Balance badge recorded in flags but does NOT override trust flags.
- [ ] DV test embedded in AR-parser-dv (parser must handle trust flags correctly).

---

## Files to Create / Modify / Delete

| File | Action | Content |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts` | Create | FR-3 tool |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageImageTool.ts` | Create | FR-4 tool |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcRefinedTool.ts` | Create | FR-11 tool |
| `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` | Create | FR-10 parser |
| `apps/mcp-server/src/application/utils/pageClassifier.ts` | Create | FR-5 classifier |
| `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` | Create | FR-12 orchestrator + cron |
| `apps/mcp-server/src/interface/mcp/routes/bctcRefineHandler.ts` | Create | on-demand POST `/api/refine-bctc/{report_id}` |
| `apps/mcp-server/src/__tests__/AR-parser-dv.test.ts` | Create | FR-10 DV (RED→GREEN guard) |
| `apps/mcp-server/src/__tests__/AR-page-classifier.test.ts` | Create | FR-5 unit tests |
| `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts` | Create | AC-FR12-2 idempotency |
| `apps/mcp-server/src/__tests__/AR-refine-readiness-gate.test.ts` | Create | AC-FR12-1 readiness |
| `apps/mcp-server/src/__tests__/AR-schema-migration.test.ts` | Create | Schema migration verify |
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | Modify | Add `bctc_refined_units` DDL + `text_status`/`refine_status` migration |
| `apps/mcp-server/src/interface/mcp/tools/registry.ts` | Modify | Add 3 new tool imports + array entries |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts` | Modify | Add 3 new exports |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Modify | Add `bctcRefineJob` key |
| `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` | Modify | Add `rasterizePages()` + `getPageText()` methods |

---

## Implementation Notes

### Window Partition Algorithm (Pseudocode)

```typescript
function partitionIntoWindows(
  pageTexts: Array<{ page: number, text: string }>,
  config: { maxWindowPages: number }
): Array<Window> {
  const windows: Window[] = [];
  let i = 0;
  
  while (i < pageTexts.length) {
    const page = pageTexts[i];
    const ocrText = page.text;
    const prevWasImage = windows.length > 0 && windows[windows.length - 1].needsImage.some(b => b);
    const needsImage = classifyPageForImageLoad(ocrText, prevWasImage);
    
    // Check for continuation marker
    if (i + 1 < pageTexts.length) {
      const nextOcr = pageTexts[i + 1].text;
      if (/tiếp theo|continued/i.test(nextOcr)) {
        // Multi-page window
        const pages = [i, i + 1];
        const texts = [ocrText, nextOcr];
        const needsImages = [needsImage, classifyPageForImageLoad(nextOcr, needsImage)];
        
        // Cap at maxWindowPages
        while (pages.length < config.maxWindowPages && i + pages.length + 1 < pageTexts.length) {
          const nextNext = pageTexts[i + pages.length + 1];
          if (/tiếp theo|continued/i.test(nextNext.text)) {
            pages.push(i + pages.length + 1);
            texts.push(nextNext.text);
            needsImages.push(classifyPageForImageLoad(nextNext.text, needsImages[needsImages.length - 1]));
          } else {
            break;
          }
        }
        
        windows.push({
          unit_id: `unit-${windows.length}`,
          page_numbers: pages.map(j => pageTexts[j].page),
          texts,
          needsImage: needsImages
        });
        i += pages.length;
        continue;
      }
    }
    
    // Single-page window
    windows.push({
      unit_id: `unit-${windows.length}`,
      page_numbers: [page.page],
      texts: [ocrText],
      needsImage: [needsImage]
    });
    i++;
  }
  
  return windows;
}
```

---

## Exit Criteria

- [x] AC-FR3: `get_bctc_page_text` tool + test.
- [x] AC-FR4: `get_bctc_page_image` tool + test.
- [x] AC-FR5: `classify_page_for_image_load` + unit tests (AC-FR5-1 through FR5-4).
- [x] AC-FR9: `bctc_refined_units` table + `text_status`/`refine_status` columns + idempotent migration.
- [x] AC-FR10: `parseRefinedMarkdown()` + DV test (RED→GREEN with guard comment).
- [x] AC-FR11: `get_bctc_refined` tool + test.
- [x] AC-FR12: Full orchestrator (4-phase, fan-out, bounded concurrency, collect-then-write) + cron + readiness gate + idempotency ≥3×.
- [x] AC-FR13: Refine contract enforcement embedded in agent prompt (agent-father scope).
- [x] All schema migrations complete + verified.
- [x] All unit tests pass.
- [x] Idempotency test covers all-DONE, PARTIAL, and PARTIAL→DONE scenarios.
- [x] Window partition algorithm never splits continuation tables.
- [x] Bounded pool never spawns more than `REFINE_FANOUT_CONCURRENCY`.

---

## Non-Negotiables

- **main branch only.** No feature branches.
- **Explicit `git add <file>`** per file — never `-A`. Many unrelated uncommitted files in tree.
- **DV test files** (AR-parser-dv.test.ts, AR-*-test.ts) land in SAME commit as production code.
- **bun:sqlite ONLY.** No better-sqlite3. Use `new Database(path)` plain pattern.
- **Persistence verified by DIRECT in-container `market.db` read.** NOT push echo.
- **Idempotency proven ≥3×** on FPT (FPT-42-dupes guard). Test MUST cover PARTIAL scenario.
- **Balance badge FORBIDDEN as sole gate.** Recorded in flags, never overrides trust flags.
- **OFF-HOSE guard.** Cron times verified outside 02:00–08:59 UTC Mon–Fri.

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Parser silent partial-row insertion | DV test (RED→GREEN). Parser returns `{ rows: [], errors: [...] }` on malformed input. |
| FPT-42 double-emit | DELETE-then-INSERT idempotency + test with PARTIAL scenario. |
| Continuation split across windows | `partitionIntoWindows()` runs to completion before spawn. Invariant enforced in algorithm. Test with FPT [22,23]. |
| Subagent DB writes race | Collect-then-write: orchestrator owns ALL DB writes. Subagents write only to file exchange point. |
| Haiku vision accuracy | QA bake-off (FR-15). If <90% pass, escalate to architect for DPI/model re-evaluation. |
| Volume mount missing | AR-OPS-PRE completes first. Without volume, rasterize returns error. |

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§3.2, §0.6)
- Requirements: `docs/REQ_BCTC-AGENTIC-REFINE.md` (FR-3 through FR-13)
- DDD reference: `docs/references/ddd-microservices.md`
- Off-HOSE policy: `docs/protocols/off-hose-cron-policy.md`

---

## RETURN

```
TASK: AR-MCP
STATUS: READY FOR ASSIGNMENT
OWNER: dev-mcp-server
BLOCKER: AR-OPS-PRE (volume mount)
BLOCKS: AR-AGENT-B (ESC-5 needs bctc_refined_units.confidence)
ESTIMATED: 6–8 hours
CRITICAL ITEMS: Window partition invariant (continuation must not split), fan-out bounded pool, collect-then-write, parser DV test (RED→GREEN)
NEXT: AR-AGENT-A (parallel with this task after AR-OPS-PRE), then AR-AGENT-B (sequentially after this + A)
```
