# Handoff: FIX-H — Extend get_insider_transactions lookback from 90d to 180d

**Task ID:** FIX-H  
**Sprint:** RAPID-DATA-LAYER  
**Priority:** P1 (unblocks SKILL-4 full 6-month insider-exit detection)  
**Zone:** dev-mcp-server  
**Owner:** dev-mcp-server  
**Depends:** None  
**WIP Count:** 1 of 2 (parallel with FIX-A, FIX-D)  
**Estimated Duration:** 0.5h (1-line code change + tests)  
**Acceptance Criteria:**
1. `get_insider_transactions(code, days=180)` accepted and honored (currently capped at 90)
2. Lookback parameter validated: min 1, max 180 (schema validation only, no hardcoded cap)
3. API signature unchanged (backward compat: existing calls with days≤90 still work)
4. Tests: (a) days=180 honored (returns 180d window, not capped), (b) days=90 still works (regression), (c) days>180 rejected (schema), (d) empty result graceful (no transactions in window)
5. Live-verified: `get_insider_transactions(code=FPT, days=180)` returns transactions spanning 6 months, not 3

---

## Implementation Notes

**File to Modify:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts`

**Code Change:**

Line 108 in insiderTools.ts currently reads:

```typescript
const lookbackDays = z.number().int().min(1).max(90).parse(days);
```

Change to:

```typescript
const lookbackDays = z.number().int().min(1).max(180).parse(days);
```

That's the sole code change. The SQL query at line 210 is already parameter-driven:

```typescript
date >= date('now', '-' || ? || ' days')
```

No schema changes needed; `insider_transactions` table persists data indefinitely (no pruning per Task 1804c).

**Tests:**

File: `apps/mcp-server/src/__tests__/tools/get-insider-transactions.test.ts`

- **T1 (happy 180d):** Call with days=180, verify result includes transactions from 180 days ago (or all available if fewer)
  - Assert: lookbackDays echoed in response === 180
  - Assert: oldest transaction date >= 180 days ago (if any exist)
- **T2 (regression 90d):** Call with days=90, verify unchanged (not broken)
  - Assert: lookbackDays === 90
  - Assert: oldest transaction date >= 90 days ago
- **T3 (schema rejects >180):** Call with days=181, verify error
  - Assert: z.ZodError or 400 response (schema validation fail)
- **T4 (empty window):** Call with days=180 for a code with no insider txns, verify graceful
  - Assert: returns empty array or { code, transactions: [] }
  - Assert: no 500 error

Use a fixture code with ≥1 insider transaction if testing against live DB (SSC disclosures).

**Rebuild + Live-verify:**

- ops: rebuild mcp-server container
- qa: call `get_insider_transactions(FPT, days=180)` via gateway
  - Inspect response: oldest transaction should be ≥180 days old (if available)
  - Compare with prior 90-day call: should see more rows now

---

## Context

SKILL-4 (ownership-governance-screen) Step 2 checks insider net-sell behavior over a 6-month window to detect insiders exiting (red flag). Current 90-day cap is insufficient; the skill requires ≥180 days.

Source: SSC insider disclosure database (populatedBy insiderCheckJob, existing scheduler).

**Risk Notes:**
- **Data availability:** insiderCheckJob may not have 180 days of historical data for newly-added watchlist tickers. If a ticker was added 60 days ago, lookback=180 will return fewer rows (OK, honest null/sparse result).
- **No compliance gates:** Insider reporting rules vary by exchange (HNX vs UPCOM vs OTC). The tool returns raw disclosures; agents apply their own filters.

---

## Blockers / Escalations

None identified. The underlying `insider_transactions` table exists and is actively populated by insiderCheckJob.

**Pre-dep verification:**
- Confirm insiderCheckJob is running (scheduler/market-data/insiderCheckJob.ts exists)
- Sample query: `SELECT COUNT(*) FROM insider_transactions WHERE code='FPT' AND date >= date('now', '-180 days')`
  - If >0, data is available; if 0, likely no old disclosures for FPT (sparse, OK)

---

## Related Docs

- Brief: docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md (§6 FIX-H, §3 SKILL-4)
- Current tool: apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts:89
- Schema: apps/mcp-server/src/infrastructure/database/schema-market-data.ts (insider_transactions table)
- Scheduler: apps/mcp-server/src/scheduler/market-data/insiderCheckJob.ts
