# TECH-068: MARKET Message Quality Review System

status: APPROVED_BY_ARCHITECT
req_ref: REQ-068

---

## Brownfield Impact

- Files modified:
  - `src/infrastructure/db/schema.ts` — add `market_messages` DDL inside `initDatabase()`
  - `src/infrastructure/notifiers/telegram.ts` — extend `SendTelegramOptions`, modify `sendTelegramMarket()`, update `sendTelegram()` alias and `notifyTelegramAlert()`
  - `src/scheduler/morningBriefingJob.ts` — pass `persist` metadata
  - `src/scheduler/eveningSummaryJob.ts` — pass `persist` metadata
  - `src/scheduler/alertDigestJob.ts` — pass `persist` metadata (via `sendTelegram` alias update)
  - `src/scheduler/franceSummaryJob.ts` — pass `persist` metadata
  - `src/scheduler/patternWatchJob.ts` — pass `persist` metadata + ticker extraction
  - `src/scheduler/calibrationReportJob.ts` — pass `persist` metadata on the MARKET send path
  - `src/scheduler/weeklyPortfolioReportJob.ts` — pass `persist` metadata
  - `src/scheduler/weatherCheckJob.ts` — pass `persist` metadata
  - `src/interface/mcp/tools/telegramTools.ts` — pass `persist` metadata on the MARKET branch
  - `src/interface/mcp/server.ts` — pass `persist` metadata at the three `sendTelegramMarket` call sites
  - `src/interface/mcp/tools/registry.ts` — add `registerMarketMessageTools` entry
  - `docs/data/project-stats.json` — advance `currentSprint` to 68
- Files created:
  - `src/infrastructure/db/marketMessageStore.ts` — insert/query helpers + type registries
  - `src/interface/mcp/tools/marketMessageTools.ts` — two new MCP tools
  - `src/__tests__/1163-market-message-review.test.ts` — TDD test suite
- Files deleted: none
- Breaking changes: no — `persist` is an optional field appended to the existing `SendTelegramOptions`-extended type. All existing call sites continue to compile and behave identically without modification. TypeScript structural typing guarantees no call site breakage.

---

## Architecture Decision

The existing `sendTelegramBug()` function in `telegram.ts` already demonstrates the exact pattern this feature requires: call `coreSend()`, then on success do a best-effort `getDb()` + store helper call, wrapped in try/catch with a `log.warn` on failure. `sendTelegramMarket()` will follow this identical pattern, delegating persistence to a new `marketMessageStore.ts` module that mirrors `telegramReportStore.ts` in structure. The two new MCP tools follow the `calibrationTools.ts` pattern: import the db-injectable store functions, import `getDb()` from `schema.ts`, and register with `server.tool()`. No new ports or domain services are required — this is a pure infrastructure + interface addition with no domain layer involvement.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `market_messages` DDL (table + 4 indexes) | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `MarketMessageAgent` union type | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW |
| `MarketMessageType` union type | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW |
| `MarketMessageRow` interface | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW |
| `insertMarketMessage()` | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW |
| `getUnreviewedMarketMessages()` | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW |
| `reviewMarketMessage()` | infrastructure | `src/infrastructure/db/marketMessageStore.ts` | NEW |
| `sendTelegramMarket()` extension (persist option) | infrastructure | `src/infrastructure/notifiers/telegram.ts` | MODIFY |
| `sendTelegram()` alias update | infrastructure | `src/infrastructure/notifiers/telegram.ts` | MODIFY |
| `notifyTelegramAlert()` update | infrastructure | `src/infrastructure/notifiers/telegram.ts` | MODIFY |
| `TelegramNotifier` interface update | infrastructure | `src/infrastructure/notifiers/telegram.ts` | MODIFY |
| Call site metadata (10 files) | scheduler/interface | see call-site table below | MODIFY |
| `get_unreviewed_market_messages` MCP tool | interface | `src/interface/mcp/tools/marketMessageTools.ts` | NEW |
| `review_market_message` MCP tool | interface | `src/interface/mcp/tools/marketMessageTools.ts` | NEW |
| `registerMarketMessageTools` | interface | `src/interface/mcp/tools/registry.ts` | MODIFY |
| Test suite | tests | `src/__tests__/1163-market-message-review.test.ts` | NEW |

---

## Interface Contracts

### market_messages DDL (add to `initDatabase()` in `schema.ts`)

Add after the last existing `db.exec()` block, following the established pattern of a comment banner preceding each table section:

```sql
-- ── Market Messages (Sprint 068) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent   TEXT    NOT NULL,
  message_type TEXT    NOT NULL,
  ticker       TEXT,
  content      TEXT    NOT NULL,
  sent_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  verdict      TEXT,
  verdict_note TEXT,
  reviewed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_mm_sent_at    ON market_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_mm_from_agent ON market_messages(from_agent);
CREATE INDEX IF NOT EXISTS idx_mm_verdict    ON market_messages(verdict);
CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker);
```

The `schema.ts` header comment block listing all tables must also be updated to include `market_messages`.

### `marketMessageStore.ts` — complete public surface

```typescript
// src/infrastructure/db/marketMessageStore.ts

export type MarketMessageAgent =
  | "morning-briefing"
  | "evening-summary"
  | "alert-commander"
  | "alert-digest"
  | "france-summary"
  | "pattern-watch"
  | "calibration-report"
  | "prediction-market"
  | "weather-check"
  | "weekly-portfolio"
  | "mcp-user"
  | "unknown";

export type MarketMessageType =
  | "morning_briefing"
  | "evening_summary"
  | "alert"
  | "alert_digest"
  | "france_summary"
  | "pattern_watch"
  | "calibration_report"
  | "prediction_signal"
  | "weather"
  | "weekly_portfolio"
  | "user_ask_reply"
  | "unknown";

export interface MarketMessageRow {
  id: number;
  from_agent: string;
  message_type: string;
  ticker: string | null;
  content: string;
  sent_at: string;
  verdict: string | null;
  verdict_note: string | null;
  reviewed_at: string | null;
}

export function insertMarketMessage(
  db: Database,
  params: {
    from_agent: MarketMessageAgent | string;
    message_type: MarketMessageType | string;
    ticker?: string | null;
    content: string;
  },
): number  // inserted rowid, or 0 on failure

export function getUnreviewedMarketMessages(
  db: Database,
  limit?: number,       // default 20, clamped 1-100
  ticker?: string | null,
): MarketMessageRow[]

export function reviewMarketMessage(
  db: Database,
  id: number,
  verdict: "signal" | "noise",
  note?: string | null,
): boolean  // true = row found and updated, false = id not found
```

`insertMarketMessage` implementation notes:
- Wrapped entirely in try/catch. Returns `0` on any exception.
- Validates `verdict` is `"signal"` or `"noise"` inside `reviewMarketMessage`; throws `Error("Invalid verdict")` for any other value. This guards against callers that bypass Zod.
- Uses `db.prepare(...).run(...)` for INSERT. The rowid is obtained via `db.prepare(...).run(...).lastInsertRowid` (Bun sqlite returns this on the statement run result).

### `sendTelegramMarket()` updated signature

```typescript
// Extend SendTelegramOptions in-place (backward compatible):
export interface SendTelegramOptions {
  parseMode?: string;
  fetchFn?: FetchFn;
  chatId?: number;
  persist?: {
    from_agent?: MarketMessageAgent | string;
    message_type?: MarketMessageType | string;
    ticker?: string | null;
  };
}

export async function sendTelegramMarket(
  text: string,
  options: SendTelegramOptions = {},
): Promise<boolean>
```

The `persist` field is added directly to the existing `SendTelegramOptions` interface rather than creating a separate options type. This is the minimal-diff approach: one new optional field on an existing exported interface, zero breaking changes.

Implementation of the post-send persist block (inserted after `const result = await coreSend(...)`):

```typescript
if (result.ok) {
  try {
    const db = getDb();
    insertMarketMessage(db, {
      from_agent: options.persist?.from_agent ?? "unknown",
      message_type: options.persist?.message_type ?? "unknown",
      ticker: options.persist?.ticker ?? null,
      content: text,
    });
  } catch (persistErr) {
    log.warn("[telegram] insertMarketMessage failed — message was sent but not persisted", {
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  }
}
return result.ok;
```

`insertMarketMessage` itself is already wrapped in try/catch and returns `0` on failure — the outer try/catch in `sendTelegramMarket` is a defence-in-depth guard for unexpected errors (e.g. `getDb()` throws before `insertMarketMessage` is even called).

### `TelegramNotifier` interface update

The `TelegramNotifier` interface exported from `telegram.ts` must reflect the updated `sendTelegramMarket` signature:

```typescript
export interface TelegramNotifier {
  sendTelegramMarket(text: string, options?: SendTelegramOptions): Promise<boolean>;
  // ... rest unchanged
}
```

Because `persist` is added to `SendTelegramOptions` (not a separate parameter), the interface method signature stays the same. No implementors break.

### `sendTelegram()` alias update

The `sendTelegram` convenience alias used by `alertDigestJob.ts` currently calls `sendTelegramMarket(text)` with no options. It must be updated to pass `persist`:

```typescript
export async function sendTelegram(text: string): Promise<boolean> {
  return sendTelegramMarket(text, {
    persist: { from_agent: "alert-digest", message_type: "alert_digest" },
  });
}
```

### `notifyTelegramAlert()` update

`notifyTelegramAlert` already has the `Alert` object, so it can extract `ticker` directly:

```typescript
// Replace the existing sendTelegramMarket call at the bottom of notifyTelegramAlert:
const sendOpts: SendTelegramOptions = {
  parseMode: "",
  persist: {
    from_agent: "alert-commander",
    message_type: "alert",
    ticker: alert.actionCode,
  },
};
if (options.fetchFn !== undefined) sendOpts.fetchFn = options.fetchFn;
return sendTelegramMarket(text, sendOpts);
```

### `marketMessageTools.ts` — tool registration function

```typescript
export function registerMarketMessageTools(server: McpServer): void {
  // registers: get_unreviewed_market_messages, review_market_message
}
```

Both tools call `getDb()` at invocation time (lazy, not at registration time) to match the pattern used by `calibrationTools.ts` and `insiderTools.ts`.

---

## Call Site Migration Plan

All 10 call sites pass `persist` through the options object. None require signature changes to their enclosing functions (callers remain structurally identical — they just add the `persist` field to the options literal they already pass).

| File | Change required | from_agent | message_type | ticker |
|---|---|---|---|---|
| `morningBriefingJob.ts` line 256/259 | add `persist` to options | `"morning-briefing"` | `"morning_briefing"` | `null` |
| `eveningSummaryJob.ts` line 118 | add `persist` to options | `"evening-summary"` | `"evening_summary"` | `null` |
| `intelligenceCycleJob.ts` via `notifyTelegramAlert` | handled by `notifyTelegramAlert` update — no direct call site change | `"alert-commander"` | `"alert"` | `alert.actionCode` |
| `alertDigestJob.ts` | handled by `sendTelegram` alias update — no direct call site change | `"alert-digest"` | `"alert_digest"` | `null` |
| `franceSummaryJob.ts` line 131 | add `persist` to options (or call `sendTelegramMarket` with options) | `"france-summary"` | `"france_summary"` | `null` |
| `patternWatchJob.ts` line 113 | add `persist` to options; extract ticker via regex before the send call | `"pattern-watch"` | `"pattern_watch"` | first `/^[A-Z]{2,4}$/` word or `null` |
| `calibrationReportJob.ts` line 370 | add `persist` to options | `"calibration-report"` | `"calibration_report"` | `null` |
| `weeklyPortfolioReportJob.ts` line 288 | add `persist` to options | `"weekly-portfolio"` | `"weekly_portfolio"` | `null` |
| `weatherCheckJob.ts` line 164 | add `persist` to options | `"weather-check"` | `"weather"` | `null` |
| `telegramTools.ts` line 52 | add `persist` to options on the `market` branch | `"mcp-user"` | `"user_ask_reply"` | `null` |
| `server.ts` lines 318, 562, 599 | add `persist` to options at each call site | `"mcp-user"` | `"user_ask_reply"` | `null` |

**Ticker extraction for `patternWatchJob.ts`:**

```typescript
// Before the sendTelegramMarket call, extract ticker from message:
const tickerMatch = message.match(/\b([A-Z]{2,4})\b/);
const patternTicker = tickerMatch ? tickerMatch[1] : null;
await sendTelegramMarket(message, {
  parseMode: "",
  persist: { from_agent: "pattern-watch", message_type: "pattern_watch", ticker: patternTicker },
});
```

**Note on `morningBriefingJob.ts` chunking:** Lines 256/259 split a long briefing into chunks via a manual `MAX_CHUNK` loop. The `content` stored in `market_messages` must be the full pre-split `text`, not per-chunk slices. The existing call at line 256 sends the full text when it fits in one chunk; line 259 sends a slice. The correct approach is to persist once before the chunking loop using `insertMarketMessage` directly, or restructure so only the first call carries `persist` and subsequent chunk calls do not. Recommended: call `insertMarketMessage` once with the full `text` before the chunk loop, bypassing `sendTelegramMarket`'s auto-persist for this specific call site. This is the only call site where the "full text before split" requirement creates a structural tension. The Developer must note this in the task.

---

## Test Strategy (TDD)

Test file: `src/__tests__/1163-market-message-review.test.ts`

All tests use `process.env["DB_PATH"] = ":memory:"` set before any import, `closeDb()` in `afterAll`, and `initDatabase()` in `beforeAll`. This matches the established pattern in `002-db-schema.test.ts` and `188-alert-digest.test.ts`.

### Test groups and mapping to ACs

| Test group | ACs covered | What is tested |
|---|---|---|
| `market_messages table creation` | AC-1 | `PRAGMA table_info` returns 9 columns; `PRAGMA index_list` returns 4 indexes; second `initDatabase()` call does not throw |
| `insertMarketMessage` | AC-2 | Insert returns id >= 1; SELECT returns correct row with null verdict/reviewed_at; `sent_at` is valid datetime string |
| `getUnreviewedMarketMessages` ordering | AC-5 | 3 rows inserted (2 unreviewed, 1 reviewed); query returns 2 rows in DESC order; reviewed row excluded |
| `getUnreviewedMarketMessages ticker filter` | AC-6 | 3 unreviewed rows with different tickers; filter by "VCB" returns exactly 1 row |
| `getUnreviewedMarketMessages empty state` | AC-7 | All rows have non-null verdict; function returns empty array (note: empty state text is the MCP tool's responsibility, tested in the tool group below) |
| `reviewMarketMessage success` | AC-8 | Sets verdict, verdict_note, non-null reviewed_at on target row |
| `reviewMarketMessage idempotent` | AC-9 | Calling twice overwrites verdict; no error thrown |
| `reviewMarketMessage unknown id` | AC-10 | Returns `false`; no exception |
| `reviewMarketMessage invalid verdict` | edge case | Throws `Error("Invalid verdict")` for value outside signal/noise |
| `sendTelegramMarket persist on success` | AC-3 | Mock fetchFn returning `{ ok: true, ... }`; one row inserted with correct from_agent and content |
| `sendTelegramMarket no persist on failure` | AC-4 | Mock fetchFn returning `{ ok: false, status: 400 }`; zero rows in market_messages |
| `sendTelegramMarket backward compat (no persist)` | AC-11 | Calling without persist option inserts row with from_agent="unknown", message_type="unknown", ticker=null |
| `get_unreviewed_market_messages MCP tool — rows exist` | AC-5 | Tool returns JSON array, newest first; correct structure |
| `get_unreviewed_market_messages MCP tool — empty` | AC-7 | Tool returns bilingual plain-text message |
| `get_unreviewed_market_messages MCP tool — ticker filter` | AC-6 | Tool with ticker="VCB" returns only VCB row |
| `review_market_message MCP tool — success with note` | AC-8 | Returns "Message N labelled as 'noise'. Note saved." |
| `review_market_message MCP tool — success without note` | AC-8 | Returns "Message N labelled as 'signal'." (no trailing note line) |
| `review_market_message MCP tool — idempotent` | AC-9 | Returns success; row overwritten |
| `review_market_message MCP tool — unknown id` | AC-10 | Returns "Message 999 not found." |

**Note on testing `sendTelegramMarket` with DB injection:** The `sendTelegramMarket` function calls `getDb()` internally. Tests that verify the persist behaviour must either (a) use `process.env["DB_PATH"] = ":memory:"` + `initDatabase()` to set up the singleton before calling `sendTelegramMarket`, or (b) spy on `insertMarketMessage`. Approach (a) is preferred — it matches production behaviour exactly and is already established as the test-isolation pattern in this codebase.

**Note on testing MCP tools:** The MCP tools call `getDb()` at invocation time. Tests call the tool handler functions directly (extracting them from `server.tool()` registrations) with the in-memory DB already initialised, as seen in `168-prediction-mcp-tool.test.ts`. Alternatively, wrap the tool function bodies in testable helper functions exported from `marketMessageTools.ts`.

---

## Task Dependency Graph

```
1163 (TDD: write failing tests)
  └─► 1164 (schema.ts DDL + marketMessageStore.ts)
        └─► 1165 (telegram.ts persist + 10 call sites)
              └─► 1166 (marketMessageTools.ts + registry.ts)
                    └─► 1167 (project-stats.json sprint 68)
```

| ID | Title | Layer | Depends On | Branch |
|---|---|---|---|---|
| 1163 | TDD: write failing tests for FR-1 to FR-8 (AC-1 to AC-12) in `src/__tests__/1163-market-message-review.test.ts` | tests | — | `task/1163-market-message-review` |
| 1164 | Add `market_messages` DDL to `schema.ts` + create `marketMessageStore.ts` with `insertMarketMessage`, `getUnreviewedMarketMessages`, `reviewMarketMessage` (FR-1 to FR-3) | infrastructure | 1163 | same branch |
| 1165 | Modify `sendTelegramMarket()` to accept and use `persist` option + update `notifyTelegramAlert`, `sendTelegram` alias, and 8 scheduler/interface call sites (FR-4 to FR-5) | infrastructure/scheduler/interface | 1164 | same branch |
| 1166 | Create `marketMessageTools.ts` + register `get_unreviewed_market_messages` and `review_market_message` in `registry.ts` (FR-6 to FR-8) | interface | 1165 | same branch |
| 1167 | Advance `docs/data/project-stats.json` `currentSprint` to 68, update `lastUpdated` | docs/data | 1166 | same branch |

All five tasks run on a single branch `task/1163-market-message-review`. The TDD rule is: task 1163 is committed first with all tests failing (red), task 1164 makes the store/schema tests green, task 1165 makes the telegram tests green, task 1166 makes the MCP tool tests green, task 1167 closes.

---

## Security Review

- SQL parameterized? Yes — all three store functions use `?` positional placeholders with `db.prepare(...).run(...)` / `.all(...)`. No string interpolation of user input into SQL anywhere in `marketMessageStore.ts`.
- Verdict validation: `reviewMarketMessage` validates `verdict` at runtime against the literal set `{"signal","noise"}` and throws for any other value. The MCP tool's Zod schema (`z.enum(["signal","noise"])`) provides the first line of defence; the store provides the second.
- `note` content: stored verbatim as TEXT. Not rendered as HTML or Markdown anywhere in this sprint — no XSS surface. Future UI rendering of `verdict_note` must sanitise at that layer.
- File paths validated (no `../`)? N/A — no new file path inputs.
- External HTTP rate-limited? N/A — no new HTTP calls.
- Secrets via Bun.env only? N/A — no new secrets introduced.
- `content` stored verbatim from Telegram send: the message text is already trusted (generated internally by scheduler jobs, not from user input), so no sanitisation is needed at store time. The `content` column has no length limit in SQLite — this is intentional per REQ-068 (briefings can be ~3000 chars).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `morningBriefingJob.ts` sends chunks separately — naive `persist` placement stores only the last chunk | High (certain without care) | Medium | Developer must insert the full `text` once before the chunk loop using `insertMarketMessage` directly; subsequent chunk sends should pass `persist: undefined` or omit the persist call. This is the only non-trivial call site. Documented above in the Call Site Migration Plan. |
| `getDb()` throws before `insertMarketMessage` is called (e.g. disk full on open) | Low | Low | Outer try/catch in `sendTelegramMarket` catches this and logs `log.warn` — message was already sent so return value stays `true`. |
| Concurrent test files using `:memory:` singleton clash | Medium | Medium | `closeDb()` + `process.env["DB_PATH"] = ":memory:"` pattern is established and prevents cross-file contamination as long as each test file calls `closeDb()` in `afterAll`. The 1163 test file must follow this pattern exactly. |
| `sendTelegram` alias used by `alertDigestJob` is exported and may be called by other unknown callers | Low | Low | The updated `sendTelegram` alias adds `persist` options only — callers that call `sendTelegram(text)` continue to compile and run identically. The only observable change is a new DB row on success. |
| `notifyTelegramDocument` also calls `sendTelegramMarket` but is not in the 10 high-value callers list | Low | Low | Per REQ-068 FR-5, call sites outside the 10 list fall back to `"unknown"`. `notifyTelegramDocument` will produce rows with `from_agent="unknown"`, `message_type="unknown"`. This is acceptable and explicitly designed as the fallback in the spec. No action needed for this sprint. |
| `calibrationReportJob.ts` has two `sendTelegramMarket` call paths (line 358 work channel and line 367 market channel) | Low | Medium | Only the MARKET path at line 367 must receive `persist`. The WORK path at line 358 calls `sendTelegramWork` and must NOT be modified. Developer must update only the correct branch. |
| table growth unbounded (no retention policy) | Certain (by design) | Low | Accepted per REQ-068 NFR: ~7MB/year at 20 messages/day. Retention deferred to future sprint. No action in sprint 068. |

---

## Forward Compatibility Note (FR-9)

The `market_messages` schema is forward-compatible with the Sprint 069 calibration join. The query Sprint 069 will use:

```sql
SELECT mm.ticker, mm.verdict, mm.sent_at
FROM market_messages mm
WHERE mm.verdict IS NOT NULL
  AND mm.message_type = 'alert'
  AND mm.ticker IS NOT NULL
```

This join requires no schema migration — all columns exist in sprint 068. The `calibrationReportJob.ts` in sprint 069 will read this table directly via `marketMessageStore.ts` or a new query helper added to the same file.
