---
task_id: P2-E1
title: "QA designs scenario pair A + B (shared input shape, regression canary)"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G11"]
files_touched:
  - "docs/architecture-briefs/2026-05-22-refactor/p2-e-regression-scenario-spec.md (NEW)"
status: "PENDING"
blocked_by: ["P2-F1"]
unblocks: ["P2-E2"]
estimate_hours: 0.333
ac_count: 4
---

# P2-E1 — QA designs scenario pair A + B (shared input shape, regression canary)

**Goal:** G11 (Regression alarm bell works)

**Description:**
QA designs a pair of test scenarios where fixing scenario A's bug may inadvertently break scenario B (regression). This tests whether the agent notices and fixes both without being told about B.

---

## Files Touched

- `docs/architecture-briefs/2026-05-22-refactor/p2-e-regression-scenario-spec.md` (NEW)

---

## Scenario Design (Architect Guidance)

**Scenario A (primary):** RSI period off-by-one bug (same injection pattern as P2-D, or a new variant).

**Scenario B (regression canary):** Moving Average scenario that shares the `prices []float64` input shape. The link: if the RSI fix inadvertently changes how the MA dispatcher handles its smoothing constant (shared `calculateEMA` helper), the MA golden scenario will flip RED. This is a realistic cross-primitive regression because both RSI Wilder smoothing and MACD signal line smoothing call the same EMA helper.

**QA may choose a different pairing** — the key constraint is: the natural fix for A must have a plausible code path that could break B (otherwise the regression alarm never fires and G11 is unprovable).

---

## Acceptance Criteria

1. **AC-1**: Spec file created: describes scenario A (primary primitive, exact failure mode) and scenario B (canary primitive, exact input shape link to A)
2. **AC-2**: Explains WHY the natural fix for A could break B (shared code path / shared constant / shared helper)
3. **AC-3**: Both A and B already have scenario JSON files (from Phase 1 P1-D1 suite) — if not, new scenarios added
4. **AC-4**: QA has a test plan: inject bug A, dispatch agent, observe whether B flips RED during the fix

---

## Smoke Check

```bash
wc -l docs/architecture-briefs/2026-05-22-refactor/p2-e-regression-scenario-spec.md
# Must be > 20 lines (non-trivial spec)
```

---

## Atomic Commit Format

```
docs(arch/technical-analysis): P2-E1 — regression scenario pair spec for G11

Scenario A: [primitive A + failure mode]. Scenario B: [primitive B + canary link].
Shared code path: [describe link]. Injection plan documented.

Sprint: <sprint>
Task: P2-E1
AC: spec created / A + B described / shared code path explained / scenario JSONs confirmed present
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G11  | IN-PROGRESS (scenario pair designed) |

---

## Dependencies

**Upstream:** P2-F1 (flow rule brief must exist so regression work counts under new DoD)
**Downstream:** P2-E2 (bug A injection + dispatch)

---

## Regression Mechanism

The key to a good regression pair is:
1. Scenario A has a realistic bug (off-by-one, initialization, etc.)
2. The natural fix for A touches shared code (EMA helper, constant, etc.)
3. Scenario B will turn RED when that shared code is modified
4. Agent doesn't know about B, only gets A's failing scenario
5. Agent's sandbox check catches B RED before declaring DONE

This proves the dashboard + flow rule work together to detect cross-primitive issues.
