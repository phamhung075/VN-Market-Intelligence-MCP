# HEAD.lock Self-Cure Protocol

**Zone:** cross-service/ | **Owner:** dev-team Step 0-PREFLIGHT

---

## (a) Symptom

`fatal: Unable to create '.git/HEAD.lock': File exists` — git operations fail.
Blocks notebook commits. Recurs across cron cycles if not structurally guarded.

---

## (b) Root Cause Hypotheses

| Hypothesis | Mechanism |
|---|---|
| macOS Spotlight indexer | `mds`/`mds_stores` opens `.git/` during index pass; crashes without releasing lock |
| fseventsd race | FS event daemon wakes on `.git/` write, holds briefly — Docker bind-mount amplifies timing gap |
| Host-vs-container metadata mismatch | Container git op leaves lock file on host-mounted `.git/`; host process never sees PID → lock survives |
| Prior git crash | Any `git` invocation killed (SIGKILL, OOM, power event) without cleanup |

**Recurrence pattern:** Inline-clearing (manual `rm`) treats symptom, not cause. Counter ≥3 triggers architect rethink per project memory.

---

## (c) Safe-Remove Algorithm

```
1. CHECK: does .git/HEAD.lock exist?
   NO  → skip, continue
   YES → step 2

2. AGE CHECK (macOS):
     age = now() - $(stat -f %m .git/HEAD.lock)
   AGE CHECK (Linux):
     age = now() - $(stat -c %Y .git/HEAD.lock)

3. PID CHECK:
     live_git = pgrep -x git | xargs -I{} lsof -p {} 2>/dev/null | grep '.git'
     pid_alive = (live_git != "")

4. DECISION:
   if age > 60s AND NOT pid_alive:
     → SAFE REMOVE
     rm .git/HEAD.lock
     audit_log = "[PREFLIGHT] HEAD.lock removed — age={age}s, no live git pid — {ISO timestamp}"
     send_telegram(work, audit_log)
     session_headlock_count++
     if session_headlock_count >= 3 within 24h:
       → ESCALATE: send_telegram(work, "HEAD.lock recurred 3x in 24h — architect rethink needed")
       → write docs/signals/{ts}-headlock-recurrence.json:
           {from: "dev-team", to: "architect", type: "recurring-bug",
            payload: {module: ".git/HEAD.lock", count: 3}}
   elif age <= 60s:
     → BLOCK: send_telegram(bug, "HEAD.lock too young ({age}s) — may be active write, escalate ops")
     → EXIT
   elif pid_alive:
     → BLOCK: send_telegram(bug, "HEAD.lock held by live git pid — escalate ops")
     → EXIT
```

---

## (d) Escalation Tree

```
HEAD.lock detected
├── age > 60s AND no live pid  → safe-remove + WORK audit log
│   └── count ≥ 3 in 24h      → WORK warning + architect signal (recurring-bug threshold)
├── age ≤ 60s                  → BUG channel "too young" + EXIT (do not remove)
└── live git pid holding .git/ → BUG channel "pid alive" + EXIT (do not remove)
```

Architect signal triggers root-cause rethink brief in `docs/architecture-briefs/`.

---

## (e) Audit Log Format

```
[PREFLIGHT] HEAD.lock removed — age=<N>s, no live git pid — <ISO-8601 UTC>
[PREFLIGHT] HEAD.lock too young — age=<N>s — blocked, ops escalated — <ISO-8601 UTC>
[PREFLIGHT] HEAD.lock pid-alive — blocked, ops escalated — <ISO-8601 UTC>
[PREFLIGHT] HEAD.lock recurred 3x in 24h — architect escalation sent — <ISO-8601 UTC>
```

Log lines written to: `docs/agent-memory/notebooks/main.md` (dev-team notebook, end of cycle).

---

## c57 diagnostic instrumentation (T1+T2+T5+T6 shipped)

**Ref:** `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md`
**Cycle:** c57 | **Task:** HEADLOCK-DIAGNOSTIC+WORKTREE-GC-c57 | **Owner:** agent-father

### What was added to PREFLIGHT (dev-team/main.md Step 0-PREFLIGHT)

**T2 — Lock-size logging:** On `HEAD.lock` detection, capture `stat -f %z .git/HEAD.lock` → `lock_size`. Log line now includes: `age={age}s size={lock_size}B pid_alive={bool}`. Size=0 → lock created but git never wrote (H2/H3 early crash). Size>0 → partial write → signal interruption (H3/H4).

**T1 — lsof + GIT_TRACE instrumentation:** Before safe-remove, run `lsof .git/HEAD.lock` + `ls -laT .git/HEAD.lock` → `docs/agent-memory/sessions/preflight-lsof-{ts}.log`. Future git commit steps SHOULD be wrapped: `GIT_TRACE=1 GIT_TRACE_PACK_ACCESS=1 git commit ... 2>&1 | tee docs/agent-memory/sessions/git-trace-{ts}.log` — captures hook invocation sequence to disambiguate H1 vs H2.

**T5 — Worktree prune:** After HEAD.lock processing (or in absent branch), run `git worktree prune -v 2>&1 | head -20`. If non-empty, send to WORK channel: `[PREFLIGHT] git worktree prune: {paths}`. Prevents orphaned worktree buildup from SDK agent crashes (Issue B).

**T6 — 24h worktree lock expiry:** After worktree prune, sweep `.claude/worktrees/*/.git/*.lock`. Each lock file older than 24h is force-removed with log: `[PREFLIGHT] expired worktree lock: {path} age={hours}h removed`. Skip if `.claude/worktrees/` directory absent.

### H2 eliminated (c57 pre-PO probe)

Pre-PO repo probe confirmed: no executable commit hooks in `.git/hooks/` (only `pre-push` symlink; no `pre-commit`, `post-commit`, `commit-msg`). GPG signing confirmed off (`commit.gpgsign=false`). H2 (hook crash after lock acquisition) eliminated as root cause. Remaining candidates: H1 (rapid sequential race), H3 (SDK signal handling), H4 (APFS-on-Docker-VM semantics).

### Evidence files

- `docs/agent-memory/sessions/preflight-lsof-*.log` — lsof output captured at each HEAD.lock detection
- `docs/agent-memory/sessions/git-trace-*.log` — GIT_TRACE output from wrapped commit steps (future)

### Next-step gate

3 PREFLIGHT fires with evidence logs captured → architect reviews `preflight-lsof-*.log` + `git-trace-*.log` → updates `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md` with confirmed root cause → T4 fix becomes specifiable (M-A1 retry / M-A2 serialize / M-A4 trap).
