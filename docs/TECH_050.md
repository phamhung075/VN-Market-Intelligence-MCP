# TECH-050: Close the Cycle — Kinh Dich Goes Live + /ask Command

status: APPROVED_BY_ARCHITECT
req_ref: REQ-050
sprint: 050

---

## Blocker Resolutions

### B1 — CAS race between Step F and userRequestCheckJob

**Resolution: Remove Step F's user-request processing. `userRequestCheckJob` becomes the sole processor.**

Rationale from brownfield analysis:

- `userRequestCheckJob.ts` (Task 246) already implements a complete, correct
  CAS pattern: `UPDATE user_requests SET status='processing' WHERE id=? AND status='pending'`
  followed by `claimResult.changes === 0` guard. It handles RAG retrieval, Telegram send,
  and `status='done'` mark in one self-contained transaction.
- Step F in `intelligenceCycleJob.ts` calls `getPendingRequests` (SELECT only, no claim),
  then works on the row without any CAS. If the check job fires within the same 15-min
  window, the same row is read by both processors — two Telegram messages are sent.
- Adding a second CAS to Step F would duplicate the logic already in the check job.
  The architecturally clean decision is: one owner per concern.
- Step F will be **replaced** by: (a) hexagram enrichment logic (Task 306 new work),
  and (b) delegation to `runUserRequestCheck()` for answering. The enrichment
  happens before the check-job call so that the enriched hexagram data is already in DB
  when the check job builds its RAG answer.
- The check job already guarantees a 15-minute SLA regardless of market hours
  (it runs on its own 15-min cron, not gated on market hours), so removing Step F
  loses no latency guarantees.

**Concrete change**: In `intelligenceCycleJob.ts` Step F, replace the current
inline pending-request loop with a single call to `runUserRequestCheck(db)`. The
enrichment that Step F adds (hexagram context in the answer body) will be handled
inside the check job via the `searchContextFn` injectable — the hexagram data is
already in `kinhdich_readings` by the time Step F runs (Step A4 runs before Step F).

**Note on Task 306 scope**: The FR-4 requirement to enrich the answer with hexagram
data is satisfied because `runUserRequestCheck` calls RAG search (`searchContext`),
and `kinhdich_readings` rows inserted by Step A4 are indexed into the RAG store.
The direct hexagram/alert/price template enrichment described in FR-4 is implemented
inside a new `buildEnrichedAnswer()` helper that the check job calls instead of the
plain RAG formatter. Task 306 therefore modifies `userRequestCheckJob.ts`, NOT
`intelligenceCycleJob.ts` Step F (except for the delegation call).

---

### B2 — `source` column migration strategy

**Resolution: Option (a) — inline `try/catch ALTER TABLE` inside `initHexagramTables()`.**

Rationale from brownfield analysis:

The codebase has no migration framework. The established and exclusively used pattern
across `schema.ts`, `hose.ts`, `hnx.ts`, `generateAiSummary.ts`, and `telegramReportStore.ts`
is uniformly:

```typescript
try { db.exec(`ALTER TABLE <table> ADD COLUMN <col> <type> DEFAULT <val>`); } catch {}
```

This pattern appears 8+ times in production. It is idempotent (SQLite raises an error
on duplicate column, which the catch silently absorbs), safe to call at every boot,
and requires no migration tracking table. Introducing a formal migration system
(migration version table, sequential numbered files) is out of scope for Sprint 050
and would be a breaking architectural change requiring its own sprint.

The `source` column addition is therefore implemented inside `initHexagramTables()`
as a single `try/catch ALTER TABLE` line, consistent with the project's established
pattern. The column has a `DEFAULT 'manual'` so all existing rows acquire the correct
retroactive value.

---

### B3 — kinhDichScore signed polarity derivation

**Resolution: Two-field formula using both `trading_signal` text suffix AND signal verb.**

Rationale from brownfield analysis:

Inspecting `kinhDichReading.ts` lines 255–257 reveals the exact stored format:

```
tradingSignalDisplay = combinedScore >= 0
  ? `${tradingSignal} (tich cuc)`
  : `${tradingSignal} (tieu cuc)`
```

Where `tradingSignal` is the majority-vote verb: `MUA | BAN | GIU | CHO | THAN TRONG`.

The BA's proposed formula `confidence * (tich cuc ? +1 : tieu cuc ? -1 : 0)` is
**rejected** for one reason: it makes GIU with "tich cuc" yield a positive score,
meaning "hold but things are looking up" — which is correct but low-magnitude. However,
`BAN (tich cuc)` would also yield positive, which is contradictory (sell signal with
positive polarity). This occurs when `combinedScore >= 0` but the majority-vote verb
is BAN (net-positive score but most hao say retreat).

**Adopted formula — verb-primary with tich/tieu as magnitude modifier**:

```typescript
function deriveKinhDichScore(
  tradingSignal: string | null,
  confidence: number | null,
): number {
  if (!tradingSignal || confidence == null) return 0;
  const sig = tradingSignal.toUpperCase();
  const conf = Math.max(0, Math.min(1, confidence));

  // Verb polarity: MUA/CHO = bullish (+1), BAN/THAN TRONG = bearish (-1), GIU = neutral (0)
  let verbPolarity: number;
  if (sig.includes("MUA") || sig.includes("CHO")) {
    verbPolarity = +1;
  } else if (sig.includes("BAN") || sig.includes("THAN TRONG")) {
    verbPolarity = -1;
  } else {
    verbPolarity = 0; // GIU
  }

  // Suffix acts as a confidence multiplier gate only: tieu cuc reduces magnitude by 30%
  const suffixMultiplier = sig.includes("TIEU CUC") ? 0.7 : 1.0;

  // Final score in [-1, +1]
  return verbPolarity * conf * suffixMultiplier;
}
```

This means:
- `MUA (tich cuc)` confidence=0.72 → `+1 * 0.72 * 1.0 = +0.72` → `scoreKinhDich = 0.5 + 0.72*0.5 = 0.86` — matches AC-304 expected value.
- `BAN (tieu cuc)` confidence=0.80 → `-1 * 0.80 * 0.7 = -0.56` → slightly damped bearish.
- `GIU (tich cuc)` confidence=0.60 → `0 * 0.60 * 1.0 = 0` → neutral (GIU always neutral).
- null/missing → `0` → `scoreKinhDich = 0.5` (neutral, matching the undefined case).

The `scoreKinhDich` mapping applied in `portfolioTools.ts` before calling `computeConviction`:
```typescript
const kinhDichScore = deriveKinhDichScore(row.trading_signal, row.confidence);
// Then pass to computeConviction: kinhDichScore → scoreKinhDich(kinhDichScore)
// scoreKinhDich maps [-1,+1] to [0,1]: 0.5 + score * 0.5
```

**Scope note**: The REQ-050 FR-2 text says caller is responsible for loading from DB
and deriving `kinhDichScore`. The formula lives in `portfolioTools.ts` (interface layer),
not in `convictionScorer.ts` (domain). The domain only receives the already-derived
`[-1,+1]` value and applies `0.5 + score * 0.5`.

---

## Brownfield Impact

**Files modified:**

| File | Change |
|------|--------|
| `src/infrastructure/db/hexagramStore.ts` | Add `source` column migration in `initHexagramTables`; extend `storeReading` to accept optional `source` param; extend `getLatestReading` to return `tradingSignal` + `confidence` |
| `src/scheduler/intelligenceCycleJob.ts` | Add Step A4 (hexagram batch loop); extend `CycleResult` with `hexagramsComputed`; extend `CycleDeps` with `computeHexagramsFn`; replace Step F inline loop with `runUserRequestCheck(db)` delegation |
| `src/domain/services/convictionScorer.ts` | Add `kinhDichScore?: number` to `ConvictionInput`; add `kinhDich` to `ConvictionResult.dimensions`; add `scoreKinhDich()` helper; update `WEIGHTS` to 6-dimension split; update `summary` string |
| `src/interface/mcp/tools/portfolioTools.ts` | Load latest `kinhdich_readings` row per stock; call `deriveKinhDichScore()`; pass `kinhDichScore` to `computeConviction` |
| `src/scheduler/userRequestCheckJob.ts` | Replace plain RAG answer formatter with `buildEnrichedAnswer()` that injects hexagram + alert + price data for mentioned tickers; handle `why:TICKER` prefix |
| `src/infrastructure/notifiers/telegramCommands.ts` | Change `/why VCB` to store `why:VCB` payload (not English); add no-arg guard for `/why` |
| `src/interface/mcp/server.ts` | Replace 36 individual `register*Tools(server)` call sites with `toolRegistry.forEach(fn => fn(server))` |

**Files created:**

| File | Purpose |
|------|---------|
| `src/interface/mcp/tools/userRequestTools.ts` | `registerUserRequestTools` — `log_user_request` + `get_pending_user_requests` MCP tools |
| `src/interface/mcp/tools/registry.ts` | `toolRegistry` flat array of all `register*Tools` functions |
| `src/__tests__/311-cycle-hexagram-batch.test.ts` | TDD: Task 303 — Step A4 unit tests |
| `src/__tests__/312-conviction-kinhdich.test.ts` | TDD: Task 304 — 6-dimension conviction scorer tests |
| `src/__tests__/313-user-request-tools.test.ts` | TDD: Task 305 — MCP tool insert/read tests |
| `src/__tests__/314-step-f-enrichment.test.ts` | TDD: Task 306 — enriched answer + Telegram channel tests |
| `src/__tests__/315-telegram-why-command.test.ts` | TDD: Task 307 — `/why` payload format + no-arg guard |
| `src/__tests__/316-tool-registry.test.ts` | TDD: Task 308 — registry completeness + server.ts loop |

**Files deleted:** None.

**Breaking changes:** No. `computeConviction` backward-compatible (optional field). `storeReading` signature unchanged (source param optional). `getLatestReading` return type extended (additive).

---

## Architecture Decision

Task 303 calls score helpers from `kinhDichTools.ts` (interface layer) directly from
the scheduler — this is a **deliberate and permitted pattern** in this codebase: the
scheduler is the outermost layer and may import from interface tools that are
themselves importers of domain logic. The score helpers (`computeHaoScores`,
`computeReading`, etc.) are pure synchronous functions with no side effects beyond DB
reads; they do not perform HTTP calls; and extracting them to a separate application
use case would add a file with zero new logic. The existing pattern in
`intelligenceCycleJob.ts` (Steps A2/A3 dynamically importing from application and
infrastructure) is followed for Step A4.

The CAS ownership decision (B1) keeps architectural responsibility clean: one job
owns one concern. The intelligence cycle computes hexagram state (domain enrichment);
the check job owns the user-request lifecycle. Both jobs share the same SQLite DB
and the CAS claim is the synchronisation primitive — no shared mutable state, no
locking beyond the SQLite UPDATE atomicity guarantee.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `initHexagramTables` — source column | infrastructure/db | `src/infrastructure/db/hexagramStore.ts` | MODIFY |
| `storeReading` — source param | infrastructure/db | `src/infrastructure/db/hexagramStore.ts` | MODIFY |
| `getLatestReading` — return tradingSignal+confidence | infrastructure/db | `src/infrastructure/db/hexagramStore.ts` | MODIFY |
| Step A4 hexagram batch | scheduler | `src/scheduler/intelligenceCycleJob.ts` | MODIFY |
| `CycleResult.hexagramsComputed` | scheduler | `src/scheduler/intelligenceCycleJob.ts` | MODIFY |
| `CycleDeps.computeHexagramsFn` | scheduler | `src/scheduler/intelligenceCycleJob.ts` | MODIFY |
| Step F → delegate to checkJob | scheduler | `src/scheduler/intelligenceCycleJob.ts` | MODIFY |
| `scoreKinhDich` + `WEIGHTS` update | domain | `src/domain/services/convictionScorer.ts` | MODIFY |
| `ConvictionInput.kinhDichScore` | domain | `src/domain/services/convictionScorer.ts` | MODIFY |
| `ConvictionResult.dimensions.kinhDich` | domain | `src/domain/services/convictionScorer.ts` | MODIFY |
| `deriveKinhDichScore` + DB load | interface/mcp/tools | `src/interface/mcp/tools/portfolioTools.ts` | MODIFY |
| `buildEnrichedAnswer` + `why:` prefix handler | scheduler | `src/scheduler/userRequestCheckJob.ts` | MODIFY |
| `/why` payload format + no-arg guard | infrastructure/notifiers | `src/infrastructure/notifiers/telegramCommands.ts` | MODIFY |
| `registerUserRequestTools` | interface/mcp/tools | `src/interface/mcp/tools/userRequestTools.ts` | CREATE |
| Barrel export | interface/mcp/tools | `src/interface/mcp/tools/index.ts` | MODIFY |
| `toolRegistry` flat array | interface/mcp/tools | `src/interface/mcp/tools/registry.ts` | CREATE |
| `createMcpServerInstance` refactor | interface/mcp | `src/interface/mcp/server.ts` | MODIFY |

---

## Interface Contracts

### `hexagramStore.ts` — extended `storeReading` signature

```typescript
export interface KinhDichReadingRow {
  stockCode: string;
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  haoStates: string;
  rawScores: string;
  nguHanhDynamic?: string;
  tradingSignal?: string;
  confidence?: number;
  actionNote?: string;
  source?: 'manual' | 'cycle';   // NEW — defaults to 'manual' if omitted
}
```

### `hexagramStore.ts` — extended `getLatestReading` return type

```typescript
// Extend existing return type (additive — no breaking change):
export function getLatestReading(code: string): {
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  haoStates: string;
  timestamp: string;
  tradingSignal: string | null;   // NEW
  confidence: number | null;       // NEW
} | null
```

### `convictionScorer.ts` — updated types

```typescript
// ConvictionInput — new optional field:
kinhDichScore?: number;  // range [-1, +1]; undefined → neutral

// WEIGHTS — 6 dimensions summing to 1.0:
const WEIGHTS = {
  priceAction: 0.2550,
  volumeConfirmation: 0.2125,
  sentiment: 0.1275,
  cascade: 0.1275,
  sectorAlignment: 0.1275,
  kinhDich: 0.1500,
} as const;

// scoreKinhDich — pure helper:
function scoreKinhDich(score: number | undefined): number
// undefined → 0.5; otherwise clamp(0.5 + score * 0.5, 0, 1)

// ConvictionResult.dimensions — new field:
dimensions: {
  priceAction: number;
  volumeConfirmation: number;
  sentiment: number;
  cascade: number;
  sectorAlignment: number;
  kinhDich: number;   // NEW
}
```

### `userRequestTools.ts` — new MCP tools

```typescript
export function registerUserRequestTools(server: McpServer): void
// Registers:
//   log_user_request(question: string, source: string) → { id: number, status: 'pending' }
//   get_pending_user_requests(limit?: number)           → UserRequest[]
```

### `registry.ts` — new file

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// All register*Tools imports...

export const toolRegistry: Array<(server: McpServer) => void> = [
  registerWatchlistTools,
  registerReportTools,
  // ... all 37+ entries
  registerUserRequestTools,   // NEW Task 305
];
```

### `intelligenceCycleJob.ts` — interface extensions

```typescript
// CycleResult — new field:
export interface CycleResult {
  // ... existing fields ...
  hexagramsComputed: number;  // NEW — count of hexagram readings stored in this cycle
}

// CycleDeps — new injectable:
export interface CycleDeps {
  // ... existing fields ...
  computeHexagramsFn?: (codes: string[]) => Promise<number>;  // NEW — for test injection
}
```

### `userRequestCheckJob.ts` — enrichment helper

```typescript
// Internal helper (not exported — used inside runUserRequestCheck only):
async function buildEnrichedAnswer(
  db: Database,
  payload: string,
  ragResults: SearchResult[],
): Promise<string>
// Extracts 2–4 letter uppercase codes from payload,
// filters against watchlist,
// queries kinhdich_readings (getLatestReading), market_prices, alerts for each code,
// builds Vietnamese answer block with hexagram info, price/change, most recent alert.
// Falls back gracefully (section omitted) when any sub-query returns null.
```

---

## Task Breakdown (for PM)

Suggested atomic tasks in dependency order — all within Sprint 050:

| Task | Title | Layer | Depends On |
|------|-------|-------|-----------|
| 303 | Cycle Step A4: hexagram batch per watchlist stock | scheduler + infrastructure/db | — |
| 304 | Conviction scorer 6th dimension kinhDichScore | domain + interface/mcp/tools | 303 (needs kinhdich_readings data in AC tests) |
| 305 | user_requests MCP tools: log_user_request + get_pending | interface/mcp/tools | — |
| 306 | Step F enrichment: buildEnrichedAnswer + Vietnamese + why: prefix | scheduler | 303, 305 |
| 307 | /why payload format + no-arg guard in telegramCommands | infrastructure/notifiers | 305 |
| 308 | Dynamic tool registry.ts | interface/mcp | — (parallel) |

Parallelism at sprint start: 303, 305, 308 can start simultaneously (no interdependencies).
304 starts after 303 is merged (needs `source` column and `getLatestReading` extension).
306 starts after 303 and 305 are merged.
307 starts after 305 is merged.

---

## Scope Adjustments vs BA Spec

1. **Task 305 scope confirmed**: `user_requests` table + `/ask`/`/why` handlers already
   exist from Task 238. Task 305 scope is correctly limited to the two new MCP tools
   (`log_user_request`, `get_pending_user_requests`) in a new `userRequestTools.ts` file.
   No changes to `userRequestStore.ts` are needed.

2. **Task 306 scope adjusted**: FR-4 described enrichment inside `intelligenceCycleJob.ts`
   Step F. Per B1 resolution, enrichment moves to `userRequestCheckJob.ts` via
   `buildEnrichedAnswer()`. Step F in `intelligenceCycleJob.ts` is simplified to a
   delegation call: `await runUserRequestCheck(db)`. This is an architectural scope
   adjustment, not a functional reduction — all acceptance criteria in AC-306 are
   still satisfied.

3. **Task 307 scope confirmed**: The existing receipt message
   `"Đang phân tích... Kết quả sẽ gửi trong 15 phút.\nID: ${id}"` is already Vietnamese
   and compliant. The only concrete code changes are: (a) store `why:VCB` not the English
   sentence, (b) guard no-arg `/why` to not insert a row. The channel verification
   (receipt goes to Chat Channel via `chatId` from the update) is already correct in
   `telegramCommands.ts` — no channel variable change needed.

4. **`computePriceVolScore` does not exist**: REQ-050 FR-1 mentions it. The actual
   exported function is `computePriceScore`. The REQ used an informal name. Task 303
   must call `computeHaoScores(code)` (the existing 6-score aggregate) rather than
   calling the 6 individual score functions separately — this matches the pattern in
   `get_kinhdich_reading` tool exactly and avoids code duplication.

---

## Implementation Notes

### Task 303 — Step A4 exact pattern

Step A4 runs unconditionally (not gated on market hours), immediately after Step A3
in `_runCycle`. It follows this per-stock pattern (mirroring `get_kinhdich_reading`):

```typescript
// For each code in watchlistCodes (or re-query watchlist if watchlistCodes is empty
// because Step 0 only runs during market hours):
const previousReading = getLatestReading(code);  // before storeReading
const scores = computeHaoScores(code);
const prelimReading = computeReading(code, scores, null);
const markovData = getMarkovData(code, prelimReading.queChiNh.number);
const reading = computeReading(code, scores, markovData);
storeReading({ ..., source: 'cycle' });
if (previousReading) {
  recordTransition(previousReading.hexagramNumber, reading.queChiNh.number, code);
}
hexagramsComputed++;
```

The entire batch is wrapped in `withTimeout(..., 'step A4 hexagramBatch', STEP_TIMEOUT_MS)`.
Per-stock errors are caught, `errors++`, and the loop continues.

When `deps.computeHexagramsFn` is injected (tests), it replaces the entire batch.
When not injected, the production implementation runs the above loop.

**Off-hours watchlist**: Step 0 only loads `watchlistCodes` during market hours.
Step A4 must independently query the watchlist from DB when `watchlistCodes` is empty
(off-hours run):

```typescript
const codesToProcess = watchlistCodes.length > 0
  ? watchlistCodes
  : (await defaultGetWatchlistCodes());
```

### Task 304 — weight precision

The 5 original weights (0.30, 0.25, 0.15, 0.15, 0.15) are each multiplied by 0.85
and rounded to 4 decimal places:

```
priceAction:        0.30 × 0.85 = 0.2550
volumeConfirmation: 0.25 × 0.85 = 0.2125
sentiment:          0.15 × 0.85 = 0.1275
cascade:            0.15 × 0.85 = 0.1275
sectorAlignment:    0.15 × 0.85 = 0.1275
kinhDich:           0.15 (fixed)
Sum:                               1.0000
```

The unit test for AC-304 must verify `Object.values(WEIGHTS).reduce((s,v) => s+v, 0) === 1.0`
using `toBeCloseTo(1.0, 10)` to avoid floating-point drift.

### Task 306 — stock code extraction from payload

```typescript
const TICKER_RE = /\b([A-Z]{2,4})\b/g;
// Applied to payload.toUpperCase()
// Filter results against: SELECT code FROM watchlist
// Limit to first 3 codes to control message length
```

For `why:VCB` payloads: strip the `why:` prefix before extraction.
If no watchlist code is found in the payload, `buildEnrichedAnswer` falls back
to pure RAG answer (no hexagram/price/alert block).

### Task 308 — registry.ts count

The current `createMcpServerInstance` in `server.ts` calls **36 individual** `register*Tools`
functions (34 from `index.ts` barrel + `registerPharmaTools` + `registerKinhDichTools`
imported separately — plus the new `registerUserRequestTools` from Task 305 = **37 total**).
The registry must contain all 37 entries. The test in `316-tool-registry.test.ts` verifies
`toolRegistry.length` equals the count of `register*Tools` calls that were in server.ts
before the refactor.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Step A4 watchlist query in off-hours runs — empty `watchlistCodes` from Step 0 | High | Medium | Always re-query watchlist in A4 when codes array is empty (see impl note above) |
| `computeHaoScores` violates DDD — interface layer called from scheduler | Low | Medium | Documented as accepted pattern; score helpers are pure SQLite-read functions; no HTTP; alternative would be empty wrapper use case |
| `kinhdich_readings.source` column absent in production DB — INSERT fails | Low | High | Mitigated by try/catch ALTER TABLE in `initHexagramTables()` at boot (B2 resolution); INSERT omits `source` column until ALTER succeeds, then includes it |
| `getLatestReading` signature change breaks existing callers | Low | High | Return type is extended additively (new nullable fields); all existing call sites destructure only `hexagramNumber`/`timestamp` — no breakage |
| `WEIGHTS` sum float drift (0.2550+0.2125+0.1275+0.1275+0.1275+0.15 = ?) | Low | Medium | Use numeric literals in source; unit test with `toBeCloseTo(1.0, 10)` |
| `/why VCB` payload format change breaks existing `userRequestCheckJob` | Low | Medium | Check job already handles arbitrary payloads via RAG; `why:` prefix detection is additive in `buildEnrichedAnswer`; old plain-text payloads still work |
| `registry.ts` missing a tool (merge conflict with parallel sprint tasks) | Medium | Low | CI check: `toolRegistry.length === server.toolCount` at start (exposed via `BunServerInstance.toolCount`) |
| Two Telegram messages if check job also runs same cycle (B1 not fully resolved) | Low | High | Resolved: Step F no longer has its own pending-request loop; only `runUserRequestCheck` processes rows |

---

## Security Review

- SQL parameterized queries? Yes — all new queries use `?` bindings.
- File paths validated (no `../`)? Yes — no file paths in this sprint.
- External HTTP rate-limited? Yes — no new external HTTP calls in Sprint 050 (Step A4 is SQLite-only).
- Secrets via `Bun.env` only? Yes.
- Telegram channel correctness: Step F (now delegated to check job) uses `sendTelegramMessage()` which defaults to `TELEGRAM_CHAT_ID` — correct. The `/ask`/`/why` webhook receipt uses `chatId` from the incoming update — correct. No change needed.
