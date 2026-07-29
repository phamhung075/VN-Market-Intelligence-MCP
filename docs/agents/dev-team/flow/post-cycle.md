<!-- size-justification: 206L (86L overage) — Step 4/4.2/4.3/4.5/4.8/4.9 sub-flow: post-execution
     checks, cold-eviction backstop (now CANON-SCRIPT spec pointer to dev-team-tick-preflight.sh
     Step 5.5 — task UC-DTL-P2, 2026-07-15), compact-checkpoint, push-backstop fallback, and
     cycle-elapsed announce are all distinct load-bearing sequential steps; splitting fragments
     the post-cycle contract across files. UC-GCP-P8 2026-07-23: Step 4.3 stranded machine-state
     sweep added (CANON-SCRIPT pointer to scripts/agents-flow/stranded-state-sweep.sh --plan,
     bounded to <=20 body lines per the rescope) (+21L). -->
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

**CANON-SCRIPT (dev-team-loop-P2, task UC-DTL-P2, 2026-07-15):** this section is now the
SSOT **spec**, not the runtime path. The logic below runs from
`scripts/agents-flow/dev-team-tick-preflight.sh` Step 5.5 (`_step55_board_hygiene` /
`_step55_cold_evict_and_commit`) on every lock-winning tick (RUN + RUN-IDLE verdicts),
evaluated deterministically BEFORE the LLM-driven main.md body ever runs — so it is no
longer skipped by main.md's Session-Gate / orphan-adoption / monitoring-only-guard
"JUMP TO end" shortcuts, which is what made this backstop unreachable on idle ticks
(dev-team-loop-I2). Edit this spec first, then update the script to match — never the
reverse. See `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#dev-team-loop-P2`.

Below is the spec of record (Run after Step 4.1 exits cleanly. Checks whether a real
eviction run would change anything; evicts to cold if so. This ensures bloat never
re-accumulates between pm/task-archive cycles):

**FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP (2026-07-25):** the threshold used
to be a hand-rolled COUNT-only predicate (`done_n>10` etc) evaluated against this same
hot file, while `orch-cold-evict.sh`'s own done[] eviction gate is COUNT-AND-AGE
(rank>=keep_n AND older than `DONE_MAX_AGE_DAYS`, default 7d) — two different axes, so
the trigger could be permanently true (done_n stays >10) while the action was a
permanent no-op (every row failing one gate or the other). The proxy also had no
`signal_queue` term, even though the script always sweeps `signal_queue.archive[]` and
conditionally sweeps `signal_queue.rows[]` — this backstop was the sole automated
caller, so the ever-true `done_n` condition was, by accident, the only thing that ever
reached that sweep. Root cause also included a plain STRING sort on `created_at` in the
script (a poison non-ISO value such as `"unknown"` string-sorted ABOVE every real date
and ranked as newest, permanently un-evictable) and a jq shape bug that misreported an
empty `done_verified[]`/`signal_queue.archive[]` as `1` item instead of `0` in the
eviction preview. All three are fixed in `scripts/orch-cold-evict.sh` (jq epoch-sort +
phantom-array shape) and in the trigger below (ask the script itself, not a separate
proxy):

```bash
# Ask orch-cold-evict.sh itself (--dry-run) whether a real run would change the hot
# file — trigger and action are now the SAME computation, so they cannot drift apart
# again, and the signal_queue disjunct rides along for free (build_hot_temp always
# clears signal_queue.archive[] and filters signal_queue.rows[] by terminal status).
DRY_RUN_OUT=$(bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh" --dry-run 2>&1)
BYTE_REDUCTION=$(printf '%s\n' "$DRY_RUN_OUT" \
  | sed -n 's/.*Byte reduction:[[:space:]]*\(-\{0,1\}[0-9]\{1,\}\) bytes.*/\1/p' | tail -1)
[[ "$BYTE_REDUCTION" =~ ^-?[0-9]+$ ]] || BYTE_REDUCTION=0

if [ "$BYTE_REDUCTION" -gt 0 ]; then
  echo "[dev-team/post-cycle] orch-cold-evict.sh --dry-run reports the hot file would shrink by ${BYTE_REDUCTION} bytes — cold eviction"
  # Claim commit-mutex before running script — task_id is the SAME canonical
  # "commit-mutex:main" every other orch-state.json writer uses (a per-caller
  # slug would not mutex against other writers of the same hot file; corrected
  # 2026-07-15 alongside the Step 5.5 relocation, task UC-DTL-P2).
  # task_claim(task_kind="commit-mutex", task_id="commit-mutex:main", owner_agent="dev-team", ttl_seconds=120)
  bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"
  # Validate gate (SHG-3): run after eviction script, before git commit
  bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
    || { echo "[dev-team/post-cycle] ABORT: post-eviction validation failed"; exit 1; }
  YYYYMM=$(date -u +%Y-%m)
  git add docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
  git commit -m "chore(tasks): cold-evict terminal sprints/done lanes → archive/${YYYYMM}.json" \
    -- docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
  # task_release(task_id: "commit-mutex:main")
fi
```

**Mutex contract:** claim `commit-mutex:main` (TTL=120s) before calling script; release after git commit.  
**Invariant (HSC-6):** `done_verified[]` never grows beyond 5 items in hot file after this hook is active.  
Script exit non-zero → log BUG-channel Telegram; skip commit; continue to Step 4.5 (do not block compact).

---

## Step 4.3 — Stranded Machine-State Sweep (UC-GCP-P8)

**CANON-SCRIPT:** classification lives in `scripts/agents-flow/stranded-state-sweep.sh --plan` (AUTO-COMMIT / OWNED-ELSEWHERE / UNKNOWN — spec: `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#git-ci-publish-P8`). Run after Step 4.2, before Step 4.5.
```bash
PLAN="$(bash "$PROJECT_ROOT/scripts/agents-flow/stranded-state-sweep.sh" --plan)" && RC=0 || RC=$?
if [ "$RC" -ne 0 ]; then
  send_telegram(channel="bug", message="[dev-team] stranded-state-sweep FAILED rc=$RC — skip, retry next tick")
else
  # task_claim(task_kind="commit-mutex", task_id="commit-mutex:main", owner_agent="dev-team", ttl_seconds=120)
  echo "$PLAN" | jq -c '.auto_commit[]?' | while read -r c; do
    PATHS_STR="$(echo "$c" | jq -r '.paths | map(@sh) | join(" ")')"
    MSG="$(echo "$c" | jq -r '.commit_message')"
    eval "git add -- $PATHS_STR" && eval "git commit -m \"\$MSG\" -- $PATHS_STR"
  done
  # task_release(task_id: "commit-mutex:main")
  echo "$PLAN" | jq -c '.signals[]? | select(.dedup_skip==false)' | while read -r s; do
    # WRITE via .claude/skills/signal-dashboard/SKILL.md § WRITE — from="dev-team", to/type/summary/payload = s.to/s.type/s.summary/s.payload
  done
fi
```

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
