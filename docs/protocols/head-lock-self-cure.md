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
