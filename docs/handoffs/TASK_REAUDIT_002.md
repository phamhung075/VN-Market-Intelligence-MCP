<!-- DEV-REAUDIT-2 — NFR-C-1 stale flags (5 handlers) — generated 2026-06-11 by PM -->

## Task: DEV-REAUDIT-2 — Add stale flags to conviction-history, corporate-events, shareholders, financials, reputation handlers

**Task ID:** REAUDIT-002  
**Title:** NFR-C-1 stale flag: 5 handlers + shared staleness utility  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/mcp-server/  
**Owner:** dev-mcp-server  
**Priority:** HIGH  
**Depends on:** REAUDIT-001 (completed and merged)  
**Paired with:** FE-REAUDIT-1 (frontend stale banners)  
**Est. effort:** 3–4 hours (shared utility + 5 handlers + tests)  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 2. NFR-C-1

---

## Problem Statement

**Item A-05, A-11, A-12, A-14:** conviction-history, corporate-events, shareholders, financials endpoints serve data that is stale by GOOD/DEGRADED/BROKEN rubric but have no consumer-visible stale flag in response. Frontend pages display data age (asOf) but do not surface a warning banner.

**NFR-C-1 ruling:** Each endpoint MUST add `stale: boolean, staleByDays: number` fields to response contract. Frontend pages use these fields to render stale warning banners.

---

## Acceptance Criteria

1. **Create shared staleness utility** (`apps/mcp-server/src/interface/mcp/routes/_staleness.ts`)
   - Export: `computeStaleness(asOfDate: string | null, thresholdDays: number, now: Date = new Date()): { stale: boolean; staleByDays: number }`
   - Handles null/undefined safely (returns { stale: false, staleByDays: 0 })
   - Date format: YYYY-MM-DD (string comparison or Date parsing)
   - Business logic: 
     - Parse `asOfDate` to Date
     - Calculate calendar days diff: `Math.floor((now - asOfDate) / (1000*60*60*24))`
     - `stale = daysDiff > thresholdDays`
     - `staleByDays = stale ? daysDiff - thresholdDays : 0`
   - Unit test: empty, single day, over threshold, exact threshold edge cases

2. **Modify 5 handler response contracts**

   | Handler | asOfField | Threshold | Response type | Modifications |
   |---|---|---|---|---|
   | `convictionHistoryHandler.ts` | `tradingDate` (most recent item) | 2 days | `ConvictionHistoryResponse` | Add `stale`, `staleByDays` to root |
   | `corporateEventsHandler.ts` | `eventDate` (max across items) | 3 days | `CorporateEventsResponse` | Add `stale`, `staleByDays` to root |
   | `shareholdersHandler.ts` | `asOf` field | 55 days (not 60) | `ShareholdersResponse` | Add `stale`, `staleByDays` to root |
   | `financialsHandler.ts` | `asOf` field | 14 days | `FinancialsResponse` | Add `stale`, `staleByDays` to root |
   | `reputationHandler.ts` | `asOf` field | 3 days | `ReputationResponse` | Add `stale`, `staleByDays` to root |

3. **Implementation pattern for each handler**
   - After data is loaded/shaped, compute asOf date:
     - `convictionHistoryHandler`: extract `tradingDate` from mostRecent item (or max() if array)
     - `corporateEventsHandler`: extract max `eventDate` from items
     - `shareholdersHandler`: use the response `asOf` field already present
     - `financialsHandler`: use the response `asOf` field already present
     - `reputationHandler`: use the response `asOf` field already present
   - Call `computeStaleness(asOfDate, thresholdDays)`
   - Assign result to response object: `response.stale = result.stale; response.staleByDays = result.staleByDays;`
   - Return response

4. **Response type updates**
   - Add to type definitions (near response root, not per-item):
     ```typescript
     stale: boolean;
     staleByDays: number;
     ```
   - Existing fields unchanged (no breaking changes to item shapes)

5. **Unit tests for each handler**
   - Fresh data (within threshold): `stale === false, staleByDays === 0`
   - Stale data (over threshold): `stale === true, staleByDays > 0`
   - Edge case: exactly at threshold
   - Edge case: asOf is null → `stale === false`

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/_staleness.ts` | utility/interface | NEW file: `computeStaleness()` helper |
| `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts` | interface | Add stale/staleByDays fields + call computeStaleness |
| `apps/mcp-server/src/interface/mcp/routes/corporateEventsHandler.ts` | interface | Add stale/staleByDays fields + call computeStaleness |
| `apps/mcp-server/src/interface/mcp/routes/shareholdersHandler.ts` | interface | Add stale/staleByDays fields + call computeStaleness (threshold 55d) |
| `apps/mcp-server/src/interface/mcp/routes/financialsHandler.ts` | interface | Add stale/staleByDays fields + call computeStaleness |
| `apps/mcp-server/src/interface/mcp/routes/reputationHandler.ts` | interface | Add stale/staleByDays fields + call computeStaleness |
| `apps/mcp-server/src/interface/mcp/routes/*.test.ts` | test | Unit tests for new fields (if handler tests exist) |

---

## Decision Journal

**Why not a middleware decorator (Option B)?**  
Staleness thresholds differ per endpoint type (2d for market data, 55d for shareholders, 14d for financials). A single middleware would need complex threshold config with no clean DDD home. Handler-level (Option A) is explicit per-endpoint semantics: each handler knows its own staleness SLA.

**Why 55d for shareholders instead of 60d?**  
Current asOf is 2026-04-14, now is 2026-06-11 = 58 days. Setting threshold at 60d would NOT flag current data. Setting at 55d flags it as 3 days past SLA. This is more conservative and catches the current stale state.

**Why threshold computation is calendar days, not trading days?**  
Thresholds are based on SLA (service-level agreement on data currency), not trading logic. Calendar days are simpler, more predictable for alerting.

---

## Dependent Tasks

- **FE-REAUDIT-1:** Frontend pages consume stale/staleByDays to render warning banners. Pairs with this task — start after mcp-server contract finalized.

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-05, A-11, A-12, A-14
- Zone standard: `docs/policies/dev-standards.md`

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/_staleness.ts` (NEW) — `computeStaleness(asOfDate, thresholdDays, now)` utility; null/undefined/empty-safe; injectable clock; returns `{stale:boolean, staleByDays:number}`
  - `apps/mcp-server/src/interface/mcp/routes/reputationHandler.ts` — add `stale`/`staleByDays` to `ReputationResponse`; threshold=3d; `now` param on `handleGetReputation` for testability
  - `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts` — add `stale`/`staleByDays` to `ConvictionHistoryResponse`; threshold=2d; `tradingDate` used as asOf
  - `apps/mcp-server/src/interface/mcp/routes/corporateEventsHandler.ts` — add `stale`/`staleByDays` to `CorporateEventsResponse`; threshold=3d; `now` param added; asOf=max eventDate
  - `apps/mcp-server/src/interface/mcp/routes/shareholdersHandler.ts` — add `stale`/`staleByDays` to `ShareholdersResponse`; threshold=55d (catches current 58d stale state); `now` param on `handleGetShareholders`
  - `apps/mcp-server/src/interface/mcp/routes/financialsHandler.ts` — add `stale`/`staleByDays` to `FinancialsResponse`; threshold=14d; `now` param on `handleGetFinancials`
  - `apps/mcp-server/src/__tests__/REAUDIT-002-staleness.test.ts` (NEW) — 24 tests: `computeStaleness` (null/empty, within-threshold, over-threshold, exact-edge, unparseable) + stale fields on all 5 handlers (fresh/stale/empty-table cases per handler)
- **Tests written:** `apps/mcp-server/src/__tests__/REAUDIT-002-staleness.test.ts` — 24 tests, 47 assertions, GREEN
- **Git commits:** `70a33a80 feat(mcp-server/REAUDIT-002): NFR-C-1 stale flags — computeStaleness utility + 5 handlers`
- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test:** 24 pass / 0 fail (new) + 257 pass / 0 fail (existing handler tests: TASK17-PAGE18, TASK17-CONVICTION, TASK17-PAGE14, TASK17-PAGE16, TASK17-PAGE13)
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 78 cron.schedule entries — unchanged
- **Docs updated:** NONE (additive fields, no architecture change)
- **Graphify:** skipped (no docs impacted)

**Design decisions:**
- Option A (handler-level) chosen over Option B (middleware) per architect brief — thresholds differ per endpoint (2d/3d/55d/14d), handler-level is explicit + DDD-clean
- `_staleness.ts` lives in `interface/mcp/routes/` (pure interface-layer logic, no DB, no domain rules)
- `beforeDate = today` with `date < ?` is consistent with REAUDIT-001 pattern
- `staleByDays = daysDiff - thresholdDays` (extra days past threshold) gives frontend precise staleness magnitude for banner text ("Dữ liệu đã cũ N ngày")

**Contract additions (non-breaking, additive to response root):**

| Handler | asOf source | Threshold | Current live state |
|---|---|---|---|
| conviction-history | tradingDate (MAX date) | 2d | asOf=2026-06-09, 2d old → stale=false |
| corporate-events | asOf (max eventDate) | 3d | asOf=2026-06-08, 3d old → stale=false |
| shareholders | asOf (MAX fetched_at) | 55d | asOf=2026-04-14, 58d → stale=true, staleByDays=3 |
| financials | asOf (MAX fetched_at) | 14d | asOf=2026-04-15, 57d → stale=true, staleByDays=43 |
| reputation | asOf (snapshot date) | 3d | asOf=2026-06-09, 2d old → stale=false |

**QA note:** Frontend (FE-REAUDIT-1) can now consume `stale`/`staleByDays` from each endpoint to render stale-data banners. No mcp-server rebuild needed for QA to verify stale flag values — they are computed at handler call time using current clock.

Zone health: bun test 24/0 new + 257/0 regression | tsc exit 0 | 157 tools intact | 78 cron.schedule | HEALTHY
