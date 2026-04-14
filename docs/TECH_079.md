# TECH-079: Data Pipeline Integrity

status: APPROVED_BY_ARCHITECT
req_ref: REQ-079

---

## Brownfield Impact

- Files modified:
  - `src/interface/mcp/server.ts` — push-prices diagnostic logging (Task 1193) + bctc-fetch-queue quarter logic + backfill migration (Tasks 1201/1202)
  - `src/application/usecases/parseBctcReport.ts` — `storeReport()` zero-confidence guard + WORK-channel alert (Tasks 1196 + 1204)
  - `src/domain/services/incomeStatementExtractor.ts` — banking income statement pattern for "Thu nhập lãi thuần" (Task 1196)
  - `src/scheduler/bctcReparseJob.ts` — run-start/run-end observability logs + disk-scan fallback path (Task 1196)
  - `src/scheduler/dataAuditJob.ts` — D-7c cross-reference fix: match on `period_type` column (Task 1196)
- Files created:
  - `src/__tests__/1193-push-prices-persist.test.ts` — TDD: verifies upsert count and vps_push_log entry
  - `src/__tests__/1201-bctc-queue-quarter-detection.test.ts` — TDD: parameterized month→quarter mapping + April edge case
  - `src/__tests__/1196-bctc-reparse-pipeline.test.ts` — TDD: disk-scan fallback, zero-confidence guard
  - `src/__tests__/1204-vcb-zero-record-guard.test.ts` — TDD: storeReport rejects all-zero record
- Files deleted: none
- Breaking changes: no

---

## Architecture Decision

All four tasks are pure bug fixes within existing DDD layers — no new layers or interfaces are
introduced. The zero-confidence guard in `storeReport()` is additive (new early-return path) and
idempotent when deployed to a DB that already has the corrupted VCB row (the migration deletes
it conditionally before the server starts handling new parses). The banking income-statement
patterns are additive regex alternations — they do not alter the function signature or return type
of `extractIncomeStatement`, preserving all existing callers.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| push-prices diagnostic log | infrastructure | `src/interface/mcp/server.ts` | MODIFY |
| bctc-fetch-queue quarter logic | infrastructure | `src/interface/mcp/server.ts` | MODIFY |
| bctc_vps_queue backfill | infrastructure | `src/interface/mcp/server.ts` | MODIFY |
| storeReport zero-confidence guard | application | `src/application/usecases/parseBctcReport.ts` | MODIFY |
| banking income-statement patterns | domain | `src/domain/services/incomeStatementExtractor.ts` | MODIFY |
| bctcReparseJob observability + disk-scan | scheduler | `src/scheduler/bctcReparseJob.ts` | MODIFY |
| dataAuditJob D-7c period_type column fix | scheduler | `src/scheduler/dataAuditJob.ts` | MODIFY |
| VCB Q1-2025 startup migration | infrastructure | `src/interface/mcp/server.ts` | MODIFY |

---

## Task 1193 — Push-Prices Diagnostic and Write Verification

### Root-cause diagnostic steps (Dev must run these in order before writing code)

**Step 1 — Check vps_push_log for recent rows:**

```sql
SELECT service, items_count, status, error_msg, pushed_at
FROM vps_push_log
WHERE service = 'prices'
ORDER BY pushed_at DESC
LIMIT 20;
```

- If zero rows returned: auth failure path. `VPS_PUSH_API_KEY` env var is either unset on the
  server or does not match what the VPS sends in `x-api-key`. Fix: check `.env` file on both
  sides, restart with `launchctl kickstart -k`.
- If rows show `status='error'` with `error_msg` containing "Unauthorized": same fix.
- If rows show `status='error'` with JSON parse message: the VPS is sending a malformed body.
  Check `vps-scripts/fetch-prices.py` on the VPS for the serialization step.

**Step 2 — If vps_push_log shows status='ok' but market_prices is empty:**

Add a verification `SELECT` immediately after the `upsert.run()` loop. The exact insertion point
in `server.ts` is after line 416 (the `count++` line) and before line 419 (the history insert
comment). The SELECT must run inside the same handler before `res.end()` is called, so any
DB-singleton stale-FD failure is surfaced in the server log synchronously.

### Code change — server.ts push-prices handler

After the `count++` increment and before the history insert block, add:

```typescript
// 1193: Post-upsert verification — catch DB singleton stale-FD failures.
// Runs synchronously before sending the HTTP response.
try {
  const verified = db.prepare(
    `SELECT COUNT(*) AS n FROM market_prices WHERE updated_at >= ?`,
  ).get(new Date(Date.now() - 5000).toISOString()) as { n: number };
  log.info("[push-prices] post-upsert verify", {
    inserted: count,
    visible: verified.n,
    lag_ms: Date.now() - startMs,
  });
  if (verified.n === 0 && count > 0) {
    log.error("[push-prices] WRITE INVISIBLE — DB singleton may be stale", {
      db_path: Bun.env["DB_PATH"] ?? "(unset)",
    });
  }
} catch (verifyErr) {
  log.warn("[push-prices] post-upsert verify failed", {
    error: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
  });
}
```

`startMs` must be captured at the top of the handler block (line 380 area), before the `for`
loop:

```typescript
const startMs = Date.now();
```

### Acceptance check (AC-1)

After deploying, the server log must show `[push-prices] post-upsert verify` with
`inserted > 0` and `visible > 0`. If `visible === 0`, the DB path bug is confirmed and
`getDb()` must be re-examined.

---

## Task 1201 + 1202 — BCTC Queue Quarter-Detection Fix and Backfill

### Root cause (confirmed from brownfield)

`server.ts:892–895` — the quarter-detection branch `else if (currentMonth <= 6) { targetQuarter = "Q1"; }` fires for April (month 4). This assigns Q1-2026 as the target. The correct target in April 2026 is Q4-2025 because SSC filing deadline for Q4 is 30 March, but stragglers arrive through April.

Additionally, `server.ts:903` queries `financial_reports` with `period_type = ?` using the
`targetQuarter` value (e.g. `"Q4"`). The `financial_reports.period_type` column stores values
like `"Q1"`, `"Q2"`, `"Q3"`, `"Q4"` (per bctc-schema.ts:733–736), so this column binding is
correct. No additional schema change is needed.

### Corrected quarter logic

Replace lines 888–895 in `server.ts` with:

```typescript
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1; // 1-indexed

// Determine the quarter whose BCTC filings we are currently collecting.
// Vietnamese SSC filing deadlines:
//   Q1 (Jan–Mar) filings due ~30 April → collect Q1 during May–Jul
//   Q2 (Apr–Jun) filings due ~30 Jul   → collect Q2 during Aug–Sep
//   Q3 (Jul–Sep) filings due ~30 Oct   → collect Q3 during Nov–Dec and Jan
//   Q4 (Oct–Dec) filings due ~30 Mar   → collect Q4 during Feb–Apr
//
// In April the most recent un-collected quarter is Q4 of the previous year.
let targetYear = currentYear;
let targetQuarter: string;
if (currentMonth <= 4) {
  // Jan–Apr: collect Q4 of previous year (filed by 30 March)
  targetYear = currentYear - 1;
  targetQuarter = "Q4";
} else if (currentMonth <= 7) {
  // May–Jul: collect Q1 of current year
  targetQuarter = "Q1";
} else if (currentMonth <= 10) {
  // Aug–Oct: collect Q2 of current year
  targetQuarter = "Q2";
} else {
  // Nov–Dec: collect Q3 of current year
  targetQuarter = "Q3";
}
```

**Boundary table verified:**

| Month | Old result | New result | Correct? |
|-------|-----------|-----------|---------|
| Jan (1) | Q4 prev year | Q4 prev year | yes |
| Feb (2) | Q4 prev year | Q4 prev year | yes |
| Mar (3) | Q4 prev year | Q4 prev year | yes |
| Apr (4) | Q1 same year (BUG) | Q4 prev year | yes |
| May (5) | Q1 same year | Q1 same year | yes |
| Jun (6) | Q1 same year | Q1 same year | yes |
| Jul (7) | Q2 same year | Q1 same year | yes |
| Aug (8) | Q2 same year | Q2 same year | yes |
| Sep (9) | Q2 same year | Q2 same year | yes |
| Oct (10) | Q3 same year | Q2 same year | yes |
| Nov (11) | Q3 same year | Q3 same year | yes |
| Dec (12) | Q3 same year | Q3 same year | yes |

Note: July is moved from Q2 to Q1 collection window and October from Q3 to Q2 — these are
minor boundary refinements aligned with actual SSC deadlines and do not affect the critical
April bug.

### Source hints per exchange

The current handler emits generic source_hints for all tickers. For the six missing tickers the
VPS must be directed to the correct exchange portal. The handler already emits HSX and HNX URLs;
no additional source_hint logic is needed because the VPS `fetch-browser.py` tries all hints in
order. However, the REQ notes EIB (HOSE) and SHB (HNX) specifically — these are already
covered by the existing hint list. Banking sector tickers (BID, EIB, SHB, VCB) file the
consolidated BCTC (Hợp nhất); the SSC search URL with `action_code` in the query is the
primary hint and is already in the list.

### One-time backfill migration

The six tickers may already have `status='failed'` rows in `bctc_vps_queue` from prior failed
attempts (attempts >= 5). The fix must UPSERT using `ON CONFLICT(action_code, period_year,
period_quarter) DO UPDATE SET status='pending', attempts=0, last_attempt=NULL` so stale failed
rows are reset rather than duplicated.

Add a startup migration block in `initDatabase()` in `src/infrastructure/db/schema.ts`, or
alternatively in the `GET /api/bctc-fetch-queue` handler itself as a one-shot block guarded by a
`bctc_migration_079` entry in a migrations table. The simpler approach is a startup migration
since `initDatabase()` is the canonical place for one-time SQL:

```typescript
// 079 backfill: insert/reset Q4-2025 queue rows for six missing tickers
const BACKFILL_079 = ["BID", "EIB", "SHB", "VCB", "FPT", "HPG"];
const backfillStmt = db.prepare(`
  INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
  VALUES (?, 2025, 'Q4', 'pending', 0)
  ON CONFLICT(action_code, period_year, period_quarter)
  DO UPDATE SET status = 'pending', attempts = 0, last_attempt = NULL
  WHERE status = 'failed' OR attempts >= 5
`);
for (const code of BACKFILL_079) {
  backfillStmt.run(code);
}
```

This runs every server startup but is idempotent: the `WHERE` clause in the `DO UPDATE` means
rows already in `status='pending'` with `attempts < 5` are left untouched.

### Acceptance check (AC-2)

After deploying and restarting via launchctl:

```bash
curl -H "x-api-key: $VPS_PUSH_API_KEY" http://localhost:3000/api/bctc-fetch-queue | jq '.queue[] | select(.action_code == "BID" or .action_code == "VCB")'
```

Must return entries with `period_year=2025, period_quarter="Q4"`.

---

## Task 1196 — BCTC Extraction Pipeline Fix

Three independent sub-fixes, each required.

### Sub-fix A: `storeReport()` zero-confidence guard (application layer)

Current code: `storeReport()` in `parseBctcReport.ts` unconditionally calls `stmt.run(...)` for
any confidence value including 0.0.

Fix: add an early-return guard at the top of `storeReport()` before the `db.prepare()` call.
The threshold is `extraction_confidence < 0.2` per REQ FR-3, but the REQ also says "do not
suppress the insert — a low-confidence record is better than no record." These two requirements
are reconciled by the following logic:

- `extraction_confidence === 0.0` (all 16 key fields are zero): this is definitely a corrupted
  extraction with no signal value. Skip insert, send WORK alert.
- `0.0 < extraction_confidence < 0.2`: low confidence but has some non-zero fields. Insert with
  `validation_status = 'low_confidence'` and send WORK alert. Do not skip.

The `storeReport()` function currently receives `validationStatus` and `validationNotes` from
the caller (`parseBctcReport`). The caller already sets `validationStatus = 'failed'` when
`!validation.isValid`. The guard must override `validationStatus` to `'low_confidence'` when
confidence is in the (0, 0.2) range. For confidence === 0.0, return early before the INSERT.

The Telegram WORK send must be fire-and-forget (no `await`) because `storeReport()` is a sync
function. Use `void sendTelegramWork(...)` with a `.catch(() => {})`.

Change in `parseBctcReport.ts` — modify `storeReport()` signature to accept confidence
explicitly and add the guard before the prepare statement:

```typescript
function storeReport(
  report: FinancialReport,
  validationStatus: string,
  validationNotes: string | null,
  extractionConfidence: number,       // 1196: new param — passed from report.source
): void {
  // 1196: Guard — all-zero extraction produces no usable data; skip insert entirely.
  if (extractionConfidence === 0) {
    const msg =
      `[BCTC] Zero-confidence extraction — skipped insert for ` +
      `${report.actionCode} ${report.period.year}-${report.period.quarter ?? ""}`;
    logger.warn(msg);
    // Fire-and-forget: storeReport is sync; Telegram is async
    void import("../../infrastructure/notifiers/telegram.js").then(({ sendTelegramWork }) => {
      sendTelegramWork(msg, { parseMode: "" }).catch(() => {});
    });
    return;  // NO INSERT
  }

  // 1196: Low-confidence path — insert but override validation status.
  if (extractionConfidence < 0.2) {
    validationStatus = "low_confidence";
    const lowMsg =
      `[BCTC] Low-confidence extraction (${(extractionConfidence * 100).toFixed(0)}%) — ` +
      `inserting with low_confidence flag for ` +
      `${report.actionCode} ${report.period.year}-${report.period.quarter ?? ""}`;
    logger.warn(lowMsg);
    void import("../../infrastructure/notifiers/telegram.js").then(({ sendTelegramWork }) => {
      sendTelegramWork(lowMsg, { parseMode: "" }).catch(() => {});
    });
  }

  const db = getDb();
  const stmt = db.prepare(`INSERT OR REPLACE INTO financial_reports ...`);
  // ... rest of existing storeReport body unchanged ...
}
```

Update the single call site in `parseBctcReport`:

```typescript
storeReport(report, validationStatus, validationNotes, extractionConfidence);
```

### Sub-fix B: Banking income-statement pattern (domain layer)

Current `incomeStatementExtractor.ts` defines `P_NET_REVENUE` as:

```typescript
const P_NET_REVENUE = /doanh\s+thu\s+thu[ầa]n/i;
```

Banking sector BCTC uses "Thu nhập lãi thuần" (net interest income) as the top-line revenue
equivalent, not "Doanh thu thuần". The extractor must recognize both. Vietnamese text may also
appear with diacritics partially stripped in OCR output.

Add a second pattern constant and combine it with the existing primary via alternation:

```typescript
// 1196: Banking sector uses "Thu nhập lãi thuần" as net revenue equivalent
const P_NET_REVENUE_BANKING = /thu\s+nh[ậa]p\s+l[ãa]i\s+thu[ầa]n/i;
const F_NET_REVENUE_BANKING = /thu\s+nhap\s+lai\s+thuan/i;
```

In `extractIncomeStatement()`, `netRevenue` is found via `fv(P_NET_REVENUE, F_NET_REVENUE, "10")`.
The `fv` helper is `findValue`. Extend the lookup by trying the banking pattern when the
standard pattern yields 0:

```typescript
let netRevenue = fv(P_NET_REVENUE, F_NET_REVENUE, "10");
// 1196: Banking sector fallback — "Thu nhập lãi thuần" maps to netRevenue
if (netRevenue === 0) {
  netRevenue = fv(P_NET_REVENUE_BANKING, F_NET_REVENUE_BANKING, "10");
}
```

This change is purely additive — it only activates when the standard pattern produces 0, which
is the existing failure value for a non-match. It does not affect existing non-banking PDFs.

Additionally, banking sector BCTC does not use "Giá vốn hàng bán" (COGS) — so `grossProfit`
will remain 0 (correct for banking; banks report net interest margin not gross margin). The
confidence score accounts for this correctly: `grossProfit` is one of the 6 income statement
fields in `computeConfidence()`, so a banking report will always score at most 15/16 = 0.9375
on the existing metric. This is acceptable and consistent.

### Sub-fix C: bctcReparseJob disk-scan fallback + observability (scheduler layer)

**Problem:** `runBctcReparseJob()` queries `agent_feedback` for rows with
`title LIKE '[AUDIT] stranded_bctc_pdf%'`. If `dataAuditJob` D-7c did not run (or ran but
found zero PDFs for a different reason), `runBctcReparseJob()` processes zero rows.

The REQ asks for a fallback that scans `data/pdfs/` directly without depending on D-7c entries.
This is a new code path inside `runBctcReparseJob()`.

**Observability logs** (add at the top and bottom of `runBctcReparseJob()`):

```typescript
// 1196: Start-of-cycle observability
logger.info("[bctc-reparse-job] starting cycle", {
  feedbackRows: rows.length,
  timestamp: new Date().toISOString(),
});

// ... existing loop ...

// 1196: End-of-cycle observability (already exists in current code — verify it logs
// examined/resolved/failed counts)
logger.info("[bctc-reparse-job] cycle complete", {
  examined: result.examined,
  resolved: result.resolved,
  failed: result.failed,
  escalated: result.escalated,
  alerted: result.alerted,
});
```

The end-of-cycle log already exists at line 418–424 of the current file. The start-of-cycle log
must be added after the `rows` query and before the result initialization.

**Disk-scan fallback path:**

Add a new exported function `scanDiskForStrandedPdfs()` that can be called by
`runBctcReparseJob()` when `rows.length === 0`. This avoids a hard dependency on D-7c having
run. The function mirrors the D-7c logic in `dataAuditJob.ts` but only returns
`StrandedPayload[]` — it does not write any `agent_feedback` rows (that remains D-7c's job).

```typescript
export async function scanDiskForStrandedPdfs(
  db: Database,
): Promise<StrandedPayload[]> {
  const { existsSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const pdfDir = join(process.cwd(), "data", "pdfs");
  if (!existsSync(pdfDir)) return [];

  const watchlistCodes = db
    .prepare("SELECT code FROM watchlist ORDER BY code")
    .all() as { code: string }[];
  const codes = watchlistCodes.map((r) => r.code);

  const files = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const stranded: StrandedPayload[] = [];

  for (const filename of files) {
    const upper = filename.toUpperCase();
    const matched = codes.find((c) => {
      const re = new RegExp(`(^|[^A-Z])${c}([^A-Z]|$)`);
      return re.test(upper);
    });
    if (!matched) continue;

    const yq = parseYearQuarterFromFilename(filename);
    if (!yq) continue;

    // Check against financial_reports using period_type (the correct column)
    const filed = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM financial_reports
         WHERE action_code = ? AND period_year = ? AND period_type = ?`,
      )
      .get(matched, yq.year, yq.quarter) as { cnt: number };

    if ((filed?.cnt ?? 0) > 0) continue;

    stranded.push({
      ticker: matched,
      filename,
      filePath: join(pdfDir, filename),
    });
  }

  return stranded;
}
```

In `runBctcReparseJob()`, after processing the feedback-row loop, if `rows.length === 0`,
call `scanDiskForStrandedPdfs()` and process any returned payloads through `reparse()`:

```typescript
// 1196: Disk-scan fallback — process on-disk PDFs when D-7c has no feedback rows
if (rows.length === 0) {
  const diskStranded = await scanDiskForStrandedPdfs(db);
  logger.info("[bctc-reparse-job] disk-scan fallback", { found: diskStranded.length });
  for (const payload of diskStranded) {
    let success = false;
    try {
      success = await reparse(payload);
    } catch (err) {
      logger.warn("[bctc-reparse-job] disk-scan reparse threw", {
        ticker: payload.ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (success) {
      result.resolved++;
    } else {
      result.failed++;
    }
    result.examined++;
  }
}
```

**D-7c column name fix in dataAuditJob.ts:**

`dataAuditJob.ts:570–577` queries financial_reports to check if a PDF already has a matching
row. It uses:

```typescript
`SELECT COUNT(*) AS cnt FROM financial_reports
 WHERE action_code = ? AND
       (pdf_path LIKE ? OR ssc_url LIKE ?)`
```

This check is filename-based, not period-based. This is correct for deduplication purposes
(it matches by filename in the path). No change needed to this specific query.

However, `scanDiskForStrandedPdfs()` introduced above uses `period_type = ?` which is the
correct column (confirmed: `bctc-schema.ts:736` defines `period_type TEXT NOT NULL` storing
"Q1"..."Q4"). The column name `period_type` is correct — do not use `period_quarter` for
`financial_reports` (that column is `INTEGER` and nullable per bctc-schema.ts:734, used for
a different purpose).

---

## Task 1204 — VCB Q1-2025 Corrupted Record Cleanup

### Sub-fix A: Startup migration (infrastructure layer)

Add to `initDatabase()` in `src/infrastructure/db/schema.ts` after the existing migration
blocks:

```typescript
// 079 / Task 1204: Delete corrupted VCB Q1-2025 record (all values = 0)
// Conditional: only deletes if extraction_confidence < 0.1 to avoid
// deleting a valid record if re-parse already ran.
db.prepare(`
  DELETE FROM financial_reports
  WHERE action_code = 'VCB'
    AND period_year = 2025
    AND period_type = 'Q1'
    AND extraction_confidence < 0.1
`).run();
```

This is idempotent: after the row is deleted and re-parsed with `extraction_confidence >= 0.3`,
subsequent server restarts find no row matching `extraction_confidence < 0.1` and do nothing.

### Sub-fix B: Re-parse trigger

After the server restarts with the startup migration applied, the VCB Q1-2025 row is deleted.
The re-parse is triggered automatically by one of two mechanisms (whichever fires first):

1. `bctcReparseJob` disk-scan fallback (Sub-fix C from Task 1196): if `data/pdfs/VCB_2025_Q1.pdf`
   (or equivalent filename) is on disk, the next 09:30 run picks it up.
2. If the PDF is not on disk: add `("VCB", 2025, "Q1")` to the backfill migration in
   `bctc_vps_queue` alongside the Task 1201/1202 backfill. This causes the VPS fetcher to
   download it fresh.

Add VCB Q1 to the backfill array in the startup migration:

```typescript
const BACKFILL_079 = [
  { code: "BID",  year: 2025, quarter: "Q4" },
  { code: "EIB",  year: 2025, quarter: "Q4" },
  { code: "SHB",  year: 2025, quarter: "Q4" },
  { code: "VCB",  year: 2025, quarter: "Q4" },
  { code: "FPT",  year: 2025, quarter: "Q4" },
  { code: "HPG",  year: 2025, quarter: "Q4" },
  { code: "VCB",  year: 2025, quarter: "Q1" },  // Task 1204: re-fetch after deletion
];
```

Using `ON CONFLICT DO UPDATE SET status='pending', attempts=0` ensures this is idempotent.

---

## Interface Contracts

No new exported interfaces. Modified call sites:

### `storeReport()` — new signature (internal to `parseBctcReport.ts`)

```typescript
function storeReport(
  report: FinancialReport,
  validationStatus: string,
  validationNotes: string | null,
  extractionConfidence: number,
): void
```

This function is not exported — the single call site in `parseBctcReport` is updated
simultaneously.

### `scanDiskForStrandedPdfs()` — new export from `bctcReparseJob.ts`

```typescript
export async function scanDiskForStrandedPdfs(db: Database): Promise<StrandedPayload[]>
```

Exported so it can be tested independently with an injected in-memory DB.

### `extractIncomeStatement()` — unchanged signature

The banking pattern is an internal fallback; the exported function type and return type are
unchanged.

---

## Test Plan (TDD — tests must be written first, failing, then fixed)

### `src/__tests__/1193-push-prices-persist.test.ts`

- Mock `getDb()` with Bun SQLite `:memory:`, create `market_prices` and `vps_push_log` tables.
- Call the push handler logic with a valid 3-ticker payload.
- Assert `SELECT COUNT(*) FROM market_prices` returns 3.
- Assert `SELECT status FROM vps_push_log ORDER BY id DESC LIMIT 1` returns `'ok'`.
- Assert `SELECT n FROM (SELECT COUNT(*) AS n FROM market_prices WHERE updated_at >= ?)` returns 3.

### `src/__tests__/1201-bctc-queue-quarter-detection.test.ts`

- Parameterized: for each month 1–12, call the quarter-detection logic and assert the correct
  `{targetYear, targetQuarter}` pair.
- Specific assertion: month=4 (April) must yield `{targetYear: currentYear - 1, targetQuarter: "Q4"}`.
- Assert the backfill upsert is idempotent: calling it twice on the same in-memory DB results
  in exactly 7 rows (6 Q4 + 1 Q1-VCB), not 14.

### `src/__tests__/1196-bctc-reparse-pipeline.test.ts`

- Test `scanDiskForStrandedPdfs()`: inject in-memory DB with one watchlist entry "VNM"; inject
  a fake PDF directory with "VNM_2025_Q4.pdf"; assert function returns one `StrandedPayload`
  for VNM.
- Test disk-scan exclusion: when `financial_reports` already has a row for VNM 2025 Q4, assert
  `scanDiskForStrandedPdfs()` returns empty array.
- Test observability log: spy on `logger.info` and assert `[bctc-reparse-job] starting cycle`
  and `[bctc-reparse-job] cycle complete` are both called with correct field names.

### `src/__tests__/1204-vcb-zero-record-guard.test.ts`

- Call `storeReport()` (by calling `parseBctcReport()`) with raw text that produces all-zero
  extractors (empty string or whitespace-only input).
- Assert `financial_reports` table remains empty after the call.
- Assert WORK-channel mock received a call containing `"Zero-confidence extraction"`.
- Assert calling it again is still safe (idempotent, no crash).

---

## Task Breakdown

Dependency order for Dev:

1. **Task 1193** — server.ts push-prices: add `startMs`, add post-upsert verify SELECT, add
   start/end log context. Write test. Deploy and run diagnostic queries to confirm root cause,
   then proceed.
2. **Task 1201 + 1202** (parallel after 1193 is merged) — server.ts bctc-fetch-queue: replace
   quarter-detection block. Add startup migration for backfill (7 rows). Write parameterized
   test. Deploy, verify queue via curl.
3. **Task 1196** (after 1201/1202) — three sub-fixes in order:
   a. Domain: add banking income-statement patterns to `incomeStatementExtractor.ts`.
   b. Application: add `extractionConfidence` param to `storeReport()`, add zero/low-confidence
      guard with WORK alert.
   c. Scheduler: add start-of-cycle log to `bctcReparseJob.ts`, add `scanDiskForStrandedPdfs()`,
      wire disk-scan fallback path in `runBctcReparseJob()`.
   Write three corresponding test files (one per sub-fix).
4. **Task 1204** (after 1196) — startup migration in `schema.ts` deletes VCB Q1-2025 row if
   confidence < 0.1. Add VCB Q1 to backfill array. Verify via sqlite3 CLI after restart that
   row is gone, then that bctcReparseJob or VPS fetch produces a new row with confidence >= 0.3.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `VPS_PUSH_API_KEY` mismatch prevents diagnosis | Medium | High | Step 1 of 1193 diagnosis checks vps_push_log before any code change |
| Backfill upsert runs on prod with stale 'pending' rows and resets attempts | Low | Low | `DO UPDATE ... WHERE status='failed' OR attempts >= 5` — pending rows untouched |
| Banking income-statement fallback matches wrong line in non-banking PDF | Low | Medium | Pattern "Thu nhập lãi thuần" is unique to banking BCTC; non-banking PDFs never have this line |
| `scanDiskForStrandedPdfs()` uses `period_type` column but `financial_reports` stores `period_type = 'Q1'` (TEXT) while bctc-schema line 734 shows `period_quarter INTEGER NULL` | Medium | High | Verified: `period_type` (TEXT, line 736) is the correct column storing "Q1"–"Q4"; `period_quarter` (INTEGER, line 734) is the numeric quarter index — the query must use `period_type` |
| VCB Q1-2025 startup migration deletes a valid re-parsed row on subsequent restart | Low | Medium | Guard: `AND extraction_confidence < 0.1` — any re-parsed row will have confidence >= 0.3 |
| `storeReport()` dynamic import of telegram in sync function causes unhandled promise | Low | Low | Pattern already used elsewhere in codebase: `void promise.catch(() => {})` |
| July boundary move (Q2→Q1 collection window) causes Q2 gap for one month | Low | Low | Q2 filings are due 30 July; in July the VPS can still fetch Q1 filings (no risk to Q2 data) |

---

## Security Review

- SQL parameterized? Yes — all new queries use `?` or named `$param` bindings. No string interpolation.
- File paths validated (no `../`)? Yes — `scanDiskForStrandedPdfs()` uses `join(process.cwd(), "data", "pdfs")` as the base; `readdirSync` returns filenames only (no path traversal).
- External HTTP rate-limited? N/A — no new external HTTP calls in this sprint.
- Secrets via `Bun.env` only? Yes — `VPS_PUSH_API_KEY` already read from env; no new secrets.
