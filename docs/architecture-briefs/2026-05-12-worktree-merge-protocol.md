# Architecture Brief — WORKTREE MERGE PROTOCOL (Phase 5)

**Authored:** 2026-05-12T14:28:54Z
**Author:** Architect
**Status:** Design — Pending PO + agents-architect review
**Task:** 1895a-worktree-merge-protocol
**Follows:** `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md` (Phases 1–4)

---

## TL;DR

**Problem.** In cycle 47, main terminal ran `git cherry-pick <1879b-sha>` while an architect agent held a concurrent commit window. The cherry-pick staged 7 files but the commit step blocked on `HEAD.lock`. The architect agent's subsequent `git commit -am` absorbed all staged content — producing commit `8bec73d3` labeled `docs(1894a/cloudflare)` that also contained 1879b feature code, two barrel updates, and the tool registry. One commit ≠ one task: C2 atomicity violated. Git history is semantically wrong even though functional state is correct.

**Solution.** Insert a serialized merge gate into the dev-team flow at Step 3 post-tier, covering five controls: (1) a pre-merge staged-index check that aborts if any unrelated files are cached; (2) a single-file OS-level lock (`flock`) that serializes all main-terminal git write operations, preventing concurrent HEAD mutation; (3) a post-merge tree-hash verification that confirms the commit contains exactly the expected files; (4) a C2 atomicity check that alerts when commit subject prefix conflicts with the file types actually merged; (5) a documented recovery path for polluted commits. Controls 1–3 are the direct preventers of the c47 class of incident. Control 4 is an early-warning layer. Control 5 enables safe rollback without discarding work.

**Implementation cost.** No production code changes. All five controls are shell-level git operations wrapped in flow-doc protocol steps. Estimate: S (≤1 developer cycle to implement in `dev-team/main.md` + one new `docs/protocols/worktree-merge-protocol.md`). Defer to Phase 5 sprint after PO + agents-architect review.

---

## 1. Forensic Evidence — c47 Incident

**Root cause sequence:**

1. Main terminal: `git cherry-pick a6d4b555` → 7 files staged (`A` status in git index), commit step blocked on `HEAD.lock`
2. Architect agent (parallel window): writes brief + notebook → `git commit -am "docs(1894a/cloudflare):..."` → succeeds because lock released at that instant
3. `-am` flag = `git add --all` + commit. All staged content (including the 1879b cherry-pick files) absorbed into the architect commit
4. Result: `8bec73d3` contains 9 files: cloudflare brief + 1879b feature code + 2 barrel updates + tool registry
5. Subsequent cherry-pick retry: "nothing to commit" — files already on HEAD. Recovery impossible without rewrite

**C2 violation confirmed.** commit-convention.md § C2: one commit = one task. `8bec73d3` mixed docs(1894a) content with feat(1879b) content. Auditor cannot reconstruct task history from `git log`.

**Pre-conditions that made this possible:**
- No staged-index guard before cherry-pick
- No lock serializing main-terminal git ops vs. agent git ops
- `git commit -am` (greedy add) used by architect agent instead of `git commit -m` (index-only)
- No post-merge tree verification

---

## 2. Recommended Mechanism — Option 2: Sequential Merge Gate in Flow

**Three candidate mechanisms evaluated:**

| Option | Mechanism | Verdict |
|--------|-----------|---------|
| 1 | `flock(2)` on `.git/.dev-team-merge.lock` | Viable for same-process coordination; fragile across agent processes that may not honor the lock |
| **2** | **Serialize all main-terminal git ops behind a sequential merge gate after all tier agents return** | **Selected. Structural, zero extra tooling, directly addresses the race by eliminating it** |
| 3 | `git stash` checkpoint + atomic apply | Extra state to manage; stash misapplication risk; adds no benefit over Option 2 |

**Rationale for Option 2.**

The c47 race occurred because main terminal initiated a cherry-pick while an agent was still in its commit window. The fix is not a lock — it is a scheduling guarantee: no main-terminal git write operation starts until ALL agents in the current tier have returned and the flow explicitly enters the merge gate step. This is already the *intended* flow structure; the c47 incident revealed that the flow text did not enforce it rigorously enough (no explicit "wait-all" barrier and no pre-condition checks on the index state).

Option 1 (flock) is weaker: it only helps if every agent and main terminal cooperates in acquiring the lock before touching git. Agents that use `git commit -am` bypass the intent of the lock by absorbing index content that arrived outside their own writes. The structural gate (Option 2) makes the race impossible by construction.

---

## 3. Five Controls

### Control 1 — Pre-merge Index Empty Check

**When:** Immediately before any `git cherry-pick`, `git merge`, or `git commit` in the main-terminal merge gate.

**Command:**
```bash
git diff --cached --quiet
```

**Logic:**
- Exit code 0 → index clean → proceed
- Exit code 1 → staged files exist from an unrelated source → **ABORT**
  - Log: `git diff --cached --name-only` to notebook
  - `send_telegram(work, "ABORT: staged index not empty before merge gate — manual inspection required")`
  - Do NOT proceed with cherry-pick/merge. EXIT the merge gate.
  - Human must inspect and either `git reset HEAD` or commit the staged content explicitly before the next cycle.

**Why this alone prevents c47.** At the moment main terminal attempted the cherry-pick, the index was clean. The problem was that the cherry-pick itself staged files and then the commit was preempted. Control 1 catches the scenario where a *previous failed operation* left files staged — which is what happened on the retry path in c47. Combined with Control 2 (structural gate), the window where a partial cherry-pick can be absorbed by an agent commit is eliminated.

---

### Control 2 — Structural Sequential Merge Gate

**When:** After ALL agents in a tier return (parallel or sequential), before the first git write for that tier's merge.

**Flow insertion point:** `dev-team/main.md` Step 3, "After each tier completes" block. Replace the current implicit fast-forward merge instruction with an explicit gate:

```
## Merge Gate (Step 3 — post-tier, sequential)
# Runs ONCE per tier, after all agents in the tier have returned.
# No git write operations occur outside this gate.

1. Wait: confirm all tier agents have returned (read all returns first)
2. Control 1: git diff --cached --quiet  → abort if exit 1
3. For each worktree branch in tier order:
   a. git cherry-pick <sha>  OR  git merge --ff-only <branch>
   b. Control 3: tree-hash verification (see below)
   c. git worktree remove <path>  (if worktree agent)
   d. git branch -d <branch>      (if worktree agent)
4. Control 4: C2 atomicity check (see below)
5. Spawn pm → update TASKS.md → read return → unblock next tier
```

**Key invariant:** No agent commit window overlaps with the merge gate. The gate is entered only after all agents have completed and returned. Agents use `git commit -m` (index-only), not `git commit -am` (greedy add).

---

### Control 3 — Post-merge Tree-Hash Verification

**When:** Immediately after each cherry-pick or merge in the gate.

**Commands:**
```bash
# Actual tree hash of the new HEAD
ACTUAL=$(git rev-parse HEAD^{tree})

# Expected files (from the agent's commit)
EXPECTED_FILES=$(git diff-tree --no-commit-id -r --name-only HEAD)

# Cross-check: files in HEAD must match files from the agent's commit SHA
CHERRY_FILES=$(git diff-tree --no-commit-id -r --name-only <cherry-sha>)

if [ "$EXPECTED_FILES" != "$CHERRY_FILES" ]; then
  echo "TREE MISMATCH: HEAD contains unexpected files"
  diff <(echo "$CHERRY_FILES") <(echo "$EXPECTED_FILES")
  # → alert + recovery path (Control 5)
fi
```

**Logic:** If the file sets differ — HEAD contains files not in the cherry-picked commit — a pollution event has occurred. Alert immediately, do not proceed to the next branch in the tier.

**Limitation:** This check detects pollution after it lands. Controls 1 + 2 prevent it from landing. Control 3 is the safety net.

---

### Control 4 — C2 Atomicity Violation Alert

**When:** After each commit lands in the merge gate.

**Command:**
```bash
SUBJECT=$(git log -1 --format="%s" HEAD)
TYPE_AREA=$(echo "$SUBJECT" | grep -oE '^\w+\([^)]+\)')   # e.g. docs(arch/1895a)
FILES=$(git diff-tree --no-commit-id -r --name-only HEAD)
```

**Rules:**
- Subject type is `docs(...)` but FILES contains `*.ts`, `*.py`, `*.json` (non-doc) → **C2 ALERT**
- Subject type is `feat(...)` or `fix(...)` but FILES contains only `*.md` → **C2 WARN** (may be intentional spec commit, lower severity)
- Subject scope references task X but FILES contain files scoped to task Y (detectable if filenames embed task IDs or module names) → **C2 ALERT**

**Action:** `send_telegram(work, "C2 VIOLATION: commit <sha> subject='<subject>' contains mixed file types: <file list>")`

**This is a detective control, not a preventive one.** It catches violations that slipped through the structural gate (e.g. agent used `git commit -am` despite the protocol). Human must review and decide whether to rewrite history or accept the mixed commit.

---

### Control 5 — Recovery Path

**Trigger:** Control 3 (tree mismatch) or Control 4 (C2 violation) fires.

**Safe rollback sequence:**
```bash
# Step 1: Capture the polluted commit's tree for audit
git show HEAD --stat > /tmp/polluted-commit-$(git rev-parse --short HEAD).txt

# Step 2: Back out the polluted commit, preserving all changes in the index
git reset --soft HEAD~1

# Step 3: Stash the index content with a labeled entry
git stash push -m "recovery-$(date -u +%Y%m%dT%H%M%SZ)-polluted-$(git rev-parse --short HEAD@{1})"

# Step 4: Verify main is at the pre-pollution SHA
git log --oneline -3

# Step 5: Re-apply each agent's changes individually with correct commit messages
# (Manual step — human or architect reviews stash content and re-commits per task)
```

**Invariant:** `git reset --soft` never discards work. All staged content moves to the stash. The stash entry is labeled with timestamp + the polluted commit SHA for traceability. Recovery is deterministic.

---

## 4. Flow Integration — dev-team/main.md Step 3

**Current text (Step 3, "After each tier completes"):**
```
- Spawn `pm` to update docs/TASKS.md + unblock next tier → read return → spawn next tier
```

**New text (replacement):**
```
- **Merge Gate** (sequential, all agents must have returned before entering):
  1. git diff --cached --quiet → abort + WORK alert if exit 1 (Control 1)
  2. For each agent branch: cherry-pick OR ff-merge → tree-hash check (Control 3)
  3. C2 atomicity check on each new HEAD (Control 4)
  4. If any control fires: STOP tier, WORK alert, await human review
  5. All controls pass → spawn pm to update TASKS.md + unblock next tier
```

**Additional agent constraint** (add to spawn prompt for all developer agents):
```
Use `git commit -m "..."` (index-only commit). NEVER use `git commit -am` or `git commit -a`.
Reason: -a flag stages untracked index content from other sources and violates C2 atomicity.
```

This single constraint eliminates the primary mechanism of the c47 incident on the agent side.

---

## 5. Rollback Plan for Phase 5 Itself

If Phase 5 gate introduces bugs (false-positive aborts, tree-hash mismatches on legitimate commits):

1. **Immediate:** Remove the Control 1 check line from the merge gate step in `dev-team/main.md`. Sequential dispatch resumes without the gate. One-line revert, no infrastructure change.
2. **Preserve Phase 4:** Worktree isolation (`isolation: "worktree"`) is independent of the merge gate. Removing the gate does not remove Phase 4's file-level isolation. Throughput gains from Phase 4 are retained.
3. **Diagnose offline:** Review tree-hash output from the triggering cycle. Determine if mismatch was genuine pollution or a legitimate multi-file agent commit with multiple task files. Adjust the Control 3 comparison logic accordingly.
4. **Re-enable:** Once root cause is confirmed, re-add the gate step with the corrected logic.

**Phase 5 rollback does not regress Phase 1–4.** The sequential mandate (Phase 4) remains in force as the primary safety net.

---

## 6. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Control 1 false-positive aborts (legitimate staged content from a previous step) | LOW | Only triggers if index is dirty at gate entry — the gate design guarantees index is clean at that point (agents commit in their own worktrees; main terminal does not stage anything before the gate) |
| Control 3 tree-hash comparison failure on multi-file commits where file order differs | LOW | `diff-tree --name-only` output is sorted by git — order is deterministic |
| Agent uses `git commit -am` despite constraint | MEDIUM | Control 3 catches it post-hoc; Control 4 surfaces the C2 violation; human reviews before next tier |
| Phase 5 gate adds latency per tier | LOW | Gate is 3 shell commands + a diff check — sub-second; negligible vs. 60s+ agent cycles |
| Recovery stash grows unbounded | LOW | Label includes timestamp; human prunes stash after reviewing each entry |

---

## 7. Out of Scope

- Automated rewrite of polluted commits (rebase/amend). Recovery (Control 5) is manual-review-gated — automated rewrites can lose work silently.
- CI enforcement of the C2 check. This brief covers the flow-level gate only. CI integration is a separate task.
- Parallel QA agent notebook contention. Covered in `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md` § Out of Scope item 3.

---

## 8. Hand-off

**Phase 5 is design-only this cycle.** Implementation deferred pending PO + agents-architect review.

When approved, PM creates one task:

- **Task 1895a-impl:** Update `dev-team/main.md` Step 3 merge gate (Controls 1–4 text) + create `docs/protocols/worktree-merge-protocol.md` (Control 5 recovery sequence + branch naming convention). Developer, SPRINT-S. No production code changes, no test changes.

Developer guidance for 1895a-impl:
- Edit `.claude/flows/dev-team/main.md` Step 3 "After each tier completes" block
- Add agent spawn constraint: "use `git commit -m`, never `git commit -am`"
- Create `docs/protocols/worktree-merge-protocol.md` with Control 5 recovery steps
- Commit as `docs(1895a/merge): worktree merge protocol — Phase 5 gate`
