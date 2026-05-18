# TASK 1945b-backend — HTTP Handler for Accuracy Digest Endpoint

**Task ID:** 1945b-backend  
**Sprint:** 1945 TIER 2a  
**Owner:** dev-mcp-server  
**Type:** FEATURE  
**Priority:** MEDIUM  
**Zone:** `apps/mcp-server/`  
**Time estimate:** ~2h  
**Arch brief:** `docs/architecture-briefs/2026-05-18-accuracy-digest-frontend-card.md`

---

## Context

ARCH-1945b is complete. Frontend component requires a backend HTTP endpoint before testing can proceed. This task delivers the endpoint in isolation.

**Dependency graph:**
- Blocks: 1945b-frontend
- Blocked by: none
- Parallel: 1945a (verdict-resolution fix) — no shared files

**Existing infrastructure:**
- `getSystemAccuracyDigestStats(db, days)` already exists at `signalOutcomeStore.ts:380–481` ✓
- `signalOutcomeStore` already imported in `server.ts:48` ✓
- No api-gateway changes needed (proxy already routes `/mcp/*` → port 3000) ✓

---

## Deliverables

### 1. Import extension (server.ts:48)

**File:** `apps/mcp-server/src/interface/mcp/server.ts`  
**Change type:** MODIFY  
**Lines affected:** 48

Extend the existing import to include `getSystemAccuracyDigestStats`:

```typescript
// Before:
import { getAccuracyStats } from "../../infrastructure/db/signalOutcomeStore.js";

// After:
import { getAccuracyStats, getSystemAccuracyDigestStats } from "../../infrastructure/db/signalOutcomeStore.js";
```

### 2. HTTP handler (server.ts:1021)

**File:** `apps/mcp-server/src/interface/mcp/server.ts`  
**Change type:** MODIFY  
**Insertion point:** After line 1020 (after `return;` of `/api/signals/stock/:code` handler), before line 1022 (`POST /api/ohlcv-backfill-done` handler)  
**Approx. lines:** 20

```typescript
// ── GET /api/accuracy/digest — system-level accuracy digest for frontend ─
// Returns getSystemAccuracyDigestStats aggregated over `days` look-back.
// Non-authenticated — read-only, no sensitive data.
// days param: integer, default 30, clamped [1, 90] (EC-5).
if (method === "GET" && pathname === "/api/accuracy/digest") {
  const daysParam = url.searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam ?? "30", 10) || 30, 1), 90);
  try {
    const stats = getSystemAccuracyDigestStats(db, days);
    const body = { ...stats, generatedAt: new Date().toISOString() };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    log.error("[accuracy/digest] query error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
  return;
}
```

**Key design notes:**
- `days` clamped **before** function call (R-4 risk mitigation for SQL template literal injection)
- `generatedAt` appended at HTTP handler level (server timestamp of response)
- Non-authenticated pattern matches `/api/signals/stock/:code` (read-only)
- `getSystemAccuracyDigestStats` has internal try/catch + table guard; outer try/catch catches unexpected errors only

### 3. Test file

**File:** `apps/mcp-server/src/__tests__/1945b-accuracy-digest-handler.test.ts`  
**Change type:** CREATE  
**Approx. lines:** 60–80 (6 test cases)

Mock strategy: Use `vi.mock("../../infrastructure/db/signalOutcomeStore.js", ...)` to inject controlled return values (no real SQLite connection).

**Test cases:**

| Test | Input | Expected | Note |
|------|-------|----------|------|
| days=30 default | `?days=30` | Calls `getSystemAccuracyDigestStats(db, 30)` | Explicit default |
| days=200 clamp-hi | `?days=200` | Clamps to 90; calls with days=90 | Upper bound (R-4) |
| days=0 clamp-lo | `?days=0` | Clamps to 1; calls with days=1 | Lower bound (R-4) |
| days absent | (no param) | Defaults to days=30 | Fallback |
| Function error | Function throws | Returns 500, `{ error: "internal error" }` | Error isolation |
| Zero struct | Function returns empty struct | Returns 200, `{ totalResolved: 0, ... }` | Table-guard path |

Each test should assert:
- HTTP status code
- Response body shape
- `generatedAt` field present and ISO-8601 format

---

## Acceptance Criteria

**AC-6: HTTP handler clamps days param**
- `GET /api/accuracy/digest?days=200` → calls function with `days=90`
- `GET /api/accuracy/digest?days=0` → calls function with `days=1`
- `GET /api/accuracy/digest?days=30` → calls function with `days=30`
- `GET /api/accuracy/digest` (no param) → calls function with `days=30`

All test cases pass without mocking the clamp logic (test the behavior, not the implementation).

---

## Risk Flags

**R-4 (MEDIUM) — `days` param injection in SQL template literal**

The clamping **must** happen before `getSystemAccuracyDigestStats(db, days)` is called. The function receives `days` as a raw integer in a template literal (lines 411, 434, 451, 463 of `signalOutcomeStore.ts`). Once clamped by the HTTP handler, the function is safe.

**Validation checklist:**
- ✓ Clamp applied: `Math.min(Math.max(..., 1), 90)`
- ✓ Clamp applied **before** function call, not after
- ✓ Test suite verifies all boundaries [1, 90]

---

## Testing Checklist

- [ ] `bun test 1945b-accuracy-digest-handler.test.ts` — all 6 tests GREEN
- [ ] `tsc` — 0 errors (import path correct, types resolve)
- [ ] Clamping boundary tests present and passing

---

## No-touch zones

- ✓ Do NOT modify `signalOutcomeStore.ts` (read-only)
- ✓ Do NOT modify `verdictResolutionJob.ts` or `alert_accuracy` tables (SPIKE-1945 isolation)
- ✓ Do NOT change api-gateway code

---

## File Change Surface

| File | Change | Lines |
|------|--------|-------|
| `apps/mcp-server/src/interface/mcp/server.ts` | MODIFY — import + handler | 1 + 20 |
| `apps/mcp-server/src/__tests__/1945b-accuracy-digest-handler.test.ts` | CREATE — 6 test cases | ~70 |

---

## Handoff to 1945b-frontend

Once this task is DONE:
1. HTTP endpoint is live at `http://localhost:3000/api/accuracy/digest?days=30`
2. All 6 handler tests pass
3. `tsc` reports 0 errors
4. Frontend developer can start 1945b-frontend (wires fetch helper + component)

**Frontend will create:**
- Mock or stub this endpoint for unit tests (no live HTTP required)
- Real fetch in loader will call via `/mcp/api/accuracy/digest?days=30` (api-gateway proxy)
