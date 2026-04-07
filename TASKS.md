# TASKS — VN Market Intelligence MCP
# Kanban Board | Agile/Kanban | DDD + TDD | Bun + TypeScript

> **WIP Limit**: max 2 tasks In Progress simultaneously
> **Workflow**: Backlog → Todo → In Progress → Review → Done
> **Branch**: `task/NNN-kebab-name`
> **Report**: `reports/TASK_REPORT_NNN.md` generated after every Review

---

## In Progress — Sprint 050

### Sprint 050 — Close the Cycle: Kinh Dich Goes Live + /ask Command
> Req spec: [docs/REQ_050.md](docs/REQ_050.md) — READY_FOR_ARCHITECT
> Tech design: [docs/TECH_050.md](docs/TECH_050.md) — APPROVED_BY_ARCHITECT
> Dependency chain: 303 (standalone) → 304 | 305 (standalone) → 306 + 307 | 308 (parallel)
> WIP slots at sprint start: 2 (303 + 305 can start in parallel immediately)
> B1 resolved: Step F delegates to runUserRequestCheck(); no more inline pending-request loop
> B2 resolved: inline try/catch ALTER TABLE in initHexagramTables() — consistent with existing pattern
> B3 resolved: verb-primary polarity formula — MUA/CHO=+1, BAN/THAN TRONG=-1, GIU=0; tieu cuc multiplier 0.7
> Scope note: Task 306 enrichment moves to userRequestCheckJob.ts (buildEnrichedAnswer); Step F simplified

| ID  | Title                                                                              | Priority | Agent     | Layer                    | Depends On | Branch                              | Status |
|-----|------------------------------------------------------------------------------------|----------|-----------|--------------------------|------------|-------------------------------------|--------|
| 303 | Cycle Step A4: auto-compute hexagram per watchlist stock every cycle               | P0       | Developer | scheduler                | —          | task/303-cycle-step-a4-hexagram     | Done   |
| 304 | Conviction scorer 6th dimension: kinhDichScore at 15%                              | P1       | Developer | domain                   | 303 ✓      | task/304-conviction-kinhdich        | Done   |
| 305 | user_requests MCP tools: log_user_request + get_pending_user_requests              | P0       | Developer | interface/mcp/tools      | —          | task/305-user-requests-mcp-tools    | Done   |
| 306 | Step F enrichment: buildEnrichedAnswer in checkJob + Vietnamese + why: prefix      | P1       | Developer | scheduler                | 303 ✓, 305 ✓ | task/306-step-f-enrichment       | Done   |
| 307 | /ask + /why: store why:TICKER payload, guard no-arg /why                           | P1       | Developer | infrastructure/notifiers | 305 ✓      | task/307-telegram-why-command       | Done   |
| 308 | Dynamic tool registry (registry.ts) — deferred task 193                            | P2       | Developer | interface                | —          | task/308-tool-registry              | Done   |

---

### Task 303 — Cycle Step A4: auto-compute hexagram per watchlist stock every cycle

**Branch**: `task/303-cycle-hexagram-batch`
**Layer**: scheduler + infrastructure/db
**Depends on**: none — start immediately (Wave 1)
**Priority**: P0
**TDD test**: `src/__tests__/311-cycle-hexagram-batch.test.ts`

#### Files to read first

- `src/scheduler/intelligenceCycleJob.ts` — locate Step A3 insertion point, `CycleResult`, `CycleDeps` interfaces
- `src/infrastructure/db/hexagramStore.ts` — `initHexagramTables`, `storeReading`, `getLatestReading`, `recordTransition`
- `src/interface/mcp/tools/kinhDichTools.ts` — `computeHaoScores`, `computeReading`, `getMarkovData` exports
- `src/__tests__/280-hexagram-library.test.ts` — reference test style for hexagram domain

#### Files to create/modify

- MODIFY: `src/infrastructure/db/hexagramStore.ts` — add `try { db.exec("ALTER TABLE kinhdich_readings ADD COLUMN source TEXT DEFAULT 'manual'") } catch {}` inside `initHexagramTables()`; extend `storeReading` to accept optional `source?: 'manual' | 'cycle'`; extend `getLatestReading` return type to include `tradingSignal: string | null` and `confidence: number | null`
- MODIFY: `src/scheduler/intelligenceCycleJob.ts` — add `hexagramsComputed: number` to `CycleResult`; add `computeHexagramsFn?: (codes: string[]) => Promise<number>` to `CycleDeps`; insert Step A4 block after Step A3 inside `_runCycle`; replace Step F inline pending-request loop with `await runUserRequestCheck(db)`
- CREATE: `src/__tests__/311-cycle-hexagram-batch.test.ts`

#### Step A4 exact pattern (from TECH_050 impl notes)

```typescript
// Step A4 — runs unconditionally, after Step A3
const codesToProcess = watchlistCodes.length > 0
  ? watchlistCodes
  : (await defaultGetWatchlistCodes());

for (const code of codesToProcess) {
  try {
    const previousReading = getLatestReading(code);
    const scores = computeHaoScores(code);
    const prelimReading = computeReading(code, scores, null);
    const markovData = getMarkovData(code, prelimReading.queChiNh.number);
    const reading = computeReading(code, scores, markovData);
    storeReading({ ..., source: 'cycle' });
    if (previousReading) {
      recordTransition(previousReading.hexagramNumber, reading.queChiNh.number, code);
    }
    hexagramsComputed++;
  } catch (err) {
    log.warn(`Step A4 failed for ${code}: ${err}`);
    errors++;
  }
}
```

Wrap entire batch in `withTimeout(..., 'step A4 hexagramBatch', STEP_TIMEOUT_MS)`.
When `deps.computeHexagramsFn` is injected, it replaces the batch (test hook).

#### Acceptance Criteria

**Given** a watchlist with codes VNM, FPT, VCB, VEA
**When** `runIntelligenceCycle()` completes one run
**Then**

- `kinhdich_readings` contains exactly 4 new rows with `source='cycle'` and timestamp within the last 16 minutes
- Each row has a non-null `hexagram_number` between 1 and 64 inclusive
- `CycleResult.hexagramsComputed` equals 4
- If the watchlist is empty, `hexagramsComputed` is 0 and no rows are inserted
- If one stock's score computation throws (mocked), the other 3 rows are still inserted and `errors` is incremented by 1
- `bun test src/__tests__/311-cycle-hexagram-batch.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

---

### Task 304 — Conviction scorer 6th dimension: kinhDichScore at 15%

**Branch**: `task/304-conviction-kinhdich`
**Layer**: domain + interface/mcp/tools
**Depends on**: 303 ✓ (needs `source` column and extended `getLatestReading` in DB)
**Priority**: P1
**TDD test**: `src/__tests__/312-conviction-kinhdich.test.ts`

#### Files to read first

- `src/domain/services/convictionScorer.ts` — current `WEIGHTS`, `ConvictionInput`, `ConvictionResult`, `computeConviction`
- `src/interface/mcp/tools/portfolioTools.ts` — `get_portfolio_conviction` tool, how it calls `computeConviction`
- `src/infrastructure/db/hexagramStore.ts` — `getLatestReading` return type (after Task 303)

#### Files to create/modify

- MODIFY: `src/domain/services/convictionScorer.ts`
  - Add `kinhDichScore?: number` to `ConvictionInput`
  - Update `WEIGHTS` to 6 dimensions (priceAction: 0.2550, volumeConfirmation: 0.2125, sentiment: 0.1275, cascade: 0.1275, sectorAlignment: 0.1275, kinhDich: 0.1500)
  - Add `scoreKinhDich(score: number | undefined): number` — undefined → 0.5; else clamp(0.5 + score * 0.5, 0, 1)
  - Add `kinhDich` field to `ConvictionResult.dimensions`
  - Update `summary` string to reflect 6 dimensions
- MODIFY: `src/interface/mcp/tools/portfolioTools.ts`
  - For each watchlist stock, call `getLatestReading(code)` and run `deriveKinhDichScore(row.trading_signal, row.confidence)` before calling `computeConviction`
  - Add `deriveKinhDichScore` inline helper using B3 formula (verb-primary, tieu cuc multiplier 0.7)
- CREATE: `src/__tests__/312-conviction-kinhdich.test.ts`

#### deriveKinhDichScore formula (B3 resolution from TECH_050)

```typescript
function deriveKinhDichScore(tradingSignal: string | null, confidence: number | null): number {
  if (!tradingSignal || confidence == null) return 0;
  const sig = tradingSignal.toUpperCase();
  const conf = Math.max(0, Math.min(1, confidence));
  let verbPolarity: number;
  if (sig.includes("MUA") || sig.includes("CHO")) verbPolarity = +1;
  else if (sig.includes("BAN") || sig.includes("THAN TRONG")) verbPolarity = -1;
  else verbPolarity = 0; // GIU
  const suffixMultiplier = sig.includes("TIEU CUC") ? 0.7 : 1.0;
  return verbPolarity * conf * suffixMultiplier;
}
```

#### Acceptance Criteria

**Given** a `kinhdich_readings` row for VNM with `confidence=0.72` and `trading_signal='MUA (tich cuc)'`
**When** `get_portfolio_conviction` is called
**Then**

- VNM conviction object has `dimensions.kinhDich` approximately 0.86 (scoreKinhDich(+0.72) = 0.5 + 0.72*0.5 = 0.86)
- `dimensions` contains exactly 6 keys: priceAction, volumeConfirmation, sentiment, cascade, sectorAlignment, kinhDich
- `Object.values(WEIGHTS).reduce((s,v) => s+v, 0)` equals 1.0 (verified with `toBeCloseTo(1.0, 10)`)
- When no `kinhdich_readings` row exists for a stock, `dimensions.kinhDich` equals 0.5
- `computeConviction()` called without `kinhDichScore` field produces identical composite score to a call with `kinhDichScore: undefined`
- `bun test src/__tests__/312-conviction-kinhdich.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

---

### Task 305 — user_requests MCP tools: log_user_request + get_pending_user_requests

**Branch**: `task/305-user-request-tools`
**Layer**: interface/mcp/tools
**Depends on**: none — start immediately (Wave 1)
**Priority**: P0
**TDD test**: `src/__tests__/313-user-request-tools.test.ts`

#### Files to read first

- `src/infrastructure/db/userRequestStore.ts` — existing `insertUserRequestInline`, `getPendingRequests`, table schema (columns: id, command, payload, status, response, created_at, answered_at)
- `src/interface/mcp/tools/index.ts` — barrel export pattern for tools
- Any existing `register*Tools` file (e.g., `watchlistTools.ts`) — registration boilerplate pattern

#### Files to create/modify

- CREATE: `src/interface/mcp/tools/userRequestTools.ts` — export `registerUserRequestTools(server: McpServer): void` registering:
  - `log_user_request(question: string, source: string)` — inserts row with `command='ask'`, `payload=question`, `status='pending'`; returns `{id: number, status: 'pending'}`
  - `get_pending_user_requests(limit?: number)` — reads up to `limit` (default 5) pending rows ordered by `created_at ASC`; returns array
- MODIFY: `src/interface/mcp/tools/index.ts` — add barrel export for `userRequestTools`
- CREATE: `src/__tests__/313-user-request-tools.test.ts`

#### Acceptance Criteria

**Given** the MCP server is running
**When** `log_user_request("Cho toi biet VNM hom nay?", "user")` is called
**Then**

- A row appears in `user_requests` with `command='ask'`, `payload='Cho toi biet VNM hom nay?'`, `status='pending'`
- The tool returns `{id: <integer>, status: 'pending'}`

**When** `get_pending_user_requests()` is called after the insert
**Then**

- The response includes the newly inserted row
- After a row is marked `status='done'`, `get_pending_user_requests()` no longer returns it

**Additionally**
- `bun test src/__tests__/313-user-request-tools.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

---

### Task 306 — Step F enrichment: buildEnrichedAnswer in checkJob + Vietnamese + why: prefix

**Branch**: `task/306-step-f-enrichment`
**Layer**: scheduler (userRequestCheckJob.ts)
**Depends on**: 303 ✓ (kinhdich_readings data present), 305 ✓ (user_requests MCP tools registered)
**Priority**: P1
**TDD test**: `src/__tests__/314-step-f-enrichment.test.ts`

#### Files to read first

- `src/scheduler/userRequestCheckJob.ts` — existing `runUserRequestCheck`, CAS pattern, RAG answer formatter
- `src/infrastructure/db/hexagramStore.ts` — `getLatestReading` (after Task 303: returns `tradingSignal`, `confidence`)
- `src/infrastructure/db/alertStore.ts` — query for most recent alert per stock
- `src/infrastructure/db/schema.ts` — `market_prices` columns (code, price, change_pct, fetched_at)
- `src/scheduler/intelligenceCycleJob.ts` — Step F location; confirm `runUserRequestCheck` import/call site

#### Files to create/modify

- MODIFY: `src/scheduler/userRequestCheckJob.ts` — add internal `buildEnrichedAnswer(db, payload, ragResults): Promise<string>` helper; integrate it into the answer-building path inside `runUserRequestCheck`; handle `why:TICKER` prefix (strip prefix before RAG query, use ticker for enrichment)
- MODIFY: `src/scheduler/intelligenceCycleJob.ts` — confirm Step F is replaced with `await runUserRequestCheck(db)` (if not done by Task 303 already)
- CREATE: `src/__tests__/314-step-f-enrichment.test.ts`

#### buildEnrichedAnswer logic

```
1. Extract uppercase 2-4 letter codes from payload via /\b([A-Z]{2,4})\b/g applied to payload.toUpperCase()
2. Filter against watchlist table; limit to first 3 codes
3. For why:VCB payloads: strip "why:" prefix before extraction
4. For each code: query getLatestReading(code), market_prices (latest price + change_pct), alerts (most recent)
5. Build Vietnamese answer block; omit any section where the sub-query returns null
6. If no watchlist code found in payload: return pure RAG answer (no enrichment block)
7. Fallback text: "Chua co du lieu Kinh Dich cho ma nay" when getLatestReading returns null
```

#### Acceptance Criteria

**Given** a pending `user_requests` row with `payload='VNM hom nay the nao?'` and a `kinhdich_readings` row for VNM
**When** the intelligence cycle runs Step F (via `runUserRequestCheck(db)`)
**Then**

- A Telegram message is sent to Chat Channel (TELEGRAM_CHAT_ID) within the cycle run
- The message text is in Vietnamese and references VNM
- The message includes hexagram information for VNM (hexagram name or number)
- The `user_requests` row is updated to `status='done'` with a non-null `answered_at`
- If `sendTelegramMessage` throws, the row remains `status='pending'`

**Given** a `why:VCB` payload
**Then**

- The enriched answer includes VCB hexagram + price + alert data
- The `why:` prefix is stripped before RAG search query

**Additionally**
- `bun test src/__tests__/314-step-f-enrichment.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

---

### Task 307 — /ask + /why: store why:TICKER payload, guard no-arg /why

**Branch**: `task/307-telegram-why-command`
**Layer**: infrastructure/notifiers
**Depends on**: 305 ✓ (user_requests table + tools confirmed working)
**Priority**: P1
**TDD test**: `src/__tests__/315-telegram-why-command.test.ts`

#### Files to read first

- `src/infrastructure/notifiers/telegramCommands.ts` — `handleWhy`, `handleAsk` functions; current payload construction for `/why VCB`; current receipt message strings; webhook channel routing

#### Files to create/modify

- MODIFY: `src/infrastructure/notifiers/telegramCommands.ts`
  - Change `/why VCB` handler to store `payload = 'why:VCB'` (not the English sentence `"Why did VCB move today?"`)
  - Add no-arg guard: if `/why` with no argument, return `"Cach dung: /why VCB"` without inserting a `user_requests` row
  - Verify receipt message goes to Chat Channel via `chatId` from update (no Report Channel)
- CREATE: `src/__tests__/315-telegram-why-command.test.ts`

#### Acceptance Criteria

**Given** a Telegram webhook POST with `/ask Que hom nay cua VNM la gi?`
**When** the webhook handler processes it
**Then**

- A `user_requests` row is inserted with `payload='Que hom nay cua VNM la gi?'`, `status='pending'`
- A Vietnamese receipt message is returned within 3 seconds
- The receipt contains no English text

**Given** a Telegram webhook POST with `/why VNM`
**When** the webhook handler processes it
**Then**

- A `user_requests` row is inserted with `payload='why:VNM'` (not an English sentence)
- A Vietnamese receipt is returned

**Given** a Telegram webhook POST with `/why` (no argument)
**When** the webhook handler processes it
**Then**

- No `user_requests` row is inserted
- The response is `"Cach dung: /why VCB"`

**Additionally**
- `bun test src/__tests__/315-telegram-why-command.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

---

### Task 308 — Dynamic tool registry (registry.ts)

**Branch**: `task/308-tool-registry`
**Layer**: interface/mcp
**Depends on**: none — start in parallel (Wave 1 or Wave 2 independent slot)
**Priority**: P2
**TDD test**: `src/__tests__/316-tool-registry.test.ts`

#### Files to read first

- `src/interface/mcp/server.ts` — count all `register*Tools(server)` call sites; identify all imported register functions
- `src/interface/mcp/tools/index.ts` — barrel export list
- Any existing test that imports `server.ts` directly — check for breakage risk

#### Files to create/modify

- CREATE: `src/interface/mcp/tools/registry.ts` — export `toolRegistry: Array<(server: McpServer) => void>` as a flat array literal of all `register*Tools` functions (37 entries including `registerUserRequestTools` from Task 305)
- MODIFY: `src/interface/mcp/server.ts` — replace all individual `register*Tools(server)` call sites with `toolRegistry.forEach(fn => fn(server))`; add import for `toolRegistry` from `./tools/registry.js`
- CREATE: `src/__tests__/316-tool-registry.test.ts`

#### Acceptance Criteria

**Given** `src/interface/mcp/tools/registry.ts` exists
**When** it is inspected
**Then**

- It exports `toolRegistry: Array<(server: McpServer) => void>`
- It contains exactly one entry per `register*Tools` function previously called individually in `server.ts`
- `toolRegistry.length` matches the count of `register*Tools` calls removed from `server.ts`

**When** `server.ts` is inspected
**Then**

- It contains no individual `register*Tools(server)` call sites
- It contains exactly one `toolRegistry.forEach(fn => fn(server))` loop

**Given** a new tool file is created and one line is added to `registry.ts`
**Then**

- All existing tests pass with 0 regressions
- `bun tsc --noEmit` reports 0 errors

**Additionally**
- `bun test src/__tests__/316-tool-registry.test.ts` passes with 0 failures

---

## Todo — Sprint 049

### Sprint 049 — Kinh Dich Differentiation
> Tech design: [docs/TECH_049.md](docs/TECH_049.md) — APPROVED_BY_ARCHITECT
> Req spec: [docs/REQ_049.md](docs/REQ_049.md)
> Dependency chain: 297 + 298 + 299 + 301 (all parallel) → 300 (after 298) → 302 (after 297+298+299)
> WIP slots at sprint start: 2 (297 + 301 can start in parallel immediately)
> Key finding: sector_peers DB table does not exist — Task 299 uses getSectorPeers() domain service + market_prices intersection
> Key finding: export score helpers from kinhDichTools.ts before writing Task 302 test

| ID  | Title                                                                                               | Priority | Agent     | Layer                    | Depends On   | Branch                                  | Status |
|-----|-----------------------------------------------------------------------------------------------------|----------|-----------|--------------------------|--------------|-----------------------------------------|--------|
| 297 | Fix computeForeignFlowScore: sort by fetched_at, replace total_volume with avg_volume_2w            | P0       | Developer | interface/mcp/tools      | —            | task/297-kinhdich-sql-fixes             | Done   |
| 298 | Fix computeMacroScore: use indicator column, derive rolling sigma from history window               | P0       | Developer | interface/mcp/tools      | —            | task/297-kinhdich-sql-fixes             | Done   |
| 299 | Fix computeSectorScore: widen peer pool from watchlist to all stocks in market_prices by domain     | P0       | Developer | interface/mcp/tools      | —            | task/297-kinhdich-sql-fixes             | Done   |
| 300 | Fix computeMacroIndicatorScore: remove sigma column ref, derive z-score from recent history         | P1       | Developer | interface/mcp/tools      | 298          | task/297-kinhdich-sql-fixes             | Done   |
| 301 | Rebuild hexagramLibrary.ts QUE_DATA: port all 64 markdown que files with full hao + bien que data  | P1       | Developer | domain/services/kinhDich | —            | task/301-hexagram-library-rebuild       | Done   |
| 302 | Smoke test: seed DB, assert VNM/FPT/VCB/VEA produce 4 different hexagrams, >=3 non-zero hao scores | P1       | Developer | test                     | 297, 298, 299| task/302-kinhdich-differentiation-test  | Done   |

---

### Task 297 — Fix computeForeignFlowScore

**Branch**: `task/297-foreign-flow-fix`
**Layer**: interface/mcp/tools
**Depends on**: none — start immediately
**Priority**: P0 (VEA and VCB always return 0 because of wrong column names)
**TDD test**: `src/__tests__/297-foreign-flow-fix.test.ts`

#### Root cause

`kinhDichTools.ts` `computeForeignFlowScore()` queries:
```sql
SELECT foreign_volume, total_volume FROM vnstock_trading_stats
WHERE code = ? ORDER BY date DESC LIMIT 1
```
`vnstock_trading_stats` (defined in `src/infrastructure/db/vnstockStore.ts` line 63) has no
`total_volume` column and no `date` column. Actual columns: `foreign_volume`, `avg_volume_2w`,
`fetched_at`.

#### Fix

Replace the query body:
```typescript
const row = db.query<
  { foreign_volume: number | null; avg_volume_2w: number | null },
  [string]
>(
  `SELECT foreign_volume, avg_volume_2w FROM vnstock_trading_stats
   WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`,
).get(code);

if (!row?.foreign_volume || !row?.avg_volume_2w || row.avg_volume_2w === 0) {
  return 0.0;
}
return Math.max(-1, Math.min(1, row.foreign_volume / row.avg_volume_2w));
```

#### Files to modify
- MODIFY: `src/interface/mcp/tools/kinhDichTools.ts` — `computeForeignFlowScore()` function

---

### Task 298 — Fix computeMacroScore

**Branch**: `task/298-macro-score-fix`
**Layer**: interface/mcp/tools
**Depends on**: none — start immediately (also gates Task 300)
**Priority**: P0 (macro hao always returns 0 for all stocks)
**TDD test**: `src/__tests__/298-macro-score-fix.test.ts`

#### Root cause

`kinhDichTools.ts` `computeMacroScore()` queries:
```sql
SELECT name, value, sigma FROM tracked_indicators
WHERE name IN ('oil', 'gold', 'usd_vnd', 'brent')
ORDER BY updated_at DESC LIMIT 10
```
`tracked_indicators` (defined in `src/infrastructure/db/commodityTracker.ts` line 36) has
columns: `indicator`, `value`, `unit`, `source`, `extracted_at`. No `name`, no `sigma`,
no `updated_at`.

#### Fix

Replace query to fetch recent history per indicator and derive sigma inline:
```typescript
const indicators = ['oil', 'gold', 'usd_vnd', 'brent'];
const placeholders = indicators.map(() => '?').join(', ');
const rows = db.query<
  { indicator: string; value: number; extracted_at: string },
  string[]
>(
  `SELECT indicator, value, extracted_at FROM tracked_indicators
   WHERE indicator IN (${placeholders})
   ORDER BY extracted_at DESC LIMIT 80`,
).all(...indicators);

if (rows.length === 0) return 0.0;

// Group by indicator, compute z-score of latest vs recent window
const byIndicator = new Map<string, number[]>();
for (const r of rows) {
  const arr = byIndicator.get(r.indicator) ?? [];
  arr.push(r.value);
  byIndicator.set(r.indicator, arr);
}

const zScores: number[] = [];
for (const [, values] of byIndicator) {
  if (values.length < 3) continue;
  const latest = values[0]!;
  const window = values.slice(1);
  const mean = window.reduce((s, v) => s + v, 0) / window.length;
  const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
  if (std === 0) continue;
  zScores.push((latest - mean) / std);
}

if (zScores.length === 0) return 0.0;
const avgZ = zScores.reduce((s, v) => s + v, 0) / zScores.length;
// High macro stress (positive sigma) = negative for stocks
return Math.max(-1, Math.min(1, -avgZ / 2.0));
```

#### Files to modify
- MODIFY: `src/interface/mcp/tools/kinhDichTools.ts` — `computeMacroScore()` function

---

### Task 299 — Fix computeSectorScore

**Branch**: `task/299-sector-score-fix`
**Layer**: interface/mcp/tools
**Depends on**: none — start immediately
**Priority**: P0 (sector hao always returns 0 — watchlist has only 1 stock per domain)
**TDD test**: `src/__tests__/299-sector-score-fix.test.ts`

#### Root cause

`kinhDichTools.ts` `computeSectorScore()` queries `watchlist WHERE domain = ?` to find peers.
Watchlist has 4 stocks across 4 distinct domains — zero peers per stock. The `sector_peers`
table (populated by syncSectorPeers) or `market_prices` (populated for 48 stocks by VPS proxy)
are the correct data sources.

#### Fix strategy

Query `market_prices` for all codes that appear alongside the target stock in the same sector
using the static domain-to-codes mapping from `sectorPeers.ts`, then compute relative strength:

```typescript
// 1. Get the domain for this stock
const watchlistRow = db.query<{ domain: string }, [string]>(
  "SELECT domain FROM watchlist WHERE code = ?",
).get(code);
if (!watchlistRow) return 0.0;

// 2. Get peer codes from sector_peers table (populated during intelligence cycle)
const sectorPeerRows = db.query<{ peer_code: string }, [string]>(
  `SELECT DISTINCT peer_code FROM sector_peers
   WHERE watchlist_code IN (SELECT code FROM watchlist WHERE domain = ?)
   AND peer_code != ?`,
).all(watchlistRow.domain, code);

// Fallback: if sector_peers empty, use all market_prices codes except target
const peerCodes = sectorPeerRows.length > 0
  ? sectorPeerRows.map(r => r.peer_code)
  : db.query<{ code: string }, [string]>(
      "SELECT DISTINCT code FROM market_prices WHERE code != ? LIMIT 20",
    ).all(code).map(r => r.code);

if (peerCodes.length === 0) return 0.0;

// 3. Compute sector average and relative strength
const placeholders = peerCodes.map(() => "?").join(", ");
const peerPrices = db.query<{ change_pct: number | null }, string[]>(
  `SELECT change_pct FROM market_prices WHERE code IN (${placeholders})
   ORDER BY rowid DESC`,
).all(...peerCodes);

const validChanges = peerPrices.map(r => r.change_pct ?? 0).filter(v => v !== 0);
if (validChanges.length === 0) return 0.0;

const sectorAvg = validChanges.reduce((s, v) => s + v, 0) / validChanges.length;
const myRow = db.query<{ change_pct: number | null }, [string]>(
  "SELECT change_pct FROM market_prices WHERE code = ? ORDER BY rowid DESC LIMIT 1",
).get(code);
const myChange = myRow?.change_pct ?? 0;
return Math.max(-1, Math.min(1, (myChange - sectorAvg) / 3.0));
```

#### Files to modify
- MODIFY: `src/interface/mcp/tools/kinhDichTools.ts` — `computeSectorScore()` function

---

### Task 300 — Fix computeMacroIndicatorScore (derived sigma)

**Branch**: `task/300-macro-indicator-sigma-fix`
**Layer**: interface/mcp/tools
**Depends on**: 298 (same pattern: derive sigma from history instead of reading missing column)
**Priority**: P1 (affects `get_market_hexagram` tool — stock readings unaffected)
**TDD test**: covered in `src/__tests__/298-macro-score-fix.test.ts` (extend existing file)

#### Root cause

`kinhDichTools.ts` line 381:
```sql
SELECT sigma FROM tracked_indicators WHERE name = ? ORDER BY updated_at DESC LIMIT 1
```
Same wrong column names as Task 298: `name` → `indicator`, `sigma` does not exist,
`updated_at` → `extracted_at`.

#### Fix

Derive sigma the same way as Task 298 but for a single named indicator:
```typescript
function computeMacroIndicatorScore(name: string): number {
  try {
    const db = getDb();
    const rows = db.query<{ value: number }, [string]>(
      `SELECT value FROM tracked_indicators
       WHERE indicator = ? ORDER BY extracted_at DESC LIMIT 21`,
    ).all(name);
    if (rows.length < 3) return 0.0;
    const latest = rows[0]!.value;
    const window = rows.slice(1).map(r => r.value);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
    if (std === 0) return 0.0;
    const z = (latest - mean) / std;
    return Math.max(-1, Math.min(1, z / 2.0));
  } catch {
    return 0.0;
  }
}
```

#### Files to modify
- MODIFY: `src/interface/mcp/tools/kinhDichTools.ts` — `computeMacroIndicatorScore()` function

---

### Task 301 — Rebuild hexagramLibrary.ts QUE_DATA (64 full entries)

**Branch**: `task/301-hexagram-library-rebuild`
**Layer**: domain/services/kinhDich
**Depends on**: none — pure data work, start immediately
**Priority**: P1 (unblocks rich `explain_hexagram` and `formatReading` output)
**TDD test**: `src/__tests__/301-hexagram-library-rebuild.test.ts`

#### Source data

64 markdown files at `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/`
named `01_kien.md` through `64_vi_te.md`. Each file follows a consistent structure:
- Section "Phán Đoán": kinh van + vietnamese + luan giai → `judgment`
- Section "Đại Tượng": tuong + hanh dong → `image`
- Table "Phân Tích Trạng Thái": xu huong, nghe nghiep, canh bao → `state`
- Section "Sáu Hào": 6 entries each with loai, kinh van, dich nghia, ket qua, hanh dong, luan giai → `lines`

#### Approach

Read each markdown file, parse the structured sections, and generate the TypeScript record
entry for `QUE_DATA[N]`. The hexagramLibrary.ts interface `QueData` already defines the exact
shape needed. The developer should write a small parser script (or do it inline during the
task) and produce the complete 64-entry `QUE_DATA` record.

Key constraints:
- Preserve diacritics in all Vietnamese text (copy verbatim from markdown)
- `state.trend` must include "THUẬN LỢI" or "BẤT LỢI" or "TRUNG BÌNH" (used by formatter)
- `lines` array must have exactly 6 entries per hexagram, positions 1-6
- `coreMeaning` = first blockquote line in the markdown file (the italic intro)

#### Files to modify
- REWRITE: `src/domain/services/kinhDich/hexagramLibrary.ts` — QUE_DATA section only
  (keep TRIGRAMS, TRIGRAM_LINES, QUE_META, all interfaces unchanged)

---

### Task 302 — Integration smoke test: differentiated hexagrams

**Branch**: `task/302-kinhdich-differentiation-test`
**Layer**: test
**Depends on**: 297, 298, 299 (all three score fixes must be merged)
**Priority**: P1
**TDD test**: `src/__tests__/302-kinhdich-differentiation-smoke.test.ts`

#### What to test

1. Seed SQLite in-memory DB with minimal but realistic data:
   - `watchlist`: VNM (Dairy), FPT (Tech), VCB (Banking), VEA (Auto)
   - `market_prices`: 8+ rows with distinct `change_pct` values per stock
   - `vnstock_trading_stats`: 1 row per stock with `foreign_volume` and `avg_volume_2w`
   - `tracked_indicators`: 20 rows of 'oil' prices with a realistic trend (rising)
   - `sector_peers`: at least 5 peer codes per watchlist domain

2. Call `computeHaoScores(code)` for each of the 4 watchlist stocks.

3. Assert:
   - At least 3 of 6 scores are non-zero for VCB
   - At least 3 of 6 scores are non-zero for FPT
   - The 4 hexagram numbers (derived from calling `computeReading`) are not all equal
   - `computeForeignFlowScore` and `computeSectorScore` and `computeMacroScore` each
     return a value != 0.0 when seeded data is present

---

## Todo — Sprint 048

### Sprint 048 — OCR + PDF Pipeline Fix
> Tech design: [docs/TECH_048.md](docs/TECH_048.md)
> Req spec: [docs/REQ_048.md](docs/REQ_048.md)
> Dependency chain: 292 → 293 → 296 | 294 → 295 (independent track)
> WIP slots at sprint start: 2 (292 + 294 can start in parallel immediately)

| ID  | Title                                                                                 | Priority | Agent     | Layer          | Depends On  | Branch                          | Status |
|-----|---------------------------------------------------------------------------------------|----------|-----------|----------------|-------------|----------------------------------|--------|
| 292 | OCR audit: pdf_extracted_text DDL, DPI 150→200, confidence guard, isOcrAvailable cache | P0     | Developer | infrastructure | —           | task/292-ocr-audit               | Done   |
| 293 | Pipeline fallback: fetchParseAndStoreBctc reads OCR cache when pdf-parse < 100 chars  | P0      | Developer | application    | 292         | task/293-ocr-fallback-pipeline   | Done   |
| 294 | SSC Puppeteer semaphore: withBrowserLock(1) around defaultBrowserFactory              | P1      | Developer | infrastructure | —           | task/294-ssc-browser-mutex       | Done   |
| 295 | SSC selector probe: verify live portal DOM, update selectors if drifted               | P1      | Developer | infrastructure | 294         | task/295-ssc-selector-probe      | Deferred   |
| 296 | e2e smoke test: OCR VNM PDF → extractors → assertions on totalAssets + netRevenue     | P1      | Developer | test           | 292, 293    | task/296-ocr-e2e-smoke-test      | Deferred   |

---

### Task 292 — OCR audit: schema DDL, DPI 200, confidence guard, isOcrAvailable cache

**Branch**: `task/292-ocr-audit`
**Layer**: infrastructure
**Depends on**: none — start immediately
**Priority**: P0 (gating — Tasks 293 and 296 cannot start until 292 is merged)
**TDD test**: `src/__tests__/292-ocr-audit.test.ts`

#### Files to read first

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts` (lines 430-460 — find the `portfolio_targets` block and the watchlist-seed guard)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/pdfOcrWorker.ts` (full file — isOcrAvailable, ocrOnePage, extractAndStorePdfPages)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/pdf.ts` (find ocrPdfBuffer — the inline OCR path with `-r 150`)

#### Files to modify

- MODIFY: `src/infrastructure/db/schema.ts` — insert `pdf_extracted_text` DDL block
- MODIFY: `src/infrastructure/fetchers/pdfOcrWorker.ts` — four sub-fixes (B, C, D, E below)
- MODIFY: `src/infrastructure/fetchers/pdf.ts` — fix F: DPI 150 → 200 in ocrPdfBuffer

#### Sub-fixes (all in one task, ~2 h total)

**292-A: schema.ts — add pdf_extracted_text DDL**
Insert after the `portfolio_targets` block and before the watchlist-seed guard:
```typescript
// -- PDF OCR Cache (Task 292 / FR-1) --
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

**292-B: pdfOcrWorker.ts — cache isOcrAvailable**
Add module-level `let _ocrAvailableCache: boolean | null = null;` and return cached value on subsequent calls.

**292-C: pdfOcrWorker.ts — DPI 150 → 200 in ocrOnePage**
Change the `"-r", "150"` argument in the pdftoppm spawn to `"-r", "200"`.

**292-D: pdfOcrWorker.ts — skip pages < 10 chars, remove double-insert**
In the `extractAndStorePdfPages` inner loop: only call `insert.run()` when `pageText.length >= 10`. Remove the second `insert.run(filename, page, "", 0)` in both the else branch and the catch block.

**292-E: pdfOcrWorker.ts — completeness guard threshold**
Change `Math.max(expectedPages * 0.8, 5)` to `Math.max(expectedPages * 0.5, 3)`.

**292-F: pdf.ts — DPI 150 → 200 in ocrPdfBuffer**
Change the `"-r", "150"` argument in the pdftoppm spawn to `"-r", "200"`.

#### Acceptance Criteria

**Given** a fresh in-memory database (`:memory:`)
**When** `initDatabase()` is called
**Then**
- `SELECT COUNT(*) FROM pdf_extracted_text` executes without error and returns 0.
- Table columns: `id`, `filename`, `page_number`, `text_content`, `confidence`, `extracted_at`.

**Given** any call to `ocrOnePage()` in `pdfOcrWorker.ts`
**When** the pdftoppm subprocess is spawned
**Then**
- The arguments array contains `"-r", "200"` (not `"-r", "150"`).

**Given** any call to `ocrPdfBuffer()` in `pdf.ts`
**When** the pdftoppm subprocess is spawned
**Then**
- The arguments array contains `"-r", "200"` (not `"-r", "150"`).

**Given** a PDF where every page produces fewer than 10 chars from Tesseract
**When** `extractAndStorePdfPages(pdfPath, filename)` completes
**Then**
- `SELECT COUNT(*) FROM pdf_extracted_text WHERE filename = ?` returns 0.
- A second call to `extractAndStorePdfPages` does NOT return early (0 rows does not trigger the guard).

**Given** `isOcrAvailable()` has been called once in the process
**When** `isOcrAvailable()` is called a second time
**Then**
- `execSync("which pdftoppm")` is NOT called again (cache hit).

**Then** `bun test src/__tests__/292-ocr-audit.test.ts` passes with 0 failures.
**Then** `bun tsc --noEmit` shows 0 errors.

---

### Task 293 — Pipeline fallback: fetchParseAndStoreBctc OCR cache wiring

**Branch**: `task/293-ocr-fallback-pipeline`
**Layer**: application
**Depends on**: 292 (merged and verified — `pdf_extracted_text` table exists, DPI and guard fixed)
**Priority**: P0
**TDD test**: `src/__tests__/293-ocr-fallback-pipeline.test.ts`

#### Files to read first

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/fetchParseAndStoreBctc.ts` (full file — find Step 2, pdfTextOverride, rawText guards)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/pdfOcrWorker.ts` (exports: `getCachedPdfText`, `extractAndStorePdfPages`, `isOcrAvailable`)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/pdf.ts` (signature of `downloadAndExtractPdf` — verify return type includes `.text`)

#### Files to modify

- MODIFY: `src/application/usecases/fetchParseAndStoreBctc.ts` — add OCR fallback branch in Step 2

#### Implementation

Add imports at top of `fetchParseAndStoreBctc.ts`:
```typescript
import {
  getCachedPdfText,
  extractAndStorePdfPages,
  isOcrAvailable,
} from "../../infrastructure/fetchers/pdfOcrWorker.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
```

In Step 2, after `downloadAndExtractPdf` returns, when `rawText.trim().length < 100`:
1. Derive `filename` from `doc.pdfFilename` or `decodeURIComponent(basename(URL.pathname))`.
2. Call `getCachedPdfText(filename)`.
3. If `cached === null && isOcrAvailable()`: re-download PDF to `data/pdfs/<filename>`, call `extractAndStorePdfPages`, then `getCachedPdfText` again.
4. If `cached.confidence >= 0.5`: use `cached.text` as `rawText`, log at `info` level.
5. If `cached.confidence` in [0.3, 0.5): use `cached.text`, log `warn` with confidence value.
6. If `cached.confidence < 0.3` or `cached === null`: log `warn` and return `null`.

Full implementation pattern is in `docs/TECH_048.md` under "Task 293 — OCR fallback" section.

#### Acceptance Criteria

**Given** `fetchParseAndStoreBctc` is called with a PDF URL for an image-based (scanned) PDF
**AND** `getCachedPdfText(filename)` returns `{ text: "...(5000+ chars)...", confidence: 0.7, pages: 12 }`
**When** `downloadAndExtractPdf` returns fewer than 100 chars
**Then**
- The pipeline does NOT return null at the empty-text guard.
- `parseBctcReport` is called with the OCR text (not the empty pdf-parse result).
- A log line `[fetchParseAndStoreBctc] using OCR cache for <filename>` is emitted at `info` level.

**Given** `getCachedPdfText` returns `null` and `isOcrAvailable()` returns false
**When** `downloadAndExtractPdf` returns fewer than 100 chars
**Then**
- The pipeline returns `null` (graceful failure, no throw).
- A `warn` log is emitted.

**Given** `getCachedPdfText` returns `{ confidence: 0.2, ... }` (below 0.3)
**When** the OCR fallback is evaluated
**Then**
- The pipeline returns `null`.
- A `warn` log is emitted with the confidence value.

**Then** `bun test src/__tests__/293-ocr-fallback-pipeline.test.ts` passes with 0 failures.
**Then** `bun tsc --noEmit` shows 0 errors.

---

### Task 294 — SSC Puppeteer semaphore: withBrowserLock(1) around defaultBrowserFactory

**Branch**: `task/294-ssc-browser-mutex`
**Layer**: infrastructure
**Depends on**: none — start immediately (independent of 292/293 track)
**Priority**: P1
**TDD test**: `src/__tests__/294-ssc-browser-mutex.test.ts`

#### Files to read first

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/ssc.ts` (full file — find `_activeBrowsers`, `listSscDocuments`, `downloadSscDocument`, `defaultBrowserFactory`)

#### Files to modify

- MODIFY: `src/infrastructure/fetchers/ssc.ts` — add `withBrowserLock` semaphore, wrap both browser-launching functions

#### Implementation

Insert module-level semaphore immediately after the `_activeBrowsers` Set and `cleanupBrowsers()` export:
```typescript
// -- Browser concurrency lock (capacity = 1) --
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

Wrap the body of `listSscDocuments` and `downloadSscDocument` each with `return withBrowserLock(async () => { ... })`. The entire try/catch/finally block (including `browser.close()`) must be inside the lock callback.

#### Acceptance Criteria

**Given** two concurrent calls to `listSscDocuments("VCB")` with a spy on `defaultBrowserFactory`
**When** both are awaited via `Promise.all([...])`
**Then**
- `defaultBrowserFactory` is called at most once at a time (calls are serialised).
- The second call starts only after the first browser is closed.
- No uncaught exceptions are thrown.

**Given** three queued calls to `listSscDocuments`
**When** they complete in sequence
**Then**
- All three return (even if the result is an empty array due to mock).
- The `_browserLock` promise chain drains — subsequent calls are not permanently blocked.

**Then** `bun test src/__tests__/294-ssc-browser-mutex.test.ts` passes with 0 failures.
**Then** `bun tsc --noEmit` shows 0 errors.

---

### Task 295 — SSC selector probe: verify live portal DOM, update selectors if drifted

**Branch**: `task/295-ssc-selector-probe`
**Layer**: infrastructure
**Depends on**: 294 (merged — stable single-browser semaphore must be in place before live probe)
**Priority**: P1
**TDD test**: none (live network task — result is either a working scraper or a BLOCKED note)

#### Files to read first

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/ssc.ts` (find selector constants: `input[id$="it8112::content"]`, `tr[_afrRK]`, and the search button click logic)

#### Files to modify

- MODIFY: `src/infrastructure/fetchers/ssc.ts` — update selector strings if drifted (no change if selectors still match)

#### Developer instructions

1. Run `listSscDocuments("VNM", "all")` via a Bun REPL or a throwaway test script against the live `https://congbothongtin.ssc.gov.vn/faces/NewsSearch` portal.
2. If it returns >= 1 document: selectors are valid — no code change needed. Document as PASSED in the task report.
3. If it returns 0 documents: add a temporary `page.evaluate(() => document.documentElement.outerHTML)` call after the 5-second post-load wait to capture the live DOM snapshot.
4. Search the DOM for the stock code search input and result table rows. Identify replacement selectors.
5. Update the selector string constants in `ssc.ts`.
6. If the portal is unreachable (timeout or 5xx): log the error, mark FR-7 as BLOCKED in the task report, defer to Sprint 049.

#### Acceptance Criteria

**Given** the SSC portal is reachable
**When** `listSscDocuments("VNM", "quarterly")` is called
**Then**
- Returns an array with length >= 1.
- Each document has a non-empty `title` and `publishedAt`.

**Given** the SSC portal is unreachable
**When** `listSscDocuments` is called
**Then**
- Returns an empty array (no crash, no throw).
- Error is logged at `warn` level.

**Then** `bun tsc --noEmit` shows 0 errors.

---

### Task 296 — e2e smoke test: OCR VNM PDF → extractors → assertions

**Branch**: `task/296-ocr-e2e-smoke-test`
**Layer**: test
**Depends on**: 292 (schema DDL + DPI + confidence guard), 293 (OCR fallback wiring) — both merged
**Priority**: P1
**TDD test**: `src/__tests__/296-ocr-pipeline-e2e.test.ts` (this IS the task deliverable)

#### Files to read first

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/291-bctc-smoke-vnm.test.ts` (structural reference — same pattern for in-memory DB setup and skip guard)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/pdfOcrWorker.ts` (exports: `isOcrAvailable`, `extractAndStorePdfPages`, `getCachedPdfText`)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts` (verify `initDatabase` is exported and `closeDb` exists for reset)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/` (find `extractBalanceSheet` and `extractIncomeStatement` exports)

#### Files to create

- CREATE: `src/__tests__/296-ocr-pipeline-e2e.test.ts`

#### Test structure

```typescript
// src/__tests__/296-ocr-pipeline-e2e.test.ts
// Step 1: Set in-memory DB before any import triggers getDb()
process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { isOcrAvailable, extractAndStorePdfPages, getCachedPdfText } from "../infrastructure/fetchers/pdfOcrWorker.js";
import { extractBalanceSheet } from "../domain/services/balanceSheetExtractor.js";
import { extractIncomeStatement } from "../domain/services/incomeStatementExtractor.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("296 OCR pipeline e2e smoke test", () => {
  it("extracts VNM PDF via OCR and asserts financial ranges", async () => {
    // Guard: skip on CI without tesseract
    if (!isOcrAvailable()) {
      console.log("skip: OCR not available (pdftoppm or tesseract missing)");
      return;
    }

    // Fresh in-memory DB
    closeDb();
    initDatabase();

    // Locate VNM PDF in data/pdfs/
    const pdfDir = join(process.cwd(), "data", "pdfs");
    let pdfFile: string | undefined;
    try {
      pdfFile = readdirSync(pdfDir).find(f => /vnm/i.test(f) && f.endsWith(".pdf"));
    } catch { /* data/pdfs/ does not exist */ }

    if (!pdfFile) {
      console.log("skip: no VNM PDF found in data/pdfs/");
      return;
    }

    const pdfPath = join(pdfDir, pdfFile);
    const filename = pdfFile;

    // Run OCR extraction
    const result = await extractAndStorePdfPages(pdfPath, filename);
    expect(result.totalChars).toBeGreaterThanOrEqual(5000);

    // Retrieve cached text
    const cached = getCachedPdfText(filename);
    expect(cached).not.toBeNull();
    expect(cached!.confidence).toBeGreaterThanOrEqual(0.5);

    // Assert balance sheet range (50M – 100M trieu VND)
    const bs = extractBalanceSheet(cached!.text);
    expect(bs.totalAssets).toBeGreaterThanOrEqual(50_000_000);
    expect(bs.totalAssets).toBeLessThanOrEqual(100_000_000);

    // Assert income statement
    const is_ = extractIncomeStatement(cached!.text);
    expect(is_.netRevenue).toBeGreaterThan(0);
  }, 300_000); // 5-minute timeout for OCR
});
```

#### Acceptance Criteria

**Given** `data/pdfs/` contains a VNM BCTC PDF and `tesseract` + `pdftoppm` are installed
**When** `bun test src/__tests__/296-ocr-pipeline-e2e.test.ts` is run
**Then**
- `extractAndStorePdfPages` returns `totalChars >= 5000`.
- `getCachedPdfText(filename)` returns `confidence >= 0.5`.
- `extractBalanceSheet(text).totalAssets` is in range [50,000,000 – 100,000,000] trieu VND.
- `extractIncomeStatement(text).netRevenue > 0`.
- Test passes with 0 failures.

**Given** `isOcrAvailable()` returns false (CI environment without tesseract)
**When** the test runs
**Then**
- Test is skipped cleanly (logs "skip: OCR not available") with 0 failures.

**Given** `data/pdfs/` has no VNM PDF
**When** the test runs
**Then**
- Test is skipped cleanly (logs "skip: no VNM PDF found") with 0 failures.

**Then** `bun tsc --noEmit` shows 0 errors.

---

## 📋 BACKLOG — Sprint 037+

(See SPRINT_GOAL.md for Tier 3-4 backlog: `/ask` command, agent signal bus, compound tools)

- **[backlog 914 / @po]** Steel sector watchlist gap — HPG missing. cafef reported steel maker 70% profit growth + 125M share issuance (impact 9, bullish), but impact_chain returned "no watchlist stocks affected" because watchlist (VNM/VCB/FPT/VEA) has zero steel exposure. Decision needed: add HPG to default watchlist OR document that steel coverage is intentionally out-of-scope. (from report 914)
- **[backlog 915 / @architect]** Analyst-credibility discount rule — when broker is under regulatory sanction, downweight their forecasts. Concrete case: TVS issued bullish Q1 sector forecast same day as cafef "Vì sao Chứng khoán Tân Việt bị xử phạt?" article. Need: cross-reference broker name in legal_risk_signals when computing forecast confidence. (from report 915)
- **[backlog 916 / @dev HIGH]** sector_rotation vs sector_comparison contradiction — get_sector_rotation reported Banking -0.46% 1d while get_sector_comparison(VCB) showed peer avg ~+0.575% same session. Root cause unknown: different stock universes, timing diff, or aggregation bug. Need to align both tools on the same source-of-truth or document the difference. (from report 916)
- **[backlog 921 / @dev]** Brent crude price source discrepancy — market-watcher signal #509 reported $111.70 vs auto-tracked tracked_indicators.brent_crude_usd = 108 (~$3.7 gap, 38 data points). Investigate: spot vs futures, stale cache, or different upstream source. Pick one source-of-truth. (from report 921)


---

## ✅ DONE

| # | Title | Branch | Merged | Report |
|---|-------|--------|--------|--------|
| 280 | Foreign flow delta + corporate events calendar | `task/280-foreign-flow-catalyst-calendar` | 2026-04-06 | [TASK_REPORT_280](reports/TASK_REPORT_280.md) |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` | `task/195-rebalancing-signals` | 2026-04-06 | [TASK_REPORT_195](reports/TASK_REPORT_195.md) |
| 215 | Telegram webhook registration + security | `task/215-telegram-webhook` | 2026-04-06 | [TASK_REPORT_215](reports/TASK_REPORT_215.md) |
| 217 | compare_stocks MCP tool — side-by-side comparison | `worktree-agent-a1f64692` | 2026-04-06 | [TASK_REPORT_217](reports/TASK_REPORT_217.md) |
| 218 | Weekly portfolio report via Telegram | `worktree-agent-a219df68` | 2026-04-06 | [TASK_REPORT_218](reports/TASK_REPORT_218.md) |
| 219 | Custom alert rules engine | `task/219-custom-alert-rules` | 2026-04-06 | [TASK_REPORT_219](reports/TASK_REPORT_219.md) |
| 000 | Initial project structure | `main` | 2026-03-24 | — |
| 230 | Remove 8 dead/forbidden/internal tools from MCP (64→56) | `task/230-remove-dead-tools` | 2026-04-02 | — |
| 231 | Fix G5: `claim_telegram_report` ownership lock | `task/231-claim-telegram-report` | 2026-04-02 | — |
| 232 | Fix G3: `/report` + `/fix` Telegram commands | `main` | 2026-04-02 | — |
| 233 | Fix G2: `system_changelog` + `log_fix` + `get_recent_fixes` | `main` | 2026-04-02 | — |
| 234 | Merge M1: system health 4→1 `get_system_status` | `main` | 2026-04-02 | — |
| 235 | Merge M2: Telegram send 3→1 `send_telegram` | `main` | 2026-04-02 | — |
| 236 | Merge M3: alert mute 2→1 `manage_alert_mute` | `main` | 2026-04-02 | — |
| 237 | CLAUDE.md + all 9 agent `.md` files updated for 53 tools | `main` | 2026-04-02 | — |
| 001 | Project setup & DDD folder structure | `task/001-project-setup` | 2026-03-25 | [TASK_REPORT_001](reports/TASK_REPORT_001.md) |
| 002 | SQLite schema + migrations | `task/002-db-schema` | 2026-03-25 | [TASK_REPORT_002](reports/TASK_REPORT_002.md) |
| 003 | Env config + structured logging | `task/003-env-config` | 2026-03-25 | [TASK_REPORT_003](reports/TASK_REPORT_003.md) |
| 011 | Embedding pipeline (HuggingFace local ONNX) | `task/011-rag-embeddings` | 2026-03-25 | [TASK_REPORT_011](reports/TASK_REPORT_011.md) |
| 012 | LanceDB vector store (read/write/search) | `task/012-lancedb-store` | 2026-03-25 | [TASK_REPORT_012](reports/TASK_REPORT_012.md) |
| 041 | Vietnamese number parser | `task/041-vn-number-parser` | 2026-03-25 | [TASK_REPORT_041](reports/TASK_REPORT_041.md) |
| 042 | Balance sheet extractor | `task/042-bctc-balance-sheet` | 2026-03-25 | [TASK_REPORT_042](reports/TASK_REPORT_042.md) |
| 014 | Embedding text builder (domain) | `task/014-embedding-text-builder` | 2026-03-26 | [TASK_REPORT_014](reports/TASK_REPORT_014.md) |
| 043 | Income statement extractor | `task/043-bctc-income-stmt` | 2026-03-26 | [TASK_REPORT_043](reports/TASK_REPORT_043.md) |
| 044 | Cash flow extractor | `task/044-bctc-cashflow` | 2026-03-26 | [TASK_REPORT_044](reports/TASK_REPORT_044.md) |
| 013 | RAG multi-level retriever | `task/013-rag-retriever` | 2026-03-26 | [TASK_REPORT_013](reports/TASK_REPORT_013.md) |
| 045 | Ratio computation | `task/045-bctc-ratios` | 2026-03-26 | [TASK_REPORT_045](reports/TASK_REPORT_045.md) |
| 046 | Period delta (QoQ / YoY) | `task/046-period-delta` | 2026-03-26 | [TASK_REPORT_046](reports/TASK_REPORT_046.md) |
| 047 | BCTC orchestrator (full parse pipeline) | `task/047-bctc-orchestrator` | 2026-03-26 | [TASK_REPORT_047](reports/TASK_REPORT_047.md) |
| 029 | SSC portal scraper | `task/029-ssc-scraper` | 2026-03-26 | [TASK_REPORT_029](reports/TASK_REPORT_029.md) |
| 081 | Bun HTTP server + SSE transport | `task/081-bun-mcp-server` | 2026-03-26 | [TASK_REPORT_081](reports/TASK_REPORT_081.md) |
| 030 | PDF downloader + pdf-parse text extractor | `task/030-pdf-extractor` | 2026-03-26 | [TASK_REPORT_030](reports/TASK_REPORT_030.md) |
| 048 | SSC fetch → parse → store pipeline | `task/048-ssc-pipeline` | 2026-03-26 | [TASK_REPORT_048](reports/TASK_REPORT_048.md) |
| 085 | SSC report MCP tools (fetch/summary/compare) | `task/085-tool-reports` | 2026-03-26 | [TASK_REPORT_085](reports/TASK_REPORT_085.md) |
| 021 | RSS base fetcher + CafeF news | `task/021-rss-cafef` | 2026-03-26 | [TASK_REPORT_021](reports/TASK_REPORT_021.md) |
| 082 | Watchlist MCP tools (add/remove/get/update) | `task/082-tool-watchlist` | 2026-03-26 | [TASK_REPORT_082](reports/TASK_REPORT_082.md) |
| 063 | Signal detector (price + news + report) | `task/063-signal-detector` | 2026-03-27 | [TASK_REPORT_063](reports/TASK_REPORT_063.md) |
| 064 | Multi-signal alert generator | `task/064-alert-generator` | 2026-03-27 | [TASK_REPORT_064](reports/TASK_REPORT_064.md) |
| 086 | Alert MCP tools (get_alerts, briefing, history) | `task/086-tool-alerts` | 2026-03-27 | [TASK_REPORT_086](reports/TASK_REPORT_086.md) |
| 087 | Server tool wiring (register all tools in createBunServer) | `task/087-server-wiring` | 2026-03-27 | [TASK_REPORT_087](reports/TASK_REPORT_087.md) |
| 022 | VnExpress Finance RSS fetcher | `task/022-rss-vnexpress` | 2026-03-27 | [TASK_REPORT_022](reports/TASK_REPORT_022.md) |
| 023 | Reuters / AP News RSS fetcher | `task/023-rss-reuters` | 2026-03-27 | [TASK_REPORT_023](reports/TASK_REPORT_023.md) |
| 061 | News normalizer → AnalysisEntry | `task/061-news-normalizer` | 2026-03-27 | [TASK_REPORT_061](reports/TASK_REPORT_061.md) |
| 062 | Causal cascade engine + runImpactChain use case | `task/062-cascade-engine` | 2026-03-27 | [TASK_REPORT_062](reports/TASK_REPORT_062.md) |
| 083 | Analysis MCP tools (fetch_and_analyze, run_impact_chain, search_similar_context) | `task/083-tool-analysis` | 2026-03-27 | [TASK_REPORT_083](reports/TASK_REPORT_083.md) |
| 088 | Legacy cleanup — delete src/server.ts + src/tools/ stubs | `task/088-legacy-cleanup` | 2026-03-27 | [TASK_REPORT_088](reports/TASK_REPORT_088.md) |
| 026 | HOSE market data fetcher (VnDirect API) | `task/026-hose-prices` | 2026-03-27 | [TASK_REPORT_026](reports/TASK_REPORT_026.md) |
| 102 | News polling job (every 30 min) | `task/102-job-news-poll` | 2026-03-28 | [TASK_REPORT_102](reports/TASK_REPORT_102.md) |
| 104 | SSC nightly report check (20:00 GMT+7) | `task/104-job-ssc-check` | 2026-03-28 | [TASK_REPORT_104](reports/TASK_REPORT_104.md) |
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | `task/103-job-market-scan` | 2026-03-28 | [TASK_REPORT_103](reports/TASK_REPORT_103.md) |
| 101 | Morning briefing job (08:00 GMT+7) | `task/101-job-morning-briefing` | 2026-03-28 | [TASK_REPORT_101](reports/TASK_REPORT_101.md) |
| 066 | AI summary generator (rule-based BCTC) | `task/066-ai-summary` | 2026-03-28 | [TASK_REPORT_066](reports/TASK_REPORT_066.md) |
| 065 | Historical pattern matcher | `task/065-pattern-matcher` | 2026-03-28 | [TASK_REPORT_065](reports/TASK_REPORT_065.md) |
| 084 | Market MCP tools (get_market_snapshot, get_patterns) | `task/084-tool-market` | 2026-03-28 | [TASK_REPORT_084](reports/TASK_REPORT_084.md) |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | 2026-03-28 | [TASK_REPORT_123](reports/TASK_REPORT_123.md) |
| 194 | CLAUDE.md sync through Sprint 026 | `main` (7f53108) | 2026-04-02 | — |
| HOT-01 | fix: source .env in start.sh — Telegram token missing | `main` (c5b925e) | 2026-04-02 | — |
| HOT-02 | feat: delete_telegram_report MCP tool + auto-cleanup workflow | `main` (c6ea1ce) | 2026-04-02 | — |
| DOC-001 | Update CLAUDE.md with Sprint 034 architecture additions | `task/doc-001-claude-md-update` | 2026-04-02 | [TASK_REPORT_DOC-001](reports/TASK_REPORT_DOC-001.md) |
| 246 | Credit Flow Analyzer (domain service) | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 247 | Leadership Signal Detector (domain service) | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 248 | Muasamcong public procurement fetcher | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 249 | SSC Insider fetcher + InsiderStore | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 250 | Signal Integration — SignalType + CAPEX/CREDIT cascade + insiderCheckJob | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 251 | MCP Tools — get_public_contracts, get_credit_flow_signal, get_insider_signals | `worktree-agent-ad862eb2` | 2026-04-03 | — |

> **Sprint 003 COMPLETE** — All 5 tasks merged: 021, 082, 063, 064, 086. PO sign-off: APPROVED 2026-03-27.
> **Sprint 004 Wave 1** — Tasks 087, 022, 023 merged: 2026-03-27.
> **Sprint 004 Wave 2** — Task 061 merged: 2026-03-27. Task 062 unblocked.
> **Sprint 004 Wave 3** — Task 062 merged: 2026-03-27. Task 083 now unblocked (Wave 4).
> **Sprint 004 COMPLETE** — All 6 tasks merged: 087, 022, 023, 061, 062, 083. QA approved: 2026-03-27.
> **Sprint 005 Wave 1** — Task 088 merged: 2026-03-27. Wave 2 (026, 102, 104) now unblocked.
> **Sprint 005 Wave 2** — Task 026 merged: 2026-03-27. Task 103 (market scan jobs) now unblocked.
> **Sprint 005 Wave 2** — Task 104 merged: 2026-03-28. SSC nightly check live at 20:00 GMT+7.
> **Sprint 005 COMPLETE** — All 6 tasks merged: 088, 026, 102, 104, 103, 101. QA approved: 2026-03-28.
> **Sprint 006 PLANNING** — Tasks 065, 066, 027, 084, 105, 123 promoted to Todo. See SPRINT_GOAL.md sprint_id: 006.
> **Sprint 006 ACTIVE** — 2026-03-28. Wave 1 (065, 066, 027, 105) ready to assign. WIP limit: 2. TECH_006.md approved by Architect.
> **Sprint 006 Wave 1** — Task 066 completed: 2026-03-28. Rule-based AI summary generator with 40 tests.
> **Sprint 006 Wave 1** — Task 065 completed: 2026-03-28. Historical pattern matcher, 15 tests pass.
> **Sprint 006 Wave 2** — Task 084 merged: 2026-03-28. Market MCP tools (get_market_snapshot, get_patterns), 14/14 tests pass, toolCount 14→16. Task 123 now unblocked (Wave 3).
> **Sprint 006 COMPLETE** — All 6 tasks merged: 065, 066, 027, 105, 084, 123. QA approved: 2026-03-28. 28-test integration harness covers all 16 MCP tools across 5 end-to-end roundtrip chains with real SQLite.
> **Sprint 049 QA SIGN-OFF** — 2026-04-06. Tasks 280, 195, 215, 217, 218, 219 reviewed and approved. All 6 passed unit tests (32+17+12+20+14+21), full suite 3015 pass, tsc 0 errors, DDD PASS, Security PASS. Moved to Done.

---

## 🔍 REVIEW

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| 223 | Portfolio target allocation: `set_target_allocation` / `get_target_allocation` | `task/223-target-allocation` | 22 tests pass, tsc clean, toolCount 53→55 |
| DOC-001 | Update CLAUDE.md architecture section | `task/doc-001-claude-md-update` | Ready for QA |
| Sprint 040 | Macro Catalyst — Credit Flow + Insider Trading + Public Investment (tasks 246-251) | `worktree-agent-ad862eb2` | Ready for QA review |

---

## 🚧 IN PROGRESS

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| 230 | Remove 8 dead/forbidden tools from MCP (64→56) | `task/230-remove-dead-tools` | Review — 16 tests, 0 fail, tsc clean |

---

### Sprint 028 — Bug Fixes & Alert Quality (2026-04-02)

> Triggered by: production monitoring reports (news-scout, alert-commander, market-watcher)
> All fixes applied directly on main — hotfix batch

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 198 | VN-Index → banking/real_estate cascade rules | ✅ Done | Added 4 rules (up/down × banking/real_estate) + "mất điểm tháng" keyword |
| 199 | Sentiment classifier: insider selling from leaders | ✅ Done | Added "muốn thoái sạch vốn" (w5), "thoái sạch vốn" (w4), "lãnh đạo bán" (w3), increased insider selling weights |
| 200 | Macro pressure dual alert (Brent+USD/VND) | ✅ Done | Added 4 combined rules: aviation -0.15, logistics -0.12, retail -0.08, automotive -0.10 |
| 201 | Cap macro penalty per entry | ✅ Done | MAX_MACRO_NEGATIVE_DELTA = -0.25 prevents over-penalisation of infrastructure news |
| 202 | VCB news_mention noise filter | ✅ Done | Market-wide cascade impacts now require direct mention to trigger news_mention alerts |
| 203 | Investigate Vinamilk → VNM alias | ✅ Investigated | Code correct — "vinamilk" in dictionary. Likely VNM not in watchlist at runtime |
| 204 | Investigate VCB price mismatch | ✅ Investigated | Data source inconsistency between VnDirect legacy (VND) and stock_prices (×1000). Not a code bug |
| 205 | Sector-wide decline alert | ✅ Done | Emits price_drop signal when ≥3 stocks in same sector decline ≥0.5%. Shows sector avg + top decliners |
| 206 | Coal/mining cascade rules | ✅ Done | Added "than đá"/"coal"/"khoáng sản" → oil_gas domain. ALV-type companies now cascade correctly |
| 207 | Infrastructure capex boost rule | ✅ Done | "sân bay Long Thành", "siêu dự án", "cao tốc" → aviation +0.80, logistics +0.75. Macro cap prevents crush |
| 208 | Fix DB path CWD-dependent resolution | ✅ Done | DEFAULT_DB_PATH now absolute via import.meta.dir. Prevents "no such table" after restart from different CWD |

**Remaining (deferred / PO decision needed):**
- Reuters RSS failing — external service issue, monitor only
- USD/VND watchlist expansion — PO decision: add VEA, HVN, HPG as FX-sensitive stocks
- VCB BCTC Q1/2025 PDF empty — scanned image, needs OCR worker (pdfOcrWorker.ts)
- Polymarket API timeout — external service issue, increase timeout config

---

## 📋 TODO
*(Dependencies cleared — ready to assign)*

### Technical debt — stale test fixtures (2026-04-06)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 303 | Rewrite 029-ssc-scraper.test.ts — drop Puppeteer BrowserFactory, use HttpClient mock | `task/303-ssc-scraper-test-rewrite` | Developer | P2 | — | Done |
| 304 | Rewrite 048-ssc-pipeline.test.ts — drop Puppeteer types, use axios+cheerio mocks | `task/304-ssc-pipeline-test-rewrite` | Developer | P2 | — | Done |
| 305 | Rewrite 124-test-ssc-pipeline.test.ts — 14 BrowserFactory→HttpClient assignments | `task/305-ssc-pipeline-124-rewrite` | Developer | P2 | — | Done |

> Deprecation shims in `ssc.ts` keep these tests type-checking but they still reference the removed Puppeteer layer. Full rewrite or deletion needed.

### Observability gaps (2026-04-06 — from analysis-team reports #673, #675, #680)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 306 | sentiment_entries table: wire pollNews sentiment classifier to per-stock rows so get_sentiment_trend has data | `task/306-sentiment-per-stock-store` | Developer | P1 | — | Done (slice 1: pollNews writes real sentiment to rag_analyses, a49d8ed) |
| 307 | Scheduled job: walk alerts older than 24h, compute outcome vs market_prices_history, call recordSignalOutcome | `task/307-signal-outcome-tracker` | Developer | P1 | — | Done (alt: relaxed lookforward) |
| 308 | market_prices_history coverage: ensure VPS price proxy writes every 15-min tick so get_correlation_matrix has >=2 days data | `task/308-price-history-coverage` | Developer | P2 | — | Done |
| 309 | Stranded BCTC PDF retry: scan data/pdfs/, infer stock from filename, re-parse anything not in financial_reports table | `task/309-pdf-retry-orchestrator` | Developer | P1 | — | Done (detector slice) |
| 310 | SSC nightly: detect overdue Q4 filings (e.g. FPT/VEA past 30/03 deadline) and surface as actionable agent_feedback | `task/310-ssc-overdue-detector` | Developer | P1 | — | Done |

> Root causes of analysis-agent reports that need design work:
> - **#675**: sentiment classifier runs in pollNews but results are written to rag_analyses only, not linked to a per-stock sentiment_entries table that sentimentTrend.ts reads.
> - **#673**: record_signal_outcome (Sprint 039) is defined but has no scheduled caller — retrospective accuracy loop is open.
> - **#680** (partially): get_correlation_matrix returns 0 stocks — market_prices_history has <2 days data despite VPS proxy running.

### Sprint 034 — Depth Over Breadth: Sentiment Trend + Context Sync (2026-04-02)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 224 | CLAUDE.md sync: document Sprints 030-033 additions | `task/224-claude-md-sync` | BA | P0 | — | Backlog |
| 225 | Sentiment trend per stock: `get_sentiment_trend` MCP tool | `task/225-sentiment-trend` | BA | P1 | 224 (soft) | Review |

---

### Sprint 033 — Investor UX Hardening (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 220 | Watchlist auto-enrichment: sector peer suggestions on `add_to_watchlist` | `task/220-watchlist-peer-suggestions` | BA | P0 | — | Review |
| 222 | Alert snooze/mute: `snooze_alerts` / `unmute_alerts` MCP tools | `task/222-alert-snooze` | BA | P1 | — | Review |
| 223 | Portfolio target allocation: `set_target_allocation` / `get_target_allocation` MCP tools | `task/223-target-allocation` | BA | P2 | 195 (done, soft) | Review |

---

### Sprint 032 — See More, Decide Faster (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 217 | Multi-stock comparison tool: `compare_stocks` | `task/217-compare-stocks` | BA | P0 | — | Backlog |
| 218 | Weekly portfolio report via Telegram | `task/218-weekly-portfolio-report` | BA | P1 | 217 (soft) | Backlog |
| 219 | Custom alert rules engine | `task/219-custom-alert-rules` | BA | P2 | 218 (soft) | Backlog |

---

### Sprint 031 — Telegram Command Interface (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 214 | Webhook endpoint + command router | `task/214-telegram-webhook-router` | BA | P0 | — | Review |
| 215 | Webhook registration + security | `task/215-telegram-webhook-security` | BA | P1 | 214 | Backlog |
| 216 | Integration tests + CLAUDE.md update | `task/216-telegram-integration-tests` | Dev | P2 | 214, 215 | Backlog |

---

### Sprint 030 — Quality Before Quantity (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 211 | CLAUDE.md sync through Sprint 029 | `task/211-claude-md-sync` | BA | P0 | — | Backlog |
| 212 | Stale worktree cleanup (.claude/worktrees/) | `task/212-worktree-cleanup` | Developer | P1 | — | Backlog |
| 213 | Test isolation audit: standardise :memory: DB pattern | `task/213-test-isolation` | Developer | P1 | — | Backlog |

---

### Sprint 029 — Always-On Investor (2026-04-01) — COMPLETE

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 208 | Telegram command interface: query system via Telegram messages | `task/208-telegram-commands` | BA | P0 | 034 (done) | Done |
| 209 | Daily P&L snapshot in morning briefing | `task/209-portfolio-pnl` | BA | P1 | 190 (done) | Done |
| 210 | News source health monitoring + get_source_health MCP tool | `task/210-source-health` | BA | P1 | 193 (soft) | Done |

---

### Sprint 005
<!-- Execution waves per TECH_005.md:
  Wave 1 — 088 (independent cleanup, no deps beyond already-done 087)
  Wave 2 — 026 + 102 + 104 in parallel (all independent of each other)
  Wave 3 — 103 (after 026 done)
  Wave 4 — 101 (after 102 done)
-->

> REQ-005 written — TECH-005 approved by Architect. See docs/TECH_005.md. Status: ACTIVE.

#### Wave 1 — COMPLETE

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 088 | Legacy cleanup — delete src/server.ts + src/tools/ stubs | `task/088-legacy-cleanup` | Developer | interface | 087 ✅ | Done ✅ |

**Task 088 — Acceptance Criteria**

**Given** `src/server.ts` and `src/tools/` exist as dead stubs (no live imports confirmed by Architect)
**When** task 088 is implemented and merged
**Then**
- `src/server.ts` file does not exist on disk
- `src/tools/` directory does not exist on disk
- `grep -r "from.*src/server" src/` returns zero matches in production code
- `bun tsc --noEmit` reports 0 errors
- `bun test` full suite passes with 0 failures

**Files to delete**: `src/server.ts`, `src/tools/watchlist.ts`, `src/tools/analysis.ts`, `src/tools/reports.ts`, `src/tools/alerts.ts`
**Pre-deletion check**: `grep -r "from.*['\"].*src/server\|from.*['\"]../tools/\|from.*['\"]./tools/" src/` must return empty before deleting
**Note**: `src/db/schema.ts` (legacy, different path) — do NOT delete; check if test files import it first.

---

#### Wave 2 — Run in parallel after Wave 1 (all three are independent of each other)

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 026 | HOSE market data fetcher (VnDirect primary, CafeF fallback) | `task/026-hose-prices` | Developer | infrastructure | 003 ✅ | Todo |
| 102 | News polling job (every 30 min) | `task/102-job-news-poll` | Developer | interface/scheduler | 061 ✅, 062 ✅, 064 ✅ | Done ✅ |
| 104 | SSC nightly report check (20:00 GMT+7) | `task/104-job-ssc-check` | Developer | interface/scheduler | 048 ✅, 086 ✅ | Done ✅ |

**Task 026 — Acceptance Criteria**

**Given** a list of HOSE ticker codes e.g. `["VCB", "HPG"]`
**When** `fetchHosePrices(codes)` is called
**Then**
- Returns `MarketPrice[]` with `code`, `price`, `previousPrice`, `changeAmt`, `changePct`, `volume`, `updatedAt`
- Primary source: VnDirect JSON API (`https://finfo-api.vndirect.com.vn/v4/stocks?q=code:...`)
- Fallback to CafeF HTML scraper if VnDirect returns 0 rows or HTTP error
- Returns `[]` (never throws) on total failure; logs warning
- `storePrices(prices)` upserts into `market_prices` (INSERT OR REPLACE) and appends to `market_prices_history`
- `fetchVnIndex()` returns `VnIndexSnapshot | null`
- Schema: `market_prices` gains `previous_price REAL` column; `market_prices_history` table created
- `bun test src/__tests__/026-*.test.ts` passes with mocked HTTP (no real network calls)
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/infrastructure/fetchers/hose.ts`
- MODIFY: `src/infrastructure/db/schema.ts` (add `previous_price` column to `market_prices`; add `market_prices_history` table + index)

---

**Task 102 — Acceptance Criteria**

**Given** RSS sources (CafeF, VnExpress, Reuters) have articles not yet in `rag_analyses`
**When** `pollNews()` is called
**Then**
- Returns `PollNewsResult` with `fetched`, `inserted`, `duplicates`, `alerts`, `errors` counts
- New articles stored via `INSERT OR IGNORE INTO rag_analyses` using UNIQUE index on `source_url`
- Second call with same articles increments `duplicates`, does NOT create duplicate rows
- Each source failure increments `errors` but does not abort remaining sources
- Impact chain (`runImpactChain`) runs on each new entry; resulting alerts stored via `INSERT OR IGNORE INTO alerts`
- Schema: `CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url ON rag_analyses(source_url) WHERE source_url IS NOT NULL AND source_url != ''` added in `initDatabase()`
- `runNewsPoller()` in `newsPollerJob.ts` has concurrency guard (skips if previous cycle still running)
- `bun test src/__tests__/102-*.test.ts` passes with mocked fetchers
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/application/usecases/pollNews.ts`
- CREATE: `src/scheduler/newsPollerJob.ts`
- MODIFY: `src/infrastructure/db/schema.ts` (add UNIQUE index on `rag_analyses.source_url`)

---

**Task 104 — Acceptance Criteria**

**Given** watchlist stocks exist in SQLite and SSC portal is reachable
**When** `runSscCheck()` is called
**Then**
- Queries SSC for new BCTC documents for each watchlist stock
- Skips documents whose `source_url` already exists in `financial_reports`
- Calls `fetchParseAndStoreBctc({ url, actionCode })` for each new document
- 2-second delay between documents per stock to avoid rate-limiting
- 3-retry exponential backoff (2 s → 4 s → 8 s) on SSC HTTP errors
- If `financial_reports` lacks `source_url` column, adds it via `ALTER TABLE`
- No crash on empty watchlist or SSC unreachable (logs warning, returns gracefully)
- `bun test src/__tests__/104-*.test.ts` passes with mocked HTTP
- `bun tsc --noEmit` 0 errors

**Files to create**:
- CREATE: `src/scheduler/sscCheckerJob.ts`

---

#### Wave 3 — After task 026 is merged

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | `task/103-job-market-scan` | Developer | interface/scheduler | 026, 063 ✅, 064 ✅ | In Progress (changes requested) |

**Task 103 — Acceptance Criteria**

**Given** watchlist stocks have HOSE price data and `market_prices_history` table exists
**When** `runMarketScan("open")` or `runMarketScan("close")` is called
**Then**
- Calls `fetchHosePrices` for all watchlist stock codes
- Inserts fetched prices into `market_prices_history` (in addition to upsert in `market_prices`)
- Assembles `MarketSnapshot` per stock: `{ actionCode, price, previousPrice, volume, avgVolume }`
- `avgVolume` = AVG of last 20 rows in `market_prices_history`; if < 5 rows exist, returns `0` (suppresses `volume_spike`)
- Passes snapshots through `detectSignals` filtering for `price_drop`, `price_surge`, `volume_spike` only
- Calls `generateAlerts` and stores resulting alerts via `INSERT OR IGNORE INTO alerts`
- No crash on empty watchlist or HOSE fetch failure
- `bun test src/__tests__/103-*.test.ts` passes with mocked fetcher
- `bun tsc --noEmit` 0 errors

**Files to create**:
- CREATE: `src/scheduler/marketScanJob.ts`

---

#### Wave 4 — After task 102 is merged

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 101 | Morning briefing job (08:00 GMT+7) | `task/101-job-morning-briefing` | Developer | interface/scheduler | 102 ✅, 086 ✅ | Done ✅ |

**Task 101 — Acceptance Criteria**

**Given** SQLite contains recent `rag_analyses`, `alerts`, `watchlist`, `market_prices`, and `financial_reports` rows
**When** `runMorningBriefing()` is called (or cron fires at 08:00 Asia/Ho_Chi_Minh)
**Then**
- Runs `pollNews()` as best-effort pre-fetch (failure does not abort briefing)
- Fetches VnIndex via `fetchVnIndex()` (best-effort; null on failure)
- `assembleBriefing(vnIndex)` returns `DailyBriefing` with:
  - `topStories`: up to 5 `rag_analyses` rows since midnight Vietnam time, sorted by `impact_score DESC`
  - `alerts`: unread alerts from last 12 hours
  - `watchlistSummary`: one entry per watchlist stock with price + changePct from `market_prices`
  - `newReports`: stock codes with new `financial_reports` since midnight Vietnam time
- `persistBriefing(briefing)` writes to `./data/briefings/YYYY-MM-DD.json` (creates dir if absent, overwrites if re-run)
- `jobs.ts` updated: imports all four job modules; `eveningSummary` cron entry removed
- `src/index.ts` updated: calls `startScheduler()` as step 3 of bootstrap
- `bun run src/index.ts` logs `[scheduler] jobs registered` at startup (manual verify)
- `bun test src/__tests__/101-*.test.ts` passes with mocked DB + file system
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/application/usecases/assembleBriefing.ts`
- CREATE: `src/scheduler/morningBriefingJob.ts`
- MODIFY: `src/scheduler/jobs.ts` (import + wire all 4 job modules; remove `eveningSummary` cron entry)
- MODIFY: `src/index.ts` (add `startScheduler()` call as step 3 of bootstrap)

---

## 🔍 REVIEW (historical — Sprint 006 Wave 1)

### Sprint 006 — Wave 1

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~Developer~~ | ~~infrastructure~~ | ~~026 ✅, 003 ✅~~ | ~~Done~~ |
| ~~065~~ | ~~Historical pattern matcher~~ | ~~`task/065-pattern-matcher`~~ | ~~Developer~~ | ~~application~~ | ~~013 ✅, 046 ✅~~ | ~~Done~~ |
| ~~084~~ | ~~Market MCP tools (get_market_snapshot, get_patterns)~~ | ~~`task/084-tool-market`~~ | ~~Developer~~ | ~~interface~~ | ~~081 ✅, 013 ✅, 065 ✅~~ | ~~Done~~ |

---

### Deferred to Sprint 006+

| # | Title | Branch | Layer | Depends on |
|---|-------|--------|-------|------------|
| 024 | Trading Economics scraper | `task/024-scraper-trading-economics` | infra | 003 ✅ |
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | infra | 003 ✅ |
| ~~026~~ | ~~HOSE market data fetcher~~ | ~~`task/026-hose-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | infra | 003 ✅ |

### Sprint 004 — DONE (historical)

| # | Title | Branch | Layer | Depends on |
|---|-------|--------|-------|------------|
| ~~021~~ | ~~RSS base fetcher + CafeF news~~ | ~~`task/021-rss-cafef`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~082~~ | ~~Watchlist MCP tools (add/remove/get/update)~~ | ~~`task/082-tool-watchlist`~~ | ~~interface~~ | ~~081 ✅, 002 ✅~~ |
| ~~063~~ | ~~Signal detector (price + news + report)~~ | ~~`task/063-signal-detector`~~ | ~~domain~~ | ~~021, 082~~ |
| ~~064~~ | ~~Multi-signal alert generator~~ | ~~`task/064-alert-generator`~~ | ~~domain~~ | ~~063 ✅~~ |
| ~~086~~ | ~~Alert MCP tools (get_alerts, briefing, history)~~ | ~~`task/086-tool-alerts`~~ | ~~interface~~ | ~~064 ✅, 081 ✅~~ |

---

## 🗂 BACKLOG
*(Ordered by priority — move to Todo when dependencies are Done)*

### 📡 Infrastructure Fetchers (021–039)

*(022, 023 promoted to Sprint 004; 026 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 024 | Trading Economics scraper | `task/024-scraper-trading-economics` | infra | 003 ✅ | Returns macro indicators (CPI, GDP, interest rate) as structured JSON; deferred Sprint 006 |
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | infra | 003 ✅ | Returns Brent crude, gold, USD/VND prices; deferred Sprint 006 |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | infra | 003 ✅ | Returns SBV interest rate, FX rate; deferred Sprint 006 |

---

### ⚙️ Domain: Analysis Engine (061–079)

*(061, 062 promoted to Sprint 004)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~065~~ | ~~Historical pattern matcher~~ | ~~`task/065-pattern-matcher`~~ | ~~application~~ | ~~013 ✅, 046 ✅~~ | ~~Done ✅~~ |
| ~~066~~ | ~~AI summary generator~~ | ~~`task/066-ai-summary`~~ | ~~application~~ | ~~061 ✅, 047 ✅~~ | ~~Done ✅~~ |

---

### 🔌 Interface: MCP Server + Tools (081–099)

*(083 promoted to Sprint 004; 088 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~084~~ | ~~Market tools (get_market_snapshot, get_patterns)~~ | ~~`task/084-tool-market`~~ | ~~interface~~ | ~~081 ✅, 013 ✅, 065 ✅~~ | ~~Done ✅~~ |

---

### ⏰ Interface: Scheduler (101–119)

*(101, 102, 103, 104 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 105 | Evening summary job (22:00) | `task/105-job-evening-summary` | interface | 086 ✅ | **Done** — merged to main 2026-03-28; 14 tests pass, tsc 0 errors |

---

### 📡 Source Health (210)

| # | Title | Branch | Layer | Status |
|---|-------|--------|-------|--------|
| 210 | News source health monitoring | `worktree-agent-a5152c35` | domain + interface | Review 🔍 |

---

### 🧪 Tests (121–139)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 121 | Unit tests — BCTC parser (Vietnamese edge cases) | `task/121-test-bctc-edge-cases` | test | 042-047 | 20+ edge cases: parentheses negatives, missing fields, image-only PDF, corrupt PDF |
| 122 | Unit tests — domain services | `task/122-test-domain-services` | test | 061-066 | Cascade engine, signal detector, alert generator all have ≥90% branch coverage |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | test | 082-086, 084 ✅ | Full tool call roundtrip: add watchlist → fetch news → generate alert → get alert. **UNBLOCKED — ready for Wave 3** |
| 124 | Integration tests — SSC pipeline (mock HTTP) | `task/124-test-ssc-pipeline` | test | 048 | Mock SSC HTML + PDF; verify full parse → store → embed pipeline |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | test | 101-105 | Full daily briefing: trigger → fetch → analyze → alert → report; assert final output structure |

---

### 🔍 Review (303, 195, 220, Sprint 042)

| # | Title | Branch | Layer | Depends on | Status |
|---|-------|--------|-------|------------|--------|
| 303 | Cycle Step A4: auto-compute hexagram per watchlist stock every cycle | `task/303-cycle-step-a4-hexagram` | scheduler + infrastructure/db | — | Review |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | `task/195-rebalancing-signals` | domain + interface | 193 (partial — registered directly pending registry) | Review |
| 220 | Watchlist auto-enrichment: sector peer suggestions on `add_to_watchlist` | `task/220-watchlist-peer-suggestions` | interface | — | Review |
| 257 | Weather VN Fetcher — NCHMF + NOAA ENSO | `task/262-mcp-tools-042` | infrastructure | — | Review |
| 258 | Hydrological Data Fetcher — reservoir levels | `task/262-mcp-tools-042` | infrastructure | — | Review |
| 259 | Climate Impact Mapper — weather event → stock signals | `task/262-mcp-tools-042` | domain | — | Review |
| 260 | Energy Market Analyzer — power grid signals | `task/262-mcp-tools-042` | domain | — | Review |
| 261 | Signal Integration — climate_event + energy_grid + CLIMATE_RULES + weatherCheckJob | `task/262-mcp-tools-042` | domain + scheduler | 257-260 | Review |
| 262 | MCP Tools — get_climate_risk_signals + get_energy_grid_signals | `task/262-mcp-tools-042` | interface | 257-261 | Review |

**Task 195 — Acceptance Criteria**
- A position at 42% weight with 25% target produces drift = +17%, action = "BAN"
- A position at 18% weight with 25% target produces drift = -7%, action = "MUA"
- A position with |drift| < threshold produces "(trong nguong)"
- Equal-weight fallback: 4 positions with no `target_weight` each get 25% target
- Stock with no `market_prices` row shown as "(thieu du lieu gia)"
- No open positions returns "Khong co vi the nao dang mo"
- Corrective share quantities are integers (sell = floor, buy = ceil)
- Threshold parameter 0.10 flags only drifts > 10%
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count increases from 46 to 47

---

## Kanban Summary

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 60+ | Sprints 000-033 complete |
| 🔍 Review | 13 | DOC-001, 195, 215, 217, 218, 219, 220, 222, 223, 257-262 (Sprint 042) |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 0 | — |
| 🗂 Backlog | 6 | 192, 193, 206, 207 (Sprint 028); 196, 197 (deferred); 125 (long-term deferred) |
| **Total** | **60+** | |

---

## Sprint 028 — ACTIVE

> Sprint 028 STARTED — 2026-04-01. Theme: Structural Integrity and Investor Safety Net.
> PO sign-off: APPROVED 2026-04-01. Tasks 192, 193, 206, 207 in scope.

| # | Title | Branch | Priority | Status |
|---|-------|--------|----------|--------|
| 192 | Fix flaky test: polymarket-fetcher mock timing | `task/192-fix-polymarket-flaky` | P0 | Backlog |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | P0 | Backlog |
| 206 | Stop-loss / take-profit threshold alerts | `task/206-price-alert-tools` | P1 | Review |
| 207 | Per-source API rate limiting for external fetchers | `task/207-rate-limiter` | P1 | Review |

**Task 206 — Acceptance Criteria**
- `set_price_alert('VCB', 'stop_loss', 88000)` inserts a row with `triggered = 0`.
- Price 87,500 processed → row marked `triggered = 1` and HIGH alert inserted into `alerts`.
- Triggered row does NOT re-fire on subsequent price checks.
- `set_price_alert('FPT', 'take_profit', 120000)` + price 123,000 → take-profit alert fires.
- `get_price_alerts()` returns all pending alerts in Vietnamese table format.
- `delete_price_alert(id)` removes the row; no longer shown in `get_price_alerts`.
- `checkPriceAlerts([])` (empty prices) → no crash, returns 0 breaches.
- `price_alerts` table + index created in `schema.ts` with `IF NOT EXISTS`.
- >= 18 tests, 0 failures. `bun tsc --noEmit` → 0 errors. Tool count 48 → 51.

Files:
- MODIFY: `src/infrastructure/db/schema.ts` — add `price_alerts` table + index
- CREATE: `src/application/usecases/checkPriceAlerts.ts`
- CREATE: `src/interface/mcp/tools/priceAlertTools.ts`
- MODIFY: `src/interface/mcp/tools/registry.ts` — add priceAlertTools entry (requires 193)
- MODIFY: `src/scheduler/intelligenceCycleJob.ts` — wire `checkPriceAlerts` after price fetch
- CREATE: `src/__tests__/206-price-alert-tools.test.ts`

Dependency: task 193 (registry.ts must exist before task 206 appends to it).

**Task 207 — Acceptance Criteria**
- `canCall('cafef.vn')` → `true` before first call, `false` immediately after `record()`,
  `true` again after 8 s (mocked timer).
- Two rapid calls to same host: second skipped, logged at DEBUG.
- Different hosts: independent counters — one rate-limited does not block others.
- All 7 modified fetchers return `[]` / `null` gracefully when rate-limited (no throws).
- `mcp.config.json` `fetchers.rateLimits` section parsed and applied at startup.
- `rateLimiter.ts` lives in `src/domain/services/` (pure logic, no I/O imports).
- >= 14 tests, 0 failures. `bun tsc --noEmit` → 0 errors. Tool count unchanged.

Files:
- CREATE: `src/domain/services/rateLimiter.ts`
- MODIFY: `src/infrastructure/fetchers/cafef.ts`
- MODIFY: `src/infrastructure/fetchers/vnexpress.ts`
- MODIFY: `src/infrastructure/fetchers/vneconomy.ts`
- MODIFY: `src/infrastructure/fetchers/reuters.ts`
- MODIFY: `src/infrastructure/fetchers/tradingEconomicsStream.ts`
- MODIFY: `src/infrastructure/fetchers/hose.ts`
- MODIFY: `src/infrastructure/fetchers/hnx.ts`
- MODIFY: `mcp.config.json` — add `fetchers.rateLimits` section
- CREATE: `src/__tests__/207-rate-limiter.test.ts`

---

## Sprint 027 — COMPLETE

> Sprint 027 DONE — 2026-04-02. Theme: Stability First — Fix the Cracks Before Adding More Floors.
> PO sign-off: APPROVED 2026-04-02. Tasks 192, 193, 194, 195, 196, 197 in scope.
> Delivered: 194 (CLAUDE.md sync), hotfixes 198-205 (production monitoring fixes). Tasks 192, 193, 195, 196, 197 carried to Sprint 028.

| # | Title | Branch | Priority | Status |
|---|-------|--------|----------|--------|
| 192 | Fix flaky test: polymarket-fetcher mock timing | `task/192-fix-polymarket-flaky` | P0 | Backlog |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | P0 | Backlog |
| 194 | CLAUDE.md sync through Sprint 026 | `main` (7f53108) | P1 | Done |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | `task/195-rebalancing-signals` | P1 | Review |
| 196 | Stale worktree cleanup + hotfix task tracking | `task/196-worktree-cleanup` | P0 | Backlog |
| 197 | Reuters RSS investigation + delete_telegram_report test coverage | `task/197-reuters-fix-telegram-tests` | P1 | Backlog |

**Task 196 — Acceptance Criteria**
- All stale agent-* worktrees under `.claude/worktrees/` removed (`git worktree prune`)
- Commits c5b925e (start.sh .env fix) and c6ea1ce (delete_telegram_report) tracked in TASKS.md Done section
- `delete_telegram_report` added to CLAUDE.md tool list and README.md tool table
- `bun tsc --noEmit` → 0 errors
- No worktrees left with branches that are already merged to main

Files:
- `TASKS.md` — add hotfix entries to Done section
- `CLAUDE.md` — add delete_telegram_report to tool list
- `cowork-analysis-vnmarket-team/README.md` — update tool count + add delete_telegram_report row
- Shell: `git worktree prune` + remove stale `.claude/worktrees/` directories

**Task 197 — Acceptance Criteria**
- Root cause of Reuters RSS failures documented (log analysis)
- If fixable: fix applied + test added; if not: alternative source identified (AP News direct, Bloomberg RSS)
- `sendTelegramReport()` return type change (boolean → message_id number) reflected in all tests
- `bun test` full suite → 0 failures
- `bun tsc --noEmit` → 0 errors

Files:
- INVESTIGATE: `src/infrastructure/fetchers/reuters.ts`
- MODIFY (if needed): test files referencing `sendTelegramReport` return value
- MODIFY (if needed): `src/infrastructure/notifiers/telegram.ts`

---

## Sprint 025 — COMPLETE

> Sprint 025 DONE — 2026-04-01. Theme: Daily Investor Intelligence — Sector Rotation, Earnings Calendar, and Alert Digest.
> PO sign-off: APPROVED 2026-04-01. Tasks 186, 187, 188 merged. Tool count: 40 → 43.

| # | Title | Branch | Agent | Priority | Status |
|---|-------|--------|-------|----------|--------|
| 186 | Sector rotation detector: `get_sector_rotation` MCP tool | `task/186-sector-rotation` | Developer | P0 | Done ✅ |
| 187 | Earnings calendar: `get_earnings_calendar` MCP tool | `task/187-earnings-calendar` | Developer | P0 | Done ✅ |
| 188 | Daily alert digest: `send_alert_digest` MCP tool + scheduler job | `task/188-alert-digest` | Developer | P1 | Done ✅ |

---

## Sprint 026 — COMPLETE

> Sprint 026 DONE — 2026-04-02. Theme: Signal Quality and Portfolio Correlation — Know What Moves Together.
> PO sign-off: APPROVED 2026-04-02. Tasks 189, 190, 191 merged. Tool count: 43 → 46.

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 189 | Correlation analysis: `get_correlation_matrix` MCP tool | `task/189-correlation-matrix` | Developer | P0 | market_prices_history ✅, watchlist ✅, positions ✅ | Done ✅ |
| 190 | Data export: `export_portfolio_snapshot` MCP tool | `task/190-export-snapshot` | Developer | P0 | all tables ✅ | Done ✅ |
| 191 | Performance attribution: `get_performance_attribution` MCP tool | `task/191-performance-attribution` | Developer | P1 | positions ✅, alerts ✅ | Done ✅ |

---

**Task 189 — Correlation Matrix**

Acceptance criteria:
- Two stocks with identical price series produce r = 1.0, classified TUONG QUAN CAO
- Two stocks with anti-correlated series produce r close to -1.0
- Pairs with < 5 aligned data points shown as "(du lieu khong du)"
- Diversification score = 100 when all pairs have |r| < 0.70
- Diversification score = 0 when all pairs have |r| >= 0.85
- Warning line appears only for highly correlated pairs where BOTH stocks have open positions
- When < 2 watchlist stocks, returns "Can it nhat 2 co phieu"
- When `market_prices_history` empty, returns "Chua co du lieu lich su gia"
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 43 → 44

Files:
- CREATE: `src/domain/services/correlationCalculator.ts`
- CREATE: `src/interface/mcp/tools/correlationTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/189-correlation-matrix.test.ts`

---

**Task 190 — Portfolio Snapshot Export**

Acceptance criteria:
- Exported JSON contains all 7 top-level keys: exported_at, schema_version, watchlist,
  positions, alerts, analysis_entries, financial_reports, market_prices, summary
- `summary.watchlist_count` matches actual row count in `watchlist` table
- `summary.open_positions` counts only rows WHERE closed_at IS NULL
- File written to `data/exports/snapshot_<YYYYMMDD_HHmmss>.json`
- File size reported in MB correct to 1 decimal place
- When export directory cannot be written, output contains "(khong the ghi file)"
- All tables export as empty arrays when 0 rows
- >= 14 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 44 → 45

Files:
- CREATE: `src/application/usecases/exportPortfolioSnapshot.ts`
- CREATE: `src/interface/mcp/tools/exportTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/190-export-snapshot.test.ts`

---

**Task 191 — Performance Attribution**

Acceptance criteria:
- Two closed positions with `news_mention` signal and positive P&L produce win rate 100%
  and correct total P&L sum for that group
- Position with NULL `entry_alert_id` grouped under "Khong ro nguon tin hieu"
- Groups ranked by total P&L descending
- "Tin hieu hieu qua nhat" names the group with highest total P&L
- "Tin hieu kem hieu qua" names the group with lowest win rate (excluding 0-position groups)
- When no closed positions exist, returns "Chua co vi the nao duoc dong"
- If `entry_alert_id` column missing, all positions in unknown group + migration hint
- Positions with NULL `realized_pnl` excluded from averages but counted in totals
- >= 14 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 45 → 46

Files:
- CREATE: `src/domain/services/performanceAttributor.ts`
- CREATE: `src/interface/mcp/tools/performanceTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/191-performance-attribution.test.ts`

---

**Task 186 — Sector Rotation Detector**

Acceptance criteria:
- `get_sector_rotation()` groups stocks by sector using `sectorPeers.ts` mapping
- A sector where all stocks have 5d return > +2% and 1d > +0.5% is labelled "DONG TIEN VAO"
- A sector where all stocks have 5d return < -2% and 1d < -0.5% is labelled "DONG TIEN RA"
- Sectors ranked by 5d return descending in output
- OUTFLOW sector containing a watchlist stock triggers a warning line
- When `market_prices` is empty, returns "Chua co du lieu gia thi truong"
- When only 1d data available, output contains "(chi co du lieu 1 ngay)"
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 40 → 41

Files:
- CREATE: `src/domain/services/sectorRotationDetector.ts`
- CREATE: `src/interface/mcp/tools/sectorRotationTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/186-sector-rotation.test.ts`

---

**Task 187 — Earnings Calendar**

Acceptance criteria:
- For a watchlist stock with no filing in `financial_reports`, next Q1 deadline (30 April) shown as "(uoc tinh)"
- Stock whose filing deadline passed yesterday with no entry shows "QUA HAN"
- Stock within 14 days of deadline shows "SAP DEN"
- Stock with actual filing in `financial_reports` shows "DA NOP" with actual date
- When `watchlist` is empty, returns "Danh sach theo doi trong"
- >= 14 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 41 → 42

Files:
- CREATE: `src/domain/services/earningsCalendar.ts`
- CREATE: `src/interface/mcp/tools/earningsCalendarTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/187-earnings-calendar.test.ts`

---

**Task 188 — Daily Alert Digest**

Acceptance criteria:
- With 7 alerts in DB spanning 3 stocks, digest contains 3 stock blocks with correct counts
- Alerts older than 24h excluded from digest
- Stock with > 3 alerts in 24h shows top 3 plus "(va N canh bao khac)"
- Severity counts in header match actual alert severities in DB
- When `alerts` empty, output contains "Khong co canh bao"
- When Telegram not configured, output contains "(Telegram chua duoc cau hinh)"
- `alertDigestJob` cron expression is `0 21 * * 1-5`
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 42 → 43

Files:
- CREATE: `src/application/usecases/assembleAlertDigest.ts`
- CREATE: `src/scheduler/alertDigestJob.ts`
- CREATE: `src/interface/mcp/tools/alertDigestTools.ts`
- MODIFY: `src/scheduler/jobs.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/188-alert-digest.test.ts`

---

## DDD Layer Summary

| Layer | Tasks | Description |
|-------|-------|-------------|
| **Domain** | 041-048, 061-066, 014 | Pure business logic, no I/O |
| **Infrastructure** | 002, 003, 011-013, 021-030 | SQLite, LanceDB, HTTP, scrapers |
| **Application** | 047, 048, 065, 066 | Use case orchestration |
| **Interface** | 081-105 | MCP tools, Bun server, scheduler |
| **Test** | 121-125 | Cross-cutting |

---

---

## Sprint 027 — Active

> Sprint 027 ACTIVE — 2026-04-02. Theme: Stability First — Fix the Cracks Before Adding More Floors.

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 192 | Fix flaky test: `164-polymarket-fetcher.test.ts` mock timing | `task/192-fix-polymarket-flaky` | Developer | P0 | — | Review |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | Developer | P0 | — | Backlog |
| 194 | CLAUDE.md sync through Sprint 026 | `main` (7f53108) | — | P1 | — | Done |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | `task/195-rebalancing-signals` | Developer | P1 | 193 | Review |
| 196 | Stale worktree cleanup + hotfix task tracking | `task/196-worktree-cleanup` | Developer | P0 | — | Backlog |
| 197 | Reuters RSS investigation + delete_telegram_report test coverage | `task/197-reuters-fix-telegram-tests` | Developer | P1 | — | Backlog |

---

**Task 192 — Fix Flaky Test: 164-polymarket-fetcher.test.ts**

Acceptance criteria:
- `bun test src/__tests__/164-polymarket-fetcher.test.ts` passes 10/10 consecutive runs
- `bun test` full suite passes 3/3 consecutive runs with no flaky failures in task 164
- No production code files modified — test isolation fix only
- `bun tsc --noEmit` → 0 errors
- >= 1 new test or assertion added that pins the previously-flaky behaviour

Files:
- MODIFY: `src/__tests__/164-polymarket-fetcher.test.ts`
- MODIFY (optional): shared test helper if mock isolation is extracted

---

**Task 193 — Dynamic Tool Registration**

Acceptance criteria:
- `src/interface/mcp/tools/registry.ts` exists and exports `toolRegistry` as an array of
  objects with a `register(server, db)` method
- `src/interface/mcp/server.ts` contains only a `toolRegistry.forEach(r => r.register(server, db))`
  loop — no individual `register*Tools(...)` call sites
- All 46 existing tools remain registered and functional
- `bun test` full suite → 0 failures
- `bun tsc --noEmit` → 0 errors
- A new tool can be added by editing only its own file + appending one entry to `registry.ts`
- >= 8 tests, 0 failures

Files:
- CREATE: `src/interface/mcp/tools/registry.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: each tool module file (add `export function register(server, db)` named export)
- CREATE: `src/__tests__/193-tool-registry.test.ts`

---

**Task 194 — DONE (committed 7f53108, 2026-04-02)**

CLAUDE.md synced through Sprint 026 — all files, tool count (46), test count (1672+) updated.

---

**Task 195 — Portfolio Rebalancing Signals: `get_rebalancing_signals` MCP tool**

Acceptance criteria:
- A position at 42% weight with 25% target produces drift = +17%, action = "BAN"
- A position at 18% weight with 25% target produces drift = -7%, action = "MUA"
- A position with |drift| < threshold produces "(trong nguong)"
- Equal-weight fallback: 4 positions with no `target_weight` each get 25% target
- Stock with no `market_prices` row shown as "(thieu du lieu gia)"
- No open positions → "Khong co vi the nao dang mo"
- Corrective share quantities are integers (sell = floor, buy = ceil)
- Threshold parameter 0.10 flags only drifts > 10%
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 46 → 47 (first tool registered via dynamic registry from task 193)

Files:
- CREATE: `src/domain/services/rebalancingCalculator.ts`
- CREATE: `src/interface/mcp/tools/rebalancingTools.ts`
- MODIFY: `src/interface/mcp/tools/registry.ts`
- CREATE: `src/__tests__/195-rebalancing-signals.test.ts`

---

## Definition of Done (DoD)

A task is **Done** when ALL of the following are true:

- [ ] Code is on `task/NNN` branch
- [ ] `bun test src/__tests__/NNN-*.test.ts` → all pass
- [ ] `bun tsc --noEmit` → 0 errors
- [ ] QA checklist: 100% ✅
- [ ] Zero BLOCKING issues in Task Report
- [ ] Merged to `main` via `--no-ff`
- [ ] `reports/TASK_REPORT_NNN.md` generated
- [ ] Kanban card moved to Done
- [ ] TASKS.md updated (move row to Done table)
