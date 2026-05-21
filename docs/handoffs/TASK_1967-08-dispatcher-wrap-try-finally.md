# Handoff — TASK_1967-08: Dispatcher-wrap outer release in try/finally (ITEM-17 + ITEM-22)

**Task:** 1967-08 | **Sprint:** 1967c | **Severity:** MED | **Size:** XS (flow edits)

---

## Summary

Two dispatcher-wrap sites lack explicit try/finally blocks around Agent() spawn calls. If spawn throws an exception (ENOSPC, timeout, tool failure), the outer task_release is unreachable, causing lock leaks for full TTL (3600s).

---

## Evidence

**Brief cross-links:**
- ITEM-17: `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-17
- ITEM-22: same brief § ITEM-22

**Repro paths:**
- ITEM-17: `execute-tier.md:54-57` — release is sequential post-loop comment, NOT try/finally block
- ITEM-22: 
  - `dev-team/main.md:130-138` (pipeline-resume) — outer claim acquired, Agent() call, sequential task_release
  - cowork-team/main.md:173-183 — CORRECT pattern (has try/finally)

**Pattern:** 
- cowork-team/main.md: ✓ CORRECT — explicit try/finally
- execute-tier.md: ✗ MISSING try/finally
- dev-team/main.md pipeline-resume: ✗ MISSING try/finally

---

## Current Behavior

- Outer claim succeeds: `task_claim(task_id, ...)`
- Agent() call raises exception (e.g., ENOSPC during spawn)
- Exception propagates, skipping task_release at L56/L137
- Lock held for full 3600s TTL
- Next dev-team tick (15min) cannot claim same task → 1-tick skip
- Self-healing via TTL expiry but causes visible latency

---

## Expected Behavior

Both sites have explicit try/finally block:
```
try:
  claim = task_claim(task_id, ...)
  Agent(nextAgent)
finally:
  task_release(claim)
```

Lock is released on ALL exit paths (success, failure, exception).

---

## Proposed Fix

**Zone:** `.claude/flows/` (flow .md files)

**Fix surface:**

1. **execute-tier.md:54-57** → wrap Step 1+2+3 in try/finally:
   ```
   try:
     [existing Step 1+2+3 logic]
   finally:
     For each outer claim: task_release(claim)
   ```

2. **dev-team/main.md:130-138 (pipeline-resume)** → wrap in try/finally:
   ```
   try:
     claim = task_claim(...)
     Agent(nextAgent)
   finally:
     task_release(claim)
   ```

**Reference pattern:** `.claude/skills/dispatch-claim/SKILL.md` shows correct try/finally template

**Blast radius:** On Agent() spawn failure → lock leaks 3600s → next dev-team tick skips task → 15min operational latency

**Dependency chain:** None — standalone flow edits

---

## Acceptance Criteria

1. [ ] execute-tier.md Step 1+2+3 wrapped in try/finally block
2. [ ] dev-team/main.md pipeline-resume block wrapped in try/finally
3. [ ] task_release() call is inside finally block (reachable on all paths)
4. [ ] Test: simulate Agent() spawn exception → task_release still fires ✓
5. [ ] Test: normal flow (no exception) → task_release fires ✓
6. [ ] tsc 0 errors

---

## Owner & Zone

- **Dev agent:** agent-father
- **Zone:** `.claude/flows/` (dev-team/main.md, execute-tier.md)
- **Model:** claude-haiku-4-5-20251001

---

## Related

- REQ-1967-3c + REQ-1967-3d (dispatcher-wrap release-on-error)
- ITEM-17 (execute-tier outer release not in try/finally)
- ITEM-22 (dispatcher-wrap no try/finally in 2 sites)
- dispatch-claim SKILL.md (correct pattern reference)
