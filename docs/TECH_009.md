# TECH-009: SSC Puppeteer Tests, Telegram Notifier, Intelligence Cycle

status: APPROVED_BY_ARCHITECT
req_ref: SPRINT_GOAL.md (sprint_id: 009)

---

## Brownfield Impact

**Files modified:**

- `src/infrastructure/config.ts` — add `telegramBotToken` and `telegramChatId` optional fields to `AppConfig`; add `loadTelegramConfig()` helper
- `src/scheduler/jobs.ts` — add `intelligenceCycle` cron entry; remove `newsPoll` cron or demote to off-hours fallback
- `src/application/usecases/checkSscReports.ts` — no code changes; the `listDocsFn` injectable already accepts the new Puppeteer-backed `listSscDocuments` signature, which is unchanged
- `src/interface/mcp/server.ts` — call `registerTelegramTools(server)` in `createMcpServerInstance()`
- `src/interface/mcp/tools/index.ts` — add `registerTelegramTools` re-export

**Files created:**

- `src/infrastructure/notifiers/telegram.ts` — plain-fetch Telegram Bot API wrapper
- `src/interface/mcp/tools/telegramTools.ts` — `send_test_telegram` MCP tool
- `src/scheduler/intelligenceCycleJob.ts` — 15-min/60-min unified cycle
- `src/__tests__/127-puppeteer-ssc-tests.test.ts` — TDD Red: mock-browser SSC scraper tests (20+ cases)
- `src/__tests__/128-telegram-notifier.test.ts` — TDD Red: mock Telegram API tests (15+ cases)
- `src/__tests__/129-intelligence-cycle.test.ts` — TDD Red: mock sub-job cycle tests (15+ cases)

**Files deleted:** none

**Breaking changes:** YES — four existing test files import `HttpClient` and use HTML-mock patterns that no longer match the rewritten `ssc.ts`. See Chain A section for the exact migration plan.

---

## Architecture Decision

Chain A treats `ssc.ts` as already done and only fixes the broken test layer: the new `BrowserFactory`/`SscBrowserPage` interfaces replace the old `HttpClient` interface as the single injection seam, and all four legacy test files must be rewritten to use the mock-browser factory pattern already established in `ssc.ts`.

Chain B places the Telegram notifier strictly in `infrastructure/notifiers/` (no domain imports), wires the alert hook at the application/scheduler boundary only (never inside `alertGenerator.ts`), and exposes a single MCP tool in `interface/mcp/tools/telegramTools.ts` for connectivity verification.

Chain C replaces the 30-min news-only cron with a single `intelligenceCycleJob.ts` that sequences five sub-jobs, enforces a concurrency guard, detects market hours in GMT+7, and runs at 15 min during trading hours or 60 min outside them — keeping `jobs.ts` as the single place that registers all cron expressions.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `AppConfig.telegramBotToken/telegramChatId` | infrastructure | `src/infrastructure/config.ts` | MODIFY |
| `TelegramNotifier` | infrastructure | `src/infrastructure/notifiers/telegram.ts` | NEW |
| `registerTelegramTools` | interface | `src/interface/mcp/tools/telegramTools.ts` | NEW |
| tools barrel re-export | interface | `src/interface/mcp/tools/index.ts` | MODIFY |
| MCP server wiring | interface | `src/interface/mcp/server.ts` | MODIFY |
| `runIntelligenceCycle` | interface/scheduler | `src/scheduler/intelligenceCycleJob.ts` | NEW |
| `CRONS.intelligenceCycle` + wiring | interface/scheduler | `src/scheduler/jobs.ts` | MODIFY |
| TDD Red — SSC Puppeteer | test | `src/__tests__/127-puppeteer-ssc-tests.test.ts` | NEW |
| TDD Red — Telegram | test | `src/__tests__/128-telegram-notifier.test.ts` | NEW |
| TDD Red — cycle | test | `src/__tests__/129-intelligence-cycle.test.ts` | NEW |
| Rewrite broken SSC scraper tests | test | `src/__tests__/029-ssc-scraper.test.ts` | MODIFY |
| Rewrite broken SSC pipeline tests | test | `src/__tests__/048-ssc-pipeline.test.ts` | MODIFY |
| Rewrite broken SSC nightly tests | test | `src/__tests__/104-job-ssc-check.test.ts` | MODIFY |
| Rewrite broken SSC integration tests | test | `src/__tests__/124-test-ssc-pipeline.test.ts` | MODIFY |

---

## Chain A — SSC Puppeteer Test Migration

### Root cause of broken tests

All four test files were written against the old `ssc.ts` which exported an `HttpClient` interface (`{ get(url: string): Promise<string> }`). The rewritten `ssc.ts` no longer exports `HttpClient`. Instead it exports:

```typescript
// src/infrastructure/fetchers/ssc.ts (already in place)
export interface SscBrowserPage { ... }
export interface SscBrowser { newPage(): Promise<SscBrowserPage>; close(): Promise<void> }
export type BrowserFactory = () => Promise<SscBrowser>;

export async function listSscDocuments(
  actionCode: string,
  reportType: "quarterly" | "annual" | "all",
  _year?: number,
  browserFactory?: BrowserFactory,   // ← injection seam
): Promise<SscDocument[]>
```

Additionally, `buildSscSearchUrl` and `parseSscHtml` are exported as `@deprecated` stubs that return empty values (not removed, so importing them does not fail at the TypeScript level, but `parseSscHtml` returns `[]` unconditionally and `buildSscSearchUrl` returns a trivial URL without `type=BCTC` or `year=` params).

### fetchParseAndStoreBctc.ts compile check

`fetchParseAndStoreBctc.ts` imports:
```typescript
import { listSscDocuments } from "../../infrastructure/fetchers/ssc.js";
import type { HttpClient } from "../../infrastructure/fetchers/ssc.js";
```

`HttpClient` is no longer exported from `ssc.ts`. This causes a **compile error**. The `HttpClient` type must be removed from the import and from `FetchParseAndStoreBctcParams.sscHttpClient`. The `sscHttpClient` parameter must be replaced with `sscBrowserFactory?: BrowserFactory`.

### fetchParseAndStoreBctc.ts changes (MODIFY)

**File:** `src/application/usecases/fetchParseAndStoreBctc.ts`

Replace:
```typescript
import type { HttpClient } from "../../infrastructure/fetchers/ssc.js";
// ...
sscHttpClient?: HttpClient;
// ...
const docs = await listSscDocuments(actionCode, "quarterly", year, sscHttpClient);
```

With:
```typescript
import type { BrowserFactory } from "../../infrastructure/fetchers/ssc.js";
// ...
sscBrowserFactory?: BrowserFactory;
// ...
const docs = await listSscDocuments(actionCode, "quarterly", year, sscBrowserFactory);
```

### Mock browser factory pattern for all four test files

The new injection seam is `BrowserFactory`. A mock factory creates a fake `SscBrowser` which creates a fake `SscBrowserPage`. The page's `evaluate()` call must return the same data shape that the real Puppeteer evaluate returns — an array of raw row objects:

```typescript
// Pattern used in ALL four test files

import {
  listSscDocuments,
  type SscDocument,
  type BrowserFactory,
  type SscBrowser,
  type SscBrowserPage,
} from "../infrastructure/fetchers/ssc.js";

/** One raw row as returned by page.evaluate() inside listSscDocuments */
interface RawRow {
  code: string;
  exchange: string;
  title: string;
  company: string;
  description: string;
  date: string;
  downloadId: string;
}

/**
 * Build a BrowserFactory mock that makes page.evaluate() return the given rows.
 * All other page interactions (goto, waitForSelector, click, type, keyboard.press)
 * are no-op stubs that resolve immediately.
 */
function makeMockBrowserFactory(rows: RawRow[]): BrowserFactory {
  return async (): Promise<SscBrowser> => {
    const page: SscBrowserPage = {
      goto: async () => {},
      waitForSelector: async () => {},
      click: async () => {},
      type: async () => {},
      evaluate: async <T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> => {
        // listSscDocuments calls evaluate() twice:
        //   - first call: clicks the search button (returns void, fn has no return value assertion)
        //   - second call: scrapes rows (returns RawRow[])
        // Distinguish by checking whether a targetCode arg is passed.
        if (args.length > 0) {
          // This is the row-scraping call — return the mock rows filtered by actionCode
          const targetCode = args[0] as string;
          return rows.filter((r) => r.code === targetCode) as unknown as T;
        }
        // This is the button-click call — return undefined
        return undefined as unknown as T;
      },
      keyboard: { press: async () => {} },
      on: () => {},
      close: async () => {},
    };

    const browser: SscBrowser = {
      newPage: async () => page,
      close: async () => {},
    };

    return browser;
  };
}

/** BrowserFactory that throws on browser creation — simulates launch failure */
function makeFailingBrowserFactory(): BrowserFactory {
  return async (): Promise<SscBrowser> => {
    throw new Error("Chrome launch failed");
  };
}
```

### Test file migration plan

#### 029-ssc-scraper.test.ts — REWRITE

**Remove:**
- Import of `HttpClient`
- `buildMockHtml()` helper (HTML parsing no longer used)
- `mockClient()` and `failingClient()` helpers

**Replace with:** `makeMockBrowserFactory()` + `makeFailingBrowserFactory()` from the pattern above.

**Test cases to keep (mapped to new mock):**

| Old test | New assertion | Mock setup |
|---|---|---|
| Returns correct docs (quarterly) | `docs.length >= 1` | rows with `code="VCB"`, titles containing "quý" |
| Each doc has title/url/publishedAt/reportType | shape check on `docs[0]` | one row with `downloadId: "dl-001"` |
| URL shape | `doc.url` matches `ssc-adf://dl-001` or empty string | row with `downloadId: "dl-001"` |
| Empty result when no matching rows | `docs.length === 0` | rows with code "OTHER", request for "VCB" |
| Network error returns `[]` | `docs.length === 0`, no throw | `makeFailingBrowserFactory()` |
| Quarterly filter | only quarterly titles returned | mixed rows with quarterly + annual titles |
| Annual filter | only annual/semi-annual titles returned | same mixed rows |
| reportType field = "quarterly" | `doc.reportType === "quarterly"` | quarterly-titled rows |
| reportType field = "annual" | `doc.reportType === "annual"` | annual-titled rows |
| publishedAt is non-empty string | `doc.publishedAt.trim().length > 0` | row with `date: "15/04/2025"` |

**Drop test:** "resolves relative hrefs to absolute URLs" — the Puppeteer implementation does not resolve relative hrefs; `url` is `ssc-adf://<downloadId>` or `""`. Replace with: "url is ssc-adf:// scheme when downloadId present" and "url is empty string when no downloadId".

#### 048-ssc-pipeline.test.ts — MODIFY

The test imports `HttpClient` from `ssc.ts` indirectly via `FetchParseAndStoreBctcParams.sscHttpClient`. After the `fetchParseAndStoreBctc.ts` change above, the parameter name changes from `sscHttpClient` to `sscBrowserFactory`.

**Changes required in test file:**
1. Remove `makeMockSscHttpClient()` and `makeMockPdfHttpClient()` factories.
2. Import `BrowserFactory` from `ssc.js`.
3. Add `makeMockBrowserFactory(rows)` with rows that satisfy the quarterly filter (title contains "quý").
4. Replace all `sscHttpClient: makeMockSscHttpClient()` with `sscBrowserFactory: makeMockBrowserFactory([...])`.
5. The `pdfHttpClient` parameter remains unchanged since `downloadAndExtractPdf` in `pdf.ts` still uses `HttpClient`. Keep `makeMockPdfHttpClient()` only if `pdfTextOverride` is not set. Since all test cases already set `pdfTextOverride`, `pdfHttpClient` can simply be dropped from all call sites.
6. Test case "returns null gracefully when listSscDocuments returns no documents" (test 7): replace `emptyHtmlClient` with `makeMockBrowserFactory([])` (empty rows → `docs.length === 0`).
7. Test case "sscUrl is set to the document URL" (test 9): note that in the new implementation, `ssc-adf://` URLs are what get stored in `report.source.sscUrl`. Update the assertion from `toBe(FAKE_DOC_URL)` to `toBe("ssc-adf://dl-001")` (matching the downloadId in the mock row).

#### 104-job-ssc-check.test.ts — NO CHANGE NEEDED

This test file injects `listDocsFn` directly as `async (code) => [FAKE_SSC_DOC]` — it never calls `listSscDocuments` and never imports `HttpClient`. The import `type { HttpClient }` is not present in this file. No changes required.

#### 124-test-ssc-pipeline.test.ts — REWRITE (most impacted)

This file imports `HttpClient`, `buildSscSearchUrl`, and `parseSscHtml` directly. Two test cases use these deprecated functions in ways that now return wrong results:

- **SSC-11** asserts `buildSscSearchUrl("VCB", 2025)` contains `keyword=VCB`, `type=BCTC`, `year=2025`. The deprecated stub returns `${SSC_URL}?keyword=VCB` — missing `type=BCTC` and `year=2025`. This test will fail.
- **SSC-12** calls `parseSscHtml(html, "quarterly")` expecting to parse 1 doc from malformed HTML. The deprecated stub returns `[]`. This test will fail.

**Changes required:**

1. Remove import of `HttpClient` — replace with `BrowserFactory` import.
2. Remove `makeSscClient()` and `makeFailingHttpClient()` helpers — replace with `makeMockBrowserFactory()` and `makeFailingBrowserFactory()`.
3. Replace all `sscHttpClient: makeSscClient(html)` call sites with `sscBrowserFactory: makeMockBrowserFactory(rowsFor(html))`.
4. Add a `rowsFor(html)` helper or define named row fixtures for each HTML fixture variant.
5. Drop or rewrite SSC-10 (relative href resolution): the Puppeteer implementation does not resolve relative hrefs; `url` is `ssc-adf://` or empty. Rewrite as: "SSC-10: url is empty string when downloadId is absent in row".
6. Rewrite SSC-11: test that `buildSscSearchUrl` (deprecated) returns a string containing the SSC base URL, and separately add a test that `listSscDocuments` with a mock browser returns a doc with `url` matching `ssc-adf://` pattern.
7. Rewrite SSC-12: test that `listSscDocuments` with a factory that returns an empty row array returns `[]` (since `parseSscHtml` is now a no-op stub).
8. Update `sscUrl` assertions from absolute PDF URLs to `ssc-adf://<downloadId>` format.

**Row fixtures to define:**

```typescript
// Maps the old HTML fixture intent to the new mock row format

const ROW_VCB_Q1_2025: RawRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - VCB",
  company: "Vietcombank",
  description: "Báo cáo tài chính quý 1 năm 2025",
  date: "15/04/2025",
  downloadId: "dl-vcb-q1-2025",
};

const ROW_VCB_Q1_V1: RawRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - VCB (Lần 1)",
  company: "Vietcombank",
  description: "",
  date: "15/04/2025",
  downloadId: "dl-vcb-q1-v1",
};

const ROW_VCB_Q1_V2: RawRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - VCB (Lần 2)",
  company: "Vietcombank",
  description: "",
  date: "20/04/2025",
  downloadId: "dl-vcb-q1-v2",
};

const ROW_VCB_ANNUAL: RawRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "Báo cáo tài chính năm 2025 - VCB",
  company: "Vietcombank",
  description: "",
  date: "10/02/2026",
  downloadId: "dl-vcb-annual-2025",
};

const ROW_HPG_RELATIVE: RawRow = {
  code: "HPG",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - HPG",
  company: "Hoa Phat Group",
  description: "",
  date: "01/05/2025",
  downloadId: "",   // empty downloadId → url = ""
};
```

---

## Chain B — Telegram Notifier

### config.ts changes

**File:** `src/infrastructure/config.ts`

Add to `AppConfig`:
```typescript
export interface AppConfig {
  port: number;
  dbPath: string;
  logLevel: LogLevel;
  /** Telegram Bot API token. Empty string when TELEGRAM_BOT_TOKEN is not set. */
  telegramBotToken: string;
  /** Telegram target chat ID. Empty string when TELEGRAM_CHAT_ID is not set. */
  telegramChatId: string;
}
```

Extend `loadConfig()`:
```typescript
export function loadConfig(): AppConfig {
  // ... existing fields ...
  const telegramBotToken = Bun.env["TELEGRAM_BOT_TOKEN"] ?? "";
  const telegramChatId = Bun.env["TELEGRAM_CHAT_ID"] ?? "";
  return { port, dbPath, logLevel, telegramBotToken, telegramChatId };
}
```

Both fields are optional strings that default to `""`. No `AppConfigError` is thrown — missing Telegram config means the notifier silently skips sending.

### telegram.ts

**File:** `src/infrastructure/notifiers/telegram.ts`

```typescript
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Injectable fetch function — defaults to global fetch.
 * Override in tests to avoid real HTTP.
 */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Sends a Markdown-formatted message to the configured Telegram chat.
 * Never throws — returns { ok: false, error } on any failure.
 *
 * @param text    - Message text (Telegram MarkdownV2 format)
 * @param config  - Bot token + chat ID
 * @param fetchFn - Injectable HTTP function (default: global fetch)
 */
export async function sendTelegram(
  text: string,
  config: TelegramConfig,
  fetchFn: FetchFn = fetch,
): Promise<TelegramSendResult>

/**
 * Format an Alert into a Telegram MarkdownV2 message.
 *
 * Format:
 *   *[SEVERITY]* VCB — price_drop
 *   drop of 8.5% detected with 0.87 confidence
 *   2026-03-29 09:15:00
 */
export function formatAlertMessage(alert: Alert): string

/**
 * Send a HIGH or CRITICAL alert to Telegram.
 * Skips silently if config.botToken or config.chatId is empty.
 *
 * @param alert   - The Alert to send
 * @param config  - Telegram credentials
 * @param fetchFn - Injectable HTTP function
 */
export async function notifyTelegramAlert(
  alert: Alert,
  config: TelegramConfig,
  fetchFn?: FetchFn,
): Promise<void>
```

**Implementation notes:**

- `sendTelegram` POSTs to `https://api.telegram.org/bot${config.botToken}/sendMessage` with body `{ chat_id, text, parse_mode: "MarkdownV2" }` as JSON.
- If `config.botToken` or `config.chatId` is empty, log a debug message and return `{ ok: false, error: "not configured" }` without making any HTTP call.
- Wrap the fetch in try/catch; on any error log a warning and return `{ ok: false, error: message }`.
- `notifyTelegramAlert` only calls `sendTelegram` when `alert.severity === "high" || alert.severity === "critical"`.
- `Alert` type is imported: `import type { Alert } from "../../domain/services/alertGenerator.js"` — this is safe because `alertGenerator.ts` is pure domain with no infrastructure imports.

**MarkdownV2 escaping:** The following characters must be escaped with a backslash in MarkdownV2: `_ * [ ] ( ) ~ > # + - = | { } . !`. `formatAlertMessage` must apply this escaping to all dynamic string values (stock code, signal message, timestamp) before embedding them in the template.

### telegramTools.ts

**File:** `src/interface/mcp/tools/telegramTools.ts`

Single tool: `send_test_telegram`

```typescript
export function registerTelegramTools(server: McpServer): void
```

Tool schema:
```
name: "send_test_telegram"
description: "Sends a test message to the configured Telegram chat to verify connectivity."
inputSchema: { message: z.string().optional().default("Test from VN Market Intelligence MCP") }
```

Handler behavior:
1. Load `config.telegramBotToken` and `config.telegramChatId` from `loadConfig()`.
2. Call `sendTelegram(message, { botToken, chatId })`.
3. Return `{ content: [{ type: "text", text: "Telegram test sent" }] }` on success.
4. Return `{ content: [{ type: "text", text: "Telegram not configured or send failed: <error>" }] }` on failure — never throw.

### server.ts changes

In `createMcpServerInstance()`:
```typescript
import { registerTelegramTools } from "./tools/index.js";
// ...
registerTelegramTools(server);
```

This raises `toolCount` from 18 to 19 (current count is 18 after Sprint 008 macro tools).

### Alert hook location

Per the PO locked decision: "alert hook location: alertGenerator.ts calls notifyTelegram(alert) only when severity is HIGH or CRITICAL; notifier is injected as optional dependency to keep domain pure."

The correct DDD interpretation is: `alertGenerator.ts` (domain) must NOT be modified with infrastructure imports. Instead, the hook lives at the **application/scheduler layer** — callers of `generateAlerts()` are responsible for forwarding HIGH/CRITICAL alerts to `notifyTelegramAlert()`.

Concretely:
- `checkSscReports.ts` — after `storeAlertsFn(generatedAlerts)`, add a call to `notifyTelegramAlert` for each HIGH/CRITICAL alert. This is injectable via a new optional `notifyFn?: (alert: Alert) => Promise<void>` parameter in `CheckSscReportsOptions`.
- `pollNews.ts` / `runImpactChain.ts` — similarly, after any `generateAlerts()` call, forward HIGH/CRITICAL alerts to `notifyTelegramAlert`.
- `intelligenceCycleJob.ts` — centralizes this pattern for the new cycle.

---

## Chain C — Intelligence Cycle Job

### intelligenceCycleJob.ts

**File:** `src/scheduler/intelligenceCycleJob.ts`

```typescript
/** Result summary from one intelligence cycle run. */
export interface CycleResult {
  durationMs: number;
  isMarketHours: boolean;
  newsFetched: number;
  sscDocsFound: number;
  pricesFetched: number;
  impactEventsRan: number;
  telegramAlertsSent: number;
  errors: number;
}

/**
 * Injectable sub-jobs for testing.
 * All default to real implementations via dynamic import.
 */
export interface CycleDeps {
  pollNewsFn?: () => Promise<PollNewsResult>;
  listSscDocsFn?: (code: string) => Promise<SscDocument[]>;
  fetchPricesFn?: () => Promise<number>;      // returns count of prices fetched
  runImpactChainFn?: () => Promise<number>;   // returns count of events processed
  sendAlertsFn?: (alerts: Alert[]) => Promise<number>; // returns count sent to Telegram
  getWatchlistCodesFn?: () => Promise<string[]>;
  isMarketHoursFn?: () => boolean;            // injectable for test determinism
}

/**
 * Runs one full intelligence cycle.
 * Call from cron — concurrency guard is enforced at the jobs.ts level.
 */
export async function runIntelligenceCycle(deps?: CycleDeps): Promise<CycleResult>

/**
 * Returns true when the current GMT+7 time is within market hours:
 * Monday–Friday, 09:00–15:30.
 */
export function isMarketHours(): boolean
```

**Cycle sequence (inside `runIntelligenceCycle`):**

```
1. Record startTime = Date.now()
2. Check isMarketHours()
3. Step A: pollNews()         — always (both market + off-hours)
4. IF market hours:
     Step B: listSscDocuments() for each watchlist code (lightweight, no full parse)
     Step C: fetchHosePrices()
     Step D: runImpactChain() on new news entries from step A
     Step E: collect HIGH/CRITICAL alerts → sendTelegramAlerts()
5. Record durationMs = Date.now() - startTime
6. Log warning if durationMs > 12 * 60 * 1000 (12 minutes)
7. Return CycleResult
```

**isMarketHours() implementation:**

```typescript
export function isMarketHours(): boolean {
  // Convert current UTC time to GMT+7
  const now = new Date();
  const gmt7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dayOfWeek = gmt7.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = gmt7.getUTCHours();
  const minute = gmt7.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;

  // Monday=1 through Friday=5
  if (dayOfWeek < 1 || dayOfWeek > 5) return false;
  // 09:00 = 540 min, 15:30 = 930 min
  return totalMinutes >= 540 && totalMinutes <= 930;
}
```

### jobs.ts changes

```typescript
// Add to CRONS:
export const CRONS = {
  morningBriefing:    Bun.env.CRON_MORNING_BRIEFING    ?? "0 8 * * 1-5",
  marketOpen:         Bun.env.CRON_MARKET_OPEN         ?? "0 9 * * 1-5",
  intelligenceCycle:  Bun.env.CRON_INTELLIGENCE_CYCLE  ?? "*/15 * * * *",  // NEW
  marketClose:        Bun.env.CRON_MARKET_CLOSE        ?? "30 15 * * 1-5",
  sscCheck:           Bun.env.CRON_SSC_CHECK           ?? "0 20 * * *",
  eveningSummary:     Bun.env.CRON_EVENING_SUMMARY     ?? "0 22 * * 1-5",
  // newsPoll removed — absorbed into intelligenceCycle
};
```

The `newsPoll` cron entry is removed. `runNewsPoller` is still called but only from inside `runIntelligenceCycle` as step A — it is not independently scheduled.

Add import and registration:
```typescript
import { runIntelligenceCycle } from "./intelligenceCycleJob.js";

// In startScheduler():
cron.schedule(CRONS.intelligenceCycle, async () => {
  await runIntelligenceCycle();
}, { timezone: "Asia/Ho_Chi_Minh" });
```

Remove the existing `newsPoll` cron.schedule call.

**Concurrency guard in jobs.ts:** The 15-min cron can fire while the previous cycle is still running. Enforce the guard at the `intelligenceCycleJob.ts` module level (same pattern as `newsPollerJob.ts`):

```typescript
let cycleRunning = false;

export async function runIntelligenceCycle(deps?: CycleDeps): Promise<CycleResult | null> {
  if (cycleRunning) {
    logger.warn("[intelligence-cycle] previous cycle still running — skipped");
    return null;
  }
  cycleRunning = true;
  try {
    return await _runCycle(deps);
  } finally {
    cycleRunning = false;
  }
}
```

---

## Interface Contracts

### New exports from config.ts

```typescript
// src/infrastructure/config.ts
export interface AppConfig {
  port: number;
  dbPath: string;
  logLevel: LogLevel;
  telegramBotToken: string;   // "" when not configured
  telegramChatId: string;     // "" when not configured
}
```

### New exports from telegram.ts

```typescript
// src/infrastructure/notifiers/telegram.ts
export interface TelegramConfig { botToken: string; chatId: string; }
export interface TelegramSendResult { ok: boolean; error?: string; }
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export async function sendTelegram(text: string, config: TelegramConfig, fetchFn?: FetchFn): Promise<TelegramSendResult>
export function formatAlertMessage(alert: Alert): string
export async function notifyTelegramAlert(alert: Alert, config: TelegramConfig, fetchFn?: FetchFn): Promise<void>
```

### New exports from intelligenceCycleJob.ts

```typescript
// src/scheduler/intelligenceCycleJob.ts
export interface CycleResult { durationMs: number; isMarketHours: boolean; newsFetched: number; sscDocsFound: number; pricesFetched: number; impactEventsRan: number; telegramAlertsSent: number; errors: number; }
export interface CycleDeps { pollNewsFn?; listSscDocsFn?; fetchPricesFn?; runImpactChainFn?; sendAlertsFn?; getWatchlistCodesFn?; isMarketHoursFn?; }
export async function runIntelligenceCycle(deps?: CycleDeps): Promise<CycleResult | null>
export function isMarketHours(): boolean
```

### New export from telegramTools.ts

```typescript
// src/interface/mcp/tools/telegramTools.ts
export function registerTelegramTools(server: McpServer): void
```

---

## Task Breakdown (for PM)

Suggested atomic tasks in dependency order:

| Task # | Title | Depends on | Layer |
|---|---|---|---|
| 127 | TDD Red — write failing Puppeteer mock tests (min 20 cases) | ssc.ts already rewritten | test |
| 128 | TDD Red — write failing Telegram notifier tests (min 15 cases) | nothing | test |
| 129 | TDD Red — write failing intelligence cycle tests (min 15 cases) | nothing | test |
| 031 | Fix broken SSC test files (029, 048, 124) + fix fetchParseAndStoreBctc.ts compile error; 127 tests must go GREEN | 127 | infra+test |
| 034 | Implement telegram.ts + telegramTools.ts + config.ts changes + wire server.ts; 128 tests must go GREEN | 128 | infra+interface |
| 032 | Add `listAllSscDocuments` (fan-out across 4 categories); 127 additional tests must pass | 031 | infra |
| 033 | Wire updated SSC fetcher into sscCheckerJob + checkSscReports; fix 104-job-ssc-check.test.ts | 032 | app+scheduler |
| 106 | Implement intelligenceCycleJob.ts + update jobs.ts; 129 tests must go GREEN | 033 + 034 | scheduler |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `fetchParseAndStoreBctc.ts` uses `sscHttpClient` param — callers (reports MCP tool, sscCheckerJob) also pass this param and must be updated | High | High | Search all callers with `grep -r sscHttpClient src/` before implementing task 031; update each call site to `sscBrowserFactory` |
| 124 test file asserts `sscUrl` equals an absolute PDF URL — Puppeteer implementation stores `ssc-adf://` pseudo-URLs | High | Medium | Update all `report.source.sscUrl` assertions to match `ssc-adf://` scheme or empty string |
| SSC-11 and SSC-12 in 124-test-ssc-pipeline.test.ts test deprecated functions that now return wrong values | High | Medium | Rewrite both test cases as specified in Chain A section |
| Telegram MarkdownV2 special characters in stock names or messages cause parse errors | Medium | Low | `formatAlertMessage` must escape all dynamic values; add dedicated test cases for messages containing `.`, `-`, `(`, `)` |
| Chrome process leak if `browser.close()` is not called in all paths | Medium | High | Already mitigated in ssc.ts via `finally { browser.close() }` — verify test mocks also call `close()` by spying on it |
| 15-min intelligence cycle overlaps with 09:00 market open scan job — both may call `fetchHosePrices` simultaneously | Low | Medium | Document the overlap in jobs.ts comment; the market scan job is an independent cron — no shared state, concurrent reads are safe for HOSE API |
| `notifyTelegramAlert` called with empty botToken at startup during tests | Low | Low | Notifier silently returns `{ ok: false }` when token is empty — no network call made |

---

## Security Review

- [ ] SQL parameterized? Yes — no new raw SQL; all DB access through existing parameterized helpers
- [ ] File paths validated (no `../`)? N/A — no new file path handling
- [ ] External HTTP rate-limited? Partial — Telegram API has generous rate limits (30 msg/s); the cycle sends at most one message per alert per cycle. SSC Puppeteer already implements a 5 s wait. No explicit rate-limiter added; acceptable for single-user deployment.
- [ ] Secrets via Bun.env only? Yes — `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are read exclusively from `Bun.env` in `config.ts`; never hardcoded or logged.
- [ ] Telegram token exposed in logs? No — `sendTelegram` must not log the token; log only the chat ID (not a secret).
