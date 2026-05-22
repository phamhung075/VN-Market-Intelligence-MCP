---
task_id: P2-E2
title: "QA injects bug A; dispatches dev-technical-analysis"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G11"]
files_touched:
  - "Primitive A source file (TEMP MODIFY — bug injection commit)"
status: "PENDING"
blocked_by: ["P2-E1"]
unblocks: ["P2-E3"]
estimate_hours: 0.25
ac_count: 3
---

# P2-E2 — QA injects bug A; dispatches dev-technical-analysis

**Goal:** G11 (Regression alarm bell works)

**Description:**
QA injects bug A (per P2-E1 spec), confirms scenario A = RED and scenario B = GREEN (canary not yet triggered), then dispatches dev-technical-analysis with ONLY scenario A context. Regression is unknown until the fix lands.

---

## Files Touched

- Primitive A source file (TEMP MODIFY — bug injection commit)

---

## Acceptance Criteria

1. **AC-1**: Bug A injected in atomic commit (same convention as P2-D2)
2. **AC-2**: Sandbox run confirms scenario A = RED, scenario B = GREEN (regression not yet triggered — the fix will trigger it)
3. **AC-3**: `dev-technical-analysis` dispatched with: failing scenario A description only + sandbox command. No B scenario mentioned. This simulates a real bug report where the regression is unknown until the fix lands.

---

## Smoke Check (post-injection, before dispatch)

```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all
# Scenario A = RED; scenario B = GREEN (pre-fix state)
```

---

## Atomic Commit Format

```
test(technical-analysis): P2-E2-inject — [primitive A] bug for G11 regression alarm proof

Bug A injected. Scenario A = RED. Scenario B = GREEN (canary not yet triggered).
Agent dispatched with scenario A context only.

Sprint: <sprint>
Task: P2-E2
AC: bug committed / scenario A RED / scenario B GREEN / agent dispatched with A-only context
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G11  | IN-PROGRESS (bug A injected, regression waiting for fix) |

---

## Dependencies

**Upstream:** P2-E1 (scenario pair spec designed)
**Downstream:** P2-E3 (agent fixes A, triggers B RED, fixes both)

---

## Dispatch Notes

- Handoff should mention ONLY scenario A
- Do NOT mention scenario B or the regression risk
- Agent receives failing dashboard scenario + sandbox command
- Cycle counting begins at dispatch
