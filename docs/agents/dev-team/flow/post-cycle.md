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

## Step 4.2 — Cold Eviction Backstop (HSC-6)

Run after Step 4.1 exits cleanly. Checks for terminal sprints and bloated done lanes; evicts to cold if found. This ensures bloat never re-accumulates between pm/task-archive cycles.

```bash
# Terminal sprint statuses — SSOT: apps/mcp-server/src/infrastructure/orchStateSchema.ts TERMINAL_SET
# {DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED} — must match scripts/orch-cold-evict.sh $TERMINAL_SPRINT_STATUSES exactly.
TERMINAL_SPRINT_N=$(jq '[.task_board.active_sprints[] | select(
  ((.status // "") | IN("DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED")) or
  ((.status // "") | startswith("BCTC-"))
)] | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")

# sprint_goal.entries[] — SEPARATE array from active_sprints[] above, keyed by sprint_id not id
# (FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT, 2026-07-02). Entries must already carry canonical tokens —
# scripts/orch-validate.mjs Stage 1d rejects drifted writes at source, so this predicate needs no
# alias/case-insensitive fallback (unlike the one-time scripts/fix-sprint-goal-status-drift-evict-normalize.jq).
SPRINT_GOAL_TERMINAL_N=$(jq '[(.sprint_goal.entries // [])[] | select(
  .sprint_id != null and ((.status // "") | IN("DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"))
)] | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")

DONE_N=$(jq '.task_board.done | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
DV_N=$(jq '.task_board.done_verified | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")

if [ "$TERMINAL_SPRINT_N" -gt 0 ] || [ "$SPRINT_GOAL_TERMINAL_N" -gt 0 ] || [ "$DONE_N" -gt 10 ] || [ "$DV_N" -gt 0 ]; then
  echo "[dev-team/post-cycle] Terminal bloat: sprints=$TERMINAL_SPRINT_N sprint_goal=$SPRINT_GOAL_TERMINAL_N done=$DONE_N done_verified=$DV_N — cold eviction"
  # Claim commit-mutex before running script
  # task_claim(task_kind="commit-mutex", task_id="dev-team-evict-<slug>", owner_agent="dev-team", ttl_seconds=120)
  bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"
  # Validate gate (SHG-3): run after eviction script, before git commit
  bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
    || { echo "[dev-team/post-cycle] ABORT: post-eviction validation failed"; exit 1; }
  YYYYMM=$(date -u +%Y-%m)
  git add docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
  git commit -m "chore(tasks): cold-evict terminal sprints/done lanes → archive/${YYYYMM}.json"
  # task_release(task_id: "dev-team-evict-<slug>")
fi
```

**Mutex contract:** claim `commit-mutex:main` (TTL=120s) before calling script; release after git commit.  
**Invariant (HSC-6):** `done_verified[]` never grows beyond 5 items in hot file after this hook is active.  
Script exit non-zero → log BUG-channel Telegram; skip commit; continue to Step 4.5 (do not block compact).

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

**Guard 1 — real push-blocker (in-progress rebase/merge or index.lock):**
> DO NOT guard on working-tree file dirtiness. The push runs in a `git worktree add … HEAD`
> sandbox on COMMITTED HEAD, isolated from the dirty main tree. orch-state.json + notebooks
> are perpetually dirty (cowork churn — the premise this push exists to overcome), so a
> file-dirtiness skip blocks ~every tick → backstop never fires
> (FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE). A dirty main tree cannot race a worktree push.
```bash
push_blocker=""
[ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] && push_blocker="rebase-in-progress"
[ -f .git/MERGE_HEAD ]   && push_blocker="merge-in-progress"
[ -f .git/index.lock ]   && push_blocker="index.lock-present"
```
If `push_blocker` is non-empty: the main repo is mid git-operation. **SKIP** this tick — log to WORK and continue to Step 4.9.

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
send_telegram(channel="work", message="[dev-team] PUSH-BACKSTOP fallback: ahead={ahead} > 20 but safety guard BLOCKED (push_blocker={push_blocker} / mutex_held={held.count}). Will retry when PO runs.")
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
