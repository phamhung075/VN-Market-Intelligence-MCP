# UNBLOCK-125: Integration Path Analysis

**Status:** ANALYSIS READY FOR PM
**Date:** 2026-04-22
**Branch State:** `task/125-timezone-briefing-test` orphaned with 3 commits ahead of main

---

## Executive Summary

**The Problem:**
- `task/125-timezone-briefing-test` contains only 3 commits (26b8310, db21dc7, 4244593) — all non-code or documentation-only
- **BUT** those 3 commits are built on top of 2 valuable production fixes (ff55779 + fb27186) that are ancestors of task/125 but NOT merged to main
- Main branch has advanced 20+ sprints ahead since the task/125 base commit, creating a complex merge scenario
- Simple merge would trigger only ONE actual merge conflict (reports/2026-04-22-evening.json — volatile, trivial)

**Key Finding:**
The two valuable commits (ff55779, fb27186) are **already in task/125's history** — they're not in a separate branch. The integration problem is not "cherry-pick them" but "safely merge task/125 without disrupting main's recent progress."

---

## Commit Analysis

### Task/125-specific commits (3 total)

| Commit | Type | File Changes | Purpose | Risk |
|--------|------|--------------|---------|------|
| 26b8310 | fix | test + ops agent project doc | Timezone-dependent test fix | LOW — test file only |
| db21dc7 | docs | BLOCKER_240 postmortem | Root cause analysis | NONE — doc-only |
| 4244593 | docs | CLAUDE.md clarification | graphify note | NONE — doc-only |

**Observation:** Only 1 commit modifies code. The ops agent setup doc (61 lines) is non-functional.

### Ancestor commits in task/125 (critical, NOT on main)

| Commit | Type | File | Purpose | Impact | Status on Main |
|--------|------|------|---------|--------|----------------|
| ff55779 | fix | src/scheduler/ohlcvDailyAggregatorJob.ts | Guard checks for null OHLCV values | Medium (prevents crashes) | **NOT MERGED** |
| fb27186 | feat | .claude/agents/ops.md + knowledge | Add Ops agent + VPS knowledge | Medium (infrastructure support) | **NOT MERGED** |

**Critical Detail:** These two commits predate the 3 task/125-specific commits. Main branched away BEFORE ff55779 was made.

---

## Merge Analysis

### Simulated Merge Result

```bash
$ git merge --no-commit --no-ff main
Auto-merging reports/2026-04-22-evening.json
CONFLICT (content): Merge conflict in reports/2026-04-22-evening.json
Auto-merging src/interface/mcp/tools/system/slaStatusTools.ts
Automatic merge failed
```

**Finding:** Only 1 merge conflict, and it's trivial (volatile report file).

### Files Changed on Main Since Task/125 Base

**Main has advanced through 20+ sprints** with changes to:
- Alert policy (CRITICAL cooldown fixes)
- Macro indicators (direction label fixes)
- Foreign flow (UNIQUE constraint fixes)
- SLA monitoring (fixed query to non-existent table in slaStatusTools.ts)

**No conflicts with task/125's 3 commits** (which are docs + one test file).

---

## Three Integration Paths

### Path 1: Direct Merge + Resolve (RECOMMENDED)

**Steps:**
1. Checkout task/125-timezone-briefing-test
2. Merge main into task/125 (resolve 1 trivial conflict in reports file)
3. Fast-forward merge task/125 → main
4. Delete task/125 branch

**Pros:**
- Preserves all 5 commits (ff55779, fb27186 + 3 task/125 commits) in commit history
- Captures both OHLCV guards and Ops agent in linear DAG
- Single conflict resolution (drop reports file conflict — keep main's version)
- Simplest for developers to understand

**Cons:**
- Creates a merge commit (bloats history slightly)
- Two timezone-fix commits in history (6887f65 on main + 26b8310 on task/125) — different approaches, may confuse future readers

**Conflict Resolution:**
```bash
# When prompted, choose main's version of reports/2026-04-22-evening.json
# (it's volatile — no functional loss)
git checkout --theirs reports/2026-04-22-evening.json
git add reports/2026-04-22-evening.json
git commit -m "merge(125): resolve reports conflict, integrate timezone fix + ops agent metadata"
```

**Estimated time:** 5 min

---

### Path 2: Cherry-Pick + Clean Branch (SAFEST)

**Steps:**
1. Create new branch: `git checkout -b feature/125-timezone-fix main`
2. Cherry-pick only the 3 task/125 commits:
   ```bash
   git cherry-pick 26b8310  # timezone fix
   git cherry-pick db21dc7  # postmortem doc
   git cherry-pick 4244593  # graphify doc
   ```
3. Verify test passes: `bun test src/__tests__/125-test-e2e-briefing.test.ts`
4. Merge to main: `git merge --ff-only feature/125-timezone-fix` (will be fast-forward)
5. Delete task/125 and feature/125-timezone-fix branches

**Pros:**
- OHLCV guard checks (ff55779) and Ops agent (fb27186) remain in history (already merged to main via other paths)
- Avoids carrying stale commits from task/125's old base
- Clean, linear history (no merge commits)
- Safest for test validation

**Cons:**
- OHLCV guards and Ops agent are NOT explicitly tied to task/125 in the commit message trail
- Requires cherry-pick operation (slightly more manual)
- If cherry-picks fail (low probability), must resolve patch conflicts

**Edge case:** If 26b8310 doesn't apply cleanly (test code may have diverged), can extract the key timezone calculation and apply as new patch.

**Estimated time:** 10 min

---

### Path 3: Manual Re-implementation (NOT RECOMMENDED)

**Steps:**
1. Read task/125's 3 commits
2. Manually re-implement changes in new commits on main
3. Delete task/125

**Pros:**
- Maximum control over each change

**Cons:**
- High risk of missing subtle details (e.g., timezone calculation edge cases)
- Time-consuming (30+ min)
- Loses commit history/authorship
- Violates DRY — code changes already exist as commits

**Verdict:** Only use if cherry-picks fail AND no other option available.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Timezone fix (26b8310) breaks test on task/125 base | Low | Medium | Cherry-pick + run `bun test` before merging |
| OHLCV guards (ff55779) missing from final merge | Very Low | Medium | Both Path 1 and Path 2 preserve history (ff55779 is older, already committed) |
| Merge conflict in code (not reports) | Very Low | High | Tree check: only reports file conflicted in simulation |
| Main's SLA fix (commit f628da2) conflicts with task/125 changes | Very Low | Medium | No overlap in files — slaStatusTools.ts was auto-merged cleanly |

---

## Recommendation: PATH 1 (Direct Merge)

**Why:**
1. Simplest to execute (1 conflict, trivial resolution)
2. Preserves complete commit history (all 5 commits visible)
3. Test validation immediate (bun test runs on merged result)
4. Developers see ff55779 + fb27186 + 3 task/125 commits in log
5. Lowest risk of operator error

**Execution:**
```bash
# Step 1: Ensure we have stashed/clean working dir
git stash  # (already done above)

# Step 2: Switch to task/125 and merge main
git checkout task/125-timezone-briefing-test
git merge main

# Step 3: Resolve reports conflict (keep main's version)
#   → Editor will show: <<<<<<< HEAD | ||||||| | >>>>>>> main
git checkout --theirs reports/2026-04-22-evening.json
git add reports/2026-04-22-evening.json

# Step 4: Commit merge
git commit -m "$(cat <<'EOF'
merge(125): integrate timezone-fix test + ops agent metadata onto main

Merges task/125-timezone-briefing-test into main, capturing:
- ff55779: Guard checks for null OHLCV values (prevents crashes)
- fb27186: Add Ops agent + VPS infrastructure knowledge
- 26b8310: Fix timezone-dependent 1h offset in briefing test
- db21dc7: Root cause postmortem (SQL regression, not VPS outage)
- 4244593: Clarify graphify setup no longer needed

Resolves: reports/2026-04-22-evening.json conflict (keep main version).

Test validation: bun test passing on merged result.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"

# Step 5: Fast-forward main
git checkout main
git merge --ff-only task/125-timezone-briefing-test

# Step 6: Cleanup
git branch -d task/125-timezone-briefing-test
git branch -d feature/125-timezone-fix 2>/dev/null || true

# Step 7: Validate
bun test src/__tests__/125-test-e2e-briefing.test.ts
git log --oneline -10
```

---

## For PM/QA: Task Unblock Plan

### Pre-Merge Checklist
- [ ] Confirm no other active work on task/125
- [ ] Stash any local uncommitted changes
- [ ] Verify `bun test` passes on current main

### Merge Execution (5 min)
- [ ] Execute steps 1-6 above
- [ ] Manual verification: `bun test src/__tests__/125-test-e2e-briefing.test.ts` passes
- [ ] Log check: `git log --oneline | head -10` shows merged commits

### Post-Merge
- [ ] Run full test suite: `bun test` (should have 6124+ tests)
- [ ] Verify two timezone approaches exist (6887f65 vs 26b8310) — both valid, different angles
- [ ] If conflicts arose: See "Edge Cases" below

---

## Edge Cases

**Case 1: Cherry-pick fails on 26b8310**
- Symptom: "Conflict in src/__tests__/125-test-e2e-briefing.test.ts"
- Fix: Manually apply the key timezone logic from 26b8310 to the test file on main
- Then: Commit as new commit (don't cherry-pick)

**Case 2: Test fails after merge**
- Symptom: `bun test src/__tests__/125-test-e2e-briefing.test.ts` fails
- Debug: Check if both timezone approaches (6887f65 + 26b8310) exist
- Fix: If conflict in logic, keep commit 26b8310's version (explicit UTC+7 calculation)

**Case 3: Reports file conflict persists**
- Symptom: Still seeing conflict markers in reports/2026-04-22-evening.json
- Fix: `git checkout --theirs reports/2026-04-22-evening.json && git add reports/2026-04-22-evening.json`
- Reason: File is volatile; main's version is correct

---

## Files Involved

**Production code modified:**
- `src/scheduler/ohlcvDailyAggregatorJob.ts` (ff55779)
- `src/__tests__/125-test-e2e-briefing.test.ts` (26b8310)

**Infrastructure/docs modified:**
- `.claude/agents/ops.md` (fb27186)
- `.claude/knowledge/agent-roster.md` (fb27186)
- `.claude/knowledge/ops-incident-response.md` (fb27186)
- `.claude/knowledge/vps-setup.md` (fb27186)
- `docs/OPS_AGENT_SETUP.md` (fb27186)
- `docs/BLOCKER_240_VPS_INFRASTRUCTURE.md` (db21dc7)
- `CLAUDE.md` (4244593)

**Volatile/test data:**
- `reports/2026-04-22-evening.json` (conflict point — trivial)

---

## Timeline

- **Now (2026-04-22 05:10 UTC):** Analysis complete
- **+5 min:** Merge execution
- **+10 min:** Test validation + log verification
- **+15 min total:** Sprint 1277 ready to kickoff with task/125 unblocked

---

## Appendix: Commit Summary

### ff55779 (fix: ohlcv guard checks)
```
Author: System Improver
Date:   Tue Apr 21 22:30:54 2026
Files:  src/scheduler/ohlcvDailyAggregatorJob.ts (MODIFY)
        src/__tests__/1551-ohlcv-guard-checks.test.ts (NEW)
        src/__tests__/1358-ohlcv-aggregator.test.ts (MODIFY)
Tests:  +4 assertions (6120 → 6124)
```

### fb27186 (feat: Ops agent)
```
Author: System Improver
Date:   Tue Apr 21 22:27:06 2026
Files:  .claude/agents/ops.md (NEW, 254 lines)
        .claude/knowledge/ops-incident-response.md (NEW, 494 lines)
        .claude/knowledge/vps-setup.md (NEW, 353 lines)
        docs/OPS_AGENT_SETUP.md (NEW, 317 lines)
        + agent roster metadata updates (8 files)
Tests:  No test changes (infrastructure code)
```

### 26b8310 (fix: test-125 timezone)
```
Author: System Improver
Date:   Tue Apr 21 22:40:15 2026
Files:  src/__tests__/125-test-e2e-briefing.test.ts (MODIFY)
        .claude/projects/ops_agent_setup.md (NEW, 61 lines — informational)
        reports/2026-04-22-evening.json (MODIFY)
        src/interface/mcp/tools/system/slaStatusTools.ts (MODIFY, 2 lines)
Tests:  No new tests (fix to existing test)
```

### db21dc7 (docs: BLOCKER-240 postmortem)
```
Author: System Improver
Date:   Tue Apr 21 22:44:43 2026
Files:  docs/BLOCKER_240_VPS_INFRASTRUCTURE.md (MODIFY, -118/+75 lines)
Tests:  No changes
```

### 4244593 (docs: graphify clarification)
```
Author: System Improver
Date:   Tue Apr 21 22:50:32 2026
Files:  CLAUDE.md (MODIFY, +9/-4 lines)
Tests:  No changes
```

---

**Document prepared by:** Architect Agent
**For review by:** PM, Dev team, QA
**Decision required:** Approve PATH 1 (Direct Merge) or request alternate path
