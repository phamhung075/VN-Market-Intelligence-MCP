<!-- [Architect] Design Brief — SHIP-WAVE-REAUDIT — generated 2026-06-11 -->
# [Architect] Brownfield Findings — SHIP-WAVE-REAUDIT

**Task:** ARCH-SHIP-WAVE-REAUDIT  
**Sprint:** SHIP-WAVE-REAUDIT  
**Spec:** docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md (APPROVED)  
**Date:** 2026-06-11

---

## Zone

`zone: multi` — fixes span both `apps/mcp-server/` and `apps/frontend/`.

PM splits into per-zone subtasks. Zone breakdown per fix task below in § Task Map.

---

## BUILD-STANDARD: lean

All affected apps (`apps/mcp-server/`, `apps/frontend/`) already exist. No new service. Existing handlers extended. Dev drives end-to-end; no relay.

---

## Brownfield Findings

### 1. Reputation Trend Defect (A-16 / NFR-C-7) — CONFIRMED COMPUTE DEFECT

**Live DB probe result (2026-06-11):**
- `SELECT trend, COUNT(*) FROM reputation_scores GROUP BY trend` → `[{trend:"stable", cnt:235}]` — 100% stable, zero improving/deteriorating.
- `reputation_scores` dates: 2026-05-18, 2026-05-22, 2026-05-31, 2026-06-03, 2026-06-06, 2026-06-09 — irregular intervals, never 7-calendar-days apart.
- VCB series: scores 62.5 → 45 → 64 → 58 → 66 — genuine delta present, but trend always "stable".

**Root cause:** `reputationComputeJob.ts` L190-197:
```typescript
const priorDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  .toISOString().slice(0, 10);  // e.g. "2026-06-02"
const priorRecord = getReputation(db, code, priorDate);  // exact date match
const priorScore = priorRecord?.score;  // always undefined → trend always "stable"
```
`getReputation(db, code, date)` in `reputationStore.ts` L84-89 does `WHERE code=? AND date=?` — exact match. Since no row exists at exactly -7d, it always returns null. `priorScore=undefined` → `if (priorScore !== undefined)` block in `computeReputationForTicker` never runs → trend always "stable".

**Fix — infrastructure layer (`reputationComputeJob.ts` + `reputationStore.ts`):**

Step 1 — Add `getReputationPrior(db, code, beforeDate)` to `reputationStore.ts`:
```typescript
// Returns most recent row with date < beforeDate. Returns null if none.
export function getReputationPrior(db, code, beforeDate): ReputationScore | null
// SQL: WHERE code=? AND date < ? ORDER BY date DESC LIMIT 1
```

Step 2 — Replace `priorDate` lookup in `reputationComputeJob.ts` L193-197:
```typescript
// OLD (broken — exact date match, always null)
const priorDate = ...  // -7d string
const priorRecord = getReputation(db, code, priorDate);

// NEW (correct — most recent prior row)
const priorRecord = getReputationPrior(db, code, today);
```

Step 3 — No handler change needed. Trend is persisted in `reputation_scores.trend` at compute time. The leaderboard reads stored trend values, so fixing the compute job fixes the served data on next cron run.

**DDD Layer:** infrastructure (`reputationStore.ts`) + interface/scheduler (`reputationComputeJob.ts`).  
**Test:** Unit test for `getReputationPrior` (empty, single row, multiple rows with gap). Unit test that `computeReputationForTicker` returns "improving" when prior score is 10 lower.

---

### 2. NFR-C-1 — Stale Flag: OPTION A RULING (handler-level)

**Decision:** Option A — each handler adds `stale: boolean, staleByDays: number` inline.

**Rationale (decision journal S1):** Thresholds differ per endpoint type (2 trading days for market data, 90 days for financial filings). Option B (middleware) would need cross-cutting threshold config with no clean DDD layer home. Option A is 3-4 lines per handler, no new primitives, explicit per-endpoint semantics.

**Staleness thresholds:**
| Endpoint | Field | Threshold |
|---|---|---|
| conviction-history | `tradingDate` | > 1 trading day (2 calendar days) |
| corporate-events | latest `eventDate` | > 3 calendar days |
| shareholders | `asOf` | > 60 calendar days |
| financials | `asOf` | > 14 calendar days |
| reputation | `asOf` | > 3 calendar days |

**Response contract addition (each affected handler):**
```typescript
// Add to response root:
stale: boolean       // true when data age exceeds threshold
staleByDays: number  // calendar days past threshold (0 when not stale)
```

**Helper to add to each handler (or shared utility `apps/mcp-server/src/interface/mcp/routes/_staleness.ts`):**
```typescript
export function computeStaleness(
  asOfDate: string | null,  // YYYY-MM-DD
  thresholdDays: number,
  now: Date = new Date()
): { stale: boolean; staleByDays: number }
```

**Files to modify:**

- `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts` — add `stale`/`staleByDays` to `ConvictionHistoryResponse` using `tradingDate` vs now, threshold=2d
- `apps/mcp-server/src/interface/mcp/routes/corporateEventsHandler.ts` — add `stale`/`staleByDays` using `asOf` (max eventDate), threshold=3d
- `apps/mcp-server/src/interface/mcp/routes/shareholdersHandler.ts` — add `stale`/`staleByDays` using `asOf`, threshold=60d (fire at 58d current)
- `apps/mcp-server/src/interface/mcp/routes/financialsHandler.ts` — add `stale`/`staleByDays` using `asOf`, threshold=14d
- `apps/mcp-server/src/interface/mcp/routes/reputationHandler.ts` — add `stale`/`staleByDays` using `asOf`, threshold=3d

**Frontend changes (stale banner):** Each corresponding dashboard page adds a stale warning banner when `stale === true`. Use existing `asOf` display pattern already present in `dashboard.financials.tsx` L399-401 and `dashboard.shareholders.tsx` L436-438 as template — extend to show "Dữ liệu đã cũ N ngày" banner.

**DDD Layer:** interface (handler files) + interface (frontend route files).

---

### 3. NFR-C-5 — foreign-flow `stale_fields` (zone: multi)

**Scope:** `currentHoldingRatio`, `maxHoldingRatio`, `marketCapBn` are null on 100% of rows (live probe: 2026-06-11). The null values are passed through correctly by `shapeRow()` in `foreignFlowHandler.ts`. Missing: no response-level notice that these fields are structurally unavailable.

**Fix — mcp-server (`foreignFlowHandler.ts`):**
- Add `stale_fields: string[]` to `ForeignFlowResponse` type.
- Compute by checking first row's values: if `currentHoldingRatio === null` on majority of items → add `"currentHoldingRatio"` to array, same for `maxHoldingRatio`, `marketCapBn`.
- Logic: after `buildSummary(allItems)`, scan `allItems` — if >50% of items have null for a field, add that field name to `stale_fields`.

**Fix — frontend (`dashboard.foreign-flow.tsx`):**
- Read `stale_fields` from response.
- When `stale_fields.includes("currentHoldingRatio")` etc., show a `<Badge>` or tooltip "Không có dữ liệu" on the column header instead of just "—" in every cell.
- Current behavior: "—" in cell (via `formatRatio(null)` → "—"). After fix: column header badge signals unavailability at-a-glance.

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` — add `stale_fields` field
- `apps/frontend/app/routes/dashboard.foreign-flow.tsx` — render stale_fields notice
- `apps/frontend/app/routes/api.foreign-flow.tsx` — type passthrough (if typed)

**DDD Layer:** interface (both zones).

---

### 4. NFR-C-4 — stockPerformance `direction` field (zone: multi)

**Scope:** `market_summaries.stock_performance_json` items currently: `{symbol, firstPrice, lastPrice, changePct, alertCount}`. No `direction` field. Frontend `dashboard.market-summaries.tsx` computes color from `changePct` sign (correct) but has no directional arrow.

**Fix — mcp-server (`marketSummaryHandler.ts`):**
- In `mapStockPerformance()` (or wherever `stockPerformance` items are shaped), add:
```typescript
direction: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat"
```
- Add `direction: "up" | "down" | "flat"` to `StockPerfItem` type.
- No DB schema change — derived field, computed at read time.

**Fix — frontend (`dashboard.market-summaries.tsx`):**
- Add `direction` field to `StockPerf` interface (L109 area).
- Use `direction` for arrow rendering at L890 area (currently only shows colored number).

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/routes/marketSummaryHandler.ts` — add direction derivation
- `apps/frontend/app/routes/dashboard.market-summaries.tsx` — consume direction field
- `apps/frontend/app/routes/api.market-summaries.tsx` — type passthrough if typed

**DDD Layer:** interface (both zones). Pure derived field, no domain logic needed.

---

### 5. DEGRADED Items — Stale Notice (Verdict DEGRADED, no immediate root fix)

These items are DEGRADED because upstream data is stale. The stale-flag NFR (item 2 above) provides the consumer-visible fix. No new data pipeline work is in scope per BA spec (upstream producer defects are separate sprints).

| Item | Current asOf | Days Stale | Fix via |
|---|---|---|---|
| A-05 conviction-history | 2026-06-09 | 2d | NFR-C-1 stale flag in handler |
| A-11 corporate-events | 2026-06-08 | 3d | NFR-C-1 stale flag in handler |
| A-12 shareholders | 2026-04-14 | 58d | NFR-C-1 stale flag in handler (threshold 60d — not yet breached but close; add at 58d ≥ 55d soft-threshold) |
| A-14 financials | 2026-04-15 | 57d | NFR-C-1 stale flag in handler |

For A-12 shareholders: threshold set at 55 days (not 60) so the current 58d is already flagged → `stale=true, staleByDays=3`.

---

### 6. DEGRADED Items — NFR-C-6 (financials yoyDirection)

**Scope:** `revenueYoy`/`netProfitYoy` exist as signed floats. BA spec improvement-lane item.

**Fix — mcp-server (`financialsHandler.ts`):**
- Add `revenueYoyDirection: "up" | "down" | "flat"` and `netProfitYoyDirection: "up" | "down" | "flat"` to `ScreenerRow` type.
- Derive at map time: `revenueYoy > 0 ? "up" : revenueYoy < 0 ? "down" : "flat"` (handle null → "flat").

**Frontend:** `dashboard.financials.tsx` already colors by sign. Add direction field read for filter use (accessibility). No visual change required — frontend can use the field if present.

**DDD Layer:** interface only. No domain layer needed — pure sign derivation.

---

### 7. B-01 / B-02 — Verify-Only Items

**B-01 (FIX-VNSTOCK-FUNDAMENTALS commit f4f5ce65):** Per BA spec + PO ruling — verify-only. QA runs the cron_job_runs probe. No new dev work unless probe shows fix ineffective.

**B-02 (FIX-EVIDENCE-PIPELINE commit 27eaece9):** `evidence_fragments.count=0` confirmed live but fix was just deployed. QA re-verifies after next cron run (foreignFlowAlertJob + evidenceAccumulatorJob). No new dev work unless next run still shows count=0 after 48h.

---

### 8. Items Verified GOOD — No Action

A-01 alerts, A-03 agm-plan-actual, A-07 sector-rotation, A-08 sector-cascade, A-09 kinh-dich-signals, A-10 global-markets (fully directional), A-13 officers, A-17 news-buzz. NFR-C-8 out-of-scope (confirmed).

**A-15 fed-rates asOf lag:** `asOf=2026-06-09` vs DB max_date=2026-06-11. Root is that `fedRatesHandler` uses MAX(date) from a query that excludes weekend-only rows. 2-day gap is within 3-business-day GOOD rubric. GOOD verdict — no fix.

---

## Task Map (PM decomposes into these subtasks)

| Task ID (suggested) | Title | Zone | Dev | Priority |
|---|---|---|---|---|
| DEV-REAUDIT-1 | Fix reputation trend-delta compute defect | apps/mcp-server/ | dev-mcp-server | CRITICAL (A-16 DEGRADED + A-16 NFR-C-7) |
| DEV-REAUDIT-2 | NFR-C-1 stale flag: conviction-history + corporate-events + shareholders + financials + reputation handlers | apps/mcp-server/ | dev-mcp-server | HIGH |
| DEV-REAUDIT-3 | NFR-C-5 foreign-flow stale_fields mcp-server side | apps/mcp-server/ | dev-mcp-server | HIGH |
| DEV-REAUDIT-4 | NFR-C-4 stockPerformance direction field mcp-server side | apps/mcp-server/ | dev-mcp-server | MEDIUM |
| DEV-REAUDIT-5 | NFR-C-6 financials yoyDirection field | apps/mcp-server/ | dev-mcp-server | LOW (improvement lane) |
| FE-REAUDIT-1 | Stale banner on conviction-history, corporate-events, shareholders, financials, reputation pages | apps/frontend/ | dev-frontend | HIGH (paired with DEV-REAUDIT-2) |
| FE-REAUDIT-2 | NFR-C-5 foreign-flow stale_fields column badge | apps/frontend/ | dev-frontend | HIGH (paired with DEV-REAUDIT-3) |
| FE-REAUDIT-3 | NFR-C-4 stockPerformance direction arrow in market-summaries | apps/frontend/ | dev-frontend | MEDIUM (paired with DEV-REAUDIT-4) |

**Sequence:** DEV-REAUDIT-1 first (trust no other stale data until reputation trend computes correctly). DEV-REAUDIT-2 + FE-REAUDIT-1 parallel. DEV-REAUDIT-3 + FE-REAUDIT-2 parallel. DEV-REAUDIT-4 + FE-REAUDIT-3 parallel. DEV-REAUDIT-5 last (improvement lane).

**Ops:** rebuild `mcp-server` container after each mcp-server dev task completes. Rebuild `frontend` container after each frontend dev task completes. QA re-verifies live after each rebuild.

---

## Verified Paths

| File | Layer | Change |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/reputationStore.ts` | infrastructure | Add `getReputationPrior(db, code, beforeDate)` |
| `apps/mcp-server/src/scheduler/news/reputationComputeJob.ts` | interface/scheduler | Replace exact-date prior lookup with `getReputationPrior()` call |
| `apps/mcp-server/src/interface/mcp/routes/reputationHandler.ts` | interface | Add `stale`/`staleByDays` fields |
| `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts` | interface | Add `stale`/`staleByDays` fields |
| `apps/mcp-server/src/interface/mcp/routes/corporateEventsHandler.ts` | interface | Add `stale`/`staleByDays` fields |
| `apps/mcp-server/src/interface/mcp/routes/shareholdersHandler.ts` | interface | Add `stale`/`staleByDays` fields (threshold 55d) |
| `apps/mcp-server/src/interface/mcp/routes/financialsHandler.ts` | interface | Add `stale`/`staleByDays` + `yoyDirection` fields |
| `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` | interface | Add `stale_fields: string[]` |
| `apps/mcp-server/src/interface/mcp/routes/marketSummaryHandler.ts` | interface | Add `direction` to stockPerformance items |
| `apps/mcp-server/src/interface/mcp/routes/_staleness.ts` (NEW) | interface utility | `computeStaleness(asOf, thresholdDays, now)` helper |
| `apps/frontend/app/routes/dashboard.conviction-history.tsx` | frontend | Render stale banner |
| `apps/frontend/app/routes/dashboard.corporate-events.tsx` | frontend | Render stale banner |
| `apps/frontend/app/routes/dashboard.shareholders.tsx` | frontend | Render stale banner |
| `apps/frontend/app/routes/dashboard.financials.tsx` | frontend | Render stale banner |
| `apps/frontend/app/routes/dashboard.reputation.tsx` | frontend | Render stale banner |
| `apps/frontend/app/routes/dashboard.foreign-flow.tsx` | frontend | Render stale_fields column badge |
| `apps/frontend/app/routes/dashboard.market-summaries.tsx` | frontend | Consume direction field |

---

## Risk Flags

1. **Reputation trend fix timing:** After dev fixes `reputationComputeJob.ts`, trend values in DB only update on the next cron run (08:30 UTC daily). QA must wait for next cron cycle to verify live trend distribution. Dev can backfill by triggering job manually (or expose a one-shot endpoint for QA).

2. **`_staleness.ts` new file — DDD layer check:** Placing a shared utility in `interface/mcp/routes/` is acceptable (it is pure interface-layer logic, no DB, no domain rules). Import only from `bun:sqlite` type and built-in Date. If desired, move to `interface/mcp/utils/_staleness.ts` but do NOT put in domain/ (no business rule) or infrastructure/ (no I/O).

3. **`stale_fields` computation in foreignFlowHandler:** Scanning `allItems` for null-majority is O(N) on ~103 rows — negligible. Do it after `buildSummary(allItems)` — no hot path concern.

4. **Frontend stale banner pattern:** Use the existing `asOf` display pattern in `dashboard.financials.tsx` L399-401 as the template (already shows "Dữ liệu tính đến:"). Extend that pattern to add a warning row "Dữ liệu đã cũ N ngày — có thể không cập nhật" when `stale === true`. Do NOT design new UI components — reuse what exists.

5. **A-04 prediction-claims (39 days no new claim):** Upstream producer (08-prediction-synthesizer cron) is silent. This is a producer defect outside this sprint's scope per BA spec + PO ruling. Handler already returns correct shape. Verdict: DEGRADED by upstream — no fix in this sprint. Document as DEFERRED-PRODUCT in QA sign-off.

---

## Scan Clean: true

No DDD violations found in existing handler code. All handlers correctly inject DB from server.ts, no `getDb()` calls in handlers, no domain imports in interface layer. Pattern is consistent — extend only, no new primitives needed except the shared `_staleness.ts` utility and `getReputationPrior` store function.
