# HEAD.lock Recurrence + Worktree Orphan — Unified RCA

<!-- size-justification: 118L — unified brief covering two distinct failure modes, diagnostic plan, mitigation options, c57+ task list -->

**Brief:** ARCH-HEADLOCK-RCA-c56 | **Date:** 2026-05-12 | **Author:** agents-architect
**Status:** OPEN — drives c57+ fix tasks
**Cross-links:** [worktree-orphan-diagnostic](./2026-05-12-worktree-orphan-diagnostic.md) | [head-lock-self-cure](../protocols/head-lock-self-cure.md) | [5th-recurrence signal](../signals/processed/2026-05-12T213640Z-headlock-5th-recurrence.routed-to-po.json)

---

## 1. Executive Summary

Two distinct git-layer pathologies have blocked dev-team across 5 consecutive cron cycles (c52–c56):

- **Issue A** — `.git/HEAD.lock` stale-file recurrence: 5 cycles, multiple occurrences within a single c56 session (agent-father, no worktrees, sequential commits). Self-cure guard (shipped c55, commit `57cbb376`) is symptomatic only.
- **Issue B** — SDK worktree orphan + stale lock on dead PIDs: 2 orphan worktrees cleared c55 (commit `4cea5eeb`); prior manifestation c47.

**c56 new data point invalidates original hypothesis.** HEAD.lock recurred 3x in one session by agent-father operating in main repo, single process, no parallelism. Worktrees are NOT required to trigger HEAD.lock. These are two separate root causes that need separate fixes.

---

## 2. Two Distinct Issues

| Dimension | Issue A: HEAD.lock recurrence | Issue B: Worktree orphan |
|---|---|---|
| Trigger | Sequential `git commit` calls in single Bash session | SDK agent dies during worktree-isolated task |
| Scope | Main repo `.git/HEAD.lock` | `.claude/worktrees/<id>/` + branch |
| Evidence | c52–c56 stale locks, c56 3x in one session | c47, c55 (2 orphans) |
| Current mitigation | PREFLIGHT safe-remove at cycle start | Manual ops cleanup |
| Root cause status | **Unknown — 4 hypotheses below** | **Known — SDK at-exit gap** |

---

## 3. HEAD.lock Root Cause Hypotheses (Issue A)

**H1 — Rapid sequential `git commit` races on `.git/HEAD.lock` [MOST LIKELY]**
Git ref-update writes HEAD atomically via lock acquire → write → rename. If the SDK Bash tool spawns each `git commit` call as a new shell subprocess, and an earlier git subprocess (e.g., post-commit hook, GPG signing) has not yet released HEAD.lock before the next `git add`/`git commit` runs, the second call fails with EEXIST. The lock file left is size=0 (write not started) or small (partial write). Age 12–30min indicates the crash occurs post-lock but pre-write or the lock survives a hook that was SIGKILLed.

**H2 — Git hook crashes after lock acquisition [HIGH probability secondary]**
A pre-commit or post-commit hook (any shell or node script launched by git) runs, git has already created HEAD.lock, the hook crashes (OOM, timeout, uncaught exception). Git never reaches the finally-release step. Lock survives indefinitely. This would explain why the lock recurs specifically on HEAD (ref update path) not on `index.lock` (staging path) — hooks fire after the index is flushed.

**H3 — SDK Bash wrapper / signal handler interferes with git cleanup**
Claude Code SDK Bash tool may use a pty/subprocess wrapper that intercepts SIGTERM/SIGINT. If git receives a signal mid-commit through this wrapper, the signal may be caught by the SDK layer, preventing git's own signal handler from running the lock cleanup. macOS-specific: `SIGPIPE` on a closed pty could trigger this silently.

**H4 — macOS APFS-on-Docker-VM filesystem semantics**
Docker Desktop on macOS uses a VirtualMachine layer (Apple Hypervisor). `.git/` is bind-mounted from the macOS host. File-creation operations (`O_CREAT | O_EXCL` for lock files) cross the VM boundary. Under high-frequency writes, APFS can coalesce or delay `unlink` operations — a lock the git process believes released may persist on the host side for ms-to-seconds. With rapid sequential commits from the SDK, this window is wide enough to produce EEXIST on the next attempt.

---

## 4. Diagnostic Plan

Concrete investigation steps to disambiguate H1–H4 before committing to a fix:

1. **GIT_TRACE audit (H1/H2):** Add `GIT_TRACE=1 GIT_TRACE_PACK_ACCESS=1` to dev-team flow's git commands for one cron cycle. Capture output to `docs/agent-memory/sessions/git-trace-<ts>.log`. Look for: time gap between `HEAD.lock` create and release; hook invocation lines; subprocess PIDs.
2. **Hook timing probe (H2):** List all hooks in `.git/hooks/` that are executable. Run `time git commit --no-verify` vs `time git commit` on a test commit. If `--no-verify` never produces HEAD.lock, H2 is confirmed.
3. **Lock file size at detection (H1/H2):** The PREFLIGHT algorithm already logs age. Add: `stat -f %z .git/HEAD.lock` at detection time. Size=0 → lock created but git never wrote → early crash (H2/H3). Size>0 → partial write → signal interruption (H3/H4).
4. **Filesystem layer test (H4):** Run identical `git commit` sequence from a non-Docker terminal (native macOS, same repo). If HEAD.lock never recurs → VM boundary confirmed (H4). If it does recur → H1/H2/H3 more likely.
5. **Process ancestry check (H3):** On next HEAD.lock detection, run `lsof .git/HEAD.lock` immediately before safe-remove. Record if any SDK wrapper PID appears in the lsof output.

---

## 5. Worktree Orphan Root Cause (Issue B)

Reuses c55 brief findings (see cross-link). Summary:

SDK `isolation: "worktree"` agents that die via process-kill or timeout leave:
- Worktree directory with stale lock referencing dead PID
- Orphaned branch (work may or may not be merged to main)
- No fallback cleanup path in the SDK's at-exit handler

This is **not** related to Issue A (HEAD.lock in main repo). The two issues share the symptom of stale lock files but differ in location, trigger, and fix path.

**Gap:** No automated gc runs at main-terminal startup to drain orphaned worktrees before the next dev cycle begins. Manual ops intervention is the current resolution path.

---

## 6. Mitigation Options

**For Issue A (HEAD.lock — do not implement until H1/H2 confirmed):**

| Option | Mechanism | Tradeoff |
|---|---|---|
| M-A1: Lock retry wrapper | Wrap every `git` call: if HEAD.lock detected, wait 2s × 3 retries | Safe, cheap, treats symptom |
| M-A2: Serialize commits via lock-manager script | Single `scripts/git-serialize.sh` serializes all git writes with `flock` | Eliminates races, adds I/O bottleneck |
| M-A3: Disable GPG signing in dev-flow | `git -c commit.gpgsign=false commit` | Eliminates hook-timing gap if H2 confirmed |
| M-A4: At-exit trap in flow scripts | `trap 'rm -f .git/HEAD.lock' EXIT` in dev-team Bash wrappers | POSIX portable, low risk, still symptomatic |

**For Issue B (worktree orphan):**

| Option | Mechanism | Tradeoff |
|---|---|---|
| M-B1: Startup gc in dev-team PREFLIGHT | `git worktree prune` + `git worktree list \| grep orphan → force-remove` | Prevents orphan buildup, safe |
| M-B2: 24h lock expiry | Lock files older than 24h auto-removed by PREFLIGHT | Time-based heuristic, covers missed cleanups |
| M-B3: SDK at-exit hook (upstream) | Register cleanup handler in SDK worktree spawn config | Ideal fix, requires SDK-level change |

---

## 7. Recommended c57+ Task List

| ID | Type | Description | Owner | Size |
|---|---|---|---|---|
| c57-T1 | investigation | Run GIT_TRACE + `--no-verify` probe for 1 cycle; log to session file; confirm H1 vs H2 | dev-team | S |
| c57-T2 | investigation | Add lock-size logging to PREFLIGHT; capture 3 occurrences | dev-team | XS |
| c57-T3 | fix (gated on T1) | If H2 confirmed: wrap `git commit` with `--no-verify` flag in dev-team Bash steps OR audit + fix crashing hook | developer | M |
| c57-T4 | fix (gated on T1) | If H1 confirmed (racing): add M-A2 lock-manager serializer or M-A1 retry wrapper to dev-team flow | dev-team | S |
| c57-T5 | fix | Add `git worktree prune` to dev-team PREFLIGHT (M-B1) — unblocks Issue B independently | dev-team | XS |
| c57-T6 | fix | Add M-B2 24h lock expiry check to PREFLIGHT for worktree lock files | dev-team | XS |
| c57-T7 | protocol | Update `head-lock-self-cure.md` with confirmed root cause + permanent fix path once T1/T2 close | agents-architect | S |

---

## 8. Open Questions

1. Are GPG commit signing hooks active in this repo? (`git config commit.gpgsign`) — if yes, H2 probability rises significantly.
2. Does `git worktree prune` run safely with an active dev-team session in progress? (Confirm no TOCTOU risk before shipping T5.)
