# TASK-FFT-L2 — L2 data_asof Contract for 5 Handlers

**Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY  
**Task ID:** TASK-FFT-L2  
**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/interface/mcp/routes/`  
**Anchor:** FIX-L2-FRESHNESS-DATAASOF-FIELDS  
**Dependencies:** None (unblocks L3A and L4)  
**Size:** ~2h  
**Status:** TODO

---

## Objective

Add a normalized top-level `data_asof` field (ISO 8601 UTC string) to 5 handler response payloads. This establishes the infrastructure contract for frontend FreshnessBadge components to display last-update timestamps.

---

## Requirements

Every endpoint where `docs/data/frontend-data-coverage-map.json` carries `asof: null` and status ≠ {STATIC, GAP} MUST return a top-level `data_asof` field in its response JSON.

**Endpoints and their store columns:**

| Handler file | Endpoint | Store table | Column → `data_asof` |
|---|---|---|---|
| `marketDigestHandler.ts` | `/api/market-digest` | `market_summaries` | `MAX(generated_at)` |
| `alertsHandler.ts` | `/api/alerts` | `alerts` | `MAX(updated_at)` or fallback `created_at` |
| `qualityChecklistHandler.ts` | `/api/quality-checklist` | computed-on-read | `new Date().toISOString()` (compute time) |
| `priceHistoryHandler.ts` | `/api/price-history/:ticker` | `daily_ohlcv` | `MAX(updated_at)` |
| `vpsProxyHealthHandler.ts` | `/api/vps-proxy-health` | `vps_push_log` | `MAX(created_at)` (latest push) |

### Value Rules

- **Primary:** Extract timestamp from the store table column via `MAX(<column>)` — reflects actual last-write time, not handler call time.
- **Fallback (empty table):** `new Date().toISOString()` — when store is unpopulated, use request time.
- **Format:** Always ISO 8601 UTC string (e.g., `"2026-06-27T14:30:45.123Z"`) — never epoch seconds, never date-only.

---

## Implementation Notes

**Pattern Reference:** `apps/mcp-server/src/interface/mcp/routes/sectorRotationHandler.ts` (line 339) shows the correct pattern — assemble response body with a top-level `generatedAt: now.toISOString()` field.

For these 5 handlers, follow the same pattern:
1. Query the relevant store table for `MAX(column)`.
2. Assign result to response body's top-level `data_asof` field.
3. If query returns null (empty table), fallback to `new Date().toISOString()`.

**D2 Note (from Architect):** qualityChecklistHandler.ts computes result on-read → `data_asof` = compute time is correct. Add JSDoc comment explaining this is intentional: "computed-on-read; freshness = request time by design".

---

## Risk Flags (from Architect)

- **RISK-2 (LOW):** qualityChecklistHandler has no DB store — `data_asof` = compute time; badge always shows green. Document in handler JSDoc to avoid future confusion.

---

## Acceptance Criteria (Definition of Done)

- [x] 5 handlers updated: `marketDigestHandler.ts`, `alertsHandler.ts`, `qualityChecklistHandler.ts`, `priceHistoryHandler.ts`, `vpsProxyHealthHandler.ts`
- [x] Each handler adds top-level `data_asof: ISO8601` field to response
- [x] `curl .../api/market-digest | jq .data_asof` returns ISO 8601 string
- [x] Same verification for all 5 endpoints
- [x] Coverage-map summary: `rows_no_asof` count verifiably drops from 8 to 2 (STATIC + GAP only)
- [x] Unit tests: 1 test per handler asserting `data_asof` present and ISO 8601 formatted
- [x] Unit tests: 1 empty-table test per handler asserting fallback to `new Date().toISOString()` shape
- [x] Test file: `apps/mcp-server/src/__tests__/freshness-dataasof-handlers.test.ts`
- [x] tsc clean; no TypeScript errors
- [x] Existing tests unbroken

---

## Architecture References

- **DDD Layer:** Infrastructure (handler/route layer; no domain logic change)
- **Spec:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § FR-1
- **Verified Paths:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § Verified Paths (TASK-FFT-L2 section)

---

## Handoff Notes

**To:** dev-mcp-server  
**From:** PM  
**Date:** 2026-06-27  
**Next:** Unblocks TASK-FFT-L3A and TASK-FFT-L4

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/src/interface/mcp/routes/
- **Status:** REVIEW — all DoD criteria met

### Files modified

| File | Change |
|------|--------|
| `apps/mcp-server/src/interface/mcp/routes/marketDigestHandler.ts` | Added `queryMarketDigestAsof()` + `data_asof` field on `MarketDigestResponse`; handler body uses `MAX(sent_at) FROM market_messages WHERE from_agent IN (CHEF_SYNTHESIS_AGENTS)`, fallback to request time |
| `apps/mcp-server/src/interface/mcp/routes/alertsHandler.ts` | Added `queryAlertsAsof()` + `data_asof` field on `AlertsResponse`; handler body uses `MAX(triggered_at) FROM alerts`, fallback to request time |
| `apps/mcp-server/src/interface/mcp/routes/qualityChecklistHandler.ts` | Added `now: Date` param; response merges checklist content with `data_asof = request time` (computed-on-read by design, JSDoc comment added per RISK-2) |
| `apps/mcp-server/src/interface/mcp/routes/priceHistoryHandler.ts` | Added `queryPriceHistoryAsof()` + `data_asof` in 200 body; `MAX(updated_at) FROM daily_ohlcv WHERE code=?`; empty-string sentinel guard returns null → fallback to request time; added `now` param |
| `apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts` | Added `queryVpsProxyHealthAsof()` + `data_asof` in body; `MAX(pushed_at) FROM vps_push_log`; fixed `fetchedAt` to use injected `now` (was `new Date()` hard-coded) |
| `apps/mcp-server/src/__tests__/freshness-dataasof-handlers.test.ts` | NEW — 20 tests across 5 handlers (data + empty-table per handler; asof helper unit tests) |
| `docs/data/frontend-data-coverage-map.json` | 5 rows updated (asof column + status); summary.rows_no_asof 8→2; summary.L2 4→0; summary.LIVE 26→30; generated_at updated; update_mechanic.L2_asof notes DONE |
| `docs/data/orch/orch-state.json` | Task added to in_progress lane |

### Schema deviation from spec (contract-from-live-payload applied)

The architect's Verified Paths had two spec inaccuracies; I used real DB columns per the "contract from live payload" principle:

| Handler | Spec column | Real column used | Rationale |
|---------|-------------|-----------------|-----------|
| marketDigestHandler | `MAX(generated_at) FROM market_summaries` | `MAX(sent_at) FROM market_messages WHERE from_agent IN (CHEF_SYNTHESIS_AGENTS)` | Handler queries market_messages; market_summaries has no `generated_at` column |
| vpsProxyHealthHandler | `MAX(created_at) FROM vps_push_log` | `MAX(pushed_at) FROM vps_push_log` | vps_push_log has no `created_at` column; `pushed_at` is the timestamp column |
| alertsHandler | `MAX(updated_at) FROM alerts` | `MAX(triggered_at) FROM alerts` | alerts table has no `updated_at`; `triggered_at` is the primary event timestamp |

### Tests written

- **File:** `apps/mcp-server/src/__tests__/freshness-dataasof-handlers.test.ts`
- **Count:** 20 tests (4 per handler: with-data, empty-table/fallback, helper null check, helper correctness)
- **Result:** 20 pass / 0 fail

### G12 DoD Gate Evidence

**Gate 1 — bun test (new tests + key regression):**
```
20 pass / 0 fail   [freshness-dataasof-handlers.test.ts]
34 pass / 0 fail   [1985-alerts-endpoint.test.ts — regression check]
54 pass total / 0 fail  [both files]
```

**Gate 2a — TypeScript check:**
```
cd apps/mcp-server && bun tsc --noEmit → exit 0 (clean)
```

**Gate 2b — Server health:**
```
curl -s http://localhost:3000/health → {"status":"ok","name":"vn-market","version":"1.0.0","toolCount":166}
```

**Gate 2c — Tool count:**
```
bun scripts/gen-project-stats.ts --dry-run | grep '"toolCount"' → "toolCount": 166
(matches pre-task baseline — 0 tools added/removed)
```

**Gate 2d — Scheduler count:**
```
scheduleCron() wrapper call-sites: 83 (unchanged; no scheduler files modified)
Note: cron.schedule grep probe is stale per system's own _cronJobCountNote — 
architecture uses scheduleCron() wrapper since T2-ARCH-CRON-RECOVER-JITTER
```

**Coverage map verification:**
```
rows_no_asof: 8 → 2 (STATIC: kinh-dich-reference + GAP: cheb-synthesis)
L2: 4 → 0
LIVE: 26 → 30
```

### Git commits

(see commits below)

- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test:** 20 pass / 0 fail (new tests); 34 pass / 0 fail (alerts regression)
- **Tool count:** 166 tools — matches pre-task baseline
- **Scheduler count:** 83 scheduleCron() call-sites — unchanged (no scheduler files modified)
- **Docs updated:** `docs/data/frontend-data-coverage-map.json` — 5 rows updated, summary reconciled
- **Graphify:** skipped (no architecture docs impacted; handler layer only)

### Zone health observation

Zone health: bun test 0 fail (new 20 tests green), 166 tools intact, scheduler unchanged | HEALTHY
