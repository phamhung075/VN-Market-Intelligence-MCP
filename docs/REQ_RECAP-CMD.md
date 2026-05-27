# REQ_RECAP-CMD — Requirement Spec: `/recap` `/recapw` `/recapm` On-demand Vietnamese Recap Commands

**Sprint:** RECAP-CMD
**BA author:** ba
**Status:** READY FOR PO SPEC-REVIEW
**Date:** 2026-05-27
**Sprint goal SSOT:** `docs/SPRINT_GOAL_RECAP-CMD.md`
**Handoff:** `docs/handoffs/TASK_RECAP-CMD.md`
**Predecessor pattern (reuse):** `docs/REQ_NEWS-CMD.md`, `handleNews` in `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`
**Sibling sprint (shared code):** NEWS-FULLDAY — `docs/REQ_NEWS-FULLDAY.md` defines `export function stripHtml(...)` at module level

---

## 1. Codebase Verification Summary

All typed object shapes, signatures, and router patterns verified against live code before finalising this spec.

**CONFIRMED — `EveningSummary` type and assembly function.**
File: `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts`
Signature: `export async function assembleEveningSummary(dbOrOptions, sendTelegramFn?): Promise<EveningSummary>`
Injectable via `{ db: Database }`. Returns typed `EveningSummary` object (never serializes to prose). Fields used by `/recap` handler (see Section 3-A):
- `vnIndex?: VnIndexSnapshot` — `{ close, change, changePct, fetchedAt }` — may be undefined when fetch fails.
- `watchlistMovers: WatchlistMover[]` — `{ code, changePct, price, exchange, volume?, rsi14? }` — sorted by `|changePct| DESC`, threshold `>=1%`. May be empty.
- `topStories: TopStory[]` — `{ title, level, sentiment, impactScore }` — up to 5 rows from `rag_analyses` since midnight VN. `title` may contain raw HTML (see Section 2 FR-3 HTML note). `impactScore` is a diagnostic field — NEVER shown to user.
- `topAlerts: BriefingAlert[]` — `{ severity, message, stocks[] }` — up to 5, severity DESC. May be empty.
- `portfolioPnl?: PortfolioPnlResult | null` — `{ items: PositionPnl[], totalPnlAmount, totalPnlPct }`. null when no open positions. undefined on old summaries.
- `newsCount: number` — diagnostic count. NEVER shown.
- `foreignFlowMovers?: ForeignFlowMover[]` — `{ code, foreignNetVol, foreignBuyVol, foreignSellVol }` — top 5 by `|foreignNetVol|`. May be empty or undefined on old summaries. OPTIONAL section — render if non-empty.
- `date: string` — Vietnam date YYYY-MM-DD. Used in the section header.
- Fields `predictionDiag`, `taDiag`, `taSummary`, `predictionSignals`, `generatedAt`, `lastPriceUpdate`, `lastNewsUpdate` — diagnostic/internal. NEVER shown to user.

**CONFIRMED — `PeriodicSummary` type and assembly function.**
File: `apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts`
Signature: `export async function generatePeriodicSummary(periodType, periodEnd?, db?): Promise<PeriodicSummary>`
Fields used by `/recapw`/`/recapm` handlers (see Section 3-B):
- `periodStart: string`, `periodEnd: string` — Vietnam local date YYYY-MM-DD. Used in the date range header.
- `newsCount: number` — count of `rag_analyses` rows in the period.
- `alertCount: number` — count of `alerts` rows in the period.
- `reportCount: number` — count of `financial_reports` rows in the period.
- `keyEvents: Array<{ date, title, impact, direction }>` — rows with `impact_score >= 6`. `title` may contain HTML (see FR-3 note). `impact` numeric value is NEVER shown.
- `stockPerformance: Record<string, StockPeriodPerformance>` — `{ changePct: number|null, alertCount: number, firstPrice, lastPrice }`.
- `alertsSummary: { total, bySeverity: Record<string,number>, topAlerts: string[] }` — breakdown by severity label.
- `summaryText: string` — English jargon-filled prose. NEVER used. NEVER piped to Telegram. NEVER shown to user.
- `recommendation: Record<string,{outlook, confidence, reasoning}>` — English + numeric confidence. NEVER shown to user.
- `macroContext: Record<string, number|null>` — raw DB macro numbers. NEVER shown to user (internal diagnostic).

**CONFIRMED — `handleNews` + `chunkStories` + router pattern.**
File: `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`
- `handleNews` at L510: `function handleNews(db, args): { texts: string[] }` — synchronous, no async. The new handlers are async (assembly fns are async).
- `chunkStories` at L480: `function chunkStories(header, storyBlocks, maxLen=4096): string[]` — reused unchanged.
- Router at L633: `/news` branch: `const newsResult = handleNews(db, args); return { text: newsResult.texts[0] ?? "", texts: newsResult.texts, chatId };` — new commands use the same shape.
- `handleTelegramCommand` is already `async` (L612) — awaiting new async handlers is free.
- `sentimentLabel`, `fmtNum`, `midnightVietnamAsUtcInline` are existing helpers at L90/L461 — reuse for formatting.

**CONFIRMED — `stripHtml` is defined by sibling sprint NEWS-FULLDAY.**
Per `docs/REQ_NEWS-FULLDAY.md` FR-3 AC-FR3-10: `export function stripHtml(raw: string | null | undefined): string` is a module-level export in `telegramCommands.ts`. RECAP-CMD handlers call it for any field that may contain HTML (`source_title`, news event titles). Developer implements both sprints in one pass per the router's confirmed one-rebuild plan — `stripHtml` will already be present when the recap handlers are added. RECAP-CMD must NOT define a second `stripHtml`.

**CONFIRMED — webhook send-loop.**
File: `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` L86: `const chunks = result.texts ?? [result.text];` — iterates all chunks. New commands plug in for free. No change to this file.

**CONFIRMED — `assembleEveningSummary` accepts `{ db: Database }` for test injection.**
The overload at L355 accepts `Database | AssembleEveningSummaryOptions`. Passing `{ db: inMemoryDb }` injects the test DB without touching any real filesystem or HTTP. No `mock.module` needed in unit tests.

**CONFIRMED — `generatePeriodicSummary` accepts `db?: Database` as third argument.**
Signature at L610: `generatePeriodicSummary(periodType, periodEnd?, db?)`. Passing an in-memory DB as third arg injects the test DB cleanly.

---

## 2. Locked Decisions (carry through entire pipeline — do not re-open)

1. **Data source is 100% in-container DB.** No `docs/recaps/*.md` read, no compose volume change, no filesystem dependency.
2. **Render from typed fields only.** `buildSummaryText()` and `PeriodicSummary.summaryText` are BANNED from the render path. No English field name, no numeric confidence, no jargon in any output string.
3. **No new DB table, MCP tool, cron, microservice, or compose change.** Synchronous read-only pull, ~1s.
4. **`stripHtml` is defined once in NEWS-FULLDAY, reused here.** Never define a second copy.
5. **Plain comprehensible Vietnamese.** Direction + delta % on every move. vi-VN number format (`fmtNum`). No analyst jargon.

---

## 3. Section Layout Specifications (Vietnamese Labels LOCKED)

### 3-A. `/recap` — renders from `EveningSummary`

Handler: `handleRecap(db: Database): Promise<{ texts: string[] }>`

The handler calls `assembleEveningSummary({ db })` and builds the following section sequence. Each section is a standalone string block fed to `chunkStories`. The header is the first block. The section order below is binding — architect must not reorder.

**Section 1 — HEADER (always present)**
```
Tổng kết ngày {date}
```
`date` = `summary.date` (YYYY-MM-DD Vietnam local). Always included.

**Section 2 — VN-Index (present only when `summary.vnIndex` is defined)**
Vietnamese label: `VN-Index`
Format: `VN-Index: {close} điểm ({direction} {|change| điểm, {direction} {|changePct|}%)`
- `direction` = `tăng` when `change >= 0`, `giảm` when `change < 0`.
- `close`, `change`, `changePct` from `vnIndex.close`, `vnIndex.change`, `vnIndex.changePct`.
- Numbers formatted with `fmtNum`. `changePct` formatted to 2 decimal places with comma decimal (vi-VN).
- Example: `VN-Index: 1.287 điểm (tăng 12 điểm, tăng 0,94%)`
- When `summary.vnIndex` is undefined: OMIT this section entirely (no placeholder, no "không có").

**Section 3 — WATCHLIST MOVERS (always present, even when empty)**
Vietnamese label: `Cổ phiếu nổi bật`
- When `watchlistMovers` is non-empty: one line per mover: `{code}: {direction} {|changePct|}% (giá {price})`
  - `direction` = `tăng` when `changePct >= 0`, `giảm` when `changePct < 0`.
  - `changePct` formatted to 2 decimal places, vi-VN (comma decimal).
  - `price` formatted with `fmtNum` (VND, rounded, no decimal).
  - Example: `VCB: tăng +2,30% (giá 88.000)`
- When `watchlistMovers` is empty: `Không có cổ phiếu nào biến động đáng kể hôm nay.`
- Header line of section: `Cổ phiếu nổi bật:`

**Section 4 — TOP NEWS (present only when `topStories` has at least one entry)**
Vietnamese label: `Tin tức nổi bật`
- Header line: `Tin tức nổi bật (${topStories.length} bài):`
- One line per story: stripped title only (`stripHtml(story.title)`). No sentiment, no impact_score shown.
- Null/empty title: render as `(không có tiêu đề)`.
- When `topStories` is empty: OMIT this section entirely.

**Section 5 — ALERTS (present only when `topAlerts` has at least one entry)**
Vietnamese label: `Cảnh báo`
- Header line: `Cảnh báo:`
- One line per alert: `[{severityLabel}] {message}`
  - `severityLabel` mapping: `critical` → `Nghiêm trọng`, `warning` → `Cảnh báo`, `info` → `Thông tin`. Unrecognized severity → `Thông tin`.
  - `message` rendered as-is (already plain text in the DB). Truncated to 120 chars if longer, append `…`.
- When `topAlerts` is empty: OMIT this section entirely.

**Section 6 — PORTFOLIO P/L (present only when `portfolioPnl` is not null/undefined)**
Vietnamese label: `Danh mục`
- Header line: `Danh mục:`
- One line per position: `{code}: {direction} {|pnlPct|}% ({direction} {|pnlAmount| đ)`
  - When `item.pnlPct` is null (no live price): `{code}: chưa có giá`.
  - `direction` = `lãi` when `pnlAmount >= 0`, `lỗ` when `pnlAmount < 0`.
  - `pnlPct` to 2 decimal places, vi-VN. `pnlAmount` with `fmtNum`.
  - Example: `VCB: lãi +2,30% (lãi 460.000 đ)`
- Aggregate footer line: `Tổng: {direction} {|totalPnlPct|}% ({direction} {|totalPnlAmount| đ)`
  - `direction` = `lãi` when `totalPnlAmount >= 0`, `lỗ` when negative.
- When `portfolioPnl` is null or undefined: OMIT this section entirely.

**Section 7 — FOREIGN FLOW (present only when `foreignFlowMovers` is defined and non-empty)**
Vietnamese label: `Khối ngoại`
- Header line: `Khối ngoại:`
- One line per mover: `{code}: {direction} {|foreignNetVol|} cổ phiếu`
  - `direction` = `mua ròng` when `foreignNetVol > 0`, `bán ròng` when `foreignNetVol < 0`.
  - `foreignNetVol` with `fmtNum`.
  - Example: `VCB: mua ròng 500.000 cổ phiếu`
- When `foreignFlowMovers` is undefined or empty: OMIT this section entirely.

**Empty-state for `/recap` (when assembly returns an entirely thin result — no movers, no news, no alerts, no pnl, no vnIndex):**
```
Hôm nay chưa có dữ liệu tổng kết.
```
This string is returned as `{ texts: ["Hôm nay chưa có dữ liệu tổng kết."] }` when the assembled summary contains no displayable content in any section (Sections 2-7 all absent and Section 3 empty-state is the only non-header content). Implementation note: in practice the header (Section 1) + Section 3 empty-state are always emitted, so the full empty-state path fires only if the assembly function itself throws.

**DB/assembly error fallback:**
When `assembleEveningSummary` throws: return `{ texts: ["Lỗi khi tổng kết ngày. Vui lòng thử lại sau."] }`.

---

### 3-B. `/recapw` and `/recapm` — renders from `PeriodicSummary`

Handler `/recapw`: `handleRecapWeek(db: Database): Promise<{ texts: string[] }>`
— calls `generatePeriodicSummary("weekly", undefined, db)`

Handler `/recapm`: `handleRecapMonth(db: Database): Promise<{ texts: string[] }>`
— calls `generatePeriodicSummary("monthly", undefined, db)`

Both share the same section layout. The only difference is the period label in Section 1. All section labels below are LOCKED.

**Section 1 — HEADER (always present)**
- `/recapw`: `Tổng kết tuần {periodStart} đến {periodEnd}`
- `/recapm`: `Tổng kết tháng {periodStart} đến {periodEnd}`
`periodStart`, `periodEnd` from `summary.periodStart` and `summary.periodEnd` (YYYY-MM-DD).

**Section 2 — TOTALS (always present)**
Vietnamese label: `Tổng quan`
Format (single block):
```
Tổng quan:
Tin tức: {newsCount} bài
Cảnh báo: {alertCount} cảnh báo
Báo cáo tài chính: {reportCount} báo cáo
```
`newsCount`, `alertCount`, `reportCount` directly from typed fields. Always shown even when zero.

**Section 3 — KEY EVENTS (present only when `keyEvents` is non-empty)**
Vietnamese label: `Sự kiện nổi bật`
- Header line: `Sự kiện nổi bật:`
- One line per event (up to 5): `{localDate} — {direction} — {strippedTitle}`
  - `localDate` = `event.date.slice(0, 10)` (YYYY-MM-DD date part).
  - `direction` mapping from `event.direction`: `"up"` → `tăng`, `"down"` → `giảm`, `"neutral"` → `ổn định`, other/empty → `ổn định`.
  - `strippedTitle` = `stripHtml(event.title)`. Truncated to 100 chars if longer, append `…`.
  - `event.impact` numeric value is NEVER shown.
  - Example: `2026-05-26 — tăng — Lãi suất điều hành giảm thêm 0,5 điểm`
- When `keyEvents` is empty: OMIT this section entirely.

**Section 4 — PER-STOCK MOVES (present only when `stockPerformance` has at least one entry with a non-null `changePct`)**
Vietnamese label: `Biến động cổ phiếu`
- Header line: `Biến động cổ phiếu:`
- One line per stock code that has `changePct !== null`, sorted by `|changePct| DESC`:
  `{code}: {direction} {|changePct|}%`
  - `direction` = `tăng` when `changePct >= 0`, `giảm` when negative.
  - `changePct` to 2 decimal places, vi-VN.
  - Example: `VCB: tăng +3,50%`
- Stocks with `changePct === null`: OMIT from this section (no price data, no placeholder line per stock).
- When no stock has non-null `changePct`: OMIT this section entirely.

**Section 5 — ALERT BREAKDOWN (present only when `alertCount > 0`)**
Vietnamese label: `Phân loại cảnh báo`
- Header line: `Phân loại cảnh báo:`
- One line per severity present in `alertsSummary.bySeverity`: `{severityLabel}: {count}`
  - `severityLabel` mapping: `critical` → `Nghiêm trọng`, `warning` → `Cảnh báo`, `info` → `Thông tin`, `high` → `Cao`, other → `Khác`.
- Up to 3 top alert messages from `alertsSummary.topAlerts`:
  `- {message}` (truncated to 100 chars if longer, append `…`).
- When `alertCount === 0`: OMIT this section entirely.

**Empty-state for `/recapw`:**
```
Tuần này chưa đủ dữ liệu để tổng kết.
```
Returned as `{ texts: ["Tuần này chưa đủ dữ liệu để tổng kết."] }` only when the assembly function throws.

**Empty-state for `/recapm`:**
```
Tháng này chưa đủ dữ liệu để tổng kết.
```
Returned as `{ texts: ["Tháng này chưa đủ dữ liệu để tổng kết."] }` only when the assembly function throws.

**DB/assembly error fallback (same pattern for both):**
- `/recapw` error: `{ texts: ["Lỗi khi tổng kết tuần. Vui lòng thử lại sau."] }`
- `/recapm` error: `{ texts: ["Lỗi khi tổng kết tháng. Vui lòng thử lại sau."] }`

---

## 4. Handler Signatures and Router Wiring

### 4-A. Handler signatures

All three handlers live in `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`.

```typescript
async function handleRecap(db: Database): Promise<{ texts: string[] }>
async function handleRecapWeek(db: Database): Promise<{ texts: string[] }>
async function handleRecapMonth(db: Database): Promise<{ texts: string[] }>
```

Each handler:
1. Calls its assembly function with the injected `db`.
2. Builds section blocks as plain strings (one block per section as described in Section 3).
3. Calls `chunkStories(header, sectionBlocks, 4096)` where `header` is the Section 1 string.
4. Returns `{ texts: chunks }`.
5. Catches all exceptions — never throws.

### 4-B. Router wiring in `handleTelegramCommand`

Mirror the `/news` branch exactly (L633). Place the three new branches BEFORE the `switch` block, alongside the `/news` branch:

```typescript
if (cmd === "/news") {
  const r = handleNews(db, args);
  return { text: r.texts[0] ?? "", texts: r.texts, chatId };
}
if (cmd === "/recap") {
  const r = await handleRecap(db);
  return { text: r.texts[0] ?? "", texts: r.texts, chatId };
}
if (cmd === "/recapw") {
  const r = await handleRecapWeek(db);
  return { text: r.texts[0] ?? "", texts: r.texts, chatId };
}
if (cmd === "/recapm") {
  const r = await handleRecapMonth(db);
  return { text: r.texts[0] ?? "", texts: r.texts, chatId };
}
```

The `await` is required because the assembly functions are async. `handleTelegramCommand` is already `async` — no signature change needed.

### 4-C. `assembleEveningSummary` import requirement

The handler must import `assembleEveningSummary` from `../../application/usecases/assembleEveningSummary.js` and `generatePeriodicSummary` from `../../application/usecases/generatePeriodicSummary.js`. These are new imports relative to the current `telegramCommands.ts` file.

---

## 5. HELP_TEXT Lines (LOCKED)

Add three lines to the existing `HELP_TEXT` constant in `telegramCommands.ts`. Insert after the `/news` line:

```
/recap                  Tổng kết hôm nay (chỉ số, cổ phiếu, tin tức, cảnh báo, danh mục)
/recapw                 Tổng kết tuần này
/recapm                 Tổng kết tháng này
```

These must also appear in the `/help` command output. The existing `/news` line is modified in the sibling NEWS-FULLDAY sprint — no conflict.

---

## 6. Chunk-Boundary Acceptance Criterion

**AC-CHUNK-1:** A recap message that exceeds 4096 characters when fully assembled is split by `chunkStories` at section (block) boundaries. No section block is split mid-text across two chunks.

**AC-CHUNK-2:** Each element of `result.texts[]` is at most 4096 characters.

**AC-CHUNK-3:** All sections appear across the full `result.texts[]` array — nothing is silently dropped.

**AC-CHUNK-4:** The `webhookHandler.ts` send-loop iterates `result.texts ?? [result.text]` — it already handles the multi-chunk case. No change to `webhookHandler.ts`.

**Implementation note:** `chunkStories` takes a `header` (Section 1 string) and `storyBlocks` (array of remaining section strings). Section blocks are the natural split unit. A section block that is itself longer than 4096 characters (e.g. a very long stock-movers list) must itself be split at line boundaries — developer handles this edge case per architect guidance (see Section 8-B).

---

## 7. Unit Test Matrix

All tests extend `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts`. Follow the established pattern exactly: in-memory Bun SQLite DB via `makeDb()` extended with the required additional tables, injected fake assembly functions via a thin wrapper, zero network, zero credentials, zero filesystem.

### 7-A. Test DB Schema Extensions

The existing `makeDb()` function creates the core tables. The recap tests need additional tables. Add a `makeRecapDb()` helper (or extend `makeDb()`) that also creates:

```sql
CREATE TABLE IF NOT EXISTS market_prices (code TEXT PRIMARY KEY, price REAL, change_pct REAL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS daily_ohlcv (code TEXT NOT NULL, date TEXT NOT NULL, open REAL, high REAL, low REAL, close REAL, volume REAL, foreign_net_vol REAL, foreign_buy_vol REAL, foreign_sell_vol REAL, updated_at TEXT, PRIMARY KEY(code, date));
CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, shares REAL NOT NULL DEFAULT 0, avg_price REAL NOT NULL DEFAULT 0, opened_at TEXT NOT NULL, closed_at TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS commodity_prices (vix REAL, dxy REAL, sp500 REAL, hang_seng REAL, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS macro_indicators (country TEXT, cpi REAL, gdp_growth REAL, interest_rate REAL);
CREATE TABLE IF NOT EXISTS market_summaries (id TEXT PRIMARY KEY, period_type TEXT, period_start TEXT, period_end TEXT, created_at TEXT, updated_at TEXT, summary_text TEXT, key_events_json TEXT, stock_performance_json TEXT, alerts_summary_json TEXT, macro_context_json TEXT, recommendation_json TEXT, news_count INTEGER, alert_count INTEGER, report_count INTEGER, UNIQUE(period_type, period_start));
CREATE TABLE IF NOT EXISTS financial_reports (id TEXT PRIMARY KEY, parsed_at TEXT);
CREATE TABLE IF NOT EXISTS prediction_signals (id TEXT PRIMARY KEY, created_at TEXT, severity TEXT, ticker TEXT, signal_type TEXT, description TEXT);
CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY, company_name TEXT, exchange TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'other', notes TEXT, added_at TEXT NOT NULL, alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5, alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1);
```

### 7-B. Fake Assembly Function Injection

Because `assembleEveningSummary` and `generatePeriodicSummary` depend on the `mcpConfig` watchlist and on DB writes (the evening assembly writes a JSON file; the periodic summary upserts into `market_summaries`), the handlers must be designed for testability using a **thin wrapper pattern**:

The developer wraps the assembly call in an injectable override parameter. Each handler accepts an optional override argument for testing:

```typescript
async function handleRecap(
  db: Database,
  assembleFn?: (db: Database) => Promise<EveningSummary>
): Promise<{ texts: string[] }>

async function handleRecapWeek(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicSummary>
): Promise<{ texts: string[] }>

async function handleRecapMonth(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicSummary>
): Promise<{ texts: string[] }>
```

Production path: `assembleFn` is omitted, handler calls the real assembly function.
Test path: `assembleFn` is provided, returns a hardcoded typed object. Zero real DB writes. Zero file I/O.

The router passes no `assembleFn` — production behavior is unchanged.

**Alternatively**, the architect may confirm that passing the in-memory DB directly to the real assembly functions (using the injectable `db` parameter already built into both functions) avoids all side effects in a test environment, making the `assembleFn` wrapper unnecessary. If the architect confirms this, the wrapper is not needed and tests call the real functions with the test DB. The architect documents the chosen approach. Either satisfies the zero-credentials, zero-network test requirement.

### 7-C. Test Cases

All test IDs follow the T-RECAP prefix.

**describe block: `handleRecap — /recap command`**

| Test ID | Scenario | Seed / Fake | Assertion |
|---------|----------|-------------|-----------|
| T-RECAP-1 | Happy path — VN-Index present, 2 movers, 2 stories, 1 alert, 1 position. | Fake assembly returns `EveningSummary` with `vnIndex={close:1287, change:12, changePct:0.94}`, `watchlistMovers=[{code:"VCB",changePct:2.3,price:88000}]`, `topStories=[{title:"Tiêu đề A",…},{title:"Tiêu đề B",…}]`, `topAlerts=[{severity:"warning",message:"Giảm sàn",stocks:[]}]`, `portfolioPnl={items:[{code:"VCB",pnlPct:2.3,pnlAmount:460000,shares:200,avgPrice:85800,currentPrice:88000,currentPriceMissing:false}],totalPnlAmount:460000,totalPnlPct:2.3}`. | `result.texts` is non-empty array. Joined output contains `VN-Index`, `tăng`, `1.287`, `VCB`, `tăng +2,30%`, `Tiêu đề A`, `Tiêu đề B`, `Cảnh báo`, `Danh mục`. Does NOT contain `summaryText`, `confidence`, `impactScore`, `0.94` as raw number without Vietnamese context (i.e. must not appear as bare `0.94`). |
| T-RECAP-2 | Empty state — `vnIndex` undefined, `watchlistMovers=[]`, `topStories=[]`, `topAlerts=[]`, `portfolioPnl=null`. | Fake returns `EveningSummary` with all empty/null optional fields. `date="2026-05-27"`. | Output contains `Tổng kết ngày 2026-05-27`. Output contains `Không có cổ phiếu nào biến động đáng kể hôm nay.`. Sections for VN-Index, News, Alerts, Portfolio are absent. Output does NOT contain `undefined`, `null`, `NaN`. |
| T-RECAP-3 | Chunk boundary — assembled text > 4096 chars. | Fake returns `EveningSummary` with `watchlistMovers` array of 30 movers (each with long code, changePct, price) and `topStories` array of 5 long titles. | `result.texts` has length >= 2. Every element of `result.texts` has `length <= 4096`. All 30 mover codes appear somewhere in `result.texts.join("\n")`. |
| T-RECAP-4 | HTML in story title — `topStories[0].title = "<b>VN-Index tăng</b>"`. | Fake returns EveningSummary with one story whose title has HTML. | Output does NOT contain `<b>`, `<`, `>`. Output DOES contain `VN-Index tăng`. |
| T-RECAP-5 | Assembly throws — simulate DB error. | Fake `assembleFn` throws `new Error("DB locked")`. | Result is non-null. `result.texts[0]` contains `Lỗi`. Does NOT throw. `result.chatId` is preserved. |
| T-RECAP-6 | `portfolioPnl` undefined (old summary). | Fake returns EveningSummary with `portfolioPnl = undefined`. | Output does NOT contain `Danh mục`. No crash. |
| T-RECAP-7 | Position with null price. | Fake returns EveningSummary with one position `{code:"HPG",pnlPct:null,pnlAmount:null,currentPrice:null,shares:100,avgPrice:50000}`. | Output contains `HPG: chưa có giá`. Does NOT contain `null`. |

**describe block: `handleRecapWeek — /recapw command`**

| Test ID | Scenario | Seed / Fake | Assertion |
|---------|----------|-------------|-----------|
| T-RECAPW-1 | Happy path — news/alert/report totals, key events, stock moves. | Fake `generatePeriodicSummary("weekly")` returns `PeriodicSummary` with `periodStart:"2026-05-25"`, `periodEnd:"2026-05-31"`, `newsCount:42`, `alertCount:8`, `reportCount:3`, `keyEvents:[{date:"2026-05-26T…",title:"Lãi suất giảm",impact:7.5,direction:"up"}]`, `stockPerformance:{"VCB":{changePct:3.5,alertCount:2,firstPrice:85000,lastPrice:88000}}`, `alertsSummary:{total:8,bySeverity:{warning:5,info:3},topAlerts:["Cảnh báo A","Cảnh báo B"]}`. | Output contains `Tổng kết tuần`, `2026-05-25`, `2026-05-31`, `Tin tức: 42 bài`, `Cảnh báo: 8 cảnh báo`, `Báo cáo tài chính: 3 báo cáo`, `Lãi suất giảm`, `tăng`, `VCB: tăng +3,50%`. Does NOT contain `summaryText`, `recommendation`, `confidence`, `7.5`, `[UP]`. |
| T-RECAPW-2 | Empty period — zero news, zero alerts, zero reports, no key events. | Fake returns `PeriodicSummary` with `newsCount:0`, `alertCount:0`, `reportCount:0`, `keyEvents:[]`, `stockPerformance:{}`, `alertsSummary:{total:0,bySeverity:{},topAlerts:[]}`. | Output contains `Tổng quan`, `Tin tức: 0 bài`, `Cảnh báo: 0 cảnh báo`. Sections for Key Events, Stock Moves, Alert Breakdown are absent. Output does NOT contain `undefined`, `NaN`. |
| T-RECAPW-3 | Chunk boundary — many stocks + many events produce > 4096 chars. | Fake returns `PeriodicSummary` with `stockPerformance` containing 30 entries and `keyEvents` containing 5 long-title events. | `result.texts` array has at least 1 element. Every element `<= 4096` chars. All stock codes appear in joined output. |
| T-RECAPW-4 | Assembly throws. | Fake throws. | Result non-null. `result.texts[0]` contains `Lỗi`. No throw. |

**describe block: `handleRecapMonth — /recapm command`**

| Test ID | Scenario | Seed / Fake | Assertion |
|---------|----------|-------------|-----------|
| T-RECAPM-1 | Happy path — month range shown correctly. | Fake returns `PeriodicSummary` with `periodStart:"2026-05-01"`, `periodEnd:"2026-05-31"`, representative data. | Output contains `Tổng kết tháng`, `2026-05-01`, `2026-05-31`. All section labels present for non-empty data. |
| T-RECAPM-2 | Empty month. | Fake returns sparse `PeriodicSummary` with all zeros. | Output contains `Tháng này chưa đủ dữ liệu` OR the Totals section with zeros. Does not crash. (Note: the full empty-state string fires only on a throw; zero-data is rendered normally with zero counts — both paths are acceptable here; the test verifies no crash and no jargon.) |
| T-RECAPM-3 | Assembly throws. | Fake throws. | `result.texts[0]` contains `Lỗi`. No throw. |

**describe block: `handleTelegramCommand routing — /recap /recapw /recapm`**

| Test ID | Scenario | Seed / Fake | Assertion |
|---------|----------|-------------|-----------|
| T-RECAP-RT-1 | `/recap` routed — command recognised. | Real `handleTelegramCommand` call with `/recap` text; real in-memory DB with minimal tables. | Result is not null. `result.chatId` preserved. `result.texts` is defined and non-empty. No throw. |
| T-RECAP-RT-2 | `/recapw` routed — command recognised. | Same as above with `/recapw`. | Same assertions. |
| T-RECAP-RT-3 | `/recapm` routed — command recognised. | Same as above with `/recapm`. | Same assertions. |
| T-RECAP-RT-4 | `/help` lists all 3 new commands. | `makeUpdate("/help")` with real DB. | `result.text` contains `/recap`, `/recapw`, `/recapm`. |

---

## 8. Non-Functional Requirements

### NFR-1 — Plain comprehensible Vietnamese (binding — from `feedback_market_report_plain_vietnamese`)

- NFR-1-AC-1: No numeric `impact_score` value in any output string.
- NFR-1-AC-2: No English field name (`summaryText`, `recommendation`, `confidence`, `changePct`, `totalPnlAmount`, `keyEvents`, `stockPerformance`, etc.) in output.
- NFR-1-AC-3: No analyst jargon (σ, bp, Layer #, citations, hexagram terms, `[UP]`, `[DN]`, outlook keywords like "bullish"/"bearish").
- NFR-1-AC-4: No HTML markup (`<` or `>`) in any rendered output.
- NFR-1-AC-5: Every price/percentage move shows direction (`tăng`/`giảm`) and delta amount, not just a bare number. `fmtNum` for vi-VN formatting.
- NFR-1-AC-6: `buildSummaryText()` return value and `summaryText` field are NEVER present in any output string. Developer verifies by grep of the rendered test output.

### NFR-2 — No new push, cron, or background job

- NFR-2-AC-1: No new cron job or scheduled Telegram push introduced.
- NFR-2-AC-2: Alert-commander and MARKET push lanes are untouched.

### NFR-3 — Zone isolation

- NFR-3-AC-1: All code changes in `apps/mcp-server/` only.
- NFR-3-AC-2: No `docker-compose.yml` volume change, no new DB table, no new MCP tool, no new microservice.
- NFR-3-AC-3: No import from outside `apps/mcp-server/src/`.

### NFR-4 — Never throws (router contract)

- NFR-4-AC-1: All three handlers catch all exceptions. No exception propagates to `handleTelegramCommand`'s outer try/catch.
- NFR-4-AC-2: A broken/empty DB returns a Vietnamese error string, not a stack trace or `undefined`.

### NFR-5 — Test baseline non-regression

Source: `docs/data/project-stats.json` (floor 9408 PASS).

- NFR-5-AC-1: Net test count after adding the recap test suite must not drop below the floor.
- NFR-5-AC-2: Existing T-NEWS-1..8 pass without modification.
- NFR-5-AC-3: `tsc` reports zero type errors after the change.
- NFR-5-AC-4: `stripHtml` import used from NEWS-FULLDAY implementation — no duplicate definition. If NEWS-FULLDAY is not yet merged, developer stubs `stripHtml` identically to the agreed NEWS-FULLDAY signature (`export function stripHtml(raw: string | null | undefined): string`) and marks the stub for replacement; the router one-rebuild merges both sprints before ops rebuild.

### NFR-6 — Synchronous pull, ~1s reply

- NFR-6-AC-1: The assembly functions complete in ~1s on the production DB. No LLM call, no external HTTP in the render path.
- NFR-6-AC-2: The `generatePeriodicSummary` side-effect upsert into `market_summaries` is idempotent and does not fail the handler if it errors (already handled internally by the use-case).

---

## 9. DDD Layer Mapping

| Requirement | Layer | Location |
|---|---|---|
| Handler logic — section builder, direction labels, Vietnamese strings | **Interface / Presentation** | `telegramCommands.ts` — three new handler functions |
| Call to `assembleEveningSummary` | **Application** (orchestration call to existing use-case) | `telegramCommands.ts` calls into `application/usecases/` |
| Call to `generatePeriodicSummary` | **Application** (orchestration call to existing use-case) | `telegramCommands.ts` calls into `application/usecases/` |
| `assembleEveningSummary` — DB reads, JSON write, freshness gate | **Application / Infrastructure** | `assembleEveningSummary.ts` — existing, NOT modified |
| `generatePeriodicSummary` — DB reads, market_summaries upsert | **Application / Infrastructure** | `generatePeriodicSummary.ts` — existing, NOT modified |
| `EveningSummary`, `PeriodicSummary` typed objects | **Domain** (value objects returned by use-cases) | `assembleEveningSummary.ts`, `generatePeriodicSummary.ts` — existing, read-only |
| `PortfolioPnlResult` typed object | **Domain** | `portfolioPnlCalculator.ts` — existing, read-only |
| `chunkStories`, `fmtNum`, `sentimentLabel`, `stripHtml` — render helpers | **Interface** | `telegramCommands.ts` — existing helpers reused; `stripHtml` from NEWS-FULLDAY |
| Router wiring — three new branches in `handleTelegramCommand` | **Interface** | `telegramCommands.ts` — router |
| `HELP_TEXT` update | **Interface** | `telegramCommands.ts` — constant |
| Unit tests — injected fakes, in-memory DB | **Testing** | `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` |
| Webhook send-loop — `result.texts ?? [result.text]` | **Interface** | `webhookHandler.ts` — existing, NOT modified |

---

## 10. Edge Cases

| Edge case | Expected behaviour |
|---|---|
| `vnIndex` undefined (VPS price fetch failed) | Section 2 omitted entirely. Handler does not crash. Rest of recap renders normally. |
| `watchlistMovers` empty (no stock moved >= 1%) | Section 3 shows `Không có cổ phiếu nào biến động đáng kể hôm nay.` below the label. |
| `topStories[i].title` contains HTML (`<b>VN-Index tăng</b>`) | `stripHtml` returns `VN-Index tăng`. No angle brackets in output. |
| `portfolioPnl.items[i].pnlPct === null` | Renders `{code}: chưa có giá`. Aggregate footer still shown if other positions have prices. |
| `portfolioPnl.items` is empty array (but `portfolioPnl` itself is not null) | Section 6 shows header `Danh mục:` + aggregate footer only (no per-position lines). |
| `foreignFlowMovers` = `[]` or `undefined` | Section 7 omitted entirely. |
| `keyEvents` event `direction` is an unrecognized value | Defaults to `ổn định`. No crash. |
| `keyEvents[i].title` contains HTML | `stripHtml` applied, tags removed. |
| `stockPerformance` record has all `changePct = null` | Section 4 of periodic recap omitted entirely. |
| A single section block > 4096 chars (e.g. 40 movers) | Developer splits this block at newline boundaries before passing to `chunkStories`. Architect confirms split strategy. |
| Assembly function side-effect (evening JSON write, weekly DB upsert) fails | Already handled gracefully inside the use-cases (logger.warn, no throw). Handler unaffected. |
| Cold DB — missing tables | Assembly functions' try/catch blocks return empty arrays. Handler renders empty sections with Vietnamese fallback text. No crash. |
| `/recap` called at midnight (no rag_analyses since midnight yet) | `topStories = []`. Section 4 omitted. Rest renders with what is available. |
| `generatePeriodicSummary` upsert into `market_summaries` — conflict on `(period_type, period_start)` | `ON CONFLICT DO UPDATE` — idempotent. No error. |

---

## 11. Architect-Deferred Design Decisions

Two items require architect confirmation before dev starts. Both are small-scope.

### B1 — Section-block overflow: how to split a single block > 4096 chars

`chunkStories` splits at block boundaries, not within a block. A section block (e.g. 40 watchlist movers, each on its own line) may itself exceed 4096 chars. The BA recommends the developer pre-splits such blocks at newline boundaries with a trailing `(tiếp theo…)` continuation marker. The architect confirms or specifies an alternative split strategy, and documents the maximum realistic block size for the production watchlist (30 tickers) to confirm this edge case is real.

### B2 — Test injection strategy: `assembleFn` wrapper vs real assembly with in-memory DB

Two valid approaches (described in Section 7-B). The architect confirms which is cleaner given the file-write side-effect in `assembleEveningSummary` (which uses `reportsDir` and calls `writeFileSync`) and the DB-upsert side-effect in `generatePeriodicSummary`. If the real assembly functions work cleanly with an in-memory DB and a `reportsDir` of `/tmp/test-reports` (injected via options), the wrapper approach is unnecessary. Architect decides.

---

## 12. Files to Create / Modify

| File | Action | Owner |
|---|---|---|
| `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` | MODIFY — add `handleRecap`, `handleRecapWeek`, `handleRecapMonth` handlers; add three router branches in `handleTelegramCommand`; update `HELP_TEXT` with three new lines; add imports for `assembleEveningSummary` and `generatePeriodicSummary`. Reuse `stripHtml` from NEWS-FULLDAY (do not define a second copy). | dev-mcp-server |
| `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` | MODIFY — add T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4 test cases as described in Section 7; add `makeRecapDb()` or extend `makeDb()` for additional tables. | dev-mcp-server |
| `docs/architecture/microservice/mcp-server/` | UPDATE — add RECAP-CMD command entries if a commands reference doc exists. | dev-mcp-server |

No changes to:
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` — already handles `result.texts`.
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` — called as-is.
- `apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts` — called as-is.
- Any file outside `apps/mcp-server/`.
- `docker-compose.yml`, any DB schema file, any cron/scheduler file.

---

## 13. Out of Scope (do not implement)

- Any change to `/news` behavior — that is NEWS-FULLDAY's deliverable.
- Mounting `docs/recaps/*.md` into the container.
- LLM call in the render path.
- New microservice, new DB table, new MCP tool, new cron job.
- Reading `PeriodicSummary.summaryText` or `recommendation` for user display.
- Any flag or option to choose between English and Vietnamese output — Vietnamese is the only output.
- Push to MARKET channel from these handlers — pull-only.

---

## 14. Done Bar

| DoD item | Maps to |
|---|---|
| `/recap` replies in ~1s with plain-VN day synthesis (VN-Index + movers + news + alerts + portfolio) | FR spec Sections 3-A, success metric |
| `/recapw` replies with week period range + totals + key events + stock moves + alert breakdown | FR spec Section 3-B |
| `/recapm` replies with month range — same shape as `/recapw` | FR spec Section 3-B |
| All output plain Vietnamese — no jargon, no English field names, no numeric confidence, no HTML | NFR-1 |
| Direction + delta % on every move; vi-VN number format | NFR-1-AC-5 |
| `summaryText` / `buildSummaryText()` are provably absent from every output string | NFR-1-AC-6 |
| Empty-state strings return the correct Vietnamese phrase per command | Sections 3-A, 3-B |
| Recap > 4096 chars splits at section boundaries — no section broken mid-text | AC-CHUNK-1..3 |
| All three commands present in `HELP_TEXT` and `/help` output | Section 5 |
| `stripHtml` is reused from NEWS-FULLDAY — zero second definition | NFR-5-AC-4 |
| T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4 all pass | Section 7 |
| Existing T-NEWS-1..8 still pass (zero regression) | NFR-5-AC-2 |
| `tsc` zero errors | NFR-5-AC-3 |
| ops REBUILD + FORCE-RECREATE mcp-server after code change | carry from handoff constraints |
| QA live-verifies `/recap`, `/recapw`, `/recapm` on `zenmidi.com/vn-market/webhook` | Sprint success metric |
| `/news` behavior is unchanged | Out of scope confirmed |

---

## 15. Blockers — None

No PO-level blocker. All product decisions are locked. Two architect-scoped decisions (B1, B2) are provided with BA recommendations. Coding must not start until the architect confirms both.

Pipeline is clean: BA (this spec) → architect (B1+B2 confirmation) → pm → dev-mcp-server → ops (rebuild + force-recreate) → QA (live) → PO sign-off.
