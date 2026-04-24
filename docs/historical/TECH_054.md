# TECH-054: Position-Aware Analysis, /ask Queue, Narrowed Alert Policy, Kinh Dich Default Layer

status: APPROVED_BY_ARCHITECT
req_ref: REQ-054
sprint: 054

---

## Brownfield Impact

**Files modified:**
- `src/infrastructure/db/positionStore.ts` — add `buyPosition`, `sellPosition`, `applyPositionCommand` helpers; `avg_price` semantics unchanged (column already exists)
- `src/infrastructure/db/schema.ts` — add `ask_queue` DDL block inside `initDatabase()`; add stale-processing recovery index
- `src/infrastructure/notifiers/telegramCommands.ts` — add `/set_position`, `/check_position`, `/ask` handlers; update `HELP_TEXT`
- `src/scheduler/jobs.ts` — import and register `runAskQueueCheck`; add `askQueueCheck` key to `CRONS` map
- `src/scheduler/marketScanJob.ts` — remove direct `send_telegram(channel="market")` calls for noise alert types; keep DB insert path
- `src/interface/mcp/tools/positionTools.ts` — add `get_user_positions_for_analysis` tool registration
- `src/interface/mcp/tools/analysis.ts` — wire `appendKinhDich` call on `analyze_stock` output
- `src/interface/mcp/tools/marketTools.ts` — wire `appendKinhDich` call on per-stock sections of `get_market_snapshot`
- `src/interface/mcp/tools/portfolioTools.ts` — wire `appendKinhDich` call on per-position sections of `get_portfolio_conviction`
- `mcp.config.json` — add `alertPolicy` top-level section

**Files created:**
- `src/domain/services/alertPolicyChecker.ts` — two pure checker functions
- `src/domain/services/stopLossComputer.ts` — `computeStopLoss` pure function
- `src/domain/services/kinhDichWrapper.ts` — `appendKinhDich` async wrapper
- `src/infrastructure/db/askQueueStore.ts` — CRUD helpers for `ask_queue` table
- `src/scheduler/askQueueCheckJob.ts` — every-12-min cron job
- `src/interface/mcp/tools/askQueueTools.ts` — `get_pending_ask_questions` + `answer_ask_question` tools

**Files deleted:** None.

**Breaking changes:** None. The existing `upsertPosition` function is not removed — `applyPositionCommand` wraps it for the new Telegram dispatch flow. Existing `set_position` / `get_positions` / `close_position` MCP tools are unchanged in signature.

---

## Architecture Decision

Sprint 054 extends the server through additive composition: new domain pure-functions feed new infrastructure stores, which are exposed via new MCP tools and Telegram command handlers. The `ask_queue` table is a net-new store (distinct from the existing `user_requests` table which uses a different schema with `command`/`payload` columns — do NOT reuse it). The Kinh Dich wrapper is a domain service (no infra imports) that delegates to existing `computeReading` + `formatReading` functions already tested in task 285. Alert narrowing is achieved by removing `send_telegram(channel="market")` calls in `marketScanJob.ts` while preserving DB insert paths, giving a zero-data-loss migration.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `buyPosition` / `sellPosition` / `applyPositionCommand` | domain | `src/infrastructure/db/positionStore.ts` | MODIFY |
| `checkPositionDanger` / `checkWatchlistOpportunity` | domain | `src/domain/services/alertPolicyChecker.ts` | NEW |
| `computeStopLoss` | domain | `src/domain/services/stopLossComputer.ts` | NEW |
| `appendKinhDich` | domain | `src/domain/services/kinhDichWrapper.ts` | NEW |
| `ask_queue` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `askQueueStore` | infrastructure | `src/infrastructure/db/askQueueStore.ts` | NEW |
| Telegram `/set_position`, `/check_position`, `/ask` | interface | `src/infrastructure/notifiers/telegramCommands.ts` | MODIFY |
| `get_pending_ask_questions` + `answer_ask_question` | interface | `src/interface/mcp/tools/askQueueTools.ts` | NEW |
| `get_user_positions_for_analysis` | interface | `src/interface/mcp/tools/positionTools.ts` | MODIFY |
| Kinh Dich wire: `analyze_stock` | interface | `src/interface/mcp/tools/analysis.ts` | MODIFY |
| Kinh Dich wire: `get_market_snapshot` | interface | `src/interface/mcp/tools/marketTools.ts` | MODIFY |
| Kinh Dich wire: `get_portfolio_conviction` | interface | `src/interface/mcp/tools/portfolioTools.ts` | MODIFY |
| `askQueueCheckJob` | scheduler | `src/scheduler/askQueueCheckJob.ts` | NEW |
| Register `askQueueCheck` cron | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| Retire noise Telegram sends | scheduler | `src/scheduler/marketScanJob.ts` | MODIFY |
| `alertPolicy` config | infrastructure | `mcp.config.json` | MODIFY |

---

## 1. Architecture Overview

The Sprint 054 data flows break into two independent paths that meet at the MARKET channel:

```
Telegram user
  │
  ├─ /set_position TICKER PRICE QTY
  │       ↓
  │   telegramCommands.ts → applyPositionCommand(db) → positionStore.ts
  │       ↓ reply: Vietnamese explanation
  │
  ├─ /check_position
  │       ↓
  │   telegramCommands.ts → listOpenPositions(db) → TP + stop-loss floor
  │       ↓ reply: position card per ticker
  │
  ├─ /ask <question>
  │       ↓
  │   telegramCommands.ts → insertAskQuestion(db) → ask_queue table
  │       ↓ reply: "Câu hỏi đã ghi nhận (#N), sẽ trả lời trong 12 phút."
  │
  │       ↓ every 12 min
  │   askQueueCheckJob.ts → getPendingAskQuestions(db, 1)
  │       │ if count > 0
  │       ↓
  │   postSignal(db, {to_agent: "07-qa-responder", signal_type: "pending_questions"})
  │       ↓ Cowork 07-qa-responder wakes up (via agent_signals MCP poll)
  │       ↓ calls get_pending_ask_questions() → processes FIFO → calls answer_ask_question()
  │       ↓ posts answer to MARKET channel via send_telegram(channel="market")
  │
  └─ Alert Commander (05)
          ↓
      reads positions via get_user_positions_for_analysis(ticker)
      reads agent_signals, news sentiment, Kinh Dich confidence
          ↓
      checkPositionDanger(input) — 3-AND gate
      checkWatchlistOpportunity(input) — 4-AND gate
          ↓ only if all conditions met
      send_telegram(channel="market") — MARKET channel

Every stock analysis tool (analyze_stock, get_market_snapshot, get_portfolio_conviction):
      ↓ at end of handler
  appendKinhDich(ticker, baseOutput, db)
      ↓
  computeReading + formatReading (from kinhDich domain services, task 285)
      ↓ appended to output text
```

---

## 2. File Map (per epic)

### E1 — Position Ledger Extension

| Action | Path |
|--------|------|
| MODIFY | `src/infrastructure/db/positionStore.ts` |
| TEST | `src/__tests__/1070-position-ledger.test.ts` |

Changes to `positionStore.ts`:
- Add `PositionCommandInput` interface: `{ ticker: string; price: number; qty: number }`
- Add `PositionCommandResult` interface: `{ ok: boolean; message: string }`
- Add `buyPosition(db, code, price, qty): PositionCommandResult` — reads current row, computes weighted avg, calls `upsertPosition`
- Add `sellPosition(db, code, price, qty): PositionCommandResult` — clamped sell, calls `closePosition` if result is 0 shares
- Add `applyPositionCommand(db, input): PositionCommandResult` — dispatcher

### E2 — Telegram Commands: /set_position, /check_position

| Action | Path |
|--------|------|
| MODIFY | `src/infrastructure/notifiers/telegramCommands.ts` |
| TEST | `src/__tests__/1071-telegram-position-commands.test.ts` |

Changes:
- Add `handleSetPosition(db, args): string` — parses TICKER PRICE QTY, calls `applyPositionCommand`
- Add `handleCheckPosition(db): string` — calls `listOpenPositions`, formats position card with TP ladder + stop-loss floor
- Update `HELP_TEXT` constant (lines 54–61)
- Add `case "/set_position":` and `case "/check_position":` to the switch at line 282

### E3 — /ask Queue (DB + Telegram Handler)

| Action | Path |
|--------|------|
| MODIFY | `src/infrastructure/db/schema.ts` |
| NEW | `src/infrastructure/db/askQueueStore.ts` |
| MODIFY | `src/infrastructure/notifiers/telegramCommands.ts` |
| TEST | `src/__tests__/1072-ask-queue-store.test.ts` |
| TEST | `src/__tests__/1073-telegram-ask-command.test.ts` |

### E4 — askQueueCheck Cron

| Action | Path |
|--------|------|
| NEW | `src/scheduler/askQueueCheckJob.ts` |
| MODIFY | `src/scheduler/jobs.ts` |
| TEST | `src/__tests__/1074-ask-queue-check-job.test.ts` |

### E5 — Alert Policy Rewrite

| Action | Path |
|--------|------|
| NEW | `src/domain/services/alertPolicyChecker.ts` |
| NEW | `src/domain/services/stopLossComputer.ts` |
| MODIFY | `mcp.config.json` |
| MODIFY | `src/scheduler/marketScanJob.ts` |
| TEST | `src/__tests__/1075-alert-policy-checker.test.ts` |
| TEST | `src/__tests__/1076-market-scan-noise-retirement.test.ts` |

### E6 — Kinh Dich Default Layer

| Action | Path |
|--------|------|
| NEW | `src/domain/services/kinhDichWrapper.ts` |
| MODIFY | `src/interface/mcp/tools/analysis.ts` |
| MODIFY | `src/interface/mcp/tools/marketTools.ts` |
| MODIFY | `src/interface/mcp/tools/portfolioTools.ts` |
| TEST | `src/__tests__/1077-kinh-dich-wrapper.test.ts` |

### Additional MCP Tools

| Action | Path |
|--------|------|
| NEW | `src/interface/mcp/tools/askQueueTools.ts` |
| MODIFY | `src/interface/mcp/tools/positionTools.ts` |
| TEST | `src/__tests__/1078-ask-queue-tools.test.ts` |
| TEST | `src/__tests__/1079-position-for-analysis-tool.test.ts` |

---

## 3. Domain Layer

### 3.1 Position Ledger Domain Functions

Location: `src/infrastructure/db/positionStore.ts`

Note: REQ-054 section 3 DDD mapping explicitly places FR-E1-1 through FR-E1-4 in the domain layer but targets `positionStore.ts` (infrastructure file). The pure computation logic (weighted avg formula, clamp logic) is implemented as functions in this file. They accept a `Database` param — this is an accepted pragmatic pattern in this codebase where thin store helpers live alongside infra. No extraction to a separate pure-domain file is required.

```typescript
export interface PositionCommandInput {
  ticker: string;   // uppercase, 2-10 chars
  price: number;    // VND, >= 0
  qty: number;      // integer, may be negative
}

export interface PositionCommandResult {
  ok: boolean;
  message: string;  // Vietnamese explanation
}

/**
 * Buy: qty > 0.
 * Weighted-average formula: (old_shares * old_avg + qty * price) / (old_shares + qty).
 * avg_price rounded to integer VND (Math.round).
 * Creates a new position row if none exists.
 */
export function buyPosition(
  db: Database,
  code: string,
  price: number,
  qty: number,
): PositionCommandResult

/**
 * Sell: qty < 0.
 * abs(qty) clamped to current shares. avg_price unchanged on partial sell.
 * Calls closePosition() if resulting shares == 0.
 */
export function sellPosition(
  db: Database,
  code: string,
  price: number,
  qty: number,
): PositionCommandResult

/**
 * Dispatcher. Routes to buyPosition / sellPosition / closePosition.
 * Routes:
 *   qty > 0                   → buyPosition
 *   qty < 0                   → sellPosition
 *   price == 0 AND qty == 0   → closePosition (clear)
 *   qty == 0 AND price > 0    → error: "Không hợp lệ: qty=0 khi price > 0"
 */
export function applyPositionCommand(
  db: Database,
  input: PositionCommandInput,
): PositionCommandResult
```

**Explanation messages:**
- Buy: `"Mua thêm {qty} @ {price} VND → avg cost mới: {new_avg_price} VND (tổng {new_shares} CP)"`
- Buy from zero: `"Mua {qty} CP @ {price} VND → vị thế mới tạo, avg cost: {price} VND"`
- Sell (normal): `"Bán {abs(qty)} CP @ {price} VND → còn lại {remaining} CP @ {avg_price} VND"`
- Sell (clamped): `"Chỉ bán được {old_shares} CP (không đủ số lượng) → đã thanh lý toàn bộ vị thế"`
- Clear: `"Đã xóa toàn bộ vị thế {TICKER}"`

### 3.2 Alert Policy Checker

Location: `src/domain/services/alertPolicyChecker.ts`

```typescript
export interface PositionDangerInput {
  stopLossHit: boolean;
  singleDayDropPct: number;   // positive float, e.g. 5.2 = 5.2% drop
  newsSentiment: number;      // -1.0 to 1.0
  thresholds: {
    singleDayDropPct: number;       // config: 5.0
    newsSentimentThreshold: number; // config: -0.5
  };
}

export interface WatchlistOpportunityInput {
  kinhDichConfidence: number;    // 0-100
  kinhDichSignal: string;        // "BUY" | "SELL" | "NEUTRAL"
  newsSentiment: number;         // -1.0 to 1.0
  agentSignalsMajority: string;  // "BUY" | "SELL" | "NEUTRAL"
  thresholds: {
    kinhDichConfidenceMin: number; // config: 70
    newsSentimentMin: number;      // config: 0.3
  };
}

/**
 * Returns true ONLY when ALL THREE conditions are met:
 *   1. stopLossHit === true
 *   2. singleDayDropPct >= thresholds.singleDayDropPct
 *   3. newsSentiment <= thresholds.newsSentimentThreshold
 * Pure function — no I/O.
 */
export function checkPositionDanger(input: PositionDangerInput): boolean

/**
 * Returns true ONLY when ALL FOUR conditions are met:
 *   1. kinhDichConfidence >= thresholds.kinhDichConfidenceMin
 *   2. kinhDichSignal === "BUY"
 *   3. newsSentiment >= thresholds.newsSentimentMin
 *   4. agentSignalsMajority === "BUY"
 * Pure function — no I/O.
 */
export function checkWatchlistOpportunity(input: WatchlistOpportunityInput): boolean
```

### 3.3 Stop-Loss Computer

Location: `src/domain/services/stopLossComputer.ts`

```typescript
/**
 * Compute dynamic stop-loss level in VND.
 *
 * Formula: Math.round(Math.max(avgCost - 2 * atr14, nearestSupport, avgCost * 0.93))
 *
 * Fallback (atr14 <= 0 OR nearestSupport <= 0):
 *   Use only the relevant valid inputs. If both atr14 and nearestSupport
 *   are invalid (<= 0), return Math.round(avgCost * 0.93).
 *
 * @param avgCost         Average purchase price in VND (integer)
 * @param atr14           14-day ATR in VND. Pass 0 if unavailable.
 * @param nearestSupport  Nearest support level in VND. Pass 0 if unavailable.
 * @returns               Stop-loss price in VND (integer, rounded)
 */
export function computeStopLoss(
  avgCost: number,
  atr14: number,
  nearestSupport: number,
): number
```

**Edge cases:**
- `atr14 <= 0`: exclude `avgCost - 2 * atr14` candidate from max()
- `nearestSupport <= 0`: exclude `nearestSupport` candidate from max()
- Both invalid: return `Math.round(avgCost * 0.93)`

### 3.4 Kinh Dich Wrapper

Location: `src/domain/services/kinhDichWrapper.ts`

```typescript
import type { Database } from "bun:sqlite";

/**
 * Append a Kinh Dich hexagram reading to any analysis output string.
 *
 * Calls computeReading + formatReading from the existing kinhDich domain
 * services (src/domain/services/kinhDich/).
 *
 * Never throws: all errors caught internally. On failure, appends:
 *   "\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ."
 *
 * @param ticker      Stock ticker code, or "MARKET" for market-wide hexagram.
 * @param baseOutput  The existing analysis text to append to.
 * @param db          SQLite database handle for kinhdich_readings lookup.
 * @returns           baseOutput + "\n---\nKinh Dịch: ..." block
 */
export async function appendKinhDich(
  ticker: string,
  baseOutput: string,
  db: Database,
): Promise<string>
```

**Append format (success):**
```
\n---\nKinh Dịch: {hexagram_name} ({number}) — {1-line trend signal}
Biến quẻ: {changing_hex_name} → {direction}
Độ tin cậy: {confidence}%
```

**Append format (no data / error):**
```
\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.
```

**Implementation note:** `kinhDichWrapper.ts` may import from `src/domain/services/kinhDich/kinhDichReading.ts` and `kinhDichFormatter.ts` — both are domain files so no DDD violation. It must NOT import from `src/infrastructure/` directly. The `db` param is passed in (dependency injection), keeping the function testable without a live DB.

For the `ticker === "MARKET"` branch: call the `computeReading` path that targets the VN-Index aggregate (same logic used by `get_market_hexagram` in `kinhDichTools.ts` line 1+).

---

## 4. Infrastructure Layer

### 4.1 positionStore.ts — avg_price column

The `positions` table DDL (created in task 179) already has `avg_price REAL` column per the existing `upsertPosition` function at line 77 of `positionStore.ts`. No migration needed for the column itself.

The new `buyPosition` / `sellPosition` functions read the current row via a parameterized SELECT, compute the new value, then call the existing `upsertPosition`. No new columns required.

**SQL pattern for buyPosition (parameterized):**
```sql
SELECT shares, avg_price FROM positions WHERE code = ? AND closed_at IS NULL
```
Then update via `upsertPosition(db, { code, shares: newShares, avgPrice: newAvg })`.

### 4.2 ask_queue DDL

Add inside `initDatabase()` in `src/infrastructure/db/schema.ts`, after the `user_requests` block (around line 635):

```sql
CREATE TABLE IF NOT EXISTS ask_queue (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                TEXT    NOT NULL DEFAULT 'default',
  message                TEXT    NOT NULL,
  received_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  status                 TEXT    NOT NULL DEFAULT 'pending',
  answered_at            TEXT,
  answer_text            TEXT,
  processing_started_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ask_queue_status   ON ask_queue(status);
CREATE INDEX IF NOT EXISTS idx_ask_queue_received ON ask_queue(received_at);
```

**Note on `user_requests` vs `ask_queue`:** The existing `user_requests` table (schema.ts line 625) has `command / payload / status / response` columns — a different shape. REQ-054 defines a new `ask_queue` table with `message / received_at / answer_text / processing_started_at`. These are separate tables serving separate purposes. Do NOT reuse `user_requests`.

**Stale-processing recovery index** (supports the 20-min staleness check described in REQ-054 section 4):
```sql
CREATE INDEX IF NOT EXISTS idx_ask_queue_proc_started ON ask_queue(processing_started_at)
  WHERE status = 'processing';
```

### 4.3 askQueueStore.ts

New file: `src/infrastructure/db/askQueueStore.ts`

```typescript
import type { Database } from "bun:sqlite";

export type AskStatus = "pending" | "processing" | "answered" | "failed" | "escalated";

export interface AskQueueRow {
  id: number;
  user_id: string;
  message: string;
  received_at: string;
  status: AskStatus;
  answered_at: string | null;
  answer_text: string | null;
  processing_started_at: string | null;
}

/**
 * Insert a new question. Truncates message to 2000 chars if needed.
 * Returns the inserted row id.
 */
export function insertAskQuestion(
  db: Database,
  message: string,
  userId?: string,
): number

/**
 * Return pending questions FIFO (received_at ASC).
 * Default limit = 10.
 */
export function getPendingAskQuestions(
  db: Database,
  limit?: number,
): Pick<AskQueueRow, "id" | "message" | "received_at">[]

/**
 * Transition status pending → processing.
 * Sets processing_started_at = datetime('now').
 */
export function markAskProcessing(db: Database, id: number): void

/**
 * Record the answer and set final status.
 * Sets answered_at = datetime('now'), answer_text, status.
 */
export function answerAskQuestion(
  db: Database,
  id: number,
  answerText: string,
  status: "answered" | "escalated" | "failed",
): void

/**
 * Reset rows stuck in 'processing' for > 20 minutes back to 'pending'.
 * Called at the start of askQueueCheckJob to enable automatic recovery.
 * Returns number of rows recovered.
 */
export function recoverStaleProcessing(db: Database): number
```

All functions use parameterized bindings only. No string interpolation in SQL.

---

## 5. Application Layer

No new application use-case files are required for Sprint 054. The domain services in section 3 are invoked directly from interface/scheduler layers (thin handler pattern consistent with the existing codebase — see `marketScanJob.ts` which calls `scanMarket()` directly, and `telegramCommands.ts` which calls `positionStore` directly).

If future sprints require orchestration logic (e.g. a full position-danger alert pipeline), an `alertPolicyEvaluator.ts` application use case should be created then. For Sprint 054, the Alert Commander agent itself orchestrates the data gathering — the server only provides the checker functions and data stores.

---

## 6. Interface Layer (MCP Tools)

### 6.1 New file: `src/interface/mcp/tools/askQueueTools.ts`

Exports `registerAskQueueTools(server: McpServer): void` registering two tools:

**Tool: `get_pending_ask_questions`**
```typescript
// Input schema
{ limit: z.number().int().positive().max(50).optional().default(10) }

// Output
// JSON array: [{ id: number, message: string, received_at: string }, ...]
// Calls getPendingAskQuestions(db, limit)
// Returns "Không có câu hỏi nào đang chờ." if empty
```

**Tool: `answer_ask_question`**
```typescript
// Input schema
{
  id: z.number().int().positive(),
  answer_text: z.string().min(1).max(4096),
  status: z.enum(["answered", "escalated", "failed"]),
}

// Output: "Câu hỏi #${id} đã được đánh dấu là '${status}'."
// Calls answerAskQuestion(db, id, answer_text, status)
```

Both tools call `initDatabase()` lazily and use `getDb()`.

### 6.2 Modification: `src/interface/mcp/tools/positionTools.ts`

Add fourth tool registration inside `registerPositionTools(server)`:

**Tool: `get_user_positions_for_analysis`**
```typescript
// Input schema
{ ticker: z.string().min(2).max(10).toUpperCase().optional() }

// Output: JSON array per open position with stopLossFloor, TP ladder
// stopLossFloor = Math.round(avgPrice * 0.93)  [simple floor only]
// tp1 = Math.round(avgPrice * 1.10)
// tp2 = Math.round(avgPrice * 1.20)
// tp3 = Math.round(avgPrice * 1.30)
```

Output JSON shape per position (from REQ-054 FR-TOOLS-3):
```json
{
  "code": "VCB",
  "shares": 1000,
  "avgPrice": 75000,
  "currentPrice": 80000,
  "costBasis": 75000000,
  "currentValue": 80000000,
  "unrealizedPnl": 5000000,
  "unrealizedPnlPct": 6.67,
  "stopLossFloor": 69750,
  "tp1": 82500,
  "tp2": 90000,
  "tp3": 97500
}
```

### 6.3 Tool registration in index/registry

`src/interface/mcp/tools/index.ts` or `registry.ts` must import and call `registerAskQueueTools(server)`. Check which pattern is used by reading `src/interface/mcp/tools/registry.ts` at implementation time — follow the existing pattern exactly.

---

## 7. Interface Layer (Telegram)

### 7.1 New handlers in `src/infrastructure/notifiers/telegramCommands.ts`

**`handleSetPosition(db: Database, args: string[]): string`**

Parse rules (from REQ-054 FR-E2-1):
- `args[0]` = TICKER: must match `/^[A-Za-z]{2,10}$/`. Reject if numeric chars or punctuation.
- `args[1]` = PRICE: `parseFloat`. Must be `>= 0`. Reject if NaN.
- `args[2]` = QTY: `Math.round(parseFloat(...))`. May be negative. Reject if NaN.
- Fractional QTY: round to nearest int, no error emitted (per REQ-054 edge cases).
- Malformed → return usage hint:
  ```
  "Cách dùng: /set_position TICKER GIÁ SỐ_LƯỢNG
  Ví dụ: /set_position FPT 80300 5100
  Xóa vị thế: /set_position FPT 0 0"
  ```

Calls `applyPositionCommand(db, { ticker: TICKER.toUpperCase(), price: PRICE, qty: QTY })`.
Returns the `message` field of the result.

**`handleCheckPosition(db: Database): string`**

Calls `listOpenPositions(db)`. If empty, returns:
```
"Chưa có vị thế nào. Dùng /set_position TICKER GIÁ SỐ_LƯỢNG để thêm."
```

Per-position card format (from REQ-054 FR-E2-2):
```
{TICKER} — {shares} CP
  Avg cost:     {avg_price} VND
  Giá hiện tại: {currentPrice} VND  (N/A nếu không có dữ liệu)
  P/L:          {sign}{pct}% ({sign}{vnd} VND)
  Stop-loss:    {stopLoss} VND
  TP ladder:    +10% @ {tp1} | +20% @ {tp2} | +30% @ {tp3}
```

Stop-loss displayed = `Math.round(avgPrice * 0.93)` (hard floor only — no ATR14 here per REQ-054 FR-E2-2 rationale: "to avoid blocking").

Use existing `fmtNum()` helper (already defined at line 68 of `telegramCommands.ts`).

**`handleAsk(db: Database, args: string[]): string`**

- `args.join(" ").trim()` = question text.
- Empty → return: `"Cách dùng: /ask câu hỏi của bạn\nVí dụ: /ask FPT có nên mua không?"`
- Non-empty → call `insertAskQuestion(db, text)` → return:
  `"Câu hỏi đã ghi nhận (#${id}), sẽ trả lời trong 12 phút."`

**Updated `HELP_TEXT` constant** (replaces lines 54–61 in `telegramCommands.ts`):
```typescript
const HELP_TEXT = `VN Market Bot

/watchlist       Danh mục theo dõi
/price VCB       Giá cổ phiếu
/set_position    Cập nhật vị thế (/set_position TICKER GIÁ SL)
/check_position  Xem vị thế + P/L + stop-loss
/ask             Đặt câu hỏi cho AI (/ask câu hỏi)
/health          Trạng thái hệ thống
/report ...      Báo lỗi
/fix ...         Báo lỗi khẩn cấp
/help            Trợ giúp`;
```

**Switch cases to add** (after line 306 `case "/fix":` in `telegramCommands.ts`):
```typescript
case "/set_position":
  responseText = handleSetPosition(db, args);
  break;

case "/check_position":
  responseText = await handleCheckPosition(db);
  break;

case "/ask":
  responseText = handleAsk(db, args);
  break;
```

Note: `handleTelegramCommand` is already `async` (line 263), so `await handleCheckPosition(db)` requires no signature change.

---

## 8. Scheduler Layer

### 8.1 New file: `src/scheduler/askQueueCheckJob.ts`

```typescript
/**
 * askQueueCheckJob — Task 1074
 *
 * Fires every 12 minutes. If ask_queue has pending questions,
 * posts a signal to agent_signals for 07-qa-responder.
 *
 * The server does NOT read, answer, or process ask_queue rows.
 * That is exclusively the QA Responder agent's job.
 */

import { getDb, initDatabase } from "../infrastructure/db/schema.js";
import {
  getPendingAskQuestions,
  recoverStaleProcessing,
} from "../infrastructure/db/askQueueStore.js";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";
import { logger } from "../infrastructure/logger.js";

export async function runAskQueueCheck(): Promise<void> {
  await initDatabase();
  const db = getDb();

  // Recover any rows stuck in processing > 20 min
  const recovered = recoverStaleProcessing(db);
  if (recovered > 0) {
    logger.info(`[askQueueCheck] recovered ${recovered} stale-processing rows`);
  }

  const pending = getPendingAskQuestions(db, 1);
  const count = pending.length;

  console.info(`[askQueueCheck] pending=${count}`);

  if (count > 0) {
    // Count all pending, not just the 1 we peeked at
    const allPending = getPendingAskQuestions(db, 100);
    postSignal(db, {
      fromAgent: "askQueueCheck",
      toAgent: "07-qa-responder",
      signalType: "pending_questions",
      payload: { count: allPending.length },
      ttlMinutes: 15,
    });
  }
}
```

### 8.2 Registration in `src/scheduler/jobs.ts`

**Import to add** (after existing imports):
```typescript
import { runAskQueueCheck } from './askQueueCheckJob.js'
```

**Entry to add to `CRONS` map** (after `bctcReparseJob` entry around line 64):
```typescript
/** /ask queue signal check: every 12 min (task 1074) */
askQueueCheck: Bun.env.CRON_ASK_QUEUE_CHECK ?? '*/12 * * * *',
```

**Schedule call to add** inside `startScheduler()` body (before the closing log line):
```typescript
// Every 12 min — /ask queue signal check (task 1074)
cron.schedule(CRONS.askQueueCheck, async () => {
  try {
    await runAskQueueCheck();
  } catch (err) {
    log(`[askQueueCheck] uncaught: ${err instanceof Error ? err.message : String(err)}`);
  }
});
```

### 8.3 Update `.claude/knowledge/cron-jobs.md`

Add entry:
```
askQueueCheck   */12 * * * *   Every 12 min   Check ask_queue for pending questions; post agent signal to 07-qa-responder if any found   task 1074
```

---

## 9. Config Schema (mcp.config.json)

Add the following top-level section to `mcp.config.json`:

```json
{
  "alertPolicy": {
    "positionDanger": {
      "singleDayDropPct": 5.0,
      "newsSentimentThreshold": -0.5
    },
    "watchlistOpportunity": {
      "kinhDichConfidenceMin": 70,
      "newsSentimentMin": 0.3
    },
    "alertCooldownMinutes": 0
  }
}
```

These values are the authoritative thresholds for Sprint 054. The `checkPositionDanger` and `checkWatchlistOpportunity` domain functions accept a `thresholds` parameter — callers (agent or scheduler) read the config and pass the values in, keeping the domain functions config-agnostic.

---

## 10. Alert Narrowing

### Noise alert types retired from MARKET channel

The following behaviors in `src/scheduler/marketScanJob.ts` must have their `send_telegram(channel="market")` calls removed. DB inserts into `alerts` table are preserved for audit:

| Alert type | Current location | Action |
|------------|------------------|--------|
| Medium price moves (2–5% drop/rise) without stop-loss hit | `scanMarket.ts` alert generation loop | Remove Telegram send; keep `storeAlerts()` call |
| Routine watchlist price heartbeats | `marketScanJob.ts` / `scanMarket.ts` signal detector | Remove Telegram send; keep DB insert |
| Volume spike without multi-signal confirmation | alert pipeline in `scanMarket.ts` | Remove Telegram send; keep DB insert |

**Note:** `marketScanJob.ts` itself (lines 1–65) is a thin wrapper — it calls `scanMarket()` from `src/application/usecases/scanMarket.ts`. The Telegram sends are inside `scanMarket.ts`. Task 1076 must modify `scanMarket.ts` (the use case), not just the scheduler shell.

**Single-source news signals without multi-agent confirmation:** This pattern lives in Cowork agent logic (`05-alert-commander.md`), not in server code. Handled by E7 agent rewrite in Phase 6 — out of scope for server-code tasks.

### Migration path: hard cutover

No deprecation period. Sprint 054 deploys with the noise Telegram sends removed. The `alerts` table retains full history for any analytics query via `get_alerts(type="all")` MCP tool. No rows are deleted.

### New alert types added

| Alert type | Evaluation location |
|------------|---------------------|
| `position-danger` | Alert Commander agent reads `checkPositionDanger()` output via MCP tools |
| `watchlist-opportunity` | Alert Commander agent reads `checkWatchlistOpportunity()` output via MCP tools |

Both new alert types are evaluated by the Alert Commander Cowork agent, not by the server scheduler. The server only provides:
1. `checkPositionDanger()` / `checkWatchlistOpportunity()` as domain pure functions
2. `get_user_positions_for_analysis(ticker)` MCP tool for position data
3. The `alertPolicy` config values in `mcp.config.json`

---

## 11. Kinh Dich Wrapper

### Tools that receive the wrapper

| Tool file | Tool name | Ticker source |
|-----------|-----------|---------------|
| `src/interface/mcp/tools/analysis.ts` | `analyze_stock` | Input `code` parameter |
| `src/interface/mcp/tools/marketTools.ts` | `get_market_snapshot` | Per-stock loop; `ticker="MARKET"` for the summary section |
| `src/interface/mcp/tools/portfolioTools.ts` | `get_portfolio_conviction` | Per-position `p.code` in the conviction loop |

### Wiring pattern

At the END of each handler, after the `text` variable is fully built but before the `return` statement:

```typescript
// In analysis.ts → analyze_stock handler
text = await appendKinhDich(actionCode, text, db);

// In marketTools.ts → get_market_snapshot handler (per-stock loop)
stockSummary = await appendKinhDich(code, stockSummary, db);

// In portfolioTools.ts → get_portfolio_conviction handler (per-position loop)
positionBlock = await appendKinhDich(p.code, positionBlock, db);
// Market-wide section:
marketSection = await appendKinhDich("MARKET", marketSection, db);
```

### Output contract preservation

`appendKinhDich` always returns a string (either `baseOutput + "\n---\n..."` or `baseOutput + "\n---\nKinh Dịch: Chưa đủ dữ liệu..."` on error). The existing tool output contracts are not broken — the Kinh Dich block is purely additive. The `content[0].type = "text"` shape is unchanged.

### `get_market_snapshot` special handling

`get_market_snapshot` in `marketTools.ts` does not have a single `ticker` parameter — it iterates multiple stocks. The Kinh Dich append should be applied per-stock in the iteration loop (each stock gets its own reading). The overall market summary line (VN-Index level etc.) should use `appendKinhDich("MARKET", ..., db)` to call `get_market_hexagram` logic.

---

## 12. Test Strategy

### Unit tests

**`src/__tests__/1070-position-ledger.test.ts`** — domain functions in `positionStore.ts`:
- `buyPosition`: new position from zero (AC-E1-4)
- `buyPosition`: buy on existing position → weighted avg (AC-E1-1 first half)
- `sellPosition`: partial sell → shares decrease, avg unchanged (AC-E1-1 second half)
- `sellPosition`: clamped sell → shares = 0, `closePosition` called (AC-E1-2)
- `applyPositionCommand`: clear (AC-E1-3)
- `applyPositionCommand`: invalid `qty=0 price>0` → `ok=false`
- `applyPositionCommand`: fractional QTY → rounded

**`src/__tests__/1072-ask-queue-store.test.ts`** — `askQueueStore.ts`:
- `insertAskQuestion`: row inserted, returns id, status='pending'
- `insertAskQuestion`: message truncated at 2000 chars
- `getPendingAskQuestions`: FIFO ordering by `received_at ASC` (AC-E3-1)
- `markAskProcessing`: status → 'processing', `processing_started_at` set
- `answerAskQuestion`: status → 'answered', `answered_at` and `answer_text` set (AC-E3-2)
- `recoverStaleProcessing`: rows with `processing_started_at > 20 min ago` reset to 'pending'

**`src/__tests__/1075-alert-policy-checker.test.ts`** — pure functions:
- `checkPositionDanger`: partial conditions (AC-E5-1)
- `checkPositionDanger`: all three met (AC-E5-2)
- `checkWatchlistOpportunity`: partial conditions (AC-E5-3)
- `checkWatchlistOpportunity`: all four met (AC-E5-4)
- `computeStopLoss`: standard case (AC-E5-5)
- `computeStopLoss`: atr14=0 fallback
- `computeStopLoss`: nearestSupport=0 fallback
- `computeStopLoss`: both zero → pure 0.93 floor

**`src/__tests__/1077-kinh-dich-wrapper.test.ts`**:
- `appendKinhDich`: with real reading data → output contains "Kinh Dịch:" and "Biến quẻ:" (AC-E6-1)
- `appendKinhDich`: no data → fallback text (AC-E6-2)
- `appendKinhDich`: computeReading throws → graceful fallback, no propagation

### Integration tests

**`src/__tests__/1071-telegram-position-commands.test.ts`**:
- Full roundtrip via `handleTelegramCommand` with `:memory:` DB + `initDatabase()`
- AC-E2-1: valid buy
- AC-E2-2: clear
- AC-E2-3: malformed input
- AC-E2-4: `/check_position` format check

**`src/__tests__/1073-telegram-ask-command.test.ts`**:
- AC-E3-3: `/ask FPT có nên mua không?` → reply matches `"Câu hỏi đã ghi nhận (#[0-9]+)"`
- AC-E3-4: empty `/ask` → usage hint

**`src/__tests__/1074-ask-queue-check-job.test.ts`**:
- AC-E4-1: `CRONS` map has key `"askQueueCheck"` with value `"*/12 * * * *"`
- AC-E4-2: 2 pending rows → `runAskQueueCheck()` → `agent_signals` has 1 new row with `to_agent='07-qa-responder'`, `signal_type='pending_questions'`, `count: 2`
- AC-E4-3: 0 pending rows → no new `agent_signals` row

**`src/__tests__/1076-market-scan-noise-retirement.test.ts`**:
- Verify `scanMarket()` with a 3% price drop does NOT call `send_telegram(channel="market")`
- Verify the alert is still inserted into `alerts` table (DB insert preserved)

**`src/__tests__/1078-ask-queue-tools.test.ts`**:
- `get_pending_ask_questions` returns FIFO list
- `answer_ask_question` marks row as answered

**`src/__tests__/1079-position-for-analysis-tool.test.ts`**:
- `get_user_positions_for_analysis()` returns all positions with computed fields
- `get_user_positions_for_analysis({ticker: "VCB"})` filters correctly
- `stopLossFloor = Math.round(avgPrice * 0.93)` verified
- `tp1 = Math.round(avgPrice * 1.10)` verified

### Smoke test

Full cycle (all mocked Telegram/DB):
1. `/set_position VCB 75000 1000` → position created
2. `/check_position` → shows VCB card with correct stop-loss 69750
3. `/ask VCB có nên tiếp tục giữ không?` → `"Câu hỏi đã ghi nhận (#1)"`
4. `runAskQueueCheck()` → signal posted to `agent_signals` for `07-qa-responder`
5. `get_pending_ask_questions()` → returns the question
6. `answer_ask_question(1, "Phân tích...", "answered")` → status set
7. `getPendingAskQuestions(db)` → returns empty list

---

## 13. Deploy & Restart

**After merging every task branch to main:**

```bash
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
```

This is the ONLY allowed restart command. Hot reload is permanently banned (see `.claude/knowledge/restart-policy.md`).

**QA checklist item — mandatory after every task merge:**
1. `launchctl list | grep com.vn-market.mcp` — PID must be non-zero
2. `curl -s http://127.0.0.1:3000/health` — must return `{"status":"ok","toolCount":N}` where N >= previous tool count
3. `tail -20 /tmp/vn-market-mcp.log` — no crash loop, no startup errors
4. For tasks adding MCP tools (1078, 1079): verify `toolCount` increments by the expected number

**Tool count expectation after Sprint 054:**
- Task 1078: +2 tools (`get_pending_ask_questions`, `answer_ask_question`)
- Task 1079: +1 tool (`get_user_positions_for_analysis`)
- Total new tools: 3

---

## 14. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `positions` table migration: new `applyPositionCommand` relies on `avg_price` column being present | Low | High | Column exists since task 179 (`positionStore.ts` line 77). No ALTER TABLE needed. Verified in brownfield analysis. |
| Concurrent `/set_position` calls from two rapid Telegram messages | Low | Low | SQLite WAL + transaction isolation handles concurrent writes. `upsertPosition` uses `ON CONFLICT(code)` upsert which is atomic. |
| `ask_queue` concurrent processing: two Cowork agent instances both pick up the same row | Low | Medium | `markAskProcessing` must use a conditional UPDATE: `UPDATE ask_queue SET status='processing' WHERE id=? AND status='pending'`. Check `changes == 1` before proceeding. Row-level optimistic locking via single-writer SQLite. |
| `computeStopLoss` receives negative ATR14 (data quality bug) | Medium | Low | Treat `atr14 <= 0` as unavailable. Explicitly documented in the function contract. Unit test covers this case. |
| `appendKinhDich` latency: adds a DB read + hexagram computation to every stock analysis call | Medium | Medium | `appendKinhDich` never throws and is not on the hot path (called once per tool invocation). If `computeReading` is slow, the timeout is per-tool call, not global. LanceDB read is already in-process. Monitor via `tail -f /tmp/vn-market-mcp.log` after deploy. |
| `kinhDichWrapper.ts` imports `kinhDichReading.ts` — must not import anything from `infrastructure/` directly | Low | High | `computeReading` is a pure function in `src/domain/services/kinhDich/kinhDichReading.ts`. The `db` handle is passed in as parameter. No `getDb()` call inside the wrapper. Developer must verify with `grep -n "infrastructure" src/domain/services/kinhDichWrapper.ts`. |
| Watchlist-opportunity false positives if `kinhDichConfidence` defaults to 100 on missing data | Low | Medium | `kinhDichConfidence = 0` when hexagram data is absent (consistent with `getLatestReading` returning null). `checkWatchlistOpportunity` with confidence=0 fails condition 1 — no false positive possible. |
| `agentSignalsMajority` computation: definition specifies "last 30 min, status='unread'" — stale signals from prior sessions could skew majority | Medium | Low | Enforced TTL on `agent_signals` (existing `ttlMinutes` mechanism). Alert Commander agent applies this rule; not a server-side concern for Sprint 054. |
| `ask_queue.answer_text` size: Telegram has 4096-char limit but SQLite TEXT has no limit | Low | Low | QA Responder agent is responsible for truncating before calling `answer_ask_question`. Server does not truncate on `answerAskQuestion` — the field is for audit, not for direct re-send. |

---

## 15. Task Breakdown for PM

Suggested atomic tasks in dependency order, ready for PM to finalize and register in `TASKS.md`:

| # | Epic | Layer | Deliverable | Depends on |
|---|------|-------|-------------|------------|
| 1070 | E1 | domain/infra | `positionStore.ts`: `buyPosition`, `sellPosition`, `applyPositionCommand` + unit tests (`1070-position-ledger.test.ts`) | — |
| 1071 | E2 | interface | `telegramCommands.ts`: `/set_position` + `/check_position` handlers + `HELP_TEXT` update + integration tests (`1071-telegram-position-commands.test.ts`) | 1070 |
| 1072 | E3 | infra | `schema.ts` DDL for `ask_queue` + `askQueueStore.ts` (insert, getPending, markProcessing, answer, recoverStale) + unit tests (`1072-ask-queue-store.test.ts`) | — |
| 1073 | E3 | interface | `telegramCommands.ts`: `/ask` handler + integration test (`1073-telegram-ask-command.test.ts`) | 1072 |
| 1074 | E4 | scheduler | `askQueueCheckJob.ts` + register in `jobs.ts` + tests (`1074-ask-queue-check-job.test.ts`) | 1072 |
| 1075 | E5 | domain | `alertPolicyChecker.ts` (`checkPositionDanger`, `checkWatchlistOpportunity`) + `stopLossComputer.ts` (`computeStopLoss`) + `mcp.config.json` alertPolicy section + unit tests (`1075-alert-policy-checker.test.ts`) | — |
| 1076 | E5 | scheduler | `marketScanJob.ts` / `scanMarket.ts`: remove noise Telegram sends (medium moves, heartbeats, volume spikes) + regression test (`1076-market-scan-noise-retirement.test.ts`) | 1075 |
| 1077 | E6 | domain + interface | `kinhDichWrapper.ts` + wire `appendKinhDich` into `analysis.ts`, `marketTools.ts`, `portfolioTools.ts` + tests (`1077-kinh-dich-wrapper.test.ts`) | — |
| 1078 | TOOLS | interface | `askQueueTools.ts`: `get_pending_ask_questions` + `answer_ask_question` + register + tests (`1078-ask-queue-tools.test.ts`) | 1072 |
| 1079 | TOOLS | interface | `positionTools.ts`: `get_user_positions_for_analysis` tool + tests (`1079-position-for-analysis-tool.test.ts`) | 1070 |
| 1080 | E7+E8 | — | Cowork agent `.md` rewrites (Phase 6, delegated to `@cowork-refactory-expert`) | 1070, 1072, 1077, 1078, 1079 |

**Parallel batches possible:**
- Batch A (no dependencies): 1070, 1072, 1075, 1077 can all start simultaneously
- Batch B (wait for Batch A): 1071 (needs 1070), 1073 (needs 1072), 1074 (needs 1072), 1076 (needs 1075), 1078 (needs 1072), 1079 (needs 1070)
- Batch C: 1080 (needs all of 1070, 1072, 1077, 1078, 1079)

Total server-code tasks: 10 (1070–1079). Phase 6 task: 1 (1080).

---

## 16. Acceptance Criteria per Epic

### E1 — Position Ledger

- **AC-E1-1**: Given VCB 1000 @ 75000. Buy 500 @ 80000 → avg = 76667, shares = 1500. Then sell 300 @ 82000 → shares = 1200, avg = 76667 (unchanged).
- **AC-E1-2**: Given FPT 200 shares. Sell 500 → clamped to 200, shares = 0, `closePosition` called, message contains "Chỉ bán được 200 CP".
- **AC-E1-3**: Given HPG 3000 shares. Clear → `closed_at IS NOT NULL`, message = "Đã xóa toàn bộ vị thế HPG".
- **AC-E1-4**: No position for VHM. Buy 1000 @ 45000 → new row: shares=1000, avg_price=45000.
- **Test file**: `src/__tests__/1070-position-ledger.test.ts`

### E2 — Telegram Commands

- **AC-E2-1**: `text: "/set_position FPT 80300 5100"` → reply contains "Mua thêm 5100" and computed avg cost.
- **AC-E2-2**: `text: "/set_position VCB 0 0"` → reply contains "Đã xóa toàn bộ vị thế VCB".
- **AC-E2-3**: `text: "/set_position"` → reply contains usage hint with example.
- **AC-E2-4**: `/check_position` with VCB 1000@75000 + market price 80000 → reply contains "VCB", "75.000", "+6,7%", stop-loss 69750, TP1 82500.
- **Test file**: `src/__tests__/1071-telegram-position-commands.test.ts`

### E3 — /ask Queue

- **AC-E3-1**: Three `/ask` calls at t+0s, t+1s, t+2s → `getPendingAskQuestions` returns them in received_at ASC order.
- **AC-E3-2**: `markAskProcessing(id)` then `answerAskQuestion(id, text, "answered")` → status='answered', `answered_at IS NOT NULL`.
- **AC-E3-3**: `text: "/ask FPT có nên mua không?"` → reply matches `Câu hỏi đã ghi nhận (#[0-9]+)`.
- **AC-E3-4**: `text: "/ask"` (empty) → reply contains usage hint.
- **Test files**: `src/__tests__/1072-ask-queue-store.test.ts`, `src/__tests__/1073-telegram-ask-command.test.ts`

### E4 — askQueueCheck Cron

- **AC-E4-1**: `CRONS` map contains key `"askQueueCheck"` with default `"*/12 * * * *"`.
- **AC-E4-2**: 2 pending rows → `runAskQueueCheck()` → 1 new `agent_signals` row: `to_agent='07-qa-responder'`, `signal_type='pending_questions'`, payload JSON contains `count: 2`.
- **AC-E4-3**: 0 pending rows → `runAskQueueCheck()` → no new `agent_signals` row inserted.
- **Test file**: `src/__tests__/1074-ask-queue-check-job.test.ts`

### E5 — Alert Policy

- **AC-E5-1**: `stopLossHit=true, singleDayDropPct=3.0, newsSentiment=-0.8` → `checkPositionDanger()` = false (drop < 5.0).
- **AC-E5-2**: `stopLossHit=true, singleDayDropPct=6.0, newsSentiment=-0.7` → `checkPositionDanger()` = true.
- **AC-E5-3**: `kinhDichConfidence=80, kinhDichSignal="BUY", newsSentiment=0.2, agentSignalsMajority="BUY"` → `checkWatchlistOpportunity()` = false (sentiment < 0.3).
- **AC-E5-4**: All four at threshold exactly → `checkWatchlistOpportunity()` = true.
- **AC-E5-5**: `computeStopLoss(75000, 1500, 72000)` = `max(72000, 72000, 69750)` = 72000.
- **AC-E5-6** (regression): `scanMarket()` with 3% price drop inserts alert row but does NOT send Telegram to MARKET channel.
- **Test file**: `src/__tests__/1075-alert-policy-checker.test.ts`, `src/__tests__/1076-market-scan-noise-retirement.test.ts`

### E6 — Kinh Dich Default Layer

- **AC-E6-1**: `analyze_stock({code: "VCB"})` with `kinhdich_readings` data → returned text contains "Kinh Dịch:" and "Biến quẻ:".
- **AC-E6-2**: `appendKinhDich("XYZ", "base output", db)` with no hexagram data → returns `"base output\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ."`.
- **AC-E6-3**: `computeReading` throws exception inside `appendKinhDich` → no exception propagated to caller; fallback text returned.
- **Test file**: `src/__tests__/1077-kinh-dich-wrapper.test.ts`

---

*End of TECH-054.*
