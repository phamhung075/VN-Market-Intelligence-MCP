<!-- size-justification: ~120L — complete acquire/critical-section/release protocol; backoff table, fail-closed C-2 path, jitter formula, foreign-restore rule, and give-up BUG-log are all load-bearing steps executed in sequence — cannot split. -->
# Skill: commit-mutex

**Trigger:** any flow step that performs `git add` + `git commit`
**Design brief:** `docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md`
**Protocol reference:** `docs/protocols/task-lock-protocol.md` (§ commit-mutex kind)
**PO ratification:** `docs/po-decisions/2026-05-24-commit-mutex-ratification.md` (C-1..C-4 binding)

---

## Purpose

Eliminate the verify→commit race on the shared git index. Only the agent holding
`commit-mutex:main` may be inside the `git add → git diff verify → git commit` critical section.
All other agents back off (exponential + jitter) or skip and retry next cron tick.

**Scope of the mutex:** ONLY the seconds-long critical section below. Everything before
(read, build, test, generate, signal emit, heartbeat for other lock kinds) is lock-free.

---

## Full Protocol

### Step 1 — Acquire

```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "commit-mutex:main",
  task_kind:   "commit-mutex",
  owner_agent: "<your-agent-id>",
  ttl_seconds: 60,
  payload:     JSON({ paths: ["<path1>", "<path2>", ...], intent: "<one-line commit summary>" })
})
```

**C-2 FAIL-CLOSED — MCP unavailable path (F3/F5 in task-lock-protocol.md):**
If `task_claim` returns a tool-not-found error, db_unavailable, or any exception:
- DO NOT proceed to stage or commit.
- SKIP the commit (leave work in working tree; it is preserved for next cycle).
- send_telegram(channel="bug", "[<agent>] commit-mutex: task_claim UNAVAILABLE — skipping commit, retry next tick")
- EXIT the commit step immediately. Return to caller.

**On claimed = false (another agent holds the lock):** proceed to Step 2 (backoff).

**On claimed = true:** proceed to Step 3 (critical section).

---

### Step 2 — Backoff (contended path)

Retry acquire with exponential backoff + jitter. Parameters per design brief §3.5:

| Attempt | Base wait | Jitter (±20%) | Max cap | Running total (approx) |
|---------|-----------|---------------|---------|------------------------|
| 1       | 5s        | ±1s           | —       | ~5s                    |
| 2       | 10s       | ±2s           | —       | ~15s                   |
| 3       | 20s       | ±4s           | —       | ~35s                   |
| 4       | 30s       | ±6s           | 30s     | ~65s                   |
| 5       | 30s       | ±6s           | 30s     | ~95s                   |
| 6       | 30s       | ±6s           | 30s     | ~125s                  |

**Jitter formula:** `actual_wait = base_wait * (0.8 + random() * 0.4)`
(`random()` = uniform [0,1]; result clipped to [base*0.8, base*1.2])

After each sleep, retry `task_claim`. If `claimed = true` → proceed to Step 3.

**Give-up (all 6 retries exhausted — C-4 required):**
```
send_telegram(channel="bug",
  "[<agent>] commit-mutex: exhausted 6 retries (~125s) — skipping commit, retry next cron tick. Paths: <paths>")
```
SKIP the commit. Do NOT stage. Do NOT restore foreign. Leave work in working tree.
Return to caller (caller resumes next cron tick from this commit step).

---

### Step 3 — Critical section (lock held)

Execute EXACTLY this sequence, no deviation:

```bash
# 3a. Stage own files — EXPLICIT PATHS ONLY. NEVER -A / . / dir
git add <path1> <path2> ...

# 3b. Verify — foreign-path check
STAGED=$(git diff --cached --name-only)
# Compare STAGED against your own-paths list.
# If STAGED contains any path NOT in own-paths:
#   git restore --staged <that-foreign-path>   ← ONLY foreign paths; NEVER own paths
#   Re-run STAGED check.
#   If still foreign after restore → go to Step 4 (release) then ABORT commit.
#   Log: "[<agent>] commit-mutex: foreign path found after restore — aborting commit"
#   send_telegram(channel="bug", "[<agent>] commit-mutex: foreign-path abort — <foreign-path>")

# 3c. Commit (only if verify is clean — STAGED == own-paths)
git commit -m "$(cat <<'EOF'
<type>(<scope>): <task-id> <summary>

<optional body>

Sprint: <sprint>
Task: <task-id>
AC: <criterion>
EOF
)"

# 3d. Post-commit verify — must be empty
git diff --cached --name-only
# If non-empty → send_telegram(channel="bug", "[<agent>] commit-mutex: residual staged files post-commit")
```

**Foreign-restore rule (non-negotiable):**
- ONLY `git restore --staged <foreign-path>` (staged-only; does NOT disturb foreign agent's working tree).
- NEVER `git restore --staged <own-path>` — that discards own work.
- NEVER `git reset HEAD <anything>`.

---

### Step 4 — Release (always — even on failure/abort)

```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id: "commit-mutex:main"
})
# ok=false is acceptable (expired or already released) — log at DEBUG, not error.
```

Release MUST be called on every exit path from Step 3 (success, foreign-abort, error).

---

## Wiring Pattern (for flow authors)

Replace any bare `git add ... && git commit` block with:

```
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: ["<exact paths this flow commits>"]
  intent:    "<one-line summary for payload>"
```

The skill is the ONLY permitted path to the git index for commit operations.
An agent that bypasses this skill bypasses its own flow's output boundary — a
fail-loud-protocol violation detectable in post-merge review.

---

## No-Heartbeat Rule

commit-mutex does NOT require `task_heartbeat` calls. The critical section is 2–10s
under normal conditions; TTL=60s is 6× headroom. Adding heartbeat round-trips to a
2–10s window would add unnecessary MCP latency. The TTL handles crash-mid-section
recovery automatically (next claimer wins after ≤60s).

---

## TTL and Stale-Lock Reclaim

TTL=60s. If the holder crashes before `task_release`, the lock expires in ≤60s and
the next `task_claim` call wins (overwrite semantics built into `coordination.db`).
No external watchdog needed. Inspect stuck locks via:
```
call_tool(server="vn-market", tool="task_list_held", arguments={ kind: "commit-mutex", expired: true })
```

---

## Quick Reference (copy-paste block for flow wiring)

```
## Commit step (mutex-guarded)
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: [<list exact file paths>]
  intent:    "<commit summary>"

Protocol:
1. task_claim("commit-mutex:main", kind="commit-mutex", ttl=60)
   - MCP error → bug-telegram → SKIP commit → EXIT
   - claimed=false → backoff (exp+jitter, 6 retries, ~125s max) → give-up → bug-telegram → SKIP
2. git add <exact own_paths only>
3. git diff --cached --name-only → if foreign: git restore --staged <foreign> only → re-check
4. git commit -m heredoc
5. git diff --cached --name-only → must be empty
6. task_release("commit-mutex:main")  ← always, even on abort
```
