# TASK_SIG-G-T5 — Per-Path Kill-Switch (C-4 HARD)

Sprint SELF-IMPROVE-GATE · Phase 2 lane-B proven-gate CODE · Task 5 of 6 dev tasks

**Owner:** dev-mcp-server | **Handoff from:** PM (SIG-IMPL-GATE decomposition) | **Date:** 2026-05-27

---

## Task Summary

Implement the `SELF_IMPROVE_AUTO_DISPATCH` kill-switch as a PER-DISPATCH-PATH keyed structure, default `false` per path. This is NOT a single global boolean. The orchestrator from TASK-3 references it; at ship time, every path must be `false`. A path flips to `true` ONLY after QA records that path's GATE-PROOF (TASK-6).

**C-4 is a HARD requirement:** ONE global flag that, once `true`, blesses all paths is REJECTED. The type system ENFORCES per-path keying at compile time (not just by convention).

**Files to create/modify:**
1. `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` — Modify: add kill-switch read logic
2. `docker-compose.yml` — Modify: add commented-out per-path env vars with "flip ONLY after QA GATE-PROOF" note

**Test file:** `apps/mcp-server/src/__tests__/1948e-dispatch-kill-switch.test.ts` — 5 acceptance criteria tests

**Dependencies:** TASK-3 (the orchestrator uses the kill-switch)

**Blocked by:** TASK-3 must be complete first

**Blocks:** Nothing (TASK-4 + TASK-5 are parallel)

---

## Per-Path Keying Scheme (Architect-Resolved Open Point i)

**Decision:** Adopt the BA-suggested starting point with strong typing.

### Type Definition

```typescript
// Inside apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts
// (or extracted to: apps/mcp-server/src/infrastructure/config/dispatchPaths.ts)

/**
 * Exhaustive list of known dispatch paths. Adding a new path requires a code
 * change here — enforces C-4: no freeform-string path lookup possible.
 */
export const DISPATCH_PATHS = [
  'price_confirmation',
  'chain_catalyst',
  'volume_spike',
  'coverage_gap',
] as const;

export type DispatchPath = typeof DISPATCH_PATHS[number];

/**
 * Read per-path kill-switch from environment. Fail-safe on unknown path:
 * returns false (not an error). Absent env var = false (default-off invariant).
 *
 * Env-var convention: SELF_IMPROVE_AUTO_DISPATCH_{PATH_UPPER}
 * Examples:
 *   SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=false   (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_CHAIN_CATALYST=false       (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_VOLUME_SPIKE=false         (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_COVERAGE_GAP=false         (ship default)
 *
 * NOTE: No global SELF_IMPROVE_AUTO_DISPATCH=true path exists in this scheme.
 * A hypothetical bare global flag cannot match any path's key pattern.
 * Unknown paths are excluded from DISPATCH_PATHS — callers use type guards.
 */
export function isAutoDispatchEnabled(path: DispatchPath): boolean {
  const key = `SELF_IMPROVE_AUTO_DISPATCH_${path.toUpperCase()}`;
  return Bun.env[key] === 'true';
}
```

### Justification

1. **Typed path parameter:** `isAutoDispatchEnabled(path: DispatchPath)` — TypeScript rejects freeform strings at compile time (AC-T5-5).

2. **No global flag:** A bare global `SELF_IMPROVE_AUTO_DISPATCH=true` has no matching key pattern (`_PRICE_CONFIRMATION` suffix required), so it cannot enable any path (AC-T5-4).

3. **Adding a new path = code change:** The `DISPATCH_PATHS` array must be edited and type-checked. Not a silent env-var addition (C-4 enforced).

4. **Unknown path type guard:** At the call site in the orchestrator:
   ```typescript
   if (DISPATCH_PATHS.includes(finding.signal_type as DispatchPath)) {
     if (isAutoDispatchEnabled(finding.signal_type as DispatchPath)) {
       // dispatch
     }
   } else {
     // signal_type is unknown; skip dispatch
   }
   ```
   Unknown types get `false` by the type guard, no exception (AC-T5-3 fail-safe).

---

## Orchestrator Integration

In `selfImproveOrchestratorJob.ts`, after step 11 (WORK Telegram sent), add the dispatch check:

```typescript
// Step 12a: Check per-path kill-switch (Phase 2: always false)
for (const finding of survivingFindings) {
  // Only dispatch if this path's kill-switch is enabled
  if (DISPATCH_PATHS.includes(finding.signal_type as DispatchPath)) {
    if (isAutoDispatchEnabled(finding.signal_type as DispatchPath)) {
      // Phase 3 will actually dispatch here; Phase 2 is shadow-mode (false)
      // For now, log that the path is enabled but not dispatching (debug info)
      logger.debug(`[selfImproveOrchestrator] path ${finding.signal_type} auto-dispatch enabled (shadow mode — not firing)`);
    }
  }
}
```

---

## Docker Environment Configuration

Add commented-out env vars to `docker-compose.yml` in the `mcp-server` service block:

```yaml
# In services.mcp-server.environment:

# Per-dispatch-path kill-switch for self-improving gate (Phase 2 lane-B)
# default false; flip ONLY after QA records GATE-PROOF in proposal doc
#SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=false
#SELF_IMPROVE_AUTO_DISPATCH_CHAIN_CATALYST=false
#SELF_IMPROVE_AUTO_DISPATCH_VOLUME_SPIKE=false
#SELF_IMPROVE_AUTO_DISPATCH_COVERAGE_GAP=false
```

**All lines are COMMENTED OUT at ship time.** No uncommented env vars. Every path defaults to `false` (absent = false).

---

## Acceptance Criteria

### AC-T5-1: All paths false by default (C-4)

**Requirement:** At ship time, every known dispatch-path must return `false` when no env override is set.

**Test:** Call `isAutoDispatchEnabled(path)` for every entry in `DISPATCH_PATHS` with Bun.env cleared (no SELF_IMPROVE_AUTO_DISPATCH_* vars). Assert all return `false`.

**Evidence to paste:**
```
Test result: PASS
Bun.env: cleared (no SELF_IMPROVE_AUTO_DISPATCH_* vars set)
isAutoDispatchEnabled('price_confirmation'): false ✓
isAutoDispatchEnabled('chain_catalyst'): false ✓
isAutoDispatchEnabled('volume_spike'): false ✓
isAutoDispatchEnabled('coverage_gap'): false ✓
All paths default to false: YES
```

---

### AC-T5-2: Path-specific enable

**Requirement:** Setting env var for one path to `true` enables ONLY that path; others remain `false`.

**Test:** Set env `SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=true`. Call `isAutoDispatchEnabled('price_confirmation')` → expect `true`. Call `isAutoDispatchEnabled('chain_catalyst')` → expect `false`.

**Evidence to paste:**
```
Test result: PASS
Env: SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=true
isAutoDispatchEnabled('price_confirmation'): true ✓
isAutoDispatchEnabled('chain_catalyst'): false ✓
isAutoDispatchEnabled('volume_spike'): false ✓
isAutoDispatchEnabled('coverage_gap'): false ✓
Only the specified path is enabled: YES
```

---

### AC-T5-3: Unknown type returns false (fail-safe)

**Requirement:** An unknown signal type must return `false` via type guard, not throw.

**Test (type-level):** `isAutoDispatchEnabled` only accepts `DispatchPath` — unknown strings are TypeScript errors. Runtime test: call via type assertion `isAutoDispatchEnabled('totally_unknown_type_xyz' as DispatchPath)` and verify it returns `false` (reads Bun.env['SELF_IMPROVE_AUTO_DISPATCH_TOTALLY_UNKNOWN_TYPE_XYZ'], which will be undefined → returns false).

**Evidence to paste:**
```
Test result: PASS
Type-level: unknown string literal 'totally_unknown_type_xyz' rejected by DispatchPath type
Runtime: (totally_unknown_type_xyz as DispatchPath) reads env var = undefined → returns false ✓
No exception thrown: YES
```

---

### AC-T5-4: Global flag REJECTED (C-4 hard)

**Requirement (C-4 enforcement):** Setting a bare global `SELF_IMPROVE_AUTO_DISPATCH=true` (no path suffix) must NOT enable any path. This is a HARD REJECT test.

**Test:** Set env `SELF_IMPROVE_AUTO_DISPATCH=true` (no suffix). Call `isAutoDispatchEnabled(path)` for all paths. Assert all return `false`.

**Evidence to paste:**
```
Test result: PASS
Env: SELF_IMPROVE_AUTO_DISPATCH=true (bare global flag, no path suffix)
isAutoDispatchEnabled('price_confirmation'): false ✓
isAutoDispatchEnabled('chain_catalyst'): false ✓
isAutoDispatchEnabled('volume_spike'): false ✓
isAutoDispatchEnabled('coverage_gap'): false ✓
Global flag enables NOTHING: YES (C-4 hard requirement PASSED)
```

---

### AC-T5-5: Kill-switch type is exported and visible

**Requirement:** The kill-switch function must have a typed signature (not `any`). Grep for the function name returns a clearly typed definition.

**Test:** `grep -n 'function isAutoDispatchEnabled' degradationRules.ts` (or wherever it lives). Assert the signature shows `(path: DispatchPath)` (not `(path: string)`, not `(path: any)`).

**Evidence to paste:**
```
Test result: PASS
export function isAutoDispatchEnabled(path: DispatchPath): boolean
Signature visible: isAutoDispatchEnabled(path: DispatchPath) ✓
Parameter type: DispatchPath (union type, not string or any) ✓
Exported: YES ✓
```

---

## Implementation Notes

1. **Placement:** `DISPATCH_PATHS`, `DispatchPath` type, and `isAutoDispatchEnabled()` can live inline in `selfImproveOrchestratorJob.ts` at ship time. If the set grows beyond 6 entries in a future sprint, extract to `apps/mcp-server/src/infrastructure/config/dispatchPaths.ts`.

2. **Bun.env access:** `isAutoDispatchEnabled()` reads `Bun.env[key]` directly (no getters, no mocks needed for production). Tests inject `Bun.env` overrides via `beforeEach` hooks.

3. **No new services:** The kill-switch is pure configuration (env reads). No new Docker services, no new cron slots, no new agents.

4. **docker-compose.yml comment style:** All env vars are on separate lines, each commented with `#`, with a block comment above explaining the feature.

5. **No git adds/commits:** Leave all files UNSTAGED.

---

## Files Touched

| File | Change | Lines |
|---|---|---|
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | Modify: add DISPATCH_PATHS + isAutoDispatchEnabled() + orchestrator call | +20 lines |
| `docker-compose.yml` | Modify: add commented env vars + note | +6 lines |
| `apps/mcp-server/src/__tests__/1948e-dispatch-kill-switch.test.ts` | NEW | ~180 lines (5 test suites) |

---

## Submission Checklist

- [ ] `DISPATCH_PATHS` array created with 4 entries (price_confirmation, chain_catalyst, volume_spike, coverage_gap)
- [ ] `DispatchPath` type exported (union of DISPATCH_PATHS entries)
- [ ] `isAutoDispatchEnabled(path: DispatchPath)` function implemented
- [ ] Orchestrator modified: kill-switch check added after step 11
- [ ] `docker-compose.yml` modified: commented-out env vars + note
- [ ] Test file created with 5 ACs passing
- [ ] AC-T5-1 through AC-T5-5 all PASS in `bun test`
- [ ] AC-T5-4 (global flag REJECTED): explicitly verified
- [ ] All paths default-false at ship time: verified
- [ ] No global `SELF_IMPROVE_AUTO_DISPATCH=true` path exists: verified (type check)
- [ ] All files UNSTAGED (NOT staged with `git add`)
- [ ] No new branches created (all on `main`)

---

## Hardening Notes

The kill-switch is THE enforcement point for C-4 (per-path default-false). Any future modifications to this logic must maintain the compile-time type constraint (no freeform strings, no global flag). If a new path is added, DISPATCH_PATHS must be edited (code review gate).

---

## Next Task

After this task is complete and verified PASS, the next task is **SIG-G-REBUILD (ops)**:  Force-recreate the mcp-server container so the new cron/code is live. This depends on TASK-1..T5 being complete and committed.
