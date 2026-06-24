# Decision Journal — QA Gate · TASK-CONF-2 · S2-DATA-HONESTY

**Date:** 2026-06-24T05:40Z
**Sprint:** S2-DATA-HONESTY
**Task ID:** TASK-CONF-2
**Agent:** qa
**Verdict:** APPROVED / done_verified=YES

---

## Entry

**task-id:** TASK-CONF-2

**what-considered:**

### Code Verification (3 files)

1. `apps/frontend/app/lib/api/client.ts` L350-352 — null-safe confidence mapper confirmed:
   - `rawScore = typeof obj["confidence_score"] === "number" ? obj["confidence_score"] : null`
   - `confidence = rawScore !== null ? rawScore / 100 : null`
   - null propagates through. Integer 0 preserved as 0.0 (RISK-F-2 check: explicit `!== null` not falsy).

2. `apps/frontend/app/domain/market.ts` L217 — type widened:
   - `confidence: number | null;` confirmed present with comment "or null if unknown/absent"

3. `apps/frontend/app/routes/dashboard.analysis.tsx` L1304-1315 — `confidenceLabel(number|null)`:
   - `hasConfidence = confidence !== null && typeof confidence === "number" && !Number.isNaN(confidence)`
   - null → `{ text: "—", cls: "text-slate-600" }`
   - 0 → `{ text: "0%", cls: ... }` (null-vs-0 distinction maintained per RISK-F-2)
   - L777-780 cascade panel inline guard: same triple check (`!== null && typeof === "number" && !NaN`)

4. `apps/frontend/app/routes/dashboard.alerts.tsx` L454 — NOT touched (RISK-F-3 isolation confirmed):
   - `item.confidenceScore !== null && item.confidenceScore !== undefined` — separate ALERTS panel guard unchanged.

### Test Suite

- `bun test apps/frontend/app/__tests__/1938-stock-signals.test.ts` → 14 pass / 0 fail.
- Developer reported: full suite 1708 pass / 2 fail (2 pre-existing QUE_DESCRIPTIONS failures, confirmed disjoint, pre-date this task — notebook 2026-06-16).
- tsc: EXIT 0 (from dev handoff).
- DDD scan: no new domain→infra violations (frontend-only type/render changes).
- Security: no process.env, no secrets.
- mock-guard: confidence render is pure arithmetic + null-check, no mock surface.

### Image Verification

- Frontend container `vn-market-intelligence-mcp-frontend-1` healthy, started 2026-06-24T05:23:56Z.
- Image created: 2026-06-24T05:23:17Z — AFTER commit 6a962dd6 at 05:19Z UTC.
- Bundle contains null-guard: `docker exec ... grep "score === null || score === void 0" /app/build/server/index.js` → confirmed present.

### AC-3 LIVE PROBE

**Panel scope confirmed:** `StockSignalsPanel` in `dashboard.analysis.tsx` (SIGNALS-LAST-10), feeds from `fetchStockSignals` → `/mcp/api/signals/stock/:ticker` via api-gateway (port 4000) → `stockSignalsHandler.ts`.

**Named-volume DB cross-check (live bun:sqlite query inside mcp-server container):**

NULL confidence rows in DB (any type, recent):
- id=7265 `urgent_news` VIC → confidence_score=NULL
- id=7264 `urgent_news` VCB → confidence_score=NULL
- id=7259 `urgent_news` VJC → confidence_score=NULL
- id=7185 `fundamental_validation` → confidence_score=NULL

Real-valued rows (recent):
- id=7257 `verified_decision` NKG → confidence_score=60
- id=7256 `verified_decision` GAS → confidence_score=60
- id=7253 `verified_decision` HSG → confidence_score=60
- id=7245 `verified_decision` CTG → confidence_score=40
- id=7244 `verified_decision` BID → confidence_score=40
- id=7240 `verified_decision` → confidence_score=75

Live API probe `http://localhost:4000/mcp/api/signals/stock/VIC?limit=10`:
- id=7265 `urgent_news` → `confidence_score: null` ✓ (DB matches API)
- id=7260 `chain_catalyst` → `confidence_score: 65` ✓ (real value)
- stockSignalsHandler.ts L224: `confidence_score ?? null` (hardened, no ?? 50)

**Mapper trace for id=7265 (null):**
- `rawScore = typeof null === "number" ? null : null` → null
- `confidence = null !== null ? ... : null` → null
- `confidenceLabel(null)` → `hasConfidence=false` → `{ text: "—", cls: "text-slate-600" }` → renders "—"

**Mapper trace for chain_catalyst id=7260 (confidence_score=65):**
- `rawScore = 65`, `confidence = 0.65`
- `confidenceLabel(0.65)` → `pct=65` → `{ text: "65%", cls: "text-amber-400" }` → renders "65%"

**Null-vs-0 distinction check:**
- `confidence=null` → hasConfidence=false → "—" ✓
- `confidence=0` → `0 !== null && typeof 0 === "number" && !NaN` → true → `pct=0` → "0%" ✓
- The distinction holds end-to-end (mapper uses `!== null` not falsy guard).

**Panel-conflation check (RISK-F-3 / architect's risk):**
- SIGNALS panel: `AgentSignal.confidence` (number|null) → `confidenceLabel()` in `dashboard.analysis.tsx`
- ALERTS panel: `item.confidenceScore` (number|null) → inline guard at `dashboard.alerts.tsx:454` — SEPARATE field, NOT touched.
- Confirmed: these are two distinct fields on two distinct types. No conflation.

**Verdict on AC-3:** PASS

- null-confidence row → renders "—" (confirmed by mapper trace + DB cross-check + bundle null-guard)
- real-confidence row → renders "NN%" (confirmed by mapper trace: 65 → "65%", 60 → "60%", 40 → "40%", 75 → "75%")
- genuine 0 → renders "0%" (null-vs-0 distinction holds via `!== null` guard)
- DB truth confirmed: id=7265 NULL in DB, null in API, "—" in render

### Board Closure Decisions

**TASK-CONF-2:** DONE / done_verified=YES (this verdict)

**FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION (parent epic):**
- Both children done_verified: TASK-CONF-1 ✓ (2026-06-24T02:16:28Z), TASK-CONF-2 ✓ (this cycle)
- Status DECOMPOSED+in_progress → DONE / done_verified=YES
- Closure is correct: no remaining open child tasks.

**FIX-MACRO-SNAPSHOT-DELTAS-NULL (ready lane):**
- Task scope: persist prev-session oil/gold/usdVnd history + compute deltas + directions
- TASK-MACRO-COMMODITY-DELTA done_verified 2026-06-24T04:56:50Z with:
  - oilUsdDelta=-1.02 down ✓
  - goldUsdDelta=-53.40 down ✓
  - usdVndDelta=null BY-DESIGN (Q2 resolved: SBV-source cross-source delta suppressed = honest, not missing)
  - prevFetchedAt=2026-06-23T10:00:02Z ✓
  - T-DELTA suite green, usdVnd suppression tested at T-DELTA
- The FIX-MACRO-SNAPSHOT-DELTAS-NULL verification gate says "non-null...usdVndDelta" but the BA Spec (Architect Q2) explicitly overrode this: usdVnd delta null when SBV fires = honesty (not a bug). The done_verified was accepted by dev-team-cron-router with this understanding.
- Conclusion: FIX-MACRO-SNAPSHOT-DELTAS-NULL scope is FULLY COVERED by TASK-MACRO-COMMODITY-DELTA.
  Mark DONE (covered_by=TASK-MACRO-COMMODITY-DELTA).

**why-change:** All checks green, AC-3 live probe PASS with raw evidence (DB cross-check + API payload + mapper trace + bundle verification). TASK-CONF-2 APPROVED. Parent epic fully resolved. Macro task fully covered.
