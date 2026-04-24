# UNBLOCK-125: Visual Reference Guide

## Current Git State

```
MAIN                           TASK/125                    MERGE-BASE
└─ abe5d5e (HEAD on main)       └─ 4244593 (HEAD on task/125)
   │                               │
   ├─ 529ac8a                      ├─ db21dc7 (docs postmortem)
   │                               │
   ├─ 4b6a090                      ├─ 26b8310 (fix timezone test)
   │                               │
   └─ ... (20+ sprints)            ├─ fb27186 (feat: Ops agent) 🎯
       │                           │
       │                           └─ ff55779 (fix: OHLCV guards) 🎯
       │
       └─ DIVERGES HERE @ commit fb27186
          (Main went one way, task/125 continued)
```

## The Unblock: Merging task/125 back to main

```
AFTER MERGE:

main ─────────────────────────────────
  └─ abe5d5e (original main head)
     └─ ... (20+ sprints of main work)
        └─ merge commit (MERGE CREATED HERE)
           ├─ ff55779 (OHLCV guards)  ✓ NOW MERGED
           ├─ fb27186 (Ops agent)      ✓ NOW MERGED
           ├─ 26b8310 (timezone fix)   ✓ NOW MERGED
           ├─ db21dc7 (postmortem)     ✓ NOW MERGED
           └─ 4244593 (graphify docs)  ✓ NOW MERGED

task/125 branch → DELETED (no longer needed)
```

## Files in Each Commit

### Commit ff55779: Guard Checks for OHLCV

```
src/scheduler/ohlcvDailyAggregatorJob.ts
  │
  ├─ Line 103-107: Replace "openRow!" with "openRow?.close_price"
  ├─ Line 109-112: Add guard check — skip ticker if OHLCV missing
  │
  └─ Result: Prevents "Cannot read property 'X' of undefined"

src/__tests__/1551-ohlcv-guard-checks.test.ts (NEW)
  │
  ├─ Test 1: Safe execution with complete OHLCV
  ├─ Test 2: Mixed completeness (some tickers skip)
  └─ Test 3: No NaN output
```

### Commit fb27186: Ops Agent

```
.claude/agents/ops.md (NEW)
  └─ Infrastructure monitoring agent (254 lines)

.claude/knowledge/ops-incident-response.md (NEW)
  └─ Incident response playbook (494 lines)

.claude/knowledge/vps-setup.md (NEW)
  └─ VPS infrastructure guide (353 lines)

docs/OPS_AGENT_SETUP.md (NEW)
  └─ Setup instructions (317 lines)

.claude/agents/ (8 files)
  └─ Metadata updates to all agent files
```

### Commit 26b8310: Timezone Test Fix

```
src/__tests__/125-test-e2e-briefing.test.ts
  │
  ├─ OLD: Date.now() - 1h  (could fall before VN midnight)
  └─ NEW: Explicit VN midnight calculation + 1h buffer

Result: Test always runs after Vietnam midnight (UTC+7)
```

### Commit db21dc7: Postmortem

```
docs/BLOCKER_240_VPS_INFRASTRUCTURE.md
  │
  └─ Root cause: slaStatusTools.ts line 54 referenced non-existent table
     Fixed in commit f628da2 (already on main)
     VPS infrastructure is healthy
```

### Commit 4244593: Graphify Docs

```
CLAUDE.md
  │
  └─ Clarify: graph.json already exists
     Only run /graphify update . after code changes
```

## Merge Conflict Map

```
Files with CONFLICTS:
  ├─ reports/2026-04-22-evening.json ⚠️ CONFLICT
  │   │
  │   └─ Resolution: git checkout --theirs (keep main's volatile version)
  │
  └─ ✓ No other conflicts expected

Files MODIFIED (auto-merge successful):
  ├─ src/interface/mcp/tools/system/slaStatusTools.ts
  └─ ✓ All others (clean merge)

Production code RISK:
  └─ NONE (only reports file is volatile)
```

## The Three Paths Visualization

```
PATH 1: Direct Merge (RECOMMENDED) ⭐
═══════════════════════════════════════════

  task/125 ──── merge main ──── resolve reports ──── merge commit
     │                              │                      │
     └──────── 5 commits ────────────────────────────────→ main

  Pros:  Single operation, preserves all history, linear DAG
  Cons:  One merge commit (adds 1 to history)
  Time:  5-15 minutes


PATH 2: Cherry-Pick + Clean (SAFEST) ✓
═══════════════════════════════════════════

  main ──── cherry-pick ff55779 ──┐
     │                             ├─→ new clean branch
     └──── cherry-pick 26b8310 ──┘

  Then: Merge new branch → main

  Pros:  No merge commits, starts fresh, explicit control
  Cons:  Cherry-pick could fail, more manual steps
  Time:  10-20 minutes


PATH 3: Manual Re-implementation (NOT RECOMMENDED) ✗
═════════════════════════════════════════════════════

  Read commits → Re-implement manually → Create new commit

  Pros:  Maximum control
  Cons:  High risk, time-consuming, loses authorship
  Time:  30+ minutes
```

## Test Validation Timeline

```
┌─ bun test passes on main ─────────────────┐
│                                            │
├─ Merge executed                           │
│  ├─ ff55779 applied (OHLCV guards)       │
│  ├─ 26b8310 applied (timezone fix)       │
│  └─ 2 timezone approaches now coexist    │
│                                            │
├─ Run: bun test src/__tests__/125-test-e2e-briefing.test.ts
│  │                                        │
│  └─ Expected: All pass (uses new 26b8310 logic)
│                                            │
├─ Run: bun test (full suite)               │
│  │                                        │
│  └─ Expected: 6124+ tests pass            │
│                                            │
└─ Merge validated ✓                        │
   Ready for Sprint 1277 →→→→→→→→→→→→→→→→┘
```

## Two Timezone Approaches (Why Not Conflicting)

```
COMMIT 6887f65 (already on main):
  function midnightVietnam() {
    return Date.now()  // Simple: just use current time
  }

COMMIT 26b8310 (on task/125):
  function midnightVietnamUtc() {
    const vnNow = new Date(now.getTime() + 7*3600_000)
    // Explicit calculation: UTC+7 conversion
    return midnight
  }

WHY NO CONFLICT:
  ✓ 26b8310's approach is clearer, more explicit
  ✓ Test prefers explicit UTC+7 calculation (26b8310's)
  ✓ Both will coexist in merged history (no functional overlap)
  ✓ 26b8310 replaces/improves on 6887f65's logic
```

## Success Criteria Checklist

```
✓ git status
  └─ Clean tree after merge

✓ git log --oneline -8
  └─ Shows: ff55779, fb27186, 26b8310, db21dc7, 4244593 all present

✓ bun test src/__tests__/125-test-e2e-briefing.test.ts
  └─ All tests pass (timezone logic working)

✓ bun test
  └─ 6124+ tests pass (full suite)

✓ git branch | grep 125
  └─ No branches named 125 (cleanup complete)

✓ Commit history linear
  └─ No orphaned branches, all merged

ALL CRITERIA MET = Unblock complete, Sprint 1277 ready
```

## For PM: Sprint 1277 Impact

```
BEFORE MERGE:
  └─ Task 125 blocked
  └─ OHLCV guards unavailable
  └─ Ops agent unavailable
  └─ Two timezone approaches in conflict

AFTER MERGE:
  └─ Task 125 integrated
  └─ OHLCV guards available (crash prevention)
  └─ Ops agent available (infrastructure support)
  └─ Timezone logic unified and tested
  └─ Sprint 1277 unblocked, ready to plan

AVAILABILITY: Immediate after execution (20 minutes)
```

## Error Recovery (Quick Reference)

```
If merge conflicts in code (not reports):
  └─ git merge --abort
  └─ Contact Architect (PATH 2 cherry-pick may be safer)

If test fails after merge:
  └─ git log --oneline | grep -E "fix\(test-125\)"
  └─ Verify both timezone approaches present
  └─ Check: Does 26b8310's logic apply cleanly?

If branch still exists after merge:
  └─ git branch -D task/125-timezone-briefing-test (force delete)
  └─ Verify: git branch | grep 125 (no output)

If reports conflict persists:
  └─ git checkout --theirs reports/2026-04-22-evening.json
  └─ git add reports/2026-04-22-evening.json
  └─ git commit --no-edit
```

---

**For detailed execution steps:** See `UNBLOCK_125_EXECUTION_RUNBOOK.md`
**For technical analysis:** See `UNBLOCK_125_INTEGRATION_ANALYSIS.md`
**For handoff details:** See `docs/handoffs/TASK_125_UNBLOCK.md`
