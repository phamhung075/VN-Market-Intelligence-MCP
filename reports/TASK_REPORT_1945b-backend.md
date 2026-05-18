# TASK REPORT — 1945b-backend

**Task ID:** 1945b-backend
**Sprint:** 1945 TIER 2a
**Zone:** `apps/mcp-server/`
**Owner:** dev-mcp-server
**Completed:** 2026-05-18
**Commit:** (see below)

---

## Summary

Implemented `GET /api/accuracy/digest?days=N` HTTP handler in `apps/mcp-server/src/interface/mcp/server.ts`.

---

## Changes Delivered

### 1. `apps/mcp-server/src/interface/mcp/server.ts`

**Import extension (line 48):**
- Added `getSystemAccuracyDigestStats` to the existing `signalOutcomeStore.js` import.

**Handler insertion (after line 1020, before `POST /api/ohlcv-backfill-done`):**
- `GET /api/accuracy/digest` handler (~20 lines).
- `days` param: parsed with `parseInt`, defaulted via `isNaN` guard (not `|| 30` — correctly handles `days=0`), clamped to `[1, 90]` (R-4 mitigation).
- Success: calls `getSystemAccuracyDigestStats(db, days)`, spreads result + appends `generatedAt: new Date().toISOString()`, responds 200.
- Error: catches unexpected throws, logs via `log.error`, responds 500 `{ error: "internal error" }`.
- Non-authenticated (read-only, same pattern as `/api/signals/stock/:code`).

**Bug found and fixed:** The original spec expression `parseInt(daysParam ?? "30", 10) || 30` treats `0` as falsy (defaults to 30). Fixed to `isNaN(parsed) ? 30 : parsed` so `days=0` correctly clamps to `1` (not falls back to `30`). This is critical for AC-6 lower-bound test.

### 2. `apps/mcp-server/src/__tests__/1945b-accuracy-digest-handler.test.ts` (NEW)

6 test cases using `mock.module` with mutable delegate + `createBunServer` (real HTTP server, in-memory DB):

| TC | Input | Expected | Assertion |
|----|-------|----------|-----------|
| TC-1 | `?days=30` | 200 + shape | `generatedAt` present + ISO-8601, `totalResolved` is number |
| TC-2 | `?days=999` | 200, delegate called with `days=90` | R-4 upper bound clamped |
| TC-3 | `?days=0` | 200, delegate called with `days=1` | R-4 lower bound clamped |
| TC-4 | (absent) | 200, delegate called with `days=30` | Default fallback |
| TC-5 | delegate throws | 500 `{ error: "internal error" }` | Error isolation |
| TC-6 | zero struct | 200, `totalResolved=0`, `bySignalType=[]` | Table-guard path (no rows) |

**Mock strategy:** `mock.module("../infrastructure/db/signalOutcomeStore.js", ...)` with mutable `_digestImpl` delegate. Dynamic `await import()` for `createBunServer` after `mock.module` registration ensures Bun's module cache returns the mocked version. All 4 exported functions stubbed (`seedSignalOutcome`, `resolveSignalOutcomes`, `getAccuracyStats`, `getSystemAccuracyDigestStats`).

**Isolation note:** `mock.module` is scoped to the test worker. In `bun test` (full suite), each file runs in its own worker — no cross-file contamination confirmed (baseline 302 failures → 296 failures after adding 6 new passing tests).

---

## QA Review Record

**Verdict:** APPROVED
**QA run date:** 2026-05-18
**Reviewer:** qa agent

### Pipeline

- Zone tests (1945b): 6/6 GREEN
- tsc: 0 errors
- DDD: PASS — test file imports from infrastructure (permitted in `__tests__/`); no domain→infra violation
- Security: PASS — no process.env, no hardcoded secrets in handler block; R-4 neutralised

### AC Matrix

| AC | Status | Evidence |
|----|--------|---------|
| AC-1: Handler responds 200 with correct shape | PASS | TC-1, TC-6 |
| AC-2: `days` clamped [1,90] — boundary values tested | PASS | TC-2 (999→90), TC-3 (0→1) |
| AC-3: DB error returns 500 | PASS | TC-5 |
| AC-4: Zero-struct response returns 200 | PASS | TC-6 |
| AC-5: tsc 0 errors | PASS | `bun tsc --noEmit` clean |
| AC-6: All 6 test cases GREEN | PASS | `6 pass, 0 fail` |

### Security Note — R-4

`days` is clamped via `Math.min(Math.max(isNaN(_daysParsed) ? 30 : _daysParsed, 1), 90)` before being passed to `getSystemAccuracyDigestStats(db, days)`. The template-literal interpolation in `signalOutcomeStore.ts` (lines 411, 434, 451, 466) is therefore safe — only integers in [1,90] can reach it. R-4 risk neutralised at call site.

---

## Bug Fixed (implementation deviation from spec)

Spec expression `parseInt(daysParam ?? "30", 10) || 30` was incorrect for `days=0`:
- `parseInt("0", 10)` = `0` → `0 || 30` = `30` (fallback fires instead of clamp)
- Correct behavior: `days=0` should clamp to `1`, not fallback to `30`
- Fix: `isNaN(_daysParsed) ? 30 : _daysParsed` — only fallback on non-numeric input

---

## Risk Mitigation

- **R-4 (MEDIUM) SQL injection via `days` template literal:** Clamping applied BEFORE `getSystemAccuracyDigestStats(db, days)` call. Verified by TC-2 and TC-3 asserting exact `days` value received by delegate.
- **SPIKE-1945 isolation:** `verdictResolutionJob.ts`, `clients.ts`, `signalOutcomeStore.ts` untouched.
- **No-touch zones:** All respected.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/interface/mcp/server.ts` | MODIFY — import extension + handler (~22 lines) |
| `apps/mcp-server/src/__tests__/1945b-accuracy-digest-handler.test.ts` | CREATE — 6 test cases (~170 lines) |
| `docs/TASKS.md` | UPDATE — 1945b-backend moved Todo → Done |

---

## Handoff to 1945b-frontend

HTTP endpoint is live at `http://localhost:3000/api/accuracy/digest?days=30`.
Response shape: `SystemAccuracyDigestStats` + `generatedAt: string` (ISO-8601).
All 6 handler tests pass. tsc 0 errors. Frontend developer can start 1945b-frontend.
