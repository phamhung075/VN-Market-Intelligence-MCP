---
sprint: S2-DATA-HONESTY
parent_task: FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION
task_id: TASK-CONF-2
branch: task/TASK-CONF-2-frontend-null-confidence-render
size: S
zone: apps/frontend/
depends_on: ["TASK-CONF-1"]
blocks: []
---

## TLDR

Render null-confidence verified_decision rows in dashboard SIGNALS panel as "—" (unknown) instead of "0%" or "50%". Update client API mapper and domain type to propagate null confidences. Add render guard to check for null before displaying percentage.

---

## [PM] Planning Context

**Task ID:** TASK-CONF-2  
**Epic:** S2-DATA-HONESTY  
**Type:** BUG-FIX (null-confidence honesty on frontend display)  
**Owner:** dev-frontend  
**Size:** S (~1h)  
**Rebuild:** REQUIRED (type changes + render logic)  
**done_verified:** WITHHELD until AC-3 live dashboard shows "—" for null-confidence rows  
**Blocks:** None  
**Depends on:** TASK-CONF-1 (backend must deploy first so null rows exist in DB)

---

## Root Cause

After TASK-CONF-1 ships, the backend will write `NULL` to `confidence_score` when a verified_decision signal has no real confidence data. However, the frontend currently cannot render this:

1. **Client mapper (client.ts:350):** `typeof obj["confidence_score"] === "number" ? obj["confidence_score"] : 0` — when API returns `null`, this becomes `0`, rendered as "0%".
2. **Domain type (market.ts:217):** `confidence: number` — non-nullable, so the renderer doesn't know null is a valid state.
3. **Dashboard render (dashboard.alerts.tsx):** The check `signal?.confidence === null` never triggers because the domain type doesn't allow null, and the mapper coerces null → 0.

**Result:** Null-confidence rows appear to have "0%" or "50%" confidence, which is false. The absence of data is masked as a data point.

---

## Requirements

### FR-F-1 — Client API mapper: null-safe confidence

**File:** `apps/frontend/app/lib/api/client.ts` line 350

Current code:
```typescript
const rawScore = typeof obj["confidence_score"] === "number" ? obj["confidence_score"] : 0;
const confidence = rawScore / 100;
```

Change to:
```typescript
const rawScore = typeof obj["confidence_score"] === "number" ? obj["confidence_score"] : null;
const confidence = rawScore !== null ? rawScore / 100 : null;
```

This propagates the API's `null` all the way through to the domain object without coercion.

### FR-F-2 — Domain type: nullable confidence

**File:** `apps/frontend/app/domain/market.ts` line 217

Current code:
```typescript
confidence: number;  // normalized 0.0–1.0
```

Change to:
```typescript
confidence: number | null;  // normalized 0.0–1.0, or null if unknown
```

This allows the domain model to represent genuine absence (NULL) separately from zero (0) or any other number.

### FR-F-3 — Dashboard render guard: null → "—"

**File:** Find the SIGNALS panel render site (likely `apps/frontend/app/routes/dashboard.alerts.tsx` or `dashboard.signals.tsx`)

The current code is likely:
```typescript
{item.confidenceScore === null ? "—" : `${Math.round(item.confidence * 100)}%`}
```

But this check never fires for `AgentSignal.confidence` (the SIGNALS-LAST-10 panel) because the type is non-nullable. Update:

```typescript
const hasConfidence = signal?.confidence !== null && typeof signal?.confidence === "number" && !Number.isNaN(signal.confidence);
// Then in render:
{hasConfidence ? `${Math.round(signal.confidence * 100)}%` : "—"}
```

Ensure the guard checks for:
- `!== null` (explicit null check)
- `=== "number"` (type guard for TypeScript)
- `!Number.isNaN()` (safety against NaN)

---

## Files to Modify

1. **apps/frontend/app/lib/api/client.ts** (line 350) — null-safe mapper, propagate null through confidence ratio
2. **apps/frontend/app/domain/market.ts** (line 217) — widen `confidence: number` → `confidence: number | null`
3. **apps/frontend/app/routes/dashboard.alerts.tsx** (or equivalent SIGNALS panel render file) — render guard `signal?.confidence !== null` before displaying percentage; render "—" for null

---

## Acceptance Criteria

**AC-3 (PRIMARY, live dashboard):** After rebuild, view the SIGNALS-LAST-10 panel:
- For any `verified_decision` row where the backend stored `NULL` confidence (genuine absence after TASK-CONF-1 fix):
  - Dashboard renders "—" or "n/a" (explicit unknown marker), NOT "0%", NOT "50%"
- For `verified_decision` rows with real confidence values:
  - Dashboard renders the percentage correctly (e.g., "75%", "90%")
- Other signal types (urgent_news, price_anomaly) with real confidence continue rendering as percentages (no regression)

**AC-4 (implicit via AC-3):** The API response from `get_stock_signals` correctly includes `confidence: null` for null-DB-rows. The frontend must receive this null value and render it as "—", proving the null propagates through the entire stack (API → client mapper → domain → render).

---

## Knowledge Needed

- `docs/policies/dev-standards.md` — frontend code zone, type safety
- TASK-CONF-1.md § Acceptance Criteria AC-3 (what null-confident rows look like in DB)
- Frontend type safety: ensure type widening doesn't break existing callers that expect `number`

---

## Risk Flags & Edge Cases

**RISK-F-1 (Type narrowing):** Widening `confidence: number` → `confidence: number | null` is additive but requires all render sites to check for null. Grep for `item.confidence`, `signal.confidence` to find all render sites that need the null guard.

**RISK-F-2 (Comparison trap):** `confidence === 0` is a legitimate value (0% confidence). The null check must use `!== null`, not truthiness (`if (!confidence)`).

**RISK-F-3 (No regression):** Alert rows (from the `alerts` table) have a separate `confidenceScore: number | null` field (dashboard.alerts.tsx:454 already renders "—" for this). Do NOT conflate with `AgentSignal.confidence`. Verify the SIGNALS-LAST-10 panel is the one being updated, not the ALERTS panel.

---

## Verification (Live Dashboard, not Just Build)

1. **Live dashboard:** Open the SIGNALS-LAST-10 panel.
2. **Find null-confidence rows:** Look for any `verified_decision` row created post-TASK-CONF-1 that should have null confidence (e.g., an alert with no computed confidence).
3. **Verify render:** Confirm it shows "—" or "n/a", not "0%" or "50%".
4. **Regression check:** Spot-check other signals (urgent_news, price_anomaly) still render percentages correctly.

**done_verified decision:** WITHHELD until AC-3 live dashboard probe passes. This must be verified against real null rows in the DB, not a synthetic test.

---

## Precedent Task

**TASK-CONF-1** (dev-mcp-server) must be done_verified first. The backend must deploy (rebuild container, restart service) so null-confidence rows actually exist in the named-volume DB for AC-3 to verify against.

---

## Commit Convention

Commit message (per `docs/policies/commit-convention.md`):
```
fix(frontend/signals): render null confidence as "—" not "0%" / "50%"

- client.ts: null-safe confidence mapper (obj["confidence_score"] = null → confidence = null, not 0)
- domain/market.ts: widen AgentSignal.confidence to number|null
- dashboard.alerts.tsx: add null-confidence render guard before percentage display, show "—" for null

AC-3: live SIGNALS-LAST-10 shows "—" for null-confidence verified_decision rows

Task: TASK-CONF-2
Depends-on: TASK-CONF-1
```

---

## [Developer] Implementation Record

- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 3+4 (API service layer mapper + domain type + route render)
- **Files modified:**
  - `apps/frontend/app/lib/api/client.ts` L350-351 — null-safe confidence mapper: `confidence_score` null/absent → `confidence=null` (not 0); real 0 → 0.0 preserved
  - `apps/frontend/app/domain/market.ts` L217 — widened `AgentSignal.confidence` from `number` to `number | null`
  - `apps/frontend/app/routes/dashboard.analysis.tsx` L1300-1311 — `confidenceLabel(number|null)`: null-guard returning `{ text: "—", cls: "text-slate-600" }` before percentage compute; also L777-781 cascade panel inline null-guard
  - `apps/frontend/app/__tests__/1938-stock-signals.test.ts` — updated null-coercion test (now expects null not 0) + 2 new tests (explicit null→null, integer 0→0.0 distinction)
- **Tests written:** 3 new assertions in 1938-stock-signals.test.ts; 14/14 GREEN
- **Git commits:** `6a962dd6 fix(frontend/signals): render null confidence as "—" not "0%" / "50%"`
- **Type check:** tsc --noEmit EXIT 0 (clean)
- **Service tests:** 1708 pass / 2 fail (2 pre-existing QUE_DESCRIPTIONS failures, unrelated, pre-date this task — confirmed in notebook 2026-06-16 entry)
- **Null-vs-0 distinction:** Guard uses `!== null` (not falsy) — `confidence === 0` (real zero) renders "0%"; `confidence === null` (absent) renders "—". TypeScript type widening enforces this at compile-time.
- **Panel scope:** SIGNALS-LAST-10 panel (`StockSignalsPanel` in `dashboard.analysis.tsx`) and cascade signals inline render. The ALERTS panel (`dashboard.alerts.tsx`) already had its own `item.confidenceScore !== null` guard (L454) — NOT touched per RISK-F-3.
- **REBUILD_REQUIRED:** YES — frontend container must be rebuilt for type and render changes to take effect in the running dashboard
- **Docs updated:** NONE — no API surface or architecture change; type widening is implementation-only
- **Graphify:** skipped (no docs impacted)

**Vitest summary:** `Tests  1708 passed / 2 failed` (2 pre-existing unrelated failures; all signal tests 14/14 GREEN)
**tsc summary:** EXIT 0 — 0 errors

---

## Decision Journal

Task created by PM 2026-06-23T17:28Z. Architect atomization ratified per docs/handoffs/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md § Frontend Change (CONF-4, separate sub-task required). Blocked until TASK-CONF-1 deployed (null rows must exist in DB). NEXT: dev-frontend picks up after TASK-CONF-1 done_verified.

dev-frontend 2026-06-24: task_id=TASK-CONF-2, what-considered="null-safe mapper (null→null not null→0) + domain type widening + render guard in confidenceLabel + cascade panel inline guard; all 4 render sites for AgentSignal.confidence accounted for", why-change="RISK-F-2: falsy check would treat 0 as absent; explicit !== null is the only safe discriminator". Chose to widen `confidenceLabel` signature (not a new helper) to minimise diff and keep the existing colour-tier logic co-located with the null guard. Cascade panel inline fixed separately (it cannot use confidenceLabel without refactor). ALERTS panel (`item.confidenceScore`) deliberately untouched per RISK-F-3 isolation rule.
