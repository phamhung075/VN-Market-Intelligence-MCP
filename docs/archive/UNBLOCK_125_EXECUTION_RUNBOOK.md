# UNBLOCK-125: Execution Runbook

**For:** Developer executing the integration
**Prerequisite:** Read `docs/UNBLOCK_125_INTEGRATION_ANALYSIS.md` first
**Recommended Path:** PATH 1 (Direct Merge)
**Duration:** 5-15 minutes

---

## Pre-Flight Checklist

- [ ] On main branch: `git status` shows clean tree
- [ ] Latest main pulled: `git pull origin main`
- [ ] No uncommitted changes: `git status` output empty
- [ ] `bun test` passes on current main
- [ ] `task/125-timezone-briefing-test` branch exists locally

**Abort if:**
- Working directory dirty (stash first: `git stash`)
- Tests failing on main (fix root cause, do not proceed)
- Branch task/125-timezone-briefing-test missing (contact Architect)

---

## Execution: PATH 1 (Direct Merge)

### Step 1: Switch to task/125 branch

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
git checkout task/125-timezone-briefing-test
echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
```

**Expected output:**
```
Switched to branch 'task/125-timezone-briefing-test'
Your branch is N commits ahead of 'origin/main'
Current branch: task/125-timezone-briefing-test
```

---

### Step 2: Merge main into task/125

```bash
git merge main
```

**Expected output:** May show merge conflicts

**If NO conflicts:** → Skip to Step 4

**If conflicts appear:**
```
Auto-merging reports/2026-04-22-evening.json
CONFLICT (content): Merge conflict in reports/2026-04-22-evening.json
Auto-merging src/interface/mcp/tools/system/slaStatusTools.ts
Automatic merge failed; fix conflicts and then commit the result.
```

→ Proceed to Step 3

---

### Step 3: Resolve Conflicts (if any)

```bash
# Check status
git status

# Show conflicted files
git diff --name-only --diff-filter=U
```

**Expected:** Only `reports/2026-04-22-evening.json` should be conflicted (volatile file)

**Resolution:** Keep main's version

```bash
# Discard task/125's version, keep main's
git checkout --theirs reports/2026-04-22-evening.json

# Stage the resolution
git add reports/2026-04-22-evening.json

# Verify no other conflicts
git diff --name-only --diff-filter=U
```

**Expected output:** Empty (no more conflicts)

---

### Step 4: Complete the Merge Commit

```bash
git commit -m "$(cat <<'EOF'
merge(125): integrate timezone-fix test + ops agent metadata onto main

Merges task/125-timezone-briefing-test into main, capturing:
- ff55779: Guard checks for null OHLCV values (prevents crashes)
- fb27186: Add Ops agent + VPS infrastructure knowledge
- 26b8310: Fix timezone-dependent 1h offset in briefing test
- db21dc7: Root cause postmortem (SQL regression, not VPS outage)
- 4244593: Clarify graphify setup no longer needed

Conflict resolution: reports/2026-04-22-evening.json (volatile, kept main).

Test validation: bun test passing on merged result.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

**Expected:** Merge commit created, no errors

---

### Step 5: Switch to main and Fast-Forward

```bash
git checkout main
git merge --ff-only task/125-timezone-briefing-test
```

**Expected:**
```
Updating abe5d5e..4244593
Fast-forward
 <files...>
 <N files changed>
```

**If you get error "fatal: Not possible to fast-forward":**
- This means main has new commits not in task/125 (unexpected)
- Solution: `git merge --ff task/125-timezone-briefing-test` (regular merge, allows merge commit)
- Escalate to Architect if this seems wrong

---

### Step 6: Validate Test Suite

```bash
bun test src/__tests__/125-test-e2e-briefing.test.ts
```

**Expected:** All tests pass (✓ N tests, 0 failures)

**If failures:**
- Read error message carefully
- If it's a timezone assertion: the two fixes (6887f65 vs 26b8310) may conflict logically
- Solution: Check if both approaches exist; if yes, keep 26b8310's explicit UTC+7 calculation
- Escalate to Architect if unclear

---

### Step 7: Verify Commit History

```bash
git log --oneline -8
```

**Expected output shows merged commits in order:**
```
4244593 (HEAD -> main) merge(125): integrate timezone-fix test...
26b8310 fix(test-125): timezone-dependent 1h offset in briefing test
db21dc7 docs(BLOCKER-240): Postmortem — SQL regression, not VPS outage
4244593 docs: Clarify graphify is already set up—no reinstall needed
ff55779 fix(ohlcvDailyAggregatorJob): add guard checks for non-null assertions
fb27186 feat(ops): Add Ops agent (infrastructure monitoring)
6887f65 fix(test-125): remove timezone-dependent 1h offset in briefing seed timestamp
bf8fd19 docs(PO): escalate UNBLOCK-240 VPS infrastructure down
```

**Note:** You may see duplicate commit hashes (normal for merges). Verify the top 5 commits match the expected ones above.

---

### Step 8: Cleanup Branches

```bash
# Delete local task/125 branch
git branch -d task/125-timezone-briefing-test

# If you created feature/125-timezone-fix, delete it too
git branch -d feature/125-timezone-fix 2>/dev/null || echo "feature branch not found (OK)"

# Verify branches deleted
git branch | grep 125
```

**Expected:** No branches named 125 listed

---

### Step 9: Full Test Suite Validation

```bash
bun test
```

**Expected:** All tests pass (6124+ tests, 0 failures)

**If failures:** Investigate root cause. Most likely:
- Merge conflict was not fully resolved
- OHLCV guards (ff55779) or test fix (26b8310) not applied correctly

---

### Step 10: Verify Remote Sync (Optional, for awareness)

```bash
git log origin/main..main --oneline | head -5
```

**Expected:** Shows commits ahead of origin (normal, will be pushed in next batch)

**Do NOT push yet** — wait for PM approval and batch with other tasks

---

## Success Criteria

All of the following must be true:

- [ ] `git status` shows clean working tree
- [ ] `git log --oneline -5` includes all 5 merged commits
- [ ] `bun test src/__tests__/125-test-e2e-briefing.test.ts` passes
- [ ] `bun test` (full suite) passes
- [ ] `task/125-timezone-briefing-test` branch deleted locally
- [ ] No `.orig` or `.rej` files in repo (no failed patches)

**If all criteria met:** Integration is complete. Inform PM.

---

## Troubleshooting

### Problem: Merge conflicts in code files (not reports)

**Symptom:**
```
Conflict in src/scheduler/ohlcvDailyAggregatorJob.ts
Conflict in src/__tests__/125-test-e2e-briefing.test.ts
```

**Cause:** Likely ff55779 or 26b8310 didn't apply cleanly due to tree divergence

**Resolution:**
1. Abort: `git merge --abort`
2. Contact Architect — may need to use PATH 2 (cherry-pick) instead
3. Do NOT manually resolve conflicts without understanding the code

---

### Problem: Test fails after merge

**Symptom:**
```
FAIL src/__tests__/125-test-e2e-briefing.test.ts
  Error: expect(assembledBriefing.topStories).toHaveLength(N)
           Expected: 10, Received: 0
```

**Likely cause:** Both timezone fixes (6887f65 on main + 26b8310 from task/125) exist but conflict in logic

**Debug:**
```bash
# Check if both commits are in history
git log --oneline | grep -E "fix\(test-125\)" | head -3

# Read the test file
cat src/__tests__/125-test-e2e-briefing.test.ts | grep -A10 "midnightVietnamUtc"

# Run with more detail
bun test src/__tests__/125-test-e2e-briefing.test.ts --verbose
```

**Fix:** If logic conflict detected, keep 26b8310's version (explicit UTC+7 calculation is clearer). May require manual edit.

---

### Problem: Merge abort needed

```bash
# If things go wrong, abort the merge
git merge --abort

# Reset to before merge started
git reset --hard HEAD

# Start over from Step 1
```

---

### Problem: Branch task/125-timezone-briefing-test lost

```bash
# Recover from reflog
git reflog | grep "task/125-timezone-briefing-test"

# Create branch from reflog
git branch task/125-timezone-briefing-test <SHA>

# Continue merge
git checkout task/125-timezone-briefing-test
git merge main
# ... continue from Step 3
```

---

## When to Escalate to Architect

- [ ] Merge conflicts in code files (not reports)
- [ ] Tests fail after merge and cause unclear
- [ ] Duplicate commit hashes in log appear anomalous
- [ ] Any `git` command returns unexpected error
- [ ] `bun test` fails but you're confident merge was correct

**Escalation command:**
```bash
# Save state for Architect review
git status > /tmp/git_status.txt
git diff --stat > /tmp/git_diff_stat.txt
git log --oneline -10 > /tmp/git_log.txt
echo "Context saved to /tmp/. Contact Architect with: task/125 merge failed at [step N]"
```

---

## Post-Integration: PM Tasks

Once developer confirms success:

1. [ ] Update TASKS.md: Remove task 125 (or mark Done if it was listed)
2. [ ] Kick off Sprint 1277 with unblocked status
3. [ ] Notify QA: task/125 merged, ready for validation
4. [ ] Batch with next merge: Push to origin/main when safe

---

## Quick Reference: All Commands (Copy-Paste Friendly)

```bash
# Pre-flight
git status
git pull origin main
bun test

# Execution
git checkout task/125-timezone-briefing-test
git merge main

# If conflicts
git checkout --theirs reports/2026-04-22-evening.json
git add reports/2026-04-22-evening.json

# Commit merge
git commit -m "merge(125): integrate timezone-fix test + ops agent metadata onto main

Merges task/125-timezone-briefing-test into main, capturing:
- ff55779: Guard checks for null OHLCV values (prevents crashes)
- fb27186: Add Ops agent + VPS infrastructure knowledge
- 26b8310: Fix timezone-dependent 1h offset in briefing test
- db21dc7: Root cause postmortem (SQL regression, not VPS outage)
- 4244593: Clarify graphify setup no longer needed

Conflict resolution: reports/2026-04-22-evening.json (volatile, kept main).

Test validation: bun test passing on merged result.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Fast-forward to main
git checkout main
git merge --ff-only task/125-timezone-briefing-test

# Validation
bun test src/__tests__/125-test-e2e-briefing.test.ts
bun test
git log --oneline -8

# Cleanup
git branch -d task/125-timezone-briefing-test
git branch | grep 125

# Success!
echo "Integration complete. Inform PM."
```

---

**Document prepared by:** Architect Agent
**Approved execution path:** PATH 1 (Direct Merge)
**Estimated duration:** 5-15 minutes
**Risk level:** LOW (only trivial merge conflict expected)
