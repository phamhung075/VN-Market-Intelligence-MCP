# Dev Team — Step 4 & 4.5: Scan + Compact Checkpoint

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 4 / 4.5 dispatcher)

---

## Step 4 — Scan

**4.0 — Expire stale monitoring:**
```
expire_monitoring_reports()  # flips monitoring reports >72h to "wontfix"
log: "[dev-team] Expired {result.expired} monitoring reports"
```

**4.0.5 — Mock-in-production backstop:**
```bash
bash scripts/audits/mock-guard.sh --full
# Scopes to apps/*/src production paths; excludes tests/sandbox/scenarios/spike/.venv
```
If exit 1 (HARD-FAIL): write signal row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]`
  (skill: `.claude/skills/signal-dashboard/SKILL.md` § WRITE) with type `system-issue`,
  `to: "po"`, summary `mock-guard HARD-FAIL: fabricated data in production source`, payload_ref `null`.
  Also emit a second row with `to: "agents-architect"`.
  Do NOT block cycle exit — this is detective-only at the backstop level.
If exit 2 (CAUTION): log `[dev-team] mock-guard CAUTION: ambiguous markers found` to WORK only.
If exit 0: silent.

**4.1 — Post-execution checks:**
1. Non-main branches remain → add CLEAN batch → Step 1.
2. `read_telegram_reports(status="new").length > 0` → `send_telegram(channel="work", message="[dev-team] Found N new report(s)")` → Step 1.
3. `list_unresolved_reports()` non-monitoring count > 0 → `send_telegram(channel="work", message="[dev-team] Found N unresolved")` → Step 1.
4. **Monitoring-only guard (C-6):** ALL unresolved are monitoring → `send_telegram(channel="work", message="[dev-team] N in monitoring — no action.")` → archive + exit. (Prevents infinite loop.)
5. **Archive resolved** (fixed/wontfix/duplicate): `process_telegram_report(id, delete_telegram_message=true)` for each.
6. Nothing remaining → `send_telegram(channel="work", message="[dev-team] Dev loop idle.")` → EXIT.

---

## Step 4.5 — Compact Checkpoint

> Invariant: always `date -u +"%Y-%m-%dT%H:%M:%SZ"` — never speculative.

Run after Step 4 exits cleanly, before re-entering Step 1:
```
if ctx > 25%:
  1. log_agent_work(tag="sprint-boundary", state=current_sprint_id)
  2. Write docs/agent-memory/notebooks/main.md
  3. **Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
     git add docs/agent-memory/notebooks/main.md
     git commit -m "chore(memory/dev-team): notebook YYYY-MM-DD"
     # Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
  4. send_telegram(channel="work", message="[dev-team] Sprint boundary — offloaded state, ctx at N%")
  5. Return  # hook: ctx>40% → /compact | ctx 30-40% → decision:block | ctx<30% → silent
```
After compact: resume from Step 1 via smart-compact-protocol.md.

**If ctx ≤ 25%:** skip → Step 1.

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Self-critique** → skill: `.claude/skills/self-critique/SKILL.md`

---

## Step 4.8 — PUSH-BACKSTOP (fallback)

<!-- Fallback: PO is primary owner of push decisions (docs/agents/po/flow/main.md § Step PUSH-BACKSTOP).
     If PO is unavailable in this tick, dev-team checks and fires the backstop here. -->

**Context:** PO is the primary owner of "push to origin" decisions. This step is the secondary backstop — it activates only when dev-team runs without a concurrent PO spawn in the same tick. Uses identical guard logic and the same script as the PO step. Design authority: `docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md` §3.2 + §4.1.

**Guard 1 — dirty critical files:**
```bash
dirty_critical=$(git diff --name-only 2>/dev/null | grep -E 'docs/data/orch/orch-state\.json|docs/agent-memory/notebooks/')
```
If `dirty_critical` is non-empty: a bg agent is mid-write. **SKIP** this tick — log to WORK and continue to Step 4.9.

**Guard 2 — commit-mutex held:**
```
held = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "commit-mutex"})
```
If `held.count > 0`: a commit is in flight. **SKIP** this tick — log to WORK and continue to Step 4.9.

**Threshold check + dispatch (only if both guards pass):**
```bash
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$ahead" -gt "${PUSH_THRESHOLD:-20}" ]; then
  bash scripts/fleet-worktree-push.sh
fi
```
Script interface: `bash scripts/fleet-worktree-push.sh [--dry-run]`; `PUSH_THRESHOLD` env var overrides default of 20.
Exit 0 = push succeeded (script sends Telegram WORK notification internally).
Exit 1 = script aborted with BUG notification sent internally — do NOT double-notify; log skip to WORK and continue.

**If either guard blocks:**
```
send_telegram(channel="work", message="[dev-team] PUSH-BACKSTOP fallback: ahead={ahead} > 20 but safety guard BLOCKED (dirty_critical={dirty_critical} / mutex_held={held.count}). Will retry when PO runs.")
```

**If ahead ≤ 20:** silent no-op — continue to Step 4.9.

---

## Step 4.9 — Cycle Elapsed Announce

Run once, at the very end of every post-cycle exit path (after Step 4 idle/monitoring exits and after Step 4.5 compact checkpoint):

```
end_epoch   = $(date +%s)
elapsed_s   = end_epoch - start_epoch          # start_epoch set in Step 0-PREFLIGHT, same session
elapsed_min = elapsed_s / 60
elapsed_sec = elapsed_s % 60
send_telegram(channel="work", message="[dev-team] cycle DONE — elapsed {elapsed_s}s / {elapsed_min}m {elapsed_sec}s")
```

Note: `start_epoch` is a session-scoped variable defined in Step 0-PREFLIGHT of `main.md`. Sub-flows run within the same main-terminal session so the variable is available here without file I/O.
