> Parent: `.claude/skills/commit-mutex/SKILL.md`
> Load trigger: (a) `task_claim` returns `claimed=false` WITH `current_holder` populated (genuine
> contention — need the backoff schedule), OR (b) `git push origin main` returns non-fast-forward
> (need the bounded rebase-retry protocol). The Rationale section is FYI-only — it never gates an action.

# Commit-Mutex — Reference (Lazy-Load)

## Backoff (contended path — `claimed=false` WITH `current_holder`)

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

After each sleep, retry `task_claim`. If `claimed = true` → back to SKILL.md Step 2 (critical section).

**Give-up (all 6 retries exhausted — C-4 required):**
```
send_telegram(channel="bug",
  "[<agent>] commit-mutex: exhausted 6 retries (~125s) — skipping commit, retry next cron tick. Paths: <paths>")
```
SKIP the commit. Do NOT stage. Do NOT restore foreign. Leave work in working tree.
Return to caller (caller resumes next cron tick from this commit step).

## Push retry (non-fast-forward path — SKILL.md Step 2d)

```bash
git push origin main
PUSH_EXIT=$?
if [ $PUSH_EXIT -ne 0 ]; then
  git pull --rebase origin main
  REBASE_EXIT=$?
  if [ $REBASE_EXIT -ne 0 ]; then
    # Rebase conflict — abort cleanly, do not leave rebase state
    git rebase --abort 2>/dev/null || true
    send_telegram(channel="bug",
      "[<agent>] commit-mutex: push rebase CONFLICT — rebase aborted; commit local-only. \
       Paths: <own_paths>. Manual reconcile required.")
    # Proceed to Step 2e (post-commit verify) then Step 3 (release) immediately
  else
    git push origin main
    PUSH2_EXIT=$?
    if [ $PUSH2_EXIT -ne 0 ]; then
      send_telegram(channel="bug",
        "[<agent>] commit-mutex: push retry FAILED after rebase; commit local-only. \
         Paths: <own_paths>.")
      # Proceed to Step 2e (post-commit verify) then Step 3 (release)
    fi
  fi
fi
```
MAX 2 total push attempts. Abort on conflict; never auto-resolve. Lock is still held during this
entire block. Origin lags by at most this one commit if both attempts fail.

**Hook-rejection push failure (alert-commander, discovered live 2026-08-25):** `PUSH_EXIT != 0`
is not always non-fast-forward — a local pre-push hook (e.g. `[pre-push] BLOCKED: doc-shaped
check(s) failed`, size-lint on a file unrelated to `own_paths`) rejects the same way. Before
attempting `git pull --rebase`, run `git status --porcelain`: if the working tree carries
UNSTAGED/UNTRACKED changes outside `own_paths` (a peer session's in-flight work), do NOT rebase
— `git pull --rebase` requires a clean tree and stashing/discarding those changes would touch
foreign paths, forbidden by this skill's own foreign-path rule. Skip straight to the same
terminal actions as a failed rebase-retry: `send_telegram(channel="bug", "[<agent>] commit-mutex:
push BLOCKED by <hook/gate> — unrelated to my change. Commit local-only. Manual reconcile
required.")` → Step 2e (post-commit verify) → Step 3 (release). Do not retry push again this
cycle — the gate is a repo-state condition, not resolved by retrying.

## Rationale (FYI — never gates an action)

**No-Heartbeat Rule:** commit-mutex does NOT require `task_heartbeat` calls. The critical section
(including push + worst-case rebase-retry) is 5–20s under normal conditions; TTL=90s is 4.5×
headroom. Adding heartbeat round-trips to this window would add unnecessary MCP latency. The TTL
handles crash-mid-section recovery automatically (next claimer wins after ≤90s).

**TTL and stale-lock reclaim:** TTL=90s. If the holder crashes before `task_release`, the lock
expires in ≤90s and the next `task_claim` call wins (overwrite semantics built into
`coordination.db`). No external watchdog needed. TTL rationale: 90s / 20s worst-case critical
section (commit + push + rebase-retry) = 4.5× headroom. See brief §3.2.

Inspect stuck locks:
```
call_tool(server="vn-market", tool="task_list_held", arguments={ kind: "commit-mutex", expired: true })
```
