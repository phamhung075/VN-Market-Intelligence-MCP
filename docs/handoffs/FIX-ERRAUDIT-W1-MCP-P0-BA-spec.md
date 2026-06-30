<!-- size-justification: P0 fix spec — two sites, 6 sections, DDD mapping, acceptance criteria, edge cases, forced-failure DoD. Structural load-bearing for architect+pm+dev+qa chain. -->

# BA Spec — FIX-ERRAUDIT-W1-MCP-P0

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 1 · P0
**Zone:** `apps/mcp-server/`
**Chain:** ba → architect → pm → dev-mcp-server → qa
**BA task_id:** FIX-ERRAUDIT-W1-MCP-P0
**Created:** 2026-06-15T21:30:00Z
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS

---

## Summary

Two live data-masking bugs in the mcp-server. Both are on served paths hit by cowork agents every cycle. Smallest correct change: pure error→tagged-marker, no fetch surface touched, no new shared helper (Wave-2 scope). Each site must produce a DISTINCT output on a thrown DB error vs. a genuine absence of data.

---

## Site A — `marketContextBuilder.ts:417`

**File:** `apps/mcp-server/src/domain/services/marketContextBuilder.ts`
**Function:** `buildSystemStatusText(db: Database): string`
**DDD Layer:** Domain (pure DB-read, zero MCP dependency — file header confirms)

### What exists today

Three independent `try/catch` blocks (lines 388-390, 401-403, 413-415) each silently swallow DB exceptions and return a safe default. After all three, line 417 unconditionally assigns:

```ts
const status = "ok";
```

This string is assembled into the system-status line consumed by:
- `getCycleBootstrap.ts:105` (via `Promise.resolve(buildSystemStatusText(db))`) — every cowork agent reads this at cycle start
- `marketContextTools.ts:87` — `get_market_context` MCP tool

On a locked / crashed DB, every agent reads `ok | 0 alerts pending | last alert: unknown` — a fabricated healthy status.

### Required behavioral change (FR-A1)

`status` must be DERIVED from whether any of the three DB reads threw:

- If ALL three queries succeed (even returning 0 rows / null): `status = "ok"`
- If ANY of the three queries throws: `status = "degraded: DB read failed"`

`pendingCount` must carry a distinct sentinel when its query fails. The current behavior (`pendingCount = 0` on a catch) is indistinguishable from a genuinely zero-pending DB. Required: when the alerts-count query throws, the pending count in the output string must be `"?"` (or an equivalent clearly-non-zero sentinel string) rather than `0`. The healthy path still emits the numeric count.

The output line shape on degraded path must contain the `"degraded:"` prefix so downstream readers (agents, QA, grep) can distinguish it programmatically.

### NFR-A1 — No new helper in this wave

Inline the three error-tracking booleans (e.g. `let dbError = false`) into `buildSystemStatusText`. Do NOT introduce `failLoud`/`safeQuery` here — those land in Wave-2 (`FIX-ERRAUDIT-W2-MCP-DATALAYER`). This is the smallest inline fix.

### NFR-A2 — Caller contract unchanged

`buildSystemStatusText` signature (`(db: Database): string`) MUST NOT change. Callers (`getCycleBootstrap.ts:105`, `marketContextTools.ts:87`) must require zero modification.

### NFR-A3 — Sync function, no async promotion

`buildSystemStatusText` is a sync function called inside `Promise.resolve(...)`. It must remain sync. No `async` promotion.

### DDD invariant

File header states: "this file MUST NOT import from src/infrastructure/". This invariant must be preserved. No new imports needed — error tracking is done with local boolean flags only.

---

## Site B — `tickerIntelligenceTools.ts` — 6 logless section catches

**File:** `apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts`
**Functions:** `buildSection1` through `buildSection6`
**DDD Layer:** Interface (MCP tool layer — imports infrastructure store functions + issues inline SQL)

### What exists today

Each of the 6 section builders follows this pattern:

```ts
let result = "<Vietnamese no-data default>";
try {
  // DB query or store call
  if (!row) return result;
  result = "...formatted data...";
} catch {
  // section stays as no-data default
}
return result;
```

On a thrown error (SQL error, missing column, schema drift, DB lock), the catch silently falls through and returns the exact same Vietnamese string as the genuine no-data case. A broken price query shows `Giá hiện tại: (không có dữ liệu)` — identical to a ticker with no price history.

### Per-section catalog

| Section | Function | No-data default | Error catch lines |
|---|---|---|---|
| S1 — Price | `buildSection1` | `(không có dữ liệu)` | 119 |
| S2 — Evidence score | `buildSection2` | `(không có dữ liệu)` | 139 |
| S3 — Insider (7d) | `buildSection3` | `(không có giao dịch insider trong 7 ngày qua)` | 171 |
| S4 — Foreign flow | `buildSection4` | `(không có dữ liệu khối ngoại)` | 206 |
| S5 — BCTC AI | `buildSection5` (outer catch) | `(chưa có phân tích BCTC)` | 266 (outer) |
| S6 — Prediction | `buildSection6` | `(chưa có dự đoán đã giải quyết)` | 298 |

Note on S5: `buildSection5` has a nested try/catch. The INNER catch (line 263) already returns `(lỗi phân tích BCTC)` for a JSON.parse failure — this is CORRECTLY tagged and must NOT be changed. Only the OUTER catch (line 266), which fires on a SQL/DB-level error, must receive the error-tagging treatment.

### Required behavioral change (FR-B1)

Each of the 6 catch blocks (119, 139, 171, 206, 266, 298) must:

1. Log the error with context: `console.error("[buildSectionN][TICKER]", err)` — using the section number and ticker for discriminability
2. Return a tagged-degraded marker that is DISTINCT from the genuine no-data string

Tagged-degraded marker convention: append `(lỗi truy vấn)` to the section's own no-data prefix, OR return a standalone `(lỗi truy vấn)` string. Either is acceptable as long as the resulting string is NEVER equal to the genuine no-data default and ALWAYS contains the literal substring `(lỗi truy vấn)`.

Example for S1:
- Genuine no-data: `(không có dữ liệu)` — ticker exists, DB query returned 0 rows
- Error path: `(lỗi truy vấn)` — DB threw, data state unknown

The two strings must be non-equal so QA and downstream readers can distinguish them programmatically.

### FR-B2 — Generic, no per-ticker special-casing

The tagged-degraded marker must be a constant string applied identically for ALL tickers. No per-ticker, per-exchange, per-sector logic. No allowlist. No date literals.

### FR-B3 — Outer handler unchanged

`handleGetTickerIntelligence` (line 318) already logs at its outer level (`console.error("[handleGetTickerIntelligence]")`). Its signature and behavior must not change.

`formatTickerIntelligence` (line 62) is a pure formatter — must not change.

### NFR-B1 — No Wave-2 helper

Do NOT introduce `runSection` helper here. That is Wave-2 scope. Each catch block gets an inline `console.error` + tagged string. Six lines of `console.error`, six lines of `return "(lỗi truy vấn)"` (or equivalent). No abstraction.

### NFR-B2 — Section isolation preserved

The existing design guarantee ("A failure in any section never crashes the whole tool") must be preserved. Each catch must still return a string, never rethrow.

---

## Edge Cases

**EC-1 — Genuine no-data ticker (goal#2 sanity)**
A ticker with no price history must still show `(không có dữ liệu)` (the genuine no-data default), NOT `(lỗi truy vấn)`. The `if (!row) return result` guard already handles this on the happy path. As long as the query SUCCEEDS and returns null/empty, the no-data default path fires — the error tag only fires on a THROWN exception. Architect must confirm the guard order is `try { ...; if(!row) return noDataDefault; ... } catch { log; return errorTag; }` — never mixed up.

**EC-2 — DB lock during bootstrap**
On a named-volume DB lock (the forced-failure DoD scenario), ALL three queries in `buildSystemStatusText` will throw simultaneously. The output must be `degraded: DB read failed | ? alerts pending | last alert: unknown | last analysis: unknown`. The `unknown` strings for lastCycle/lastAnalysis already exist as defaults and are acceptable on the degraded path (they are not fabricated success values — they signal absence of data, not fabricated freshness).

**EC-3 — Partial DB failure (one of three queries throws)**
If only the alerts-count query throws but the other two succeed, status must still be `degraded:` (any-of-three rule). `pendingCount` must be `"?"`. The lastCycle and lastAnalysis strings may still show real values from their successful queries.

**EC-4 — S5 inner vs outer catch distinction**
The inner catch at S5 line 263 fires on `JSON.parse` failure of stored `ai_analysis` — this already returns `(lỗi phân tích BCTC)`. This is NOT a DB error; it is a data-quality signal and must stay unchanged. Only the outer catch (line 266) that fires on SQL execution failure gets the `(lỗi truy vấn)` tag.

**EC-5 — TypeScript type safety**
When `pendingCount` changes type from `number` to `number | string` (to hold `"?"`), the template literal on line 418 must handle it. The `pendingCount !== 1` ternary for pluralization must be guarded: when `pendingCount` is `"?"`, always use `"s"` (plural). Architect must decide: union type `number | "?"` declared locally, or a string variable `pendingDisplay` that holds the formatted value. Either is valid — must be type-safe under `bun check`.

**EC-6 — Logger choice in domain layer**
`marketContextBuilder.ts` currently has NO logger import (confirmed by grep — zero logger/console calls in the file). The DDD invariant says no infrastructure imports. `console.error` is a global — it does not require an import and does not violate the DDD invariant. Using `console.error` is the correct choice for this P0 inline fix. Architect should confirm this is acceptable for the domain layer (alternative: bubble the error flag up via return type, but that changes caller contract — NFR-A2 forbids it).

**EC-7 — Test suite impact**
Existing tests (`1563-get-cycle-bootstrap.test.ts`, `230-bootstrap-verify.test.ts`) inject a real test DB. They should continue to pass on the happy path. Dev must add a forced-failure test that verifies `degraded:` appears on DB lock, and that a zero-row DB still returns `ok`. QA acceptance covers this via the forced-failure DoD live probe.

---

## DDD Layer Map

| Requirement | File | DDD Layer | Reason |
|---|---|---|---|
| FR-A1, NFR-A1/A2/A3 | `marketContextBuilder.ts` | Domain | Pure DB-read with no MCP/infra imports; receives `db` via DI |
| FR-B1/B2/B3, NFR-B1/B2 | `tickerIntelligenceTools.ts` | Interface | MCP tool handler; imports infra store functions; issues inline SQL |

---

## Acceptance Criteria (Forced-Failure DoD)

The DONE bar for this P0 is a LIVE forced-failure probe against the named-volume DB `vn-market-intelligence-mcp_market_data`. Container must be REBUILT after the code change. `./data/market.db` (host path) is a stale decoy — do NOT use it for QA.

**AC-1 (marketContextBuilder — degraded path)**
Force a DB error (lock the named-volume market.db or drop the alerts table). Call `get_market_context` or `get_cycle_bootstrap` via the MCP gateway. The `system_status` string in the response MUST contain `degraded:` and MUST NOT be `ok`. The pending count MUST NOT be `0` (must be `?` or equivalent sentinel).

**AC-2 (marketContextBuilder — healthy path)**
With DB healthy and nominal data: system_status MUST start with `ok`. The numeric pending count must match the actual unread alert count in the DB.

**AC-3 (tickerIntelligenceTools — degraded path)**
Force a DB error for any ticker (lock named-volume DB). Call `get_ticker_intelligence` for any ticker. Each section in the response MUST contain `(lỗi truy vấn)` (not the genuine no-data default). The mcp-server container logs MUST show `console.error` entries for each section.

**AC-4 (tickerIntelligenceTools — genuine no-data path)**
With DB healthy but no price data for an unknown ticker (e.g. `XYZTEST`): S1 MUST show `(không có dữ liệu)`, NOT `(lỗi truy vấn)`. This verifies the no-data vs error distinction is preserved.

**AC-5 (generic mandate)**
AC-3 and AC-4 must hold for ANY ticker symbol, not just a hardcoded test case. QA picks two tickers: one with data (e.g. VCB), one without.

**AC-6 (container rebuild)**
QA must confirm container was rebuilt after code change by checking `docker inspect` image `.Created` timestamp is after the commit timestamp.

**AC-7 (CI green)**
`pnpm check` in `apps/mcp-server/` passes with no TypeScript errors after the change (type-safety of the `pendingCount`/`pendingDisplay` change).

---

## Blockers

ZERO PO blockers. All design decisions are within the dev's authority:
- The tagged-degraded marker string `(lỗi truy vấn)` is approved by PO in the board row spec.
- The `degraded: DB read failed` prefix is approved by PO in the board row spec.
- Wave-2 helper scope boundary is set by PO.

One architect ratification item (not a blocker — dev may proceed after architect confirms):

**ARCH-RATIFY-1:** Confirm that `console.error` in `marketContextBuilder.ts` (domain layer) is acceptable given the DDD-no-infra-import invariant. Architect should note this in the technical design. If architect prefers a different logging mechanism that is still import-free, dev implements that instead — but must not change the `buildSystemStatusText` signature.

---

## Hard Constraints (propagate to architect → pm → dev → qa)

1. SMALLEST CORRECT CHANGE — pure error→marker. Do NOT touch any fetch surface. Do NOT introduce `runSection`/`failLoud`/`safeQuery` shared helpers (Wave-2 scope).
2. GENERIC — NO per-ticker / per-exchange / per-date / per-instance hardcode or allowlist in the error tag logic.
3. FORCED-FAILURE DoD is mandatory — not optional. QA must perform the DB-lock probe.
4. Named-volume DB only for QA verification (`vn-market-intelligence-mcp_market_data` via keinos/sqlite3 sidecar).
5. Container MUST be rebuilt (not restarted) after code change before QA runs.
6. `buildSystemStatusText` signature must remain `(db: Database): string` — sync, no async.
7. `formatTickerIntelligence` must not change.
8. S5 inner catch (JSON.parse) must not change — it is already correctly tagged.

---

## Files Modified (scope for architect/dev)

- `apps/mcp-server/src/domain/services/marketContextBuilder.ts` — inline error tracking for 3 catches, derive `status`
- `apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts` — add `console.error` + tagged return to 6 section catches

No other files should change for this P0. Zero caller changes required.

---

## Handoff to Architect

ZONE: `apps/mcp-server/`
SPEC: this file
NEXT: architect — produce technical design, confirm ARCH-RATIFY-1, confirm type-safety approach for EC-5, confirm guard order for EC-1.
