# TASK_602: tasksMdJanitorJob.ts KNOWN_LEGIT_PREFIXES Addition + AC-3b Test

**Parent:** FIX-CRON-REGISTRATION-PREFIX-NOT-EXCLUDED-ORPHANEMIT-AND-D4-R1B (P2, size S)
**Zone:** apps/mcp-server/
**Scope:** 1 file (main) + 1 test file (assertion)
**Estimated:** ~60 min

---

## Acceptance Criteria (AC-2 + AC-3b from parent)

**AC-2 (SCOPE WIDENING — mandatory):** tasksMdJanitorJob.ts KNOWN_LEGIT_PREFIXES array gains `"cron-registration:"`. Verify by construction that it lands in the prefix array (not the `-singleton` suffix branch). 

**Critical:** Without this, AC-1 alone closes the orphan-emit path and leaves a daily D4 false-positive generator wide open — shipping AC-1 without AC-2 is a **net-negative change** and must not be signed off.

**AC-3b (regression test, part of AC-3):** Extend `apps/mcp-server/src/__tests__/FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` — it already exercises `isKnownLegitPattern` directly at line ~138 — with:
- `isKnownLegitPattern('cron-registration:cowork-team') === true`
- Plus a control asserting an unrelated id is still false

Non-vacuousness must be demonstrated via the repo's standing convention: git stash the fix, show the new assertions go red, restore, show green. Do not assert non-vacuousness in prose.

---

## Changes Required

### 1. KNOWN_LEGIT_PREFIXES Array Addition

**File:** `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts`
**Location:** ~197-210 (the KNOWN_LEGIT_PREFIXES array definition)

**Current (line 197-210, exact array):**
```typescript
const KNOWN_LEGIT_PREFIXES = [
  "cron:",
  "po-triage-",
  "esc-datacov:",
  "esc-deepdive:",
  "session-presence",
  "commit-mutex",
  "intent:",
];
```

**New:**
```typescript
const KNOWN_LEGIT_PREFIXES = [
  "cron:",
  "cron-registration:",
  "po-triage-",
  "esc-datacov:",
  "esc-deepdive:",
  "session-presence",
  "commit-mutex",
  "intent:",
];
```

**Rationale:** The D4 audit dimension runs daily (03:00Z) and scans for held locks that don't have a board row. Markers with task_id `cron-registration:*` are legitimate cross-session coordination markers that intentionally outlive their owning session (by design, 8-day TTL vs ≤30 min session-presence TTL). Including `"cron-registration:"` in KNOWN_LEGIT_PREFIXES prevents D4 from flagging them as "held-lock-with-no-board-row" candidates, which would generate false system_issue signals daily.

### 2. Verify No Suffix-Branch Collision

Before committing, verify that `"cron-registration:"` is added to the array directly (not the `-singleton` branch). Search the file for `dev-team-cron-singleton` to understand the suffix pattern — `cron-registration:*` does NOT have a `-singleton` suffix, so it belongs in the prefix array only.

---

## Test Changes (AC-3b)

**File:** `apps/mcp-server/src/__tests__/FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts`

**Existing line ~138:** The test already has a basic `isKnownLegitPattern` call. Extend the test suite with:

```typescript
describe('isKnownLegitPattern cron-registration:* handling', () => {
  it('should recognize cron-registration:cowork-team as known-legit', () => {
    expect(isKnownLegitPattern('cron-registration:cowork-team')).toBe(true);
  });

  it('should recognize cron-registration:detect-loop as known-legit', () => {
    expect(isKnownLegitPattern('cron-registration:detect-loop')).toBe(true);
  });

  it('should recognize cron-registration:standalone-team as known-legit', () => {
    expect(isKnownLegitPattern('cron-registration:standalone-team')).toBe(true);
  });

  it('should still reject unrelated task_id families', () => {
    expect(isKnownLegitPattern('some-random-id')).toBe(false);
  });
});
```

**Non-vacuousness verification (MANDATORY):**
1. Run: `git stash`
2. Run: `pnpm test -- FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` → assertions MUST go RED
3. Run: `git stash pop`
4. Run: `pnpm test -- FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` → assertions MUST go GREEN

This proves the fix is not vacuous (the test actually depends on the code change).

---

## What NOT to Do

- Do not add `"cron-registration:"` to the `-singleton` suffix check.
- Do not modify any other part of the KNOWN_LEGIT_PREFIXES logic.
- Do not change Step R-1b's isLiveConcurrentSession check.
- Do not modify the listHeldTasks call or the R-1 → R-2 → R-3 → R-4 scan order.

---

## Related Tasks

- **TASK_601:** AC-1 (coordinationStore.ts WHERE clause)
- **TASK_603:** AC-3a tests + AC-4 full suite + AC-6 deploy

---

## Sequencing

**Blocked by:** None (can proceed in parallel with TASK_601)
**Blocks:** TASK_603 (must have both code changes before full testing)

Both TASK_601 and TASK_602 must land together in the same deploy cycle. Deploying TASK_601 alone without TASK_602 leaves a daily false-positive generator live and is worse than deploying neither.

---

## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:199` — added `"cron-registration:"` to `KNOWN_LEGIT_PREFIXES` array (prefix branch, not the `-singleton` suffix branch — verified by construction, no `-singleton` string appended)
  - `apps/mcp-server/src/__tests__/FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts:153-169` — new `describe("isKnownLegitPattern cron-registration:* handling")` block, 4 assertions (3 positive families: `cowork-team`/`detect-loop`/`standalone-team` + 1 negative control `some-random-id`)
- **Tests written:** `apps/mcp-server/src/__tests__/FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` — 4 new assertions, GREEN
- **Non-vacuousness (mandatory, per AC-3b):** `git stash push --keep-index -- tasksMdJanitorJob.ts` (source-only, test kept) → `bun test FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` = **27 pass / 3 fail (RED)** → `git stash pop` → re-run = **30 pass / 0 fail (GREEN)**. Confirms the new assertions actually depend on the code change.
- **Git commits:** `86b31eccd` fix(mcp-server): tasksMdJanitorJob KNOWN_LEGIT_PREFIXES += cron-registration:
- **Type check:** clean (`bun tsc --noEmit` — 0 errors)
- **Scoped test run:** `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` — 30 pass / 0 fail (69 expect() calls)
- **Full suite / deploy:** deliberately NOT run — out of scope per TASK_602 instructions (TASK_603's job once TASK_601 also lands)
- **Docs updated:** NONE — `docs/agents/system-auditor/handlers.md` and `docs/agents/system-auditor/audit-dimensions.md` prose mirrors are explicitly out of scope for this task (agent-father's zone, separate task)
- **Graphify:** skipped (no docs impacted)

## [QA] Review Record
QA agent: qa | Date: 2026-08-07 | Round: 1 | Verdict: APPROVED (direct-commit verify — 86b31eccd + a5fa7bf7c already on main, no branch)

- [x] Diff scope: `git show --stat` on both commits — `86b31eccd` touches exactly the 2 claimed files (18+1 insertions), `a5fa7bf7c` is the orch-state/handoff board-bookkeeping commit only. No unrelated changes.
- [x] `isKnownLegitPattern` read at source (tasksMdJanitorJob.ts:208-211): `-singleton` suffix is a separate `endsWith` check; `"cron-registration:"` landed in `KNOWN_LEGIT_PREFIXES` (the `startsWith` prefix array, line 199) — correct branch confirmed by reading, not by trusting prose.
- [x] Non-vacuousness independently reproduced (did not trust the stash-claim in prose): scoped revert of just the one array line (not full `git stash` — repo has unrelated dirty files elsewhere), ran the test file myself → 27 pass / 3 fail RED, exact match to claim; restored, re-ran → 30 pass / 0 fail GREEN, exact match. Also confirmed by direct simulation that `"cron:"` alone does NOT match `cron-registration:*` (5th byte differs, `-` vs `:`) — the 3 positive assertions are genuinely load-bearing, not coincidentally already-true. Negative control (`some-random-id`) correctly stays `false` in both RED and GREEN states.
- [x] tsc: 0 errors (independently re-run). mock-guard: PASS.
- [x] Hard constraint: `docs/agents/system-auditor/handlers.md` / `audit-dimensions.md` — grep-confirmed NOT touched by either commit (`--name-only` on both), and `git log -1` shows both files' last touch predates this row entirely. Agent-father's zone correctly left alone.

smart_skip: NO — production array-literal change + test-file change, ran full checklist.
Report: reports/TASK_REPORT_602.md

---
