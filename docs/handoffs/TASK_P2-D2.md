---
task_id: P2-D2
title: "QA injects bug; dispatches dev-technical-analysis with dashboard scenario only"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G10"]
files_touched:
  - "apps/technical-analysis/pkg/primitive/rsi/rsi.go (TEMP MODIFY — bug injection commit)"
status: "PENDING"
blocked_by: ["P2-D1"]
unblocks: ["P2-D3"]
estimate_hours: 0.25
ac_count: 5
---

# P2-D2 — QA injects bug; dispatches dev-technical-analysis with dashboard scenario only

**Goal:** G10 (AI agent fixes a primitive bug without looping)

**Description:**
QA injects the designed bug into RSI primitive, confirms it appears in sandbox RED, then dispatches dev-technical-analysis agent with ONLY the failing scenario description and sandbox command. No code hints. Cycle counting begins.

---

## Files Touched

- `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (TEMP MODIFY — bug injection commit)

---

## Acceptance Criteria

1. **AC-1**: Bug injected in a single atomic commit (identifiable as the injection point in git log)
2. **AC-2**: Commit message: `test(technical-analysis): P2-D2-inject — RSI [bug-type] bug for G10 AI-fix proof`
3. **AC-3**: After injection: `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=rsi-all` returns at least one RED result
4. **AC-4**: Dashboard card for RSI golden scenario shows RED (confirms sandbox is the signal contract)
5. **AC-5**: `dev-technical-analysis` agent dispatched with handoff containing ONLY: the failing dashboard scenario description + the command to run the sandbox. No other context. No code pointer. No hint about the bug location.

---

## Smoke Check (post-injection, before dispatch)

```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=rsi-all
# Must show at least one scenario status: RED
```

---

## Atomic Commit Format

```
test(technical-analysis): P2-D2-inject — RSI [bug-type] bug for G10 AI-fix proof

Deliberate bug injected for G10 measurement. Dashboard RSI golden card = RED.
Agent dispatched with scenario-only context. Cycle counting begins.

Sprint: <sprint>
Task: P2-D2
AC: bug committed / sandbox returns RED / dashboard card RED / agent dispatched with scenario-only context
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G10  | IN-PROGRESS (bug injected, agent dispatched) |

---

## Dependencies

**Upstream:** P2-D1 (bug spec designed)
**Downstream:** P2-D3 (agent fixes bug within ≤2 cycles)

---

## Dispatch Notes

- Handoff to dev-technical-analysis should contain:
  - Dashboard scenario description (e.g., "RSI scenario golden is RED")
  - Sandbox command to reproduce
  - Timestamp (cycle counting starts)
- NO hints about where the bug is or what it might be
- Agent must identify the bug from sandbox output + source inspection
- Cycle counting: each fix attempt that doesn't result in all GREEN = 1 cycle

---

## Verification (QA — P2-D2, 2026-05-23)

**Performed by:** qa (cycle-12, dispatch closure-anchor `62edbf3d`)
**Mutation site:** `apps/technical-analysis/pkg/primitive/rsi/rsi.go:56-57` (Wilder smoothing constant, multiplier `period-1` → `period`).
**Spec adherence:** Option A (Wilder smoothing period off-by-one). Single-token edit per statement; 2 adjacent statements mutated. Seed loop (i=1..period), `wilderRSI` helper, signature, error sentinels, test file all untouched.

### Sandbox results — G12 DoD Gate

**Pre-injection (HEAD before edit):** all RSI scenarios GREEN; all cross-primitive scenarios GREEN.

**Post-injection (this commit):**

```
RSI value scenarios:
  rsi-golden                 status=red   diff: rsi[4]: got 56.181151, want 54.567700 (tol 1)
  rsi-overbought-pullback    status=red
  rsi-oversold-bounce        status=red
  rsi-mid-range              status=red

Canary (error path — must stay green):
  rsi-insufficient-data      status=green

Cross-primitive isolation (must all stay green):
  bb-golden bb-expansion bb-squeeze bb-insufficient-data bb-period-equals-length   → green
  macd-golden macd-bullish-cross macd-bearish-cross macd-flat-zero macd-insufficient-data → green
  ma-golden ma-edge ma-failure ma-sma-vs-ema ma-dispatcher-unknown                  → green
  cross-golden cross-edge cross-failure cross-multi-alternating cross-parallel-no-cross → green
```

**Summary line:** RSI value scenarios 4 RED / canary 1 GREEN / cross-primitive 20 GREEN — bug isolated to RSI primitive as spec predicted.

### Acceptance Criteria self-check

| AC | Statement | Verdict |
|----|-----------|---------|
| AC-1 | Bug injected in a single atomic commit | PASS — see commit `<hash>` |
| AC-2 | Commit message matches `test(technical-analysis): P2-D2-inject — RSI [bug-type] bug for G10 AI-fix proof` | PASS — bug-type = "Wilder smoothing off-by-one" |
| AC-3 | Sandbox returns at least one RED for `rsi-*` | PASS — 4 RSI scenarios RED |
| AC-4 | Dashboard card for RSI golden = RED | PASS — `rsi-golden` status=red, diff at `rsi[4]` exceeds ±1 tolerance |
| AC-5 | dev-technical-analysis dispatched with scenario-only context | DEFERRED to PO per dispatch signal (cycle-13+) |

### Constraint compliance

- WIP-1 respected — no other tasks claimed this cycle.
- No `--no-verify`, no `--force`, no broad-glob staging — explicit file paths only (L84).
- Append-only edit to handoff — frontmatter (`status`, `owner`, `blocked_by`) untouched.
- Scope-shrink not triggered — rsi.go structure matched spec lines 55-58 exactly.
- Stall-watch not triggered — go toolchain available (go1.26.2 darwin/amd64).
