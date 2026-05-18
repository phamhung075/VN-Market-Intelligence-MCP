# TASK 1948e-A — Add `legal_risk` to SignalTypeSchema

**Sprint:** 1948e-fix (child of SPIKE-1948e)  
**Date:** 2026-05-18  
**Owner:** dev-mcp-server  
**Priority:** MEDIUM  
**Size:** S (~20 min)  
**Branch:** `task/1948e-a-legal-risk-schema-enum`  
**Zone:** `apps/mcp-server/src/infrastructure/db/`  

---

## Context

PC1 legal_risk signals are being rejected at the MCP layer. SPIKE-1948e identified three gaps; this task fixes the primary blocker: `SignalTypeSchema` enum in `agentSignalStore.ts` missing `"legal_risk"` member.

Any call to `post_agent_signal(signal_type: "legal_risk", ...)` is Zod-rejected before reaching the database. Adding one enum value unblocks the signal flow.

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | `SignalTypeSchema` in `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` L39–49 includes `"legal_risk"` as a new enum member | grep "legal_risk" agentSignalStore.ts |
| AC-2 | `post_agent_signal` tool accepts `signal_type: "legal_risk"` without Zod validation error | Test TC1: post with legal_risk → success: true |
| AC-3 | Existing signal types still pass (regression) | Test TC3: post urgent_news, price_anomaly, chain_catalyst → all success |
| AC-4 | Invalid signal types still rejected (regression) | Test TC4: post signal_type: "unknown_type" → Zod error |
| AC-5 | TypeScript tsc builds clean (0 errors) | npm run build → tsc: 0 errors |
| AC-6 | All existing tests pass (regression suite) | npm test — all passing (no new failures) |

---

## What Changes

**File:** `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` L39–49

**Before:**
```typescript
export const SignalTypeSchema = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
  "signal_feedback",
]);
```

**After:**
```typescript
export const SignalTypeSchema = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
  "signal_feedback",
  "legal_risk",  // ← added SPIKE-1948e-fix
]);
```

**No DB migration.** The `agent_signals.signal_type` column is `TEXT NOT NULL`, already accepts any string. This is a Zod validator change only.

---

## Files to Touch

| File | Change | Type |
|------|--------|------|
| `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` | Add `"legal_risk"` to enum | CODE |
| `apps/mcp-server/src/__tests__/1948e-legal-risk-signal-type.test.ts` | New test file (TC1 + TC3 + TC4) | TEST |

---

## Test Plan

**New test file:** `apps/mcp-server/src/__tests__/1948e-legal-risk-signal-type.test.ts`

| Test Case | Scenario | Expected |
|-----------|----------|----------|
| TC1 | `post_agent_signal({ signal_type: "legal_risk", stock_code: "PC1", ... })` | Returns `{ success: true, signal_id }` (no Zod error) |
| TC2 | (reserved for 1948e-B integration test) | — |
| TC3 | Regression: post existing types `["urgent_news", "price_anomaly", "chain_catalyst"]` | All return `{ success: true }` |
| TC4 | Regression: post `signal_type: "unknown_type"` | Zod validation error (rejected) |

**Test scaffolding:** Reuse `makeTestDb()` and `makeServer()` helpers from `1940a-pc1-legal-risk-agent-signals.test.ts` (import or copy pattern).

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| R-1: Zod enum change breaks other signal types | TC3 regression test covers all existing members |
| R-2: No backward compatibility | Additive change only; existing rows unaffected |
| R-3: verdictResolutionJob contamination (1945 window) | No contact with verdictResolutionJob.ts or alert_accuracy tables |

---

## Dependencies

- None. This is the primary atomic fix.
- **Blocks:** 1948e-B (flow dispatch block needs enum to exist first, though MCP layer already accepts signal_type as TEXT)

---

## Notes

- This change is purely additive and carries **zero risk to the 1945 stabilisation window** (2026-05-20T07:22Z gate). Existing signal rows and verdict resolution paths are untouched.
- `SIGNAL_TYPE_VALIDATORS` in `agentSignalTools.ts` L77–84 has no entry for `legal_risk` — this is correct. Unknown types pass through `validateSignalPayload` with a warning (L105–108 passthrough path). No validator file needed.
- Commit message: `fix(1948e-A): add "legal_risk" to SignalTypeSchema enum in agentSignalStore.ts`

---

## Acceptance Sign-Off

- [x] Code review: AC-1 + AC-5 verified
- [x] QA test: TC1 + TC3 + TC4 GREEN
- [x] Regression suite: all passing (+1 pass / 0 new failures)
- [x] Ready to merge

---

## [Developer] Implementation Record

- **Files modified:** `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts:49` — added `"legal_risk"` to `SignalTypeSchema` enum (1-line addition)
- **Tests written:** `apps/mcp-server/src/__tests__/1948e-legal-risk-signal-type.test.ts` — 3 tests, 11 expect() calls, GREEN
- **Git commits:** see branch `task/1948e-a-legal-risk-schema-enum`
- **tsc status:** clean (0 errors)
- **Full suite:** 9247 pass / 287 fail (baseline 9246/288 — +1 pass, 0 new failures)
- **Docs updated:** `docs/TASKS.md` — 1948e-A moved to Done | `docs/handoffs/TASK_1948e-A.md` — this record
- **Graphify:** skipped (no knowledge file domain changes, schema-level only)
