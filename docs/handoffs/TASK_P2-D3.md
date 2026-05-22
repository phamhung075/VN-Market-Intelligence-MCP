---
task_id: P2-D3
title: "dev-technical-analysis fixes bug (≤2 cycles); dashboard GREEN"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G10", "G12"]
files_touched:
  - "apps/technical-analysis/pkg/primitive/rsi/rsi.go (MODIFY — fix)"
status: "PENDING"
blocked_by: ["P2-D2"]
unblocks: ["P2-E1"]
estimate_hours: 1.0
ac_count: 6
---

# P2-D3 — dev-technical-analysis fixes bug (≤2 cycles); dashboard GREEN

**Goal:** G10 (AI agent fixes a primitive bug without looping), G12 (Dev flow enforces dashboard-green DoD)

**Description:**
Agent receives only the failing scenario description. Identifies bug from sandbox RED + source inspection. Fixes in ≤2 cycles (each fix attempt that doesn't result in all GREEN = 1 cycle). Must run sandbox before marking DONE.

---

## Files Touched

- `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (MODIFY — fix)

---

## Acceptance Criteria

1. **AC-1**: Agent receives handoff with ONLY the failing dashboard scenario
2. **AC-2**: Agent identifies bug from dashboard RED signal + sandbox output + source code inspection
3. **AC-3**: Fix applied in ≤2 commits (each fix attempt = 1 cycle; success = dashboard GREEN, failure = 1 cycle consumed)
4. **AC-4**: After fix: `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all` → ALL 30 scenarios GREEN
5. **AC-5**: G12 DoD enforced: agent does NOT mark task DONE until sandbox runs all scenarios and dashboard shows GREEN
6. **AC-6**: Git log evidence: between injection commit (P2-D2) and final green commit = ≤2 commits by dev-technical-analysis

---

## Smoke Check

```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all
# Both must exit 0 with all GREEN
```

---

## Atomic Commit Format (each fix attempt)

```
fix(technical-analysis): P2-D3 — RSI [fix description] — G10 cycle [N] of ≤2

[What was wrong, what was fixed]

Sprint: <sprint>
Task: P2-D3
AC: sandbox all-scenarios GREEN / dashboard green confirmed / G12 DoD check run before this commit
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G10  | COMPLETE (proof: ≤2 cycles) |
| G12  | IN-PROGRESS (streak task #2 — requires flow rule + sandbox evidence) |

---

## Dependencies

**Upstream:** P2-D2 (bug injected, agent dispatched)
**Downstream:** P2-E1 (regression scenario design), P2-F3 (3-task streak verification)

---

## Flow Rule Integration (G12)

Per P2-F2 flow rule, agent MUST:
1. Run both sandbox tiers (`-tier=primitive` and `-tier=module`)
2. Verify ALL scenarios GREEN
3. Paste sandbox output (pass/fail summary) into handoff doc BEFORE writing RETURN block
4. If ANY scenario is RED → task is NOT done, re-cycle

Evidence: sandbox output must be appended to handoff doc before task closure.

---

## Cycle Counting

- Cycle 0: receive handoff
- Cycle N: each fix attempt that doesn't result in all GREEN scenarios
- Success: all 30 scenarios GREEN within ≤2 cycles
