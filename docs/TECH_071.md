# TECH-071: Per-Ticker Intelligence Summary

status: APPROVED_BY_ARCHITECT
req_ref: REQ-071

---

## Brownfield Impact

- Files created: `src/interface/mcp/tools/tickerIntelligenceTools.ts`
- Files modified: `src/interface/mcp/tools/registry.ts`
- Files deleted: none
- Breaking changes: no — purely additive

---

## Architecture Decision

This feature is a pure read-and-format aggregator in the interface layer. It reuses three existing infrastructure store functions (`getLatestEvidenceScore`, `getInsiderTransactionsFiltered`, `getResolvedClaims`) and issues three inline SQL queries against tables already queried by `foreignFlowTools.ts`, `priceHistoryTools.ts`, and the BCTC pipeline. No new domain services, no new tables, no new cron jobs. The pattern mirrors the DB-injection approach established in `foreignFlowTools.ts` and `insiderTools.ts`: a `db?: Database` parameter defaults to `getDb()` in production, and tests pass an in-memory database directly.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `registerTickerIntelligenceTools` | interface | `src/interface/mcp/tools/tickerIntelligenceTools.ts` | NEW |
| `handleGetTickerIntelligence` | interface | `src/interface/mcp/tools/tickerIntelligenceTools.ts` | NEW |
| `formatTickerIntelligence` | interface | `src/interface/mcp/tools/tickerIntelligenceTools.ts` | NEW |
| Tool registry entry | interface | `src/interface/mcp/tools/registry.ts` | MODIFY |
| Tests | tests | `src/__tests__/1178-ticker-intelligence.test.ts` | NEW |

---

## Interface Contracts

### Tool signature

```
tool name:   get_ticker_intelligence
input:       { code: string }   — stock ticker, uppercased/trimmed inside handler
output:      plain-text multi-section Vietnamese brief (never throws to MCP layer)
```

### Registration function

```typescript
// src/interface/mcp/tools/tickerIntelligenceTools.ts

export function registerTickerIntelligenceTools(
  server: McpServer,
  db?: Database,
): void
```

Standard pattern: `db` defaults to `getDb()` when omitted (production). Tests inject an in-memory `Database`.

### Handler function (internal, exported for tests)

```typescript
export async function handleGetTickerIntelligence(
  code: string,
  db: Database,
): Promise<string>
```

Normalises `code` via `.toUpperCase().trim()`, runs all six sections sequentially in independent try/catch blocks, then calls `formatTickerIntelligence`.

### Formatter function (exported for unit tests)

```typescript
export function formatTickerIntelligence(
  code: string,
  sections: [string, string, string, string, string, string],
  timestamp: string,
): string
```

Accepts pre-computed section strings and the ISO timestamp. Returns the complete 35-`=` bordered brief. Separating formatter from handler enables unit-testing format logic independently from DB queries.

---

## Per-Section Implementation Plan

### Section 1 — Latest price (inline SQL)

Table: `market_prices_history`. Query matches `priceHistoryTools.ts` column usage.

```sql
SELECT price, volume, fetched_at
FROM market_prices_history
WHERE code = ?
ORDER BY fetched_at DESC
LIMIT 1
```

Formatting helpers (already established in `priceHistoryTools.ts`, replicate locally — do not import from a peer tool file):
- `formatPrice(n)` — `Math.round(n).toLocaleString("en-US")` → `"85,000"`
- `formatVolume(n)` — `>=1M` → `"1.50M"`, `>=1K` → `"500.0K"`, else raw integer

Output: `Gia hien tai: {price} VND | KL: {volume} | Ngay: {date}`
No-data: `(khong co du lieu)`

### Section 2 — Evidence score (reuse store function)

Import: `getLatestEvidenceScore` from `../../../infrastructure/db/evidenceFragmentStore.js`

Call: `getLatestEvidenceScore(db, ticker)` — returns `EvidenceScoreRow | null`.

Output: `Evidence score ({score_date}): Bullish {bullish:.4f} | Bearish {bearish:.4f} | Neutral {neutral:.4f} | {fragmentCount} fragments`
No-data: `(khong co du lieu)`

### Section 3 — Insider activity (reuse store function)

Import: `getInsiderTransactionsFiltered` from `../../../infrastructure/db/insiderStore.js`

```typescript
const sinceDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
const txs = getInsiderTransactionsFiltered(db, { codes: [ticker], sinceDate });
```

Sort by `fromDate` DESC (already returned in that order by the store). Cap display at 3 rows.

Type mapping: `"buy"` → `"mua"`, `"sell"` → `"ban"`.
Volume format: `toLocaleString("en-US")` with comma separators.

Output per transaction: `Insider ({fromDate}): {insiderName} [{position}] — {type} {executedVolume} cp`
Overflow line when `txs.length > 3`: `(+{N} giao dich khac trong 7 ngay)`
No-data: `(khong co giao dich insider trong 7 ngay qua)`

### Section 4 — Foreign flow (inline SQL)

Table: `vnstock_trading_stats`. Query matches the inline query in `foreignFlowTools.ts`.

```sql
SELECT foreign_volume, foreign_room, current_holding_ratio,
       substr(fetched_at, 1, 10) AS date
FROM vnstock_trading_stats
WHERE code = ?
ORDER BY fetched_at DESC
LIMIT 1
```

Zero-guard: if `foreign_volume === 0` (or no row), render no-data string.

Output: `Khoi ngoai ({date}): KL {foreign_volume} | Room con lai: {foreign_room} | Ty le so huu: {holding_ratio}%`
Where `foreign_volume` and `foreign_room` use `formatVolume`, and `holding_ratio = (current_holding_ratio * 100).toFixed(2)`.
No-data: `(khong co du lieu khoi ngoai)`

### Section 5 — BCTC AI outlook (inline SQL + JSON.parse)

Table: `financial_reports`.

```sql
SELECT action_code, sort_key, period_year, period_quarter, ai_analysis
FROM financial_reports
WHERE action_code = ?
  AND ai_analysis IS NOT NULL
ORDER BY sort_key DESC
LIMIT 1
```

Outlook map:
- `"positive"` → `"TICH CUC"`
- `"neutral"` → `"TRUNG TINH"`
- `"negative"` → `"TIEU CUC"`
- `"mixed"` → `"HO HOP"`
- anything else → `"KHONG RO"`

Summary truncation: `ai_analysis.summary.slice(0, 120)` + `"..."` if truncated.

Two error paths inside section try/catch:
1. Outer catch (SQL throws — e.g. table missing): `(khong co du lieu)`
2. Inner catch on `JSON.parse` failure: `(loi phan tich BCTC)`
3. Missing `outlook`/`summary` fields after parse: `(loi phan tich BCTC)` from inner catch

Output: `BCTC ({sort_key}): Nhan dinh {outlook_vi} | {summary_truncated}`
No-data: `(chua co phan tich BCTC)`

### Section 6 — Prediction calibration (reuse store function)

Import: `getResolvedClaims` from `../../../infrastructure/db/predictionClaimStore.js`

Call: `getResolvedClaims(db, ticker, 20)`

Compute:
- `N = claims.length`
- `correct = claims.filter(c => c.resolution_outcome === "correct").length`
- `pct = (correct / N * 100).toFixed(1)`
- `brierScores = claims.map(c => c.brier_score).filter(v => v !== null && v !== undefined)`
- `avg_brier = brierScores.length > 0 ? (sum / brierScores.length).toFixed(4) : "N/A"`

Output: `Du doan ({N} resolved): Chinh xac {correct}/{N} ({pct}%) | Brier TB: {avg_brier}`
No-data: `(chua co du doan da giai quyet)`

---

## Output Format

```
=== INTELLIGENCE BRIEF: {CODE} ===
Thoi gian: {new Date().toISOString()}

[1] GIA
{section_1}

[2] EVIDENCE SCORE
{section_2}

[3] INSIDER (7 NGAY)
{section_3}

[4] KHOI NGOAI
{section_4}

[5] BCTC AI
{section_5}

[6] DU DOAN
{section_6}

===================================
```

Separator: exactly 35 `=` characters on both header and footer lines.

---

## Best-Effort Error Isolation Pattern

```typescript
// Template for each section
let section1 = "(khong co du lieu)";
try {
  // ... query + format
  section1 = formattedResult;
} catch {
  // section1 stays as no-data default
}
```

Each of the six sections follows this exact pattern. No section's failure can propagate to another. The outer `handleGetTickerIntelligence` function itself is wrapped in a try/catch that returns a generic error string if something unexpected escapes all inner guards — but this outer catch should never be reached in practice.

---

## DB Injection Pattern

Consistent with `foreignFlowTools.ts` and `insiderTools.ts`:

```typescript
export function registerTickerIntelligenceTools(
  server: McpServer,
  db?: Database,
): void {
  server.tool("get_ticker_intelligence", ..., async ({ code }) => {
    const resolvedDb = db ?? getDb();
    const text = await handleGetTickerIntelligence(code, resolvedDb);
    return { content: [{ type: "text" as const, text }] };
  });
}
```

Tests pass a `Database` instance directly to `registerTickerIntelligenceTools`. The `handleGetTickerIntelligence` function is also exported so tests can call it directly without going through MCP transport overhead, following the pattern in `1146-get-insider-transactions.test.ts`.

---

## Test Strategy (TDD)

Test file: `src/__tests__/1178-ticker-intelligence.test.ts`

Tests must be written as failing stubs before `tickerIntelligenceTools.ts` is implemented (Task 1178 before Task 1179).

### In-memory DB setup

The test `buildDb()` helper creates these tables with minimal columns:

```sql
CREATE TABLE market_prices_history (code TEXT, price REAL, volume INTEGER, fetched_at TEXT);
CREATE TABLE evidence_scores (id INTEGER PRIMARY KEY, stock TEXT, score_date TEXT,
  bullish_score REAL, bearish_score REAL, neutral_score REAL, fragment_count INTEGER, computed_at TEXT);
CREATE TABLE insider_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT,
  insider_name TEXT, position TEXT, type TEXT, executed_volume INTEGER, registered_volume INTEGER,
  price REAL, from_date TEXT, to_date TEXT, fetched_at TEXT);
CREATE TABLE vnstock_trading_stats (code TEXT, foreign_volume INTEGER, foreign_room INTEGER,
  current_holding_ratio REAL, fetched_at TEXT);
CREATE TABLE financial_reports (id INTEGER PRIMARY KEY, action_code TEXT, sort_key TEXT,
  period_year INTEGER, period_quarter INTEGER, ai_analysis TEXT);
CREATE TABLE prediction_claims (id INTEGER PRIMARY KEY, stock TEXT, agent_id TEXT,
  claim_text TEXT, direction TEXT, target_price REAL, creation_price REAL,
  resolution_date TEXT, confidence REAL, resolution_outcome TEXT, brier_score REAL,
  resolved_at TEXT, created_at TEXT);
```

### Test cases (map to Acceptance Criteria)

| Test | AC | Description |
|---|---|---|
| `AC-1: full brief with all data` | AC-1 | Seed all 6 tables for VCB, assert all 6 section labels and key values present |
| `AC-2: clean brief with no data` | AC-2 | Empty DB, assert HPG brief contains all 6 section labels with no-data strings |
| `AC-3: ticker normalisation` | AC-3 | Insert price for `"FPT"`, call with `"fpt"`, assert header shows `FPT` and price data present |
| `AC-4: malformed ai_analysis JSON` | AC-4 | Insert `ai_analysis = "not-valid-json"` for VNM, assert section 5 shows `(loi phan tich BCTC)` |
| `AC-5: insider cap at 3 with overflow` | AC-5 | Insert 5 insider rows for VCB, assert exactly 3 transaction lines + `(+2 giao dich khac trong 7 ngay)` |
| `AC-6: all brier_scores null` | AC-6 | Insert 2 resolved claims with NULL brier_score for TCB, assert `Brier TB: N/A` |
| `AC-7: tool registered in server wiring` | AC-7 | Load `registry.ts`, assert `get_ticker_intelligence` present in tool list |
| `AC-8: formatTickerIntelligence output structure` | AC-8 | Unit test formatter directly: assert header uses 35 `=`, all 6 labels present |

One additional edge-case test:
- `section 5 missing ai_analysis fields` — Insert valid JSON `{}` (no `outlook`/`summary`), assert section 5 shows `(loi phan tich BCTC)`.

Note on the `087-server-wiring.test.ts` reference in AC-7: the REQ refers to updating that test to expect `toolCount = 97`. That assertion update is part of Task 1180 (registry registration).

---

## Registry Update (Task 1180)

Add to `src/interface/mcp/tools/registry.ts`:

```typescript
import { registerTickerIntelligenceTools } from "./tickerIntelligenceTools.js";
```

Append to `toolRegistry` array:

```typescript
registerTickerIntelligenceTools, // Sprint 071: get_ticker_intelligence (+1 tool → 97)
```

No other changes to `registry.ts`.

---

## Task Breakdown

Dependency order (matches REQ-071 task table):

| ID | Title | Layer | Depends On |
|---|---|---|---|
| 1178 | TDD: write failing tests for AC-1 to AC-8 in `src/__tests__/1178-ticker-intelligence.test.ts` | tests | — |
| 1179 | Implement `tickerIntelligenceTools.ts` — all 6 sections + `handleGetTickerIntelligence` + `formatTickerIntelligence` + `registerTickerIntelligenceTools` (FR-1 through FR-8) | interface | 1178 |
| 1180 | Register `registerTickerIntelligenceTools` in `registry.ts`; update `087-server-wiring.test.ts` to expect `toolCount = 97` (FR-9) | interface | 1179 |
| 1181 | Sprint close: advance `project-stats.json` `currentSprint` to 71, `toolCount` to 97, update `lastUpdated` | docs/data | 1179, 1180 |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `vnstock_trading_stats` table absent (pre-Sprint 061 DB) | Low | Low | Section 4 outer try/catch catches the SQL error, renders `(khong co du lieu khoi ngoai)` |
| `ai_analysis` column absent on `financial_reports` (pre-Sprint 066 DB) | Low | Low | Section 5 outer try/catch catches the SQL error, renders `(khong co du lieu)` |
| `ai_analysis` JSON shape evolves (new fields added) | Medium | Low | Only `outlook` and `summary` fields are read — additive schema changes are invisible |
| `getInsiderTransactionsFiltered` sort order changes | Low | Medium | REQ-071 specifies `fromDate DESC` — test AC-5 enforces the cap-at-3 contract; if store sort order changes, tests catch it |
| `getResolvedClaims` signature changes (parameter order) | Low | Low | Function is called with named positional args `(db, ticker, 20)` — any signature change causes a TypeScript compile error |
| Volume formatting discrepancy vs `foreignFlowTools.ts` | Low | Low | Both use the same M/K threshold logic — replicated locally in `tickerIntelligenceTools.ts` to avoid peer-tool import; deviation risk is cosmetic only |
| Performance regression on cold SQLite | Low | Low | All 6 queries hit indexed columns; expected <30ms per REQ; no joins, no aggregates except Section 6 (done in TS not SQL) |

---

## Security Review

- SQL parameterized? Yes — all 3 inline queries use `?` bindings; store functions use their own bindings
- File paths validated (no `../`)? N/A — no file I/O in this tool
- External HTTP rate-limited? N/A — no external HTTP calls; reads from local SQLite only
- Secrets via `Bun.env` only? N/A — no secrets used by this tool
