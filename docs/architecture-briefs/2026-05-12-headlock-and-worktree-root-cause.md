# HEAD.lock Recurrence + Worktree Orphan — Unified RCA

<!-- size-justification: 139L — added H4 confirmed mechanism, F1-F4 ranked options, c59+ impl plan, Q1/Q2 closed, c58 orphan note; stayed ≤140L cap -->

**Brief:** ARCH-HEADLOCK-RCA-c58 | **Date:** 2026-05-12 (updated c58 2026-05-13) | **Author:** agents-architect
**Status:** RESOLVED-MECHANISM, OPEN-FIX-PICK (F2 primary, F4 secondary selected)
**Cross-links:** [worktree-orphan-diagnostic](./2026-05-12-worktree-orphan-diagnostic.md) | [head-lock-self-cure](../protocols/head-lock-self-cure.md) | [h4-confirmed signal](../signals/processed/2026-05-13T004500Z-h4-confirmed-docker-virtiofs.json) | [container-restart-rca-v2](./2026-05-13-container-restart-rca-v2.md)

---

## 1. Executive Summary

Two distinct git-layer pathologies have blocked dev-team across **7 consecutive cron cycles (c52–c58)**:

- **Issue A** — `.git/HEAD.lock` + `index.lock` stale-file recurrence: 7 cycles; c58 CLEAN also caught `index.lock` race (concurrent cron), confirming BOTH lock paths affected. Self-cure guard (shipped c55, commit `57cbb376`) is symptomatic only.
- **Issue B** — SDK worktree orphan + stale lock on dead PIDs: 2 orphan worktrees cleared c55 (commit `4cea5eeb`); c58 CLEAN removed `.claude/worktrees/agent-a0f89162/` (orphan from ≤c54, no lock, not in `git worktree list`) — decrements outstanding orphan count.

**Root cause H4 CONFIRMED c57+c58.** PID 51247 = `com.apple.Virtualization.VirtualMachine.xpc` (Docker Desktop Apple Hypervisor) caught on 7th recurrence (evidence: `docs/agent-memory/sessions/preflight-lsof-20260512T233630Z.log`, commit `9d9aa017`).

---

## 2. Two Distinct Issues

| Dimension | Issue A: HEAD/index.lock recurrence | Issue B: Worktree orphan |
|---|---|---|
| Trigger | Docker VM VirtioFS scans project root mid git atomic op | SDK agent dies during worktree-isolated task |
| Scope | `.git/HEAD.lock` + `.git/index.lock` | `.claude/worktrees/<id>/` + branch |
| Evidence | c52–c58, PID 51247 lsof-confirmed c57+c58 | c47, c55 (2 orphans), c58 (1 orphan cleared) |
| Current mitigation | PREFLIGHT safe-remove at cycle start | Manual ops cleanup |
| Root cause status | **CONFIRMED H4** | **Known — SDK at-exit gap** |

---

## 3. HEAD.lock Root Cause Hypotheses (Issue A)

**H1 — Rapid sequential `git commit` races [REJECTED]**
Single-process recurrence (agent-father only, no parallelism) proves another process holds the lock. Intra-process race ruled out.

**H2 — Git hook crashes after lock acquisition [ELIMINATED]**
c57 probe: `.git/hooks/` empty except pre-push symlink; `commit.gpgsign` unset. No hook timing gap possible.

**H3 — SDK Bash wrapper / signal handler [REJECTED]**
c57+c58 lsof shows Apple VM PID 51247, not any SDK PID. SDK wrapper not the holder.

**H4 — macOS Docker-VM VirtioFS filesystem scan [CONFIRMED — c57+c58]**
`com.apple.Virtualization.VirtualMachine.xpc` (PID 51247) holds read-only fds on `.git/HEAD.lock`, `.git/refs/heads`, `.git/objects/...` during git's atomic ref-update (create → write → rename → unlink). Mechanism: Docker Desktop VirtioFS/GRPCFUSE file-sharing scans project root because `docker-compose.yml` bind-mounts subdirs (`./docs/agent-memory`, `./reports`, `./docs/data`, `./mcp.config.json`). VM opens lock files mid-creation, races git's atomic create+rename+unlink sequence.

---

## 4. Diagnostic Plan (COMPLETE — H4 CONFIRMED)

All five diagnostic steps executed across c57+c58. GIT_TRACE captured, hook audit done, lsof confirmed PID 51247. Diagnostic phase closed.

---

## 5. Worktree Orphan Root Cause (Issue B)

SDK `isolation: "worktree"` agents that die via process-kill or timeout leave orphaned worktree dirs + stale branches. No SDK at-exit cleanup. This is NOT related to Issue A.

**c58 note:** Orphan `.claude/worktrees/agent-a0f89162/` cleared (≤c54 origin, 29 April date, no lock, absent from `git worktree list`). Decrements outstanding orphan count by 1.

`git worktree prune` shipped in c57-T5 (commit `749a0b02`) now runs at PREFLIGHT. No TOCTOU observed across c57+c58.

---

## 6. Fix Options (ranked)

| ID | Type | Mechanism | Status |
|---|---|---|---|
| F1 | USER-ACTION | Add `.git/` to Docker Desktop file-sharing exclusions (Dashboard) | **BLOCKED** — requires user action; carry as USER queue item |
| F2 | CONFIG | Migrate bind-mounts to named volumes for host-write-safe paths. F2a: `./reports` + `./docs/data` (lowest risk). F2b: `./docs/agent-memory` after writer-audit (cron host commits). Zone: `cross-service/`. Size: S | **RECOMMENDED PRIMARY** |
| F3 | CONFIG | External `--git-dir` relocation | **REJECTED** — breaks IDE git integration, major operational change |
| F4 | DEFENSIVE | Retry wrapper: `git commit` + `git add` retry on index.lock/HEAD.lock (2s × 3). Update `head-lock-self-cure.md`. Keep PREFLIGHT instrumentation | **RECOMMENDED SECONDARY** (defense-in-depth) |

---

## 7. c59+ Implementation Plan

| Task | Agent | Description | AC |
|---|---|---|---|
| c59-T1 | developer/ops | **F2a** — migrate `./reports` + `./docs/data` to named volumes in `docker-compose.yml` | Bind-mounts reduced; alert-engine + BCTC reach paths via container path remap |
| c59-T2 | dev-team | **F4** — wrap `git commit`/`git add` calls in dev-team flow + `.claude/skills` with retry-on-index.lock/HEAD.lock (2s × 3); update `head-lock-self-cure.md` | Retry helper active; no regressions in flow tests |
| c60-T1 | developer | **F2b** — audit `./docs/agent-memory` writers (cron host commits); if all writes container-only, migrate to named volume | F2 complete; bind-mount surface minimal |
| open | user | **F1** — add `.git/` to Docker Desktop exclusions | Carry as user-queue item (Cloudflare bundle pattern) |

---

## 8. Open Questions (CLOSED)

1. ~~Are GPG commit signing hooks active?~~ **CLOSED c57** — `commit.gpgsign` unset; `.git/hooks/` empty except pre-push symlink.
2. ~~Does `git worktree prune` run safely with active dev-team session?~~ **CLOSED c57** — no TOCTOU observed across c57+c58; T5 shipped `749a0b02`.
