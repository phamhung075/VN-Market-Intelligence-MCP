# Architecture Brief: Origin-Lag Push Discipline

**Date:** 2026-06-13
**Author:** agents-architect
**Status:** READY-FOR-PM-DECOMPOSE
**Slug:** origin-lag-push-discipline
**Task:** FU-ORIGIN-LAG-PUSH-DISCIPLINE
**Signal:** `docs/signals/origin-lag-push-discipline-20260613T161810Z.json`

---

## DJ-GATE-1 — Decision Journal

**task-id:** FU-ORIGIN-LAG-PUSH-DISCIPLINE
**decision:** Fold a bounded rebase-retry push step into `.claude/skills/commit-mutex/SKILL.md` as the single SSOT push location. Push executes inside the already-serialized mutex critical section, immediately after the existing `git commit` step (Step 3c), before `task_release`. The retry guard is: `git push origin main || (git pull --rebase origin main && git push origin main)`, bounded to 2 total push attempts (1 initial + 1 rebase-retry) with abort on rebase conflict (no auto-resolve). All high-frequency commit paths that currently call commit-mutex (po notebook, pm orch-state, agents-architect brief commits) inherit push automatically. The bare commit in `.claude/skills/commit-boundary/SKILL.md` keeps its separate commit path for agents-architect and agent-father (no gateway binding) but adopts the same push guard as an appended Step 4 to the existing RULE 1-3 protocol. The generic `.claude/skills/commit/SKILL.md` Step 3 is updated to use the same guarded push to replace its existing bare `git push origin main`.
**rationale:** Approach #1 (push in mutex window, rebase-retry guard) is the only option that is race-free without adding a new component. The mutex is already the serialization boundary for the git index; push is a git operation on the same branch and belongs in the same critical section. Approach #2 (periodic-push cron) would be race-free but adds an always-on component, cron inventory debt, and introduces push latency unrelated to commit timing. Approach #3 (post-commit hook) was correctly flagged as REJECT by PO: firing on every commit under concurrency generates push-storm + non-fast-forward churn unless gated behind the same mutex, at which point it collapses into Approach #1 with hook overhead added.
**alternatives-rejected:** #2 periodic-cron (new component + latency + cron inventory debt; no benefit over #1); #3 post-commit hook (push-storm risk; reduces to #1 inside mutex).
**risk:** Rebase conflict during retry: mitigated by abort-on-conflict semantics (see §3.3). Push failure after retry: mitigated by bug-telegram + SKIP-push-leave-commit (origin still lags but commit is preserved; next cycle's holder will push). Increased TTL pressure from push inside mutex: mitigated by TTL bump to 90s (see §3.2).

---

## 1. Problem Statement

Every maintenance cycle, `git rev-list --count origin/main..HEAD` accumulates 27–30+ unpushed commits within ~2 hours, requiring manual `git pull --rebase origin main && git push` reconciliation each pass. This is a recurring class-1 bug (3 consecutive maintenance passes, PO raw-verified 2026-06-13T12:18Z at count=30).

Root cause: the git commit and git push operations are split across skills, and the high-frequency paths never push.

**Verified current state of each commit path:**

| Skill / Path | Commits | Pushes | Guard |
|---|---|---|---|
| `.claude/skills/commit-mutex/SKILL.md` | YES (Step 3c) | NO | none |
| `.claude/skills/commit-boundary/SKILL.md` | YES (RULE 2 → commit) | NO | none |
| `.claude/skills/commit/SKILL.md` Step 3 | YES (Step 2) | YES — bare | no rebase-retry; fails non-fast-forward |
| `docs/agents/po/flow/main.md` L134-139 (notebook commit inline) | YES | NO | none |

The commit-mutex skill is the highest-volume commit path: it handles every notebook commit (po, pm, agents-architect, all maintenance-lane agents), every orch-state write, and every signal-emit commit. It NEVER pushes. The commit-boundary skill handles agents-architect and agent-father brief/flow commits — also never pushes. The generic commit skill's push is unreliable because it has no rebase-retry guard and fails non-fast-forward under the known concurrent-commit race.

---

## 2. Affected Files

| File | Change | Owner |
|---|---|---|
| `.claude/skills/commit-mutex/SKILL.md` | Add Step 3d-PUSH (rebase-retry guard) inside critical section; bump TTL to 90s in acquire + quick-reference block | agent-father |
| `.claude/skills/commit-boundary/SKILL.md` | Add Step 4 — Push (same rebase-retry guard, same abort semantics) after RULE 3 | agent-father |
| `.claude/skills/commit/SKILL.md` | Replace bare `git push origin main` in Step 3 with the guarded push block | agent-father |
| `docs/agents/po/flow/main.md` L134-139 (inline commit block) | Delete inline commit block; replace with `→ skill: .claude/skills/commit-mutex/SKILL.md` (already the declared pattern; the inline block was a divergent copy that omitted both the mutex acquire AND push) | agent-father |

**Out of scope / explicitly NOT touched:** `docs/agents/*/init.md` (per task constraint). No new cron. No post-commit hook. No new always-on component.

---

## 3. Recommended Implementation

### 3.1 SSOT Location for the Push Step

**Single SSOT:** `.claude/skills/commit-mutex/SKILL.md` Step 3d-PUSH.

This is the canonical high-frequency commit path. All agents that can reach the MCP gateway use it. The push step added here is authoritative; the additions to commit-boundary and commit/SKILL.md are adaptations of the same guard to their respective (no-gateway) contexts.

### 3.2 TTL Adjustment

Current TTL=60s. Push over the network adds 1–5s under normal conditions; the rebase-retry path adds another 3–8s (fetch + rebase + push). Worst case is ~15s additional. Bump TTL from 60s to 90s in:
- Step 1 acquire block: `ttl_seconds: 90`
- Quick-reference block: `ttl=90`

This preserves the 6× headroom design intent (90s / 15s critical section upper bound = 6×). No change to the no-heartbeat rule (section still holds; 90s is still well within crash-recovery acceptable window).

### 3.3 Push Step Semantics — Exact Guard

Insert as Step 3d-PUSH immediately after Step 3c (git commit) and before Step 3d (post-commit verify), inside the critical section (lock still held):

```bash
# 3d-PUSH. Attempt push. If non-fast-forward: rebase once and retry.
# MAX 2 total push attempts. Abort on conflict; never auto-resolve.
git push origin main
PUSH_EXIT=$?
if [ $PUSH_EXIT -ne 0 ]; then
  # Retry: rebase then push
  git pull --rebase origin main
  REBASE_EXIT=$?
  if [ $REBASE_EXIT -ne 0 ]; then
    # Rebase conflict — abort cleanly, do not leave rebase state
    git rebase --abort 2>/dev/null || true
    send_telegram(channel="bug",
      "[<agent>] commit-mutex: push rebase CONFLICT — rebase aborted; commit local-only. \
       Paths: <own_paths>. Manual reconcile required.")
    # EXIT push step — commit is preserved; origin lags by this one commit only
    # Proceed to Step 4 (release) immediately
  else
    git push origin main
    PUSH2_EXIT=$?
    if [ $PUSH2_EXIT -ne 0 ]; then
      send_telegram(channel="bug",
        "[<agent>] commit-mutex: push retry FAILED after rebase; commit local-only. \
         Paths: <own_paths>.")
      # Proceed to Step 4 (release)
    fi
  fi
fi
```

**Key semantics:**
- **Retry count:** exactly 1 rebase + 1 retry push (2 total push attempts). Not configurable; not infinite.
- **Conflict action:** `git rebase --abort` then log to bug channel + leave commit local-only. The commit exists in local history; next agent to hold the mutex will push it along with its own commit.
- **What "success" means:** push exit 0 on attempt 1 or attempt 2.
- **What "acceptable failure" means:** rebase conflict or second push failure — commit preserved locally, origin lags by exactly the failed batch. No data loss.
- **No auto-resolve:** the guard never uses `-X theirs` or `-X ours`. Conflicts must surface to a human.

### 3.4 Rebase-Retry Guard for commit-boundary (no-gateway agents)

Agents-architect and agent-father use commit-boundary (no MCP gateway binding, no task_claim). They commit serially under `orch-state.head.wip ≤ 1` (per the R-HANDOFF protocol in commit-boundary). For these agents, push contention is lower but the guard must still be applied.

Add as **RULE 4 — PUSH (after RULE 3)** in `.claude/skills/commit-boundary/SKILL.md`:

```bash
# RULE 4 — PUSH after commit-boundary commit
# Same bounded rebase-retry guard as commit-mutex Step 3d-PUSH.
# On rebase conflict: git rebase --abort; log; leave local-only.
# No task_release step (no mutex held here).
git push origin main || (git pull --rebase origin main && git push origin main)
# If rebase conflicts: git rebase --abort; log to notebook/session-log.
```

The one-liner form is acceptable for commit-boundary since these paths have lower concurrent-write pressure (wip ≤ 1 guard already enforced upstream). However, the conflict-detect + abort must still be implemented — use the full form in the actual skill text if the one-liner is ambiguous.

### 3.5 Generic commit/SKILL.md Step 3 Replacement

Replace the current bare:
```bash
git push origin main
```
with the bounded guard block from §3.3. Same semantics apply.

### 3.6 PO Inline Commit Block Fix

`docs/agents/po/flow/main.md` lines 134–139 contain an inline notebook-commit block:
```bash
git add docs/agent-memory/notebooks/po.md
git commit -m "chore(memory/po): notebook YYYY-MM-DD"
```

This block diverges from the declared commit-mutex pattern and never pushes. Replace with the existing canonical reference already present in the file:
```
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: ["docs/agent-memory/notebooks/po.md"]
  intent:    "chore(memory/po): notebook YYYY-MM-DD"
```

No logic change — the commit-mutex skill already handles the acquire/stage/verify/commit/release cycle. With §3.2–3.3 in place, push is included automatically.

---

## 4. Race-Safety Argument

**Why push inside the mutex window is safe:**

The commit-mutex serializes agents on the git index: only one agent is inside `git add → git commit` at a time. A `git push` on the same branch is an extension of the same critical section — it is the operation that makes the local HEAD change visible to remote. Including push inside the mutex window means:

1. No two agents attempt `git push origin main` concurrently. The mutex TTL=90s ensures at most one push attempt is in flight.
2. The rebase-retry path (`git pull --rebase && git push`) fetches remote HEAD and rebases local commits onto it. Because the mutex is held, no other local commit is being made during this rebase window. The rebase is therefore operating on a stable local HEAD.
3. After a successful rebase-push, the mutex is released. The next claimant calls `task_claim`, gets the lock, and proceeds to commit + push — its `git push` will be fast-forward because it builds on the just-pushed HEAD.

**Why the abort-on-conflict path does not create debt:**

A rebase conflict means two agents both edited the same file in their respective commits and git cannot auto-merge them. This is a genuine content conflict, not a race condition artifact. The abort path leaves the commit in local history. The next mutex holder pushes it as part of its own push. Worst case: a conflict batch sits unpushed for one additional mutex cycle (≤ the next agent's commit, which is typically seconds to minutes in maintenance mode). The maximum lag is bounded by the commit frequency, not by time — a qualitatively different bound than the current "never pushed" situation.

**Why this does not create push-storm:**

Each mutex holder pushes exactly once (or twice under conflict). Push attempts are serialized by the mutex. There is no mechanism by which multiple agents push simultaneously. The concern with post-commit hooks was that they fire outside the mutex — that risk does not apply here.

**Concurrent-commit-race lesson compliance:**

The existing lesson ("serialize parallel workers sharing the git index") is satisfied: the mutex already serializes git-index access. Push is added to the same serialized window — no new race surface. The rebase-retry guard ensures that if another agent pushed between the local commit and the push attempt, the local history is brought up to date before the second attempt (this is exactly the scenario that makes bare `git push` fail non-fast-forward, and the guard handles it correctly).

---

## 5. Acceptance Test

**Test 1 — Steady-state lag bounded to 0**

After implementation, across one full maintenance cycle (2h window, normal commit volume):
```bash
git rev-list --count origin/main..HEAD
# Expected: 0
# Acceptable: ≤ 1 (one in-flight commit during measurement)
# Fail: ≥ 2 (indicates a push path was missed)
```
No manual `git pull --rebase && git push` reconciliation required.

**Test 2 — Non-fast-forward handled without error spam**

Artificially trigger a non-fast-forward scenario (two agents commit in rapid succession):
- Agent A holds mutex, commits + pushes successfully.
- Agent B acquires mutex immediately after A releases. Agent B's local HEAD is one behind origin (A just pushed).
- Agent B runs `git push origin main` → fails non-fast-forward.
- Agent B runs `git pull --rebase origin main` → succeeds (no conflict).
- Agent B runs `git push origin main` → succeeds (fast-forward onto A's commit).
- Bug channel: no message (success path).
- Post-test: `git rev-list --count origin/main..HEAD == 0`.

**Test 3 — Conflict abort is clean**

Artificially create a rebase conflict (two commits editing the same line):
- Rebase fails → `git rebase --abort` runs → repo returns to clean pre-rebase state.
- Bug channel receives one message: `[<agent>] commit-mutex: push rebase CONFLICT — rebase aborted; commit local-only.`
- `git status` shows clean working tree (no rebase in progress).
- Local commit exists in `git log --oneline -5`.
- The commit is pushed by the next mutex holder's push step.

**Test 4 — TTL sufficient under push + rebase worst case**

Worst case critical section timing: 2s (add/verify/commit) + 5s (push attempt 1 fail) + 8s (pull --rebase) + 5s (push attempt 2) = 20s. TTL=90s provides 4.5× headroom. Verify by monitoring `task_list_held` — no stale lock should appear for commit-mutex under normal operation.

---

## 6. Implementation Sequence (for pm decompose)

Suggested task order to minimize lock-step risk:

1. **Task A** — Update `.claude/skills/commit-mutex/SKILL.md`: add Step 3d-PUSH (§3.3), bump TTL to 90s (§3.2). This is the highest-impact change (covers all gateway-capable agents).
2. **Task B** — Update `.claude/skills/commit-boundary/SKILL.md`: add RULE 4 (§3.4). Covers agents-architect and agent-father.
3. **Task C** — Update `.claude/skills/commit/SKILL.md`: replace bare push in Step 3 (§3.5).
4. **Task D** — Fix `docs/agents/po/flow/main.md` inline commit block (§3.6): replace with skill reference.

Tasks A and C can run in parallel (different files, no dependency). Task B is independent. Task D depends only on Task A being deployed (the skill it references must have push in it). All four tasks are agent-father domain. No production code change; no Docker rebuild required.

---

## 7. Constraints Checklist

- [x] Does NOT touch `docs/agents/*/init.md`
- [x] Does NOT add a new cron or always-on component
- [x] Does NOT use post-commit hook
- [x] Inherits existing commit-mutex serialization — no new race surface
- [x] Rebase conflict aborts cleanly — no auto-resolve, no data loss
- [x] Bug-telegram on every failure path (complies with fail-loud-protocol)
- [x] TTL bumped to maintain ≥ 4× headroom over worst-case critical section
- [x] Explicit-stage-only discipline (RULE 1 / commit-boundary) unchanged
