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
