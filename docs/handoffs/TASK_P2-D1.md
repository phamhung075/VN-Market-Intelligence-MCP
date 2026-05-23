---
task_id: P2-D1
title: "Design and document bug-injection spec"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G10"]
files_touched:
  - "docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md (NEW)"
status: "PENDING"
blocked_by: ["P2-D0", "P2-F1"]
unblocks: ["P2-D2"]
estimate_hours: 0.333
ac_count: 5
---

# P2-D1 — Design and document bug-injection spec

**Goal:** G10 (AI agent fixes a primitive bug without looping)

**Description:**
QA designs which bug to inject into the RSI primitive and documents the exact failure mode, baseline cycle count, and detection method. This spec feeds directly into P2-D2 injection.

---

## Files Touched

- `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md` (NEW)

---

## Bug Injection Candidate (Architect Recommendation)

Inject an off-by-one in `apps/technical-analysis/pkg/primitive/rsi/rsi.go`: change the Wilder smoothing period from `period` to `period - 1` in the RSI gain/loss averaging calculation. This is a realistic bug (off-by-one in period parameter is a common math mistake), scoped to a single pure function, and is directly detectable by the `rsi-golden.json` scenario (the output RSI values will be wrong for all periods). The sandbox will flip the RSI golden scenario card from GREEN to RED immediately — proving the dashboard IS the signal contract.

**Alternatively:** RSI Wilder smoothing initial seed — change `WilderEMA[0] = simple mean of first period values` to `WilderEMA[0] = prices[0]` (uses first price as seed instead of mean). This produces wrong RSI values after the first window, detectable by comparing to a reference vector.

**QA selects one of these two options in P2-D1 and documents it before injection.**

---

## Acceptance Criteria

1. **AC-1**: `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md` created
2. **AC-2**: Specifies: which file is modified, which line(s) change, before/after code snippet (redacted — exact code kept out of this doc per architect boundary), expected scenario failure (which scenario JSON card turns RED)
3. **AC-3**: Confirms the bug is detectable by dashboard scenario RED (not silently passing with wrong output)
4. **AC-4**: Documents the cycle-counting protocol: each agent fix attempt that does NOT flip all RSI scenarios GREEN = 1 cycle
5. **AC-5**: Documents baseline: TA-specific `baselineCycleCount = 1.5` (from bug-inventory.json), target ≤ 2 cycles

---

## Smoke Check

```bash
# Verify spec file exists and is non-trivial
wc -l docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md
# Must be > 20 lines
```

---

## Atomic Commit Format

```
docs(arch/technical-analysis): P2-D1 — bug-injection spec for G10 AI-fixability proof

RSI off-by-one (period vs period-1) or Wilder seed selection. Detectable by rsi-golden.json RED.
Baseline: 1.5 cycles (TA-specific from bug-inventory.json). Target: ≤2 cycles.

Sprint: <sprint>
Task: P2-D1
AC: spec doc created / bug scoped to single primitive / sandbox RED detection confirmed / cycle-counting protocol documented
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G10  | IN-PROGRESS (bug spec designed) |

---

## Dependencies

**Upstream:** P2-D0 (baseline confirmed), P2-F1 (flow rule brief must exist so fix work counts)
**Downstream:** P2-D2 (bug injection)

---

## Notes

- Reference: `docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md` §P2-D1 (lines 524–566)
- Code snippet in spec should be redacted per architect boundary (reference file/line only, not exact code)
- Scenario detection: sandbox must show RED for at least one scenario after injection

---

## Verification (qa, 2026-05-23 cycle-11 R-11 redispatch)

Spec file `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md` created (125 lines, smoke-check passes >20). Variant selected: **Option A — Wilder smoothing period off-by-one**, with rationale documented in spec §Selected Variant.

| AC | Result | Evidence |
|---|---|---|
| AC-1 | PASS | spec file exists at the canonical path |
| AC-2 | PASS | spec §Bug Location & Mutation Sketch (file=rsi.go, lines 55–58, mutation sketch redacted per architect boundary); §Expected Failure Signature (`rsi-golden.json` card → RED) |
| AC-3 | PASS | spec §Expected Failure Signature, detectability claim: golden ±1-point tolerance is tighter than recursive drift introduced by off-by-one smoothing constant; first post-seed value exceeds tolerance — not silent |
| AC-4 | PASS | spec §Cycle-Counting Protocol (7 numbered rules: cycle = dev-TA dispatch ending in commit+dashboard read; +1 per RED-exit; no partial credit; no-spec-cheat clause) |
| AC-5 | PASS | spec §Baseline & Target table: baseline 1.5 cycles (TA-specific, from `bug-inventory.json#baselineCycleCount` averaging 1970 + 1968d), target ≤ 2 cycles (inclusive) |

Prerequisites confirmed at start of task: `docs/data/bug-inventory.json` exists with `baselineCycleCount: 1.5` and ≥1 TA bug (P2-D0 gate passed); `docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md` exists (P2-F1 gate passed). Closure anchor: `62edbf3d`.
