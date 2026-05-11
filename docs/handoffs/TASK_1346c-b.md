# TASK_1346c-b: Alert + Infrastructure Quality — NER Suffix Wiring + Feedback Retry + Unknown Stock Code

**Task:** 1346c-b
**Sprint:** 1346
**Developer:** Dev B
**Related Reports:** [1311, 1317, 1313]
**Dependencies:** None (parallelizable with 1346c-a, 1346d)
**WIP Limit:** Part of 3-developer parallel batch (max 2 In Progress)

---

## Summary

Three bugs spanning application (news pipeline) and infrastructure (signal store, feedback channel):

1. **Bug 1311**: DirectCodeNER suffix matching — MSN source attribution not stripped before ticker detection
2. **Bug 1317**: submit_feedback BUG channel retry — Telegram failures silently swallowed, no retry
3. **Bug 1313**: stock_code="unknown" breaking chain grouping — null/unknown values leaked into signal chains

**Rationale:** Bugs 1311 and 1313 both touch the signal pipeline (news ingestion → signal grouping). Bug 1317 touches feedback infrastructure (Telegram reliability). Developer familiar with signal routing handles all three efficiently.

---

## Bug 1311: DirectCodeNER Suffix Matching (MSN source attribution)

### Root Cause

File: `apps/mcp-server/src/domain/services/stockAliases.ts` (lines 815–826)

The function `stripSourceAttributionSuffix` already exists and is correctly implemented:
```typescript
function stripSourceAttributionSuffix(text: string): string {
  // Strips " - TOKEN" when TOKEN is 2–5 chars OR in KNOWN_NEWS_SOURCES
}
```

**The missing wiring:** The function is defined but NOT called in the news ingestion pipeline before ticker matching.

**Broken sequence (currently):**
1. `pollNews.ts` fetches headlines (e.g., `"Vietnam stocks rally - MSN"`)
2. Passes headline directly to `detectStocksInText`
3. MSN is treated as ticker code
4. False MSN stock alert generated

**Correct sequence (required):**
1. Fetch headline
2. **Call `stripSourceAttributionSuffix(headline)` first**
3. Trim result: `"Vietnam stocks rally"`
4. Pass cleaned headline to `detectStocksInText`
5. MSN not detected as ticker

### Files to Verify and Fix

**File 1:** `apps/mcp-server/src/application/usecases/pollNews.ts`
- Locate all calls to `detectStocksInText` on article headlines (search: `detectStocksInText`)
- Insert `stripSourceAttributionSuffix(headline)` before the call
- Example fix location (lines TBD, search for headline detection):
  ```typescript
  // BEFORE:
  const tickers = detectStocksInText(article.headline, watchlistCodes);

  // AFTER:
  const cleanHeadline = stripSourceAttributionSuffix(article.headline);
  const tickers = detectStocksInText(cleanHeadline, watchlistCodes);
  ```

**File 2:** `apps/mcp-server/src/application/cascadeExecutor.ts`
- Same check: search for `detectStocksInText` calls on headlines
- Verify call order: `stripSourceAttributionSuffix` → `detectStocksInText`

**Import requirement:**
```typescript
import { stripSourceAttributionSuffix } from "../../domain/services/stockAliases";
```

DDD note: `stripSourceAttributionSuffix` lives correctly in `domain/services/`. Application layer importing from domain is permitted.

### Test File

**Integration test** in existing `pollNews.test.ts` or new file `1311-msn-source-suffix.test.ts`:

**Test case:**
```typescript
it("should not trigger MSN stock alert for 'Vietnam rally - MSN' headline", async () => {
  // Mock fetcher to return headline with source suffix
  mockFetcher.newsArticles = [
    {
      headline: "Vietnam stocks rally - MSN",
      source: "MSN",
      timestamp: new Date().toISOString(),
    }
  ];

  // Mock watchlist: no MSN ticker
  const watchlistCodes = ["VNM", "VIC", "VJC"];

  // Run pollNews pipeline
  const signals = await pollNews({ watchlistCodes, ...mockContext });

  // Assert: no MSN ticker alert generated
  const msnSignals = signals.filter(s => s.stockCode === "MSN");
  assert(msnSignals.length === 0);

  // Verify: "Vietnam stocks rally" still triggers if VNM is in watchlist
  // (depends on content, but suffix must be stripped)
});
```

**Red test (before fix):**
- Headline: `"Vietnam rally - MSN"`, watchlist: `["VNM"]`
- Current behavior: MSN alert generated (incorrect)
- After fix: No MSN alert (correct)

---

## Bug 1317: submit_feedback BUG Channel Retry

### Root Cause

File: `apps/mcp-server/src/interface/mcp/tools/system/feedbackTools.ts`, lines 62–82

```typescript
try {
  msgId = await sendTelegramBug(msg);
} catch {
  // best-effort, silently swallowed
}
```

Any transient error (429 rate limit, 503 service unavailable, ECONNRESET) is swallowed. `msgId` stays 0, caller sees `"BUG channel: failed"` but no retry occurs.

### Fix

**File:** `apps/mcp-server/src/interface/mcp/tools/system/feedbackTools.ts`
**Lines:** 62–82

Add retry wrapper around `sendTelegramBug(msg)` with 1 retry + 2s delay:

```typescript
// Add helper (top of file, after imports):
async function retryOnTransient<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      const isTransient =
        (e instanceof Error &&
         (e.message.includes("ECONNRESET") ||
          e.message.includes("ETIMEDOUT") ||
          e.message.includes("429") ||
          e.message.includes("503")));

      if (!isTransient || attempt === maxRetries) {
        throw e;
      }

      logger.warn("[feedback] Telegram send failed, retrying...", {
        attempt: attempt + 1,
        error: e instanceof Error ? e.message : String(e),
        delayMs,
      });

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error("Unknown error");
}

// Replace line 81:
// msgId = await sendTelegramBug(msg);
// With:
msgId = await retryOnTransient(() => sendTelegramBug(msg), 1, 2000);
```

Alternative: If `infrastructure/resilience.ts` already exports a retry helper, import and use it instead.

### Test File

Create: `apps/mcp-server/src/__tests__/1317-feedback-retry.test.ts`

**Test cases:**

1. **Transient failure → retry succeeds:**
   ```typescript
   it("should retry once on transient Telegram failure", async () => {
     let attemptCount = 0;
     const mockSendTelegramBug = jest.fn(async () => {
       attemptCount++;
       if (attemptCount === 1) {
         throw new Error("ECONNRESET");
       }
       return 42; // msgId
     });

     const result = await retryOnTransient(
       mockSendTelegramBug,
       1,
       100  // short delay for test
     );

     assert(result === 42);
     assert(mockSendTelegramBug.mock.calls.length === 2); // called twice
   });
   ```

2. **Persistent failure → graceful (all retries exhausted):**
   ```typescript
   it("should return graceful message when all retries fail", async () => {
     const mockSendTelegramBug = jest.fn(async () => {
       throw new Error("503 Service Unavailable");
     });

     try {
       await retryOnTransient(mockSendTelegramBug, 1, 100);
       assert(false, "should have thrown");
     } catch (e) {
       assert((e as Error).message.includes("503"));
     }

     assert(mockSendTelegramBug.mock.calls.length === 2); // attempt 1 + retry
   });
   ```

3. **Non-transient error → fail immediately:**
   ```typescript
   it("should not retry on non-transient errors", async () => {
     const mockSendTelegramBug = jest.fn(async () => {
       throw new Error("Invalid token");  // not transient
     });

     try {
       await retryOnTransient(mockSendTelegramBug, 1, 100);
       assert(false);
     } catch (e) {
       assert((e as Error).message.includes("Invalid token"));
     }

     assert(mockSendTelegramBug.mock.calls.length === 1); // no retry
   });
   ```

4. **Integration: submit_feedback call:**
   ```typescript
   it("submit_feedback should retry Telegram send on transient failure", async () => {
     // Mock sendTelegramBug to fail once, then succeed
     // Call submit_feedback tool
     // Assert: msgId > 0, no unhandled exception
   });
   ```

---

## Bug 1313: stock_code="unknown" Breaking Chain Grouping

### Root Cause

File: `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`, line 277

```typescript
!stockCode || stockCode === "unknown" ? null : stockCode;
```

The normalization in `postSignal` already converts `"unknown"` → `NULL` (added in task 1334). However:

1. **Stale data:** Existing DB rows with `stock_code = 'unknown'` (pre-1334 data) still exist and break historical chain queries
2. **SQL filter gap:** `getChainFindings` SQL does not filter `WHERE stock_code IS NOT NULL`, relying on application-level guard at `intelligenceCycleJob.ts` line 1145: `if (!f.stockCode) continue;`
3. **Defense in depth:** If guard is missed elsewhere, nulls still leak into chain synthesis

### Fix

**File:** `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`

**Fix 1: Add SQL filter to `getChainFindings` (around line 808)**

Locate the SQL query in `getChainFindings` and add `AND stock_code IS NOT NULL`:

```typescript
// BEFORE:
const query = `
  SELECT * FROM agent_signals
  WHERE cycle_id = ?
  ORDER BY created_at DESC
`;

// AFTER:
const query = `
  SELECT * FROM agent_signals
  WHERE cycle_id = ? AND stock_code IS NOT NULL
  ORDER BY created_at DESC
`;
```

**Fix 2: Add data migration helper**

Add function at end of file (before export):

```typescript
export async function migrateUnknownStockCodes(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE agent_signals SET stock_code = NULL WHERE stock_code = 'unknown'`,
      (err) => {
        if (err) {
          logger.error("[migration] Failed to migrate unknown stock codes", { error: err.message });
          reject(err);
        } else {
          logger.info("[migration] Migrated unknown stock codes to NULL");
          resolve();
        }
      }
    );
  });
}
```

Call this once at startup (e.g., in `intelligence-cycle-job.ts` initialization or a dedicated migration script).

**Fix 3: Audit call sites for explicit `stockCode: "unknown"`**

Search entire `apps/mcp-server/src` for:
```
stockCode: "unknown"
```

Replace with:
```
stockCode: null
```

or

```
stockCode: "MARKET"  // for market-wide signals
```

Example locations (verify):
- `signalBuilders.ts` (if any builder hard-codes "unknown")
- `agentSignalStore.ts` test fixtures
- Any cascading signal generators

### Test File

Create: `apps/mcp-server/src/__tests__/1313-unknown-stock-chain.test.ts`

**Test cases:**

1. **getChainFindings excludes unknown/null:**
   ```typescript
   it("should exclude null/unknown stock_code from chain findings", async () => {
     const db = new Database(":memory:");
     setupSchema(db);  // Create agent_signals table

     // Insert signals: 1 with code, 1 with null, 1 with "unknown"
     db.run(
       `INSERT INTO agent_signals (cycle_id, stock_code, signal, ...)
        VALUES (1, 'VNM', '...', ...),
               (1, NULL, '...', ...),
               (1, 'unknown', '...', ...)`
     );

     const findings = agentSignalStore.getChainFindings(db, 1);

     // Should return only VNM signal
     assert(findings.length === 1);
     assert(findings[0].stockCode === "VNM");
   });
   ```

2. **postSignal normalizes "unknown" → null:**
   ```typescript
   it("should normalize stockCode='unknown' to NULL on insert", async () => {
     const db = new Database(":memory:");
     setupSchema(db);

     agentSignalStore.postSignal(db, {
       cycleId: 1,
       stockCode: "unknown",  // explicitly pass "unknown"
       signal: "test",
       ...
     });

     const row = db.prepare(
       `SELECT stock_code FROM agent_signals WHERE cycle_id = 1`
     ).get();

     assert(row.stock_code === null);
   });
   ```

3. **Data migration cleans up pre-1334 rows:**
   ```typescript
   it("should migrate existing 'unknown' rows to NULL", async () => {
     const db = new Database(":memory:");
     setupSchema(db);

     // Pre-1334 data: insert with 'unknown' directly
     db.run(
       `INSERT INTO agent_signals (cycle_id, stock_code, signal, ...)
        VALUES (1, 'unknown', '...', ...),
               (1, 'unknown', '...', ...)`
     );

     // Run migration
     await agentSignalStore.migrateUnknownStockCodes(db);

     // Verify all 'unknown' → null
     const rows = db.prepare(
       `SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code = 'unknown'`
     ).get();

     assert(rows.cnt === 0);

     const nullRows = db.prepare(
       `SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code IS NULL`
     ).get();

     assert(nullRows.cnt === 2);
   });
   ```

4. **Integration: chain synthesis skips nulls:**
   ```typescript
   it("should not group null stock_code in chain synthesis", async () => {
     // Run full intelligence cycle with mixed signals (some null codes)
     // Assert: final chains do not include null entries
     // Assert: byStock grouping excludes null keys
   });
   ```

---

## Acceptance Criteria

- [ ] **1311 resolved:** `stripSourceAttributionSuffix` called before `detectStocksInText` in both `pollNews.ts` and `cascadeExecutor.ts`
- [ ] **1311 test:** Red test confirms headline `"Vietnam rally - MSN"` no longer triggers MSN alert
- [ ] **1317 resolved:** `submit_feedback` retries once on transient Telegram errors (429, 503, ECONNRESET) with 2s delay
- [ ] **1317 test:** Fail-once → retry succeeds; fail-all → graceful error; non-transient → no retry
- [ ] **1313 resolved:** `getChainFindings` SQL includes `AND stock_code IS NOT NULL`; `postSignal` normalizes "unknown" → NULL; migration helper added
- [ ] **1313 audit complete:** No explicit `stockCode: "unknown"` calls remain in codebase
- [ ] **1313 test:** getChainFindings excludes null/unknown; migration cleans pre-1334 rows; synthesis skips nulls
- [ ] **All baseline tests pass:** `bun test` reports 7371+ passing (no regression from 1344+1345)

---

## Test Execution

1. Create test files:
   - `1311-msn-source-suffix.test.ts` (integration in pollNews pipeline)
   - `1317-feedback-retry.test.ts` (unit test for retry logic + integration)
   - `1313-unknown-stock-chain.test.ts` (unit + integration)

2. Run targeted: `bun test -- --files "**/1311-*.test.ts" --files "**/1317-*.test.ts" --files "**/1313-*.test.ts"`

3. Run full suite: `bun test` (verify all 7371+ baseline tests pass)

4. **Code audit:** Search and replace all `stockCode: "unknown"` instances

---

## Branch + PR

- **Branch:** `task/1346c-b-ner-feedback-unknown-stock`
- **Commits:**
  1. `fix(1311): call stripSourceAttributionSuffix before detectStocksInText`
  2. `fix(1317): add retry wrapper for Telegram BUG channel send`
  3. `fix(1313): add SQL filter + migration for unknown stock_code`
  4. `test(1311-1317-1313): comprehensive unit + integration tests`

---

## Handoff Complete

TASK_1346c-b ready for development. No blockers. Parallelizable with 1346c-a and 1346d.

---

## [QA] Review Record — 2026-04-27

**Reviewer:** QA agent
**Verdict:** APPROVED

### Test Results
- Targeted (24 new): 24 pass / 0 fail
- Full suite: 7382 pass / 73 fail (73 = pre-existing sprint-1345 baseline, 0 regression)
- TypeScript: 0 errors

### DDD: PASS
- newsNormalizer.ts (domain/services): no infrastructure/ or application/ imports
- All three modified files comply with layer rules

### Security: PASS
- No process.env, no hardcoded secrets, SQL parameterized

### Merge
- Merged to main via no-ff merge commit
- Branch task/1346c-b-ner-feedback-stockcode deleted
- Reports 1311, 1317, 1313 closed via log_fix + process_telegram_report
