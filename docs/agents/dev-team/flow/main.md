<!-- size-justification: 868L — thin dispatcher; PREFLIGHT script-first gate + JUMP-TO table route Steps 0a/0a.5/3/4 to sub-flows; Steps 0b/1/2 (session-gate, PO triage, planning matrix) too small to extract; full change history in git log. UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK 2026-07-22: +113L — Ready-Lane Consumer + Review-Lane QA-Drain sections (2 new idle-fallthrough pickup lanes, mirroring BOUNDED-1/SLS's existing inline shape; extracting to a sub-flow would break the single linear head-idle fall-through chain BOUNDED-1→SLS→RLC→QA-Drain that makes same-tick `.head`-collision-freedom provable by control-flow inspection alone). FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE 2026-07-23: +1L (868→869) — PROSE-SEQUENCING GATE clause appended to the existing BOUNDED-1 Promote paragraph + predicate-list update (in-place, same lines) + ONE new Reusable Scripts bullet for the new regression verifier's own line; no new section. -->
<!-- BGFAN-1: ALL Agent spawns from THIS dispatcher MUST use run_in_background=true. Canonical rule + rationale → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate. Background ≠ parallel: gated chain (po→ba→…→qa) still serializes on completion notification; independent tier tasks fan out concurrently. Commit-mutex serialization unchanged. -->
# Dev Team — Cron Orchestration Flow (Thin Dispatcher)

## Team Boundary (Sprint 2026-05-31 — expanded)

This flow may spawn any INDIVIDUAL agent. Taxonomy:

- **dev-core:** po, ba, architect, pm, developer, qa, fixer
- **dev-zone:** dev-mcp-server, dev-api-gateway, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-pdf-extractor, dev-rag-service, dev-frontend, dev-mainserver-crawls, dev-vps-crawls, dev-news-fetch
- **ops** lane (ops, ops-mainserver-fetch, ops-vps-fetch) — spawned on infra/fetch incident
- **maintenance** lane (claude-manager-helper, code-janitor, agent-father, agents-architect, system-auditor, cowork-refactory-expert, idea-forge) — on-demand only; mutex-wrap REQUIRED (see below)
- **cowork** lane (news-scout, market-watcher, bctc-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, fb-market-poster, qa-responder, market-analyst, refine_bctc_md) — on-demand only; mutex-wrap REQUIRED (see below)
<!-- roster mirrors docs/data/system-map.json .project.agents[]; re-sync here when roster changes -->

**NEVER spawn the `cowork-team` or `dev-team` dispatcher flows** — those are team dispatchers; spawning them here recurses infinitely. This guard is non-negotiable.
<!-- spawn-guard: policy-only — no runtime assertion; enforced by convention, not code check. Individual agents are safe; dispatcher FLOWS are not. -->

**Cross-team work** (cowork agent reports a code bug): write a signal row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md`. This remains the primary channel. Direct on-demand cowork spawn is ADDITIONAL (for cases where dev-team needs immediate cowork output after a code change).

**On-demand spawn of maintenance/cowork agents — mutex-wrap REQUIRED:**
Before spawning any agent from the maintenance or cowork lanes, claim a lock keyed on the agent id to prevent double-running a concurrent cron instance:
```
agent_spawn_key = "task:on-demand:" + agent_id + ":" + $(date -u +"%Y%m%d")
# SAFE-JSON: payload built as a structured object — NEVER interpolate agent_id into a /bin/sh string.
# INVARIANT (DRAIN-INJECTION-SAFE): no signal/payload/DASHBOARD field may appear in a shell command line.
# Safe patterns: (a) jq --arg for bash SQL/JSON steps; (b) structured object passed to call_tool; (c) sqlite3 db < file.
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              agent_spawn_key,
  task_kind:            "sprint-task",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          3600,
  payload:              "{\"site\":\"on-demand\",\"spawning\":\"" + agent_id + "\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
})
if not outer_claim.claimed:
  log "[dev-team] SKIP on-demand " + agent_id + " — cron holds lock (" + outer_claim.current_holder.owner_agent + ")"
  send_telegram(channel="work", message="[dev-team] on-demand " + agent_id + " SKIP — cron holds lock")
  # fall through; do NOT spawn
else:
  try:
    Agent(agent_id, context..., run_in_background=true)   # (background) — BGFAN-1
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: agent_spawn_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
```
Skill ref: `.claude/skills/task-lock/SKILL.md` § Dispatcher-Wrap Pattern.

## Input
`read_telegram_reports(status="new")` | `list_unresolved_reports()` | `docs/data/orch/orch-state.json` `.task_board` | git log (last 30 commits) | `git branch`

## Output
Tasks executed → `docs/data/orch/orch-state.json` `.task_board` updated → WORK notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md`

| Spawn context | JUMP TO | Detail file |
|---|---|---|
| Cold start / cron tick | `preflight` | inline below |
| HEAD.lock cleared / preflight pass | `drain-signals` | `drain-signals.md` (includes Step 0a-D: DASHBOARD.md cross-team drain) |
| CI probe (after drain-signals) | `ci-health-probe` | `ci-health-probe.md` |
| Pipeline resume (`in_progress`) | `pipeline-resume` | inline below |
| FIX / direct task | `execute` | `execute-tier.md` |
| Post-execution verification only | `post-cycle` | `post-cycle.md` |
| Empty signals + empty TASKS.md + no reports | `session-gate` | inline below |

---

<!-- jump:preflight -->
## Step 0-PREFLIGHT — Dev-team Tick Preflight (TOKEN-ECONOMY-TICK-PREFLIGHT WU-2)

Run the deterministic preflight script FIRST and capture its one-line JSON verdict — this
replaces the LLM-narrated presence/SF-1/fire-election chain below on the common RUN/SKIP path
(risk notes R6/R7/R8, `docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md`). Self-arm (cron-detect-loop
re-registration) is **no longer read from here** — `CronCreate`/`CronList`/`CronDelete` are Claude
Code CLI-native tools, unreachable from a curl-based script, so self-arm now fires FIRST, on every
tick (RUN and SKIP alike), from the `.claude/skills/cron-detect-loop/SKILL.md` Job 1 `CronCreate`
`prompt:` text itself — before this script even runs.

```bash
VERDICT_JSON=$(bash "$PROJECT_ROOT/scripts/agents-flow/dev-team-tick-preflight.sh")
PREFLIGHT_RC=$?
VERDICT=$(echo "$VERDICT_JSON" | jq -r '.verdict')
```

Script SSOT: `scripts/agents-flow/dev-team-tick-preflight.sh` (uses shared
`scripts/agents-flow/mcp-call.sh`). Requires `$CLAUDE_CODE_SESSION_ID` in the environment.

### JUMP-TO table (preflight verdict)

| Verdict | Action |
|---|---|
| `RUN` | SF-1 (`dev-team-cron-singleton`, TTL=5400) + fire-election (`cron:dev-team:<tick>`, TTL=600) locks are HELD by this session. **Do NOT re-run presence/SF-1/fire-election below** — JUMP TO `gcc-preflight` (GCC-PREFLIGHT read + HEAD.lock/worktree-GC), skipping the START telegram/self-arm/presence/SF-1/fire-election steps entirely (already satisfied by the script). Both locks stay held for the rest of the dispatch body — release-at-end (`telemetry`/`jump:end`) is unchanged. |
| `RUN-IDLE` | Same precondition as `RUN` — SF-1 + fire-election locks are HELD by this session; Step 5 of the script only evaluates idle-emptiness after winning both. `docs/signals/*.json`, `signals.db` freshness, `signal_queue` NEW rows, and `task_board.active_sprints` are ALL empty/fresh (`$VERDICT_JSON.detail` names the checked fields). Mirrors cowork's silent-release (`_step8_silent_release`, `scripts/agents-flow/cowork-tick-preflight.sh` lines 74-105): emit last state (`log "[dev-team] RUN-IDLE — " + $VERDICT_JSON.detail`) + release both locks + **zero commit**. Do NOT run `gcc-preflight` (no HEAD.lock/worktree-GC) and do NOT JUMP TO `drain-signals` (no signal drain, no board write, no `chore(signals): drain + prune` commit) — set `FIRE_TICK=$(jq -r '.tick' <<< "$VERDICT_JSON")` so the existing `jump:end` SF-1/fire-election release logic fires for both locks, then JUMP TO `end` directly. |
| `SKIP` | Done. Script already sent the `work`-channel telegram and preserved R7 lock semantics: SF-1-claim-failed → nothing released (never held it); fire-election-lost-after-SF-1-won → SF-1 released. EXIT — no further reads needed. |
| `ERROR` | Script hit a transport/malformed-response/local-guard failure (`$VERDICT_JSON.detail` has why — lock state may be undefined). JUMP TO `preflight-fallback` below (unchanged, never deleted) — read from there as if the script never ran. |

---

<!-- jump:preflight-fallback -->
## Step 0-PREFLIGHT-FALLBACK — Original Presence/SF-1/Fire-Election (ERROR-fallback only)

> Reached ONLY on `ERROR` verdict from `scripts/agents-flow/dev-team-tick-preflight.sh` above (or
> when this flow is run manually / pre-WU-2). Kept verbatim below, never deleted — R6/R7/R8
> fallback guarantee, see `docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md` § Design decisions.

```
ts          = $(date -u +%Y%m%dT%H%M%SZ)
start_epoch = $(date +%s)
ts_human    = $(date "+%Y-%m-%d %H:%M:%S %Z")   # local wall-clock for readability
send_telegram(channel="work", message="[dev-team] cron START — actual fire {ts_human} ({ts})")
# Self-arm detect→plan loop (idempotent — skill Step 1 CronList guard makes this a no-op once armed)
→ skill: .claude/skills/cron-detect-loop/SKILL.md
# Guarantees system-auditor Tier-1/2/3 + dev-team crons stay live while this always-on session runs.

# P2-PRESENCE: session-presence self-registration — fires before SF-1 so this session is visible
# even when SF-1 causes an early exit on duplicate-tick guard.
# dispatch-claim SKILL § Step 0a is authoritative — this is the dev-team instantiation.
# Non-adoptable: presence row expiry = liveness GC, NEVER orphan-signal.
presence_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind:            "session-presence",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          1800,
  payload:              {
    agent_id:     "dev-team",
    host:         $(hostname),
    started_at:   ts,           # reuse ts set above (UTC ISO string)
    current_task: "preflight"
  }
})
if not presence_result.claimed:
  if presence_result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: "session-presence:" + $CLAUDE_CODE_SESSION_ID,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
# Presence result is NEVER a gate — always proceed to SF-1.

# SF-1: SINGLE-FLIGHT GUARD — session-level cron overlap prevention (TTL-only, no owner-session binding)
# Survives mcp-server restart: TTL clock continues; orphaned lock expiry is natural. → memory: lock_orphaned_by_rebuild
sf_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "dev-team-cron-singleton",
  task_kind:            "sprint-task",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          5400,          # 90min — 1.5× observed 99th-pct tick duration
  payload:              {"site": "SF-1", "tick": ts}   # structured object — DRAIN-INJECTION-SAFE
})
if not sf_result.claimed:
  log "[dev-team] SF-1 SKIP — session already running (holder: " + sf_result.current_holder.owner_agent + " since " + sf_result.current_holder.claimed_at + ")"
  call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: "[dev-team] cron SKIP — single-flight held by peer (TTL ~" + sf_result.current_holder.expires_in_s + "s)"})
  JUMP TO end   # exit immediately — do NOT run any step

# SF-1 claimed — proceed to fire-time election (Step [3])

# P3-FIRE-ELECTION Step [3] — Cross-session tick dedup (NEW — TASK_1994)
# Fires AFTER SF-1 (session-level guard), BEFORE HEAD.lock guard.
# SF-1 ensures this session is not mid-tick from a prior tick. Fire-election ensures this
# session leads THIS specific tick vs any other session attempting the same tick.
# On election LOSS: release SF-1 (so this session can win SF-1 on next tick) then EXIT.
# On election WIN: proceed with full HEAD.lock guard + dispatch pipeline.
# Spec: addendum §C.2 (ordering), §C.3 (why SF-1 first), §C.4 (deadlock-free).

# compute_tick_boundary for expression "7,37 * * * *" (boundary minutes: 07, 37)
# Largest scheduled minute ≤ current_minute.
CURRENT_MINUTE_FIREELECT=$(date -u +%M)
if [ "$CURRENT_MINUTE_FIREELECT" -ge 37 ]; then
  FIRE_TICK_BOUND="37"
else
  FIRE_TICK_BOUND="07"
fi
FIRE_TICK=$(date -u +"%Y-%m-%dT%H:${FIRE_TICK_BOUND}Z")
# e.g. fire at 14:38Z → FIRE_TICK="2026-06-28T14:37Z"
# e.g. fire at 14:09Z → FIRE_TICK="2026-06-28T14:07Z" (jitter absorbed)

fire_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "cron:dev-team:" + FIRE_TICK,
  task_kind:            "sprint-task",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tick": FIRE_TICK}
})

if not fire_result.claimed:
  fire_peer = fire_result.current_holder.owner_client_session
  if fire_peer == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant: this session already holds this tick's key (restart within same session mid-tick).
    log "[dev-team] fire-election RE-ENTRANT tick=" + FIRE_TICK + " — renewing + proceeding"
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "cron:dev-team:" + FIRE_TICK,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    # → proceed (SF-1 is held, fire-election renewed)
  else:
    # Peer session leads this tick — release SF-1 so this session is free for the next tick.
    log "[dev-team] fire-election SKIP tick=" + FIRE_TICK + " — peer=" + fire_peer + " leads; releasing SF-1"
    call_tool(server="vn-market", tool="send_telegram", arguments={
      channel: "work",
      message: "[dev-team] fire-election SKIP tick=" + FIRE_TICK + " (peer session leads)"
    })
    call_tool(server="vn-market", tool="task_release", arguments={
      task_id:              "dev-team-cron-singleton",
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    JUMP TO end   # EXIT cleanly — no head set, no dispatch, no orphan work
# else: fire_result.claimed == true → won the election → FIRE_TICK is the active tick key
```

<!-- jump:gcc-preflight -->
## Step 0-PREFLIGHT-CONTINUE — GCC-PREFLIGHT + HEAD.lock Guard + Worktree GC

> Reached from BOTH the `RUN` verdict above (script already handled presence/SF-1/fire-election —
> no duplicate work) AND as the natural continuation of `preflight-fallback` immediately above it
> on the `ERROR` path. Same content either way.

```
# GCC-PREFLIGHT: load gateway call contract before any call_tool use
→ Read docs/standards/gateway-call-contract.md   (one file, ~60L, ~250 tokens — closes 6 recurring tool-call error classes)

if .git/HEAD.lock not exists:
  # T5: worktree prune (always, lock absent branch)
  pruned = $(git worktree prune -v 2>&1 | head -20)
  if pruned non-empty: send_telegram(channel="work", message="[PREFLIGHT] git worktree prune: {pruned}")
  # T6: 24h worktree lock expiry sweep
  if .claude/worktrees/ exists:
    for each f in .claude/worktrees/*/.git/*.lock:
      age_h = (now() - mtime(f)) / 3600
      if age_h > 24:
        log "[PREFLIGHT] expired worktree lock: {f} age={age_h}h removed"
        rm -f {f}
  JUMP TO drain-signals

else:
  # T2: capture lock size for diagnostics
  lock_size = $(stat -f %z .git/HEAD.lock)   # macOS; Linux: stat -c %s
  age = (macOS) now() - $(stat -f %m .git/HEAD.lock)
        (linux)  now() - $(stat -c %Y .git/HEAD.lock)
  pid_alive = pgrep -x git | xargs -I{} lsof -p {} 2>/dev/null | grep '.git' → non-empty?

  if age > 60s AND NOT pid_alive:
    # T1: capture lsof + lock metadata before removal
    lsof .git/HEAD.lock 2>&1 > docs/agent-memory/sessions/preflight-lsof-{ts}.log
    ls -laT .git/HEAD.lock >> docs/agent-memory/sessions/preflight-lsof-{ts}.log
    # F4 (c59-T2): all commit steps use git_commit_retry idiom on index.lock/HEAD.lock
    #   → docs/protocols/head-lock-self-cure.md § F4
    rm .git/HEAD.lock
    send_telegram(channel="work", message="[PREFLIGHT] HEAD.lock removed — age={age}s size={lock_size}B pid_alive=false — {ISO timestamp}")
    session_headlock_count++
    if session_headlock_count >= 3 within 24h:
      send_telegram(channel="work", message="[dev-team] HEAD.lock recurred 3x in 24h — architect rethink needed")
      write docs/signals/{ts}-headlock-recurrence.json:
        {from: "dev-team", to: "architect", type: "recurring-bug", payload: {module: ".git/HEAD.lock", count: 3}}
    # T5+T6: run worktree gc after lock clearance too
    pruned = $(git worktree prune -v 2>&1 | head -20)
    if pruned non-empty: send_telegram(channel="work", message="[PREFLIGHT] git worktree prune: {pruned}")
    if .claude/worktrees/ exists:
      for each f in .claude/worktrees/*/.git/*.lock:
        age_h = (now() - mtime(f)) / 3600
        if age_h > 24: log "[PREFLIGHT] expired worktree lock: {f} age={age_h}h removed"; rm -f {f}
    JUMP TO drain-signals

  elif age <= 60s:
    send_telegram(channel="bug", message="[dev-team] HEAD.lock too young ({age}s) size={lock_size}B — may be active write — escalate ops")
    JUMP TO end

  elif pid_alive:
    send_telegram(channel="bug", message="[dev-team] HEAD.lock held by live git pid size={lock_size}B — escalate ops")
    JUMP TO end
```

---

<!-- jump:drain-signals -->
## Step 0a — Drain `docs/signals/` + Orphan-Signal Adoption

> **Honest bound:** zero live sessions = zero execution; the reaper only makes work ADOPTABLE, it never self-heals execution.

### Step 0a-A: Agent-signals drain

→ Run sub-flow: `docs/agents/dev-team/flow/drain-signals.md`

Output: `pendingSignals[]` for Step 1, or empty.

### Step 0a-B: Orphan-signal adoption (P1.5-AF-2 — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · TASK_1987)

After draining agent-signals, probe for adoptable orphaned sprint-tasks from dead dev-team sessions:

```
N_MAX = 3   # poison-task threshold (configurable; global default = 3)

orphan_signals = call_tool(server="vn-market", tool="task_list_held", arguments={
  kind:        "orphan-signal",
  owner_agent: "dev-team"
})
# READ-ONLY probe — DoD-P15-2: NEVER use task_heartbeat/task_claim to probe published artifacts

for each signal in orphan_signals where signal.payload.original_task_kind == "sprint-task":
  original_task_id           = signal.payload.original_task_id
  redispatch_count           = signal.payload.redispatch_count   # DoD-P15-3: carry forward
  last_payload               = signal.payload.last_payload
  dead_session               = signal.payload.original_owner_client_session
  task_zone                  = signal.payload.zone ?? infer_from_task_id(original_task_id)

  if redispatch_count >= N_MAX:
    # Router P1.5-AF-1 handles escalation — dev-team SKIPS; do NOT re-dispatch
    log "[dev-team] orphan-signal:{original_task_id} redispatch_count={redispatch_count} >= N_MAX — skip (router escalates)"
    continue

  # Claim the original task_id (stale-steal succeeds: reaper deleted the original row)
  adopt_result = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:              original_task_id,
    task_kind:            "sprint-task",
    owner_agent:          "dev-team",
    owner_client_session: $CLAUDE_CODE_SESSION_ID,   # REQUIRED — authoritative key
    ttl_seconds:          3600,
    payload:              {"site": "orphan-adoption",
                           "adopted_from": dead_session,
                           "redispatch_count": redispatch_count}   # DoD-P15-3: carry forward
  })

  if not adopt_result.claimed:
    log "[dev-team] orphan-signal:{original_task_id} — adoption lost to peer; skip"
    continue

  # --- DoD-P15-1 GATE: Tree-Hygiene PRECONDITION (MANDATORY — load-bearing) ---
  # A dead worker's uncommitted edits are LIVE in the shared working tree and corrupt until reverted.
  # This gate MUST run BEFORE any resume work. The checkpoint SHA is blind to live tree state.
  #
  # Run git status --porcelain scoped to the task zone:
  uncommitted = $(git status --porcelain -- {task_zone} | grep -E '^[ M]M')
  reverted_files = []
  for each line in uncommitted:
    filepath = line[3:]   # strip status prefix
    git checkout -- {filepath}
    reverted_files.append(filepath)
    log "[dev-team] tree-hygiene: reverted uncommitted edit in {filepath} (dead session: {dead_session})"

  # Leave untracked files in place (e.g. .DS_Store, build artifacts, node_modules/ if not tracked)
  # Lines starting with '??' in git status are untracked — leave them

  # Surface reverted list in board note (see board flip below)
  tree_hygiene_note = "tree-hygiene: reverted " + len(reverted_files) + " file(s): " + join(reverted_files, ", ")
  send_telegram(channel="work",
    message="[dev-team] Adopted orphan task {original_task_id} from dead session {dead_session}. {tree_hygiene_note}")

  # --- Read checkpoint from signal payload (§6.5.5 resume contract) ---
  git_sha = last_payload.git_sha ?? null

  if git_sha:
    # Verify checkpoint is in repo history
    sha_valid = $(git log --oneline -5 {git_sha} 2>&1 | grep -c {git_sha})
    if sha_valid == 0:
      send_telegram(channel="bug",
        message="[dev-team] Orphan adoption {original_task_id}: git_sha {git_sha} not in history — cannot resume; skip")
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id: original_task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID
      })
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id: "orphan-signal:" + original_task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID
      })
      continue
    # Checkpoint valid — continue work from git_sha (DO NOT re-run already-committed steps)
    log "[dev-team] resuming from checkpoint SHA={git_sha} (DoD-P15-3 redispatch_count={redispatch_count})"
  else:
    # No git SHA checkpoint — resume from board state (task_board entry is authoritative)
    log "[dev-team] no git_sha checkpoint in orphan-signal payload; resuming from board state"

  # --- Board flip: update assigned_to, leave status=in_progress (re-assign only) ---
  # MUST route via scripts/orch-apply.sh (NEVER raw write — SSOT-W1-ORCH-APPLY-WRAPPER)
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # DoD-P15-2: check for cowork-slot or cron published artifact before re-running
  # (sprint-task checkpoint is git SHA; this check is belt-and-suspenders for mixed-kind adoptions)
  jq --arg tid "{original_task_id}" --arg now "$NOW" --arg note "{tree_hygiene_note}" \
    --arg session "$CLAUDE_CODE_SESSION_ID" \
    '(.task_board.active_sprints[].tasks[] | select(.id == $tid))
     |= (.assigned_to = $session | .adopted_at = $now | .tree_hygiene_note = $note)' \
    docs/data/orch/orch-state.json \
    | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

  # --- Release the orphan-signal row after successful adoption ---
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id:              "orphan-signal:" + original_task_id,
    owner_client_session: $CLAUDE_CODE_SESSION_ID
  })

  # --- Resume work ---
  # Treat adopted task as the next task to execute — prepend to work queue
  # Spawn the appropriate agent with checkpoint; dev-team owns the original task_id lock
  Agent(<zone-agent>, prompt="run docs/agents/<zone-agent>/flow/main.md
        coordination_session=$CLAUDE_CODE_SESSION_ID
        task={original_task_id}
        checkpoint={git_sha}
        redispatch_count={redispatch_count}
        mode=adopt-resume",
        run_in_background=true)   # BGFAN-1
  # Adoption path exits here — release original lock inside the spawned agent's finally block
  JUMP TO end   # adopted task queued; do not process further signals in this tick
```

**Scope note:** Step 0a-B handles `original_task_kind="sprint-task"` only. `cowork-slot` and
`dashboard-row` orphan-signals directed to `owner_agent="dev-team"` are rare edge cases;
route to PO for manual triage if encountered (they carry a published-artifact checkpoint check
per DoD-P15-2 that requires cowork context dev-team does not own).

---

**After Steps 0a-A and 0a-B:**

If `pendingSignals[]` empty AND `docs/data/orch/orch-state.json` `.task_board` empty AND no Telegram reports → JUMP TO `session-gate`.

---

<!-- jump:ci-health-probe -->
## Step 0a.5 — CI Health Probe

→ Run sub-flow: `docs/agents/dev-team/flow/ci-health-probe.md`

Non-fatal: probe errors log and fall through. On RED HEAD: emits `ci_red` signal to `docs/signals/` (routed to PO in Step 1).
`pendingSignals[]` is unchanged if CI is GREEN or probe skips — no signal appended.

---

<!-- jump:pipeline-resume -->
## Step 0b — Pipeline Resume + Session Gate

Slice `.head` from `docs/data/orch/orch-state.json` (~150 tokens — see `docs/standards/orch-state-access.md §1`):
```bash
# NEVER cat the full file — jq slice only
HEAD=$(jq -c '.head' docs/data/orch/orch-state.json)
head_status       =$(printf '%s' "$HEAD" | jq -r '.status')
head_active_task  =$(printf '%s' "$HEAD" | jq -r '.active_task_id')
head_next_agent   =$(printf '%s' "$HEAD" | jq -r '.next_agent')
head_next_action  =$(printf '%s' "$HEAD" | jq -r '.next_action')
head_updated_at   =$(printf '%s' "$HEAD" | jq -r '.updated_at')
```
`narrative.*` block is lazy-loaded only on explicit human-facing resume request — do NOT read at cold start.

**v1 legacy (no `head` key):** field names were `status`/`activeTaskId`/`nextAgent`/`updatedAt` directly at root. Self-heal to v4 on next write (first writer detects `._meta.schema` absent or `< "v4"` and writes v4 envelope with canonical `_meta: {updated_at, updated_by, schema: "v4", ssot: true}`).

- `head.status == "in_progress"` AND `head.next_agent` non-null AND `head.updated_at < 24h` →
  **WF-1 BLOCKED-task check (AC-WF1-5 — run FIRST, before S2 dispatcher-wrap):**
  ```bash
  task_status=$(jq -r --arg tid "$head_active_task" \
    '.task_board.active_sprints[].tasks[] | select(.id == $tid or .task_id == $tid) | .status' \
    docs/data/orch/orch-state.json | head -1)
  if [ "$task_status" = "BLOCKED" ]; then
    # BLOCKED task — reset head to idle so pipeline-resume never re-spawns it
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
      '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    send_telegram(channel="work", "[dev-team] head task " + head_active_task + " is BLOCKED — head reset idle, routing to triage")
    JUMP TO drain-signals   # PO triage picks up from here
  fi
  ```
  If task is NOT BLOCKED → dispatcher-wrap then spawn `head.next_agent`. JUMP TO `execute`.
  ```
  # S2 dispatcher-wrap:
  bare_task_id = head.active_task_id   # from docs/data/orch/orch-state.json .head block
  resume_key   = "task:" + bare_task_id
  # SAFE-JSON: head.next_agent is read from orch-state.json (agent-authored) — NEVER interpolate into /bin/sh.
  # Use structured object passed to call_tool (MCP gateway, no shell exposure).
  outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: resume_key, task_kind: "sprint-task",
    owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
    ttl_seconds: 3600,
    payload: "{\"site\":\"S2\",\"spawning\":\"" + head.next_agent + "\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
  })
  if not outer_claim.claimed:
    log "[dev-team] SKIP pipeline resume " + resume_key + " — held by peer session"
    # fall through to Step 1 (do NOT spawn)
  else:
    try:
      Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1; await task notification before next gate
    finally:
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
      # ok=false is acceptable (TTL expired or inner self-claim already released)
    JUMP TO execute
  ```
- `head.status == "in_progress"` AND `head.updated_at ≥ 24h` → stale crash, reset `head.status` to `"idle"`. Fall through to Step 1.
- `head.status == "idle"` or `head.status == "done"` (Close Gate Step-6/PM-closeout terminal reset — `active_task_id:null, next_agent:"router"`; established convention across multiple prior closes, e.g. FACTORY-MACRO-split-repositories, FACTORY-DOMAIN-split-cascade-engine) or `head` missing or v1 schema → fall through to **Idle-capacity backlog pickup (BOUNDED-1)** below, then Step 1.

---

### Idle-capacity backlog pickup (BOUNDED-1)

Runs ONLY on the head-idle fall-through above (`head.status == "idle"` or `head` missing/v1), BEFORE PO triage is spawned. Fixes the root-cause gap SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1: with `ready[]=0` and `in_progress[]=0`, nothing previously promoted or claimed a plain BACKLOG/TODO row — the backlog pile was inert to unattended automation (PO triage only self-initiates NEW sprints off signals/Telegram, it never sweeps plain backlog[] rows). BOUNDED-1 caps this lane at ONE task in flight — user-gated 2026-07-04; do NOT raise past 1 for this lane (the existing WIP≤2 invariant below is the separate, human/router-supervised dispatch budget).

**WIP FORMULA (corrected 2026-07-22, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK):** WIP is `.task_board.in_progress` length ONLY — a pure concurrency count. `ready[]` is a STAGING queue (promoted-but-not-yet-claimed work, including rows placed there by other sources — PM/architect decomposition, PO triage, the Supervised-Lane Sweep, the Ready-Lane Consumer below), never concurrency. The prior formula `(ready|length)+(in_progress|length)` let a saturated `ready[]` (36 rows live 2026-07-21, mostly PM epic-decomposition children this gate had no way to drain — see the Ready-Lane Consumer below) permanently evaluate `WIP<1` as false even when `in_progress==0` — instance 9 on the count-threshold-gate class, deadlocking BOTH this gate and the Supervised-Lane Sweep's gate simultaneously. Root cause + fix: `docs/agent-memory/decisions/sprint-UNBLOCK-DEVTEAM-DISPATCH-GATE-DEADLOCK-po.md`. DoD/regression instrument (tests gate SATISFIABILITY on a live-shaped saturated fixture, not lane resolution): `scripts/audits/devteam-dispatch-gate-satisfiability.sh`.

```bash
WIP=$(jq '.task_board.in_progress|length' docs/data/orch/orch-state.json)
if [ "$WIP" -lt 1 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-promote-bounded1.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  jq --arg now "$NOW" -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-bounded1.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  new_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
  if [ "$new_head_status" = "in_progress" ]; then
    JUMP TO execute   # claimed a task — execute-tier.md's own Phase-3.5 dispatcher-wrap claims task:<id> and resolves the real specialist via zone-detect skill
  fi
fi
# WIP>=1, or nothing eligible was promoted/claimed -> fall through unchanged, continue to Supervised-Lane Sweep below
```

- **Promote** (`scripts/devteam-backlog-promote-bounded1.jq`): selects the SINGLE top-priority row from `.task_board.backlog[]` where `status ∈ {BACKLOG, TODO}` AND `effective_supervised != true` AND NOT an epic wrapper AND `depends_on` is eligible AND NOT detail-DEFERRED* AND NOT a non-dev-owner+null-next_agent row — the Phase-1 supervised set (see `.head.note` history) is held OUT of this auto-pickup lane and is picked up instead by the **Supervised-Lane Sweep (SLS)** below (rows that are BOTH `effective_supervised` AND `effective_plan_only`) — see FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (2026-07-21): prior to that fix this comment claimed gated rows "still launch normally via the router-adjudicated path (Step 1 PO triage / manual dispatch)", which was FALSE — no such sweep existed anywhere (confirmed live against `docs/agents/po/flow/main.md` + this file's own pre-fix content; root cause of 6+ day idle P0 rows, see `scripts/po-signaldrain-20260721T16-bctcscope-cowork-loopclosure.jq`). **SUPERVISED GATE (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09):** `effective_supervised` = true if EITHER inline `.supervised` on the board row OR — detail-authoritative — `docs/data/orch/archive/backlog-detail.json` `.items[<id>].supervised` is true (no `.detail_ref` precondition; lookup is keyed purely by `.id`); absent/null in both = NOT supervised (promotable). Closes the 2026-07-09T15:48Z near-miss where the old board-row-only check silently treated every detail_ref'd supervised row as unsupervised. **EPIC-WRAPPER GATE (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10):** `is_epic_wrapper` = true if EITHER inline `.children` on the board row OR `docs/data/orch/archive/backlog-detail.json` `.items[<id>].children` resolves to a non-empty array (same no-`.detail_ref`-precondition precedence as the supervised gate) — decomposition-container rows (e.g. `mode=audit-epic`/multi-child SPIKEs) are NEVER auto-promoted, independent of the `supervised` flag's value. Closes the 2026-07-09T23:17Z near-miss (`AUDIT-FETCH-COMPLETE` auto-claimed, point-fixed by hand with `supervised:true`) plus the structurally identical `FACTORY-GUARD-CI-REGRESSION-SPIKE` row, which the supervised gate alone could not catch (`supervised:null` everywhere). **DEPENDS-ON GATE (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08):** effective `depends_on` = inline `.depends_on` on the board row if non-empty, else — for `detail_ref`'d rows — the lookup in `docs/data/orch/archive/backlog-detail.json` `.items[<id>].depends_on`, else `[]`; a dep is satisfied ONLY if it resolves to `status == "DONE_VERIFIED"` in ANY task_board lane (plain `DONE` is NOT sufficient), and a dep id found in NO lane is treated as UNSATISFIED (conservative-skip). Filter applies during candidate selection so a blocked top-ranked row cannot starve an eligible lower-ranked one. Requires `--slurpfile detail docs/data/orch/archive/backlog-detail.json` on the invocation (see block above). **DETAIL-DEFERRED GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12):** a row is gated if `docs/data/orch/archive/backlog-detail.json` `.items[<id>].status` is a non-null string whose ascii-downcased value STARTS WITH `"deferred"` (case-insensitive; covers `DEFERRED`, `DEFERRED-INFRA`, and any future `DEFERRED-<reason>` variant — 11 detail rows carry a detail-DEFERRED* status live today); looked up purely by `.id` (no `.detail_ref` precondition, same precedence as the supervised/children gates); absent/null detail status = NOT gated (promotable). Closes the 2026-07-12 near-miss where `BCTC-HIST-VPS-BACKFILL` (detail status `DEFERRED-INFRA`) was re-picked at 09:37Z and 10:07Z because the board layer never mirrors a detail DEFERRED* disposition back onto the thin backlog[] row's own `status` field. **NON-DEV-OWNER GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12):** a row is gated ONLY if BOTH hold — (1) `docs/data/orch/archive/backlog-detail.json` `.items[<id>].owner` is a non-empty string that does NOT match the dev-role pattern `^dev(-|$)|^developer$` (case-insensitive, i.e. it names a deliberate-launch owner such as po/ops/architect/agents-architect/ba/pm/qa/agent-father/system-auditor), AND (2) the BOARD row's `.next_agent` is null/absent/empty (see the "NON-CODE / DESIGN row `next_agent` gap" note below — with no `next_agent`, zone-detect's Tier-3 fallback would mis-route the row to the generic `developer` placeholder). Scoped to THIS unattended idle-pickup lane only — a row gated here AND ALSO `effective_plan_only` is picked up by the **Supervised-Lane Sweep** below; a row gated here WITHOUT `plan_only` is a tracked residual gap (no dedicated sweep lane yet — surfaced by `scripts/audits/bounded1-supervised-lane-report.sh`'s SECONDARY section, not silently assumed-covered). Conservative default (absent/empty owner, dev-role owner, or a non-empty `next_agent`) = NOT gated (promotable). Closes the 2026-07-12 near-miss where the next two queued BOUNDED-1 picks behind `BCTC-HIST-VPS-BACKFILL`, `FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW` and `IND-ROADMAP-LEDGER` (both `owner:"po"`, `next_agent:null`), were the same structural class. **PLAN-ONLY GATE (FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE, 2026-07-12; generalized to `effective_plan_only` board-OR-detail by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE, 2026-07-16):** a row is gated if EITHER the board row's own inline `.plan_only` OR `docs/data/orch/archive/backlog-detail.json` `.items[<id>].plan_only` is exactly `true` — looked up purely by `.id` (no `.detail_ref` precondition, same precedence as the sibling gates above); conservative default (absent/null in both places) = NOT gated (promotable). `plan_only:true` rows are plan-first / architect-recon asks, not autonomous code-fixes, and are withheld from idle auto-pickup — route them via deliberate architect/PO dispatch instead. Closes the 2026-07-12 near-miss where `FIX-MCP-MEMORY-CODE-LEAK` (board `status:BACKLOG, next_agent:null`, detail `plan_only:true, next_agent:"architect", owner:"dev", status:"TODO"`) defeated both the DETAIL-DEFERRED gate (`status:"TODO"` doesn't start with "deferred") and the NON-DEV-OWNER gate (`owner:"dev"` is a dev-role owner) and was auto-picked/routed to a dev specialist as an autonomous code-fix. **NON-DEV-NEXT_AGENT GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12; generalized to `effective_next_agent` detail-first/board-fallback by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE, 2026-07-16, which also SUBSUMES FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE):** sibling of NON-DEV-OWNER but keys off `.next_agent` instead of `.owner` — a row is gated if the row's EFFECTIVE `next_agent` (`docs/data/orch/archive/backlog-detail.json` `.items[<id>].next_agent` if present-non-empty, ELSE the board row's own inline `.next_agent`) is a non-empty string that does NOT match the dev-role pattern `^dev(-|$)|^developer$` — i.e. not zone-detect-routable, covering architect/ba/pm/agents-architect AND the maintenance lane (agent-father/system-auditor/code-janitor/...) in one check; conservative default (absent/empty effective next_agent, or a dev-role value) = NOT gated (promotable). The prior version's extra "AND board next_agent is empty" clause is REMOVED — that clause is exactly why an inline board `next_agent` naming a non-dev agent with no detail entry at all (e.g. `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC`, `next_agent:"architect"`) previously slipped through. Closes the 2026-07-12 near-miss where `FEAT-SEVERITY-OVERRIDE-SURFACING` (detail `next_agent:"architect"`, no `owner` field at all) defeated the NON-DEV-OWNER gate (silent on an absent `owner`) and would have been auto-promoted for a single-`developer` Tier-3 zone-detect mis-route, skipping the required ba→architect→pm relay. Regression verifier: `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` (dynamic live-data fixtures, no hardcoded task IDs — see Reusable Scripts below). **PROSE-SEQUENCING GATE (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE, 2026-07-23):** a row is gated if `has_unbacked_sequencing_prose` is true — EITHER the board row OR its detail_ref'd counterpart carries any object key matching `^po_sequencing` (a PO-authored ordering note, e.g. `po_sequencing_20260722`), AND the row's `effective_depends_on` (already board-OR-detail, already unions `.depends_on`/`.depends`/`.blocked_by`) resolves to an EMPTY list — i.e. the ordering constraint exists only in prose, not machine-readable form. Conservative default (no `po_sequencing_*` key anywhere, or `depends_on` non-empty regardless of prose) = NOT gated. Deliberately does NOT parse the prose to infer a predecessor task-id (regex-mining English sentences for control flow is brittle) — it only forces the ordering to be encoded as real `depends_on` before auto-dispatch proceeds. Closes the 2026-07-22 near-miss where `UC-CDC-P5` (ordering constraint lived only in `.po_sequencing_20260722`, "must land LAST after UC-SDF-P6 and the liveness watchdog") was blind-promoted by BOUNDED-1 then had to be reverted; acutely contained by hand-installing `depends_on` on that one row. Surfaced (not silent) by `scripts/audits/bounded1-supervised-lane-report.sh`'s TERTIARY section — lists every backlog row carrying unbacked prose sequencing so PO is nudged to encode the dep. Regression verifier: `scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh` (SYNTHETIC unbacked/backed/detail-side/control fixtures + a LIVE dynamic discovery check, no hardcoded task IDs). Moves the picked row backlog→ready, stamps `promoted_at`/`promoted_by`/`promotion_note` + `.task_board.last_triaged_at`/`last_triaged_by`. No-op (identity) if `WIP >= 1` or nothing eligible.
- **Claim** (`scripts/devteam-backlog-claim-bounded1.jq`): moves the bounded-1-stamped ready row → in_progress, sets `.head.status="in_progress"`, `.head.active_task_id=<id>`, `.head.next_agent` (the row's own `next_agent` if set, else `"developer"` placeholder — Step 3's zone-detect skill re-resolves the real specialist from the task's `zone`/files). No-op if nothing bounded-1-stamped is waiting in `ready[]`.
- Both writes go through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite.
- **NON-CODE / DESIGN row `next_agent` gap (found 2026-07-09T17:48Z, `ARCH-HEADLESS-GATEWAY-COWORK-NOPOST`):** `.claude/skills/zone-detect/SKILL.md` only ever resolves a task to `dev-<service>` or generic `developer` (Tier 1/2 need `apps/<service>/`-shaped `zone`/`files`; Tier 3 fallback is also `developer`) — it has **no path to `agents-architect`, `architect`, `ba`, `pm`, or any non-dev-* specialist**. A BOUNDED-1-picked row whose thin board entry has no `next_agent` gets the `"developer"` placeholder above regardless of `type`. Before letting zone-detect run on the claimed row, check `docs/data/orch/archive/backlog-detail.json .items[<id>].owner` (and `.type`) — if `owner` names a non-dev-* agent (e.g. `agents-architect` for `type:"design"` root-cause/architecture asks), correct `.head.next_agent` (and the task row's own `next_agent`) to that owner via `orch-apply.sh` BEFORE dispatch, instead of routing a design/doc deliverable to `developer` through zone-detect's Tier-3 fallback. **This note is now vestigial for BOUNDED-1 itself** — the NON-DEV-OWNER/NON-DEV-NEXT_AGENT gates (2026-07-12/07-16) already exclude every row this note describes from ever reaching BOUNDED-1's own claim step. It remains true, and is now MECHANIZED (not manual-check prose), for the Supervised-Lane Sweep immediately below, which exists specifically to dispatch that excluded set.

---

### Supervised-Lane Sweep (SLS)

FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (architect, 2026-07-21). Runs immediately after the BOUNDED-1 block above, still inside the same head-idle fall-through, still BEFORE Step 1 PO triage — reached ONLY when BOUNDED-1 did NOT `JUMP TO execute` this tick (either nothing was eligible for unsupervised auto-pickup, or WIP was already ≥1 before BOUNDED-1 ran). Control flow guarantees `.head` is still idle whenever this block runs, so SLS setting `.head` cannot collide with a same-tick BOUNDED-1 claim.

**Problem this closes:** rows carrying BOTH `effective_supervised == true` AND `effective_plan_only == true` are correctly withheld from BOUNDED-1 (by design — a deliberate-dispatch, not-an-autonomous-fix class) but scripts/devteam-backlog-promote-bounded1.jq's own comments claimed they "still launch normally via the router-adjudicated path (Step 1 PO triage / manual dispatch)". CONFIRMED FALSE 2026-07-21: neither `docs/agents/po/flow/main.md` (PO's own pre-checks/No-Task-Guard read `.task_board` for blocked/pending/in-progress work and Telegram reports — never a priority-ordered sweep of `backlog[]` for supervised/plan_only rows) nor this file (before this fix) ever dispatched that set. Result: P0 rows idled 6+ days (`FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS`) purely because the promised destination did not exist. Root-cause confirmation: `scripts/po-signaldrain-20260721T16-bctcscope-cowork-loopclosure.jq` (the PO signal-drain that minted this very task) states it explicitly in its own `question` field.

**Fix — SLS spends the SECOND slot of the pre-existing WIP≤2 invariant** (`docs/agents/dev-team/flow/main.md` § Invariants) — NOT a new budget. BOUNDED-1's own header comment already names this slot: *"[WIP≤2] is the existing, separate router/PO WIP budget for supervised/manual dispatch; this auto-pickup lane [BOUNDED-1] is bounded independently and more conservatively [WIP<1]"*. SLS is the automated writer for that previously-named-but-never-used slot. The Ready-Lane Consumer immediately below shares this SAME slot (a 2nd/3rd writer, not a 3rd budget).

**WIP2 FORMULA (corrected 2026-07-22, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK):** same fix as BOUNDED-1's WIP above — `.task_board.in_progress` length ONLY, never `ready[]`. The pre-fix formula `(ready|length)+(in_progress|length)` was 37 against the live board on the exact day this sweep shipped (ready=36, in_progress=1), so `WIP2<2` was false from the moment this section was written — this sweep was dead on arrival despite its own acceptance instrument (`scripts/audits/bounded1-supervised-lane-report.sh`, lane-resolution only) showing green. See `docs/agent-memory/decisions/sprint-UNBLOCK-DEVTEAM-DISPATCH-GATE-DEADLOCK-po.md` and the satisfiability instrument `scripts/audits/devteam-dispatch-gate-satisfiability.sh`.

```bash
WIP2=$(jq '.task_board.in_progress|length' docs/data/orch/orch-state.json)
if [ "$WIP2" -lt 2 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-promote-supervised-lane-sweep.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  jq --arg now "$NOW" -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-supervised-lane-sweep.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  sls_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
fi
# WIP2>=2, or nothing eligible in the supervised+plan_only quarantine -> fall through unchanged, continue to the Ready-Lane Consumer below
```

If `sls_head_status = "in_progress"` (a row was claimed this tick):
```
# Dispatcher-wrap (mirrors S4 UNBLOCK below) then spawn the RESOLVED specialist DIRECTLY.
# Do NOT "JUMP TO execute" here — execute-tier.md's zone-detect skill only ever resolves
# dev-<service>/developer (see the NON-CODE/DESIGN gap note above); routing an SLS-claimed
# row through it would silently discard the lane this sweep just resolved and re-route a
# non-dev specialist (architect/ba/po/ops/...) back to a generic "developer" placeholder.
bare_task_id = head.active_task_id
resume_key   = "task:" + bare_task_id
outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: resume_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
  ttl_seconds: 3600,
  payload: "{\"site\":\"SLS\",\"spawning\":\"" + head.next_agent + "\"}"
})
if not outer_claim.claimed:
  log "[dev-team] SLS SKIP " + bare_task_id + " — held by peer session"
  # fall through to Step 1 (do NOT spawn)
else:
  try:
    Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
  JUMP TO end   # SLS dispatch queued this tick; do not also fall through to PO triage in the same tick
```

- **Promote** (`scripts/devteam-backlog-promote-supervised-lane-sweep.jq`): selects the SINGLE top-priority row from `.task_board.backlog[]` where `status ∈ {BACKLOG, TODO}` AND `effective_supervised == true` AND `effective_plan_only == true` (the exact doubly-gated class, same board-OR-detail / detail-first-board-fallback `effective_*` precedence as BOUNDED-1 — no forked logic) AND NOT an epic wrapper AND `depends_on` is eligible AND NOT detail-DEFERRED*. Resolves `dispatch_lane` = `effective_next_agent` if non-empty, ELSE `effective_owner` if non-empty, ELSE `"developer"` (defensive fallback only — every live row resolves to a real specialist today, verified by the report script below). Stamps the promoted row with `promoted_at`/`promoted_by="dev-team (supervised-lane sweep)"`/`promotion_note`/`dispatch_lane` — **`supervised`/`plan_only` are carried through UNCHANGED** (still `true`); this is an ADDITIVE lane assignment, never a gate-clear. No-op if nothing eligible.
- **Claim** (`scripts/devteam-backlog-claim-supervised-lane-sweep.jq`): moves the swept ready row → in_progress, sets `.head.next_agent` to the row's own already-resolved `dispatch_lane` field DIRECTLY (never a `"developer"` fallback-of-last-resort — unlike BOUNDED-1's claim script, because the promote step already did that resolution). No-op if nothing SLS-stamped is waiting in `ready[]`.
- Both writes go through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite. Idempotency + Zod-schema + conservation dry-run verified 2026-07-21 (scratch-copy replay, never against the live file).
- **Acceptance / regression instrument:** `scripts/audits/bounded1-supervised-lane-report.sh` — read-only, run live, lists every supervised+plan_only row with its resolved `dispatch_lane` and age in days; exits 1 if any such row's lane is unresolved (`none`). Also prints (informational, non-gating) the wider supervised-XOR-plan_only set for visibility into the residual NON-DEV-OWNER/NON-DEV-NEXT_AGENT-only gap noted above. **This instrument tests LANE RESOLUTION only, not gate satisfiability** — it shipped green while this sweep's own firing gate was dead (see WIP2 note above). The satisfiability instrument is `scripts/audits/devteam-dispatch-gate-satisfiability.sh`.

---

### Ready-Lane Consumer (RLC)

UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22), PO ruling item (2). Runs immediately after the Supervised-Lane Sweep block above, still inside the same head-idle fall-through, still BEFORE Step 1 PO triage — reached ONLY when SLS did NOT claim+dispatch this tick. Control flow guarantees `.head` is still idle whenever this block runs (same argument as SLS's own placement after BOUNDED-1).

**Problem this closes:** `ready[]` holds rows from three sources — BOUNDED-1's own promote script, SLS's own promote script, and PM/architect decomposition (epic children minted DIRECTLY into `ready[]`, never through either promote script — e.g. `CCATO-MCP-T1..T8`, `SYSREMAKE-P2-T1..T9`, `DESIGN-COWORK-FANOUT-T1..T8`, 25 rows live 2026-07-21, all carrying a resolved inline `next_agent`). BOUNDED-1's and SLS's own CLAIM scripts each only claim rows stamped with their OWN `promoted_by` marker — the third source has neither marker and was therefore **never claimable by anything**: not by BOUNDED-1/SLS (marker mismatch), not by PO triage (`po/flow/main.md` never sweeps `ready[]` by priority), not by any other step in this file. RLC is the missing generic consumer.

Shares the SAME WIP≤2 budget as SLS (`.task_board.in_progress` length ONLY, per the corrected formula above) — a 3rd writer of the same named slot, not a new budget.

```bash
WIP3=$(jq '.task_board.in_progress|length' docs/data/orch/orch-state.json)
if [ "$WIP3" -lt 2 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-ready-lane-consumer.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  rlc_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
fi
# WIP3>=2, or nothing eligible in ready[] -> fall through unchanged, continue to the Review-Lane QA-Drain below
```

If `rlc_head_status = "in_progress"` (a row was claimed this tick):
```
# Dispatcher-wrap (mirrors SLS/S4 UNBLOCK) then spawn the RESOLVED specialist DIRECTLY.
# Do NOT "JUMP TO execute" — same rationale as SLS: the claimed row's next_agent is
# already resolved (dev-* or non-dev-*), and zone-detect's dev-only Tier-3 fallback
# would silently discard that resolution.
bare_task_id = head.active_task_id
resume_key   = "task:" + bare_task_id
outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: resume_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
  ttl_seconds: 3600,
  payload: "{\"site\":\"RLC\",\"spawning\":\"" + head.next_agent + "\"}"
})
if not outer_claim.claimed:
  log "[dev-team] RLC SKIP " + bare_task_id + " — held by peer session"
  # fall through to Step 1 (do NOT spawn)
else:
  try:
    Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
  JUMP TO end   # RLC dispatch queued this tick; do not also fall through to PO triage in the same tick
```

- **Claim** (`scripts/devteam-backlog-claim-ready-lane-consumer.jq`): single script, no promote half needed (candidates are already in `ready[]`). Picks the top-priority (priority_rank, FIFO tiebreak) `ready[]` row where `status ∈ {READY, TODO}` AND NOT supervised AND NOT plan_only AND NOT an epic wrapper AND `depends_on` is satisfied (cross-lane DONE_VERIFIED-only — LOAD-BEARING: the epic children carry real sequential `depends_on` chains onto their own siblings, e.g. `SYSREMAKE-P2-T9-QA-GATE` depends on 8 other T-rows; without this gate RLC would dispatch a child before its parent lands) AND NOT detail-DEFERRED* AND carries a resolved `effective_next_agent` or `effective_owner`. Moves `ready[] -> in_progress[]`, sets `.head.next_agent` to the resolved lane directly (no `"developer"` fabrication — a row with no resolvable next_agent/owner is simply not a candidate). No-op if nothing eligible.
- Write goes through `scripts/orch-apply.sh` ONLY. Idempotency + Zod-schema + conservation dry-run verified 2026-07-22 (scratch-copy replay against the live board — confirmed it correctly excludes rows with unsatisfied `depends_on`, e.g. `CCATO-MCP-T3` before `CCATO-MCP-T1` is `DONE_VERIFIED`, and correctly excludes supervised P0 rows despite higher raw priority).
- **Acceptance instrument:** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (shared with BOUNDED-1/SLS/QA-Drain — see below).

---

### Review-Lane QA-Drain

UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22), PO ruling item (3) — FOLDS `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` (backlog since 2026-07-12; this section + its scripts ARE that row's own SUGGESTED REMEDY, implemented). Runs immediately after the Ready-Lane Consumer block above, still inside the same head-idle fall-through, still BEFORE Step 1 PO triage — reached ONLY when RLC did NOT claim+dispatch this tick.

**Problem this closes:** `review[]` is a WRITE-ONLY lane in this flow — every developer DONE pushes a row INTO `review[]`; grep-confirmed (2026-07-12, re-confirmed 2026-07-21) nothing anywhere in `docs/agents/dev-team/flow/*.md` or `docs/agents/po/flow/main.md` ever scans `.task_board.review[]` for a stranded row whose inline qa dispatch never ran (dev session died, host wedge, etc). Live 2026-07-21: 32 review rows, 10+ with `next_agent=='qa'` and `qa[]==0`, oldest frozen 11+ days.

**HARD PREREQUISITE (do not treat as separable — PO AC):** every live `review[]` row carries `branch: null` (grep-verified, all 32) — committed straight to `main` by the FIX direct-execute path, never on a `task/NNN-*` branch. QA's normal `pipeline` JUMP-TO requires `git checkout task/NNN-*` (`docs/agents/qa/flow/main.md` line ~113) and CANNOT run against these rows. This is why `docs/agents/qa/flow/main.md` now carries an additive `verify-committed` JUMP-TO entry (§ Direct-Commit Verify) — QA-drain-claimed rows MUST be spawned in that mode, never the normal `pipeline` mode.

Dedicated `qa[] < 1` cap (NOT the shared WIP≤2 in_progress budget above) — per the row's own 2026-07-12 SUGGESTED REMEDY and because this lane moves rows into a different board lane entirely.

```bash
QA_WIP=$(jq '.task_board.qa|length' docs/data/orch/orch-state.json)
if [ "$QA_WIP" -lt 1 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-review-claim-qa-drain.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  qadrain_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
fi
# QA_WIP>=1, or nothing eligible in review[] -> fall through unchanged, continue to Session Gate / Step 1 PO triage
```

If `qadrain_head_status = "in_progress"` (a row was claimed this tick):
```
bare_task_id = head.active_task_id
resume_key   = "task:" + bare_task_id
outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: resume_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
  ttl_seconds: 3600,
  payload: "{\"site\":\"QA-DRAIN\",\"spawning\":\"qa\"}"
})
if not outer_claim.claimed:
  log "[dev-team] QA-DRAIN SKIP " + bare_task_id + " — held by peer session"
else:
  try:
    # Spawn qa with mode=verify-committed (head.next_action already carries this instruction).
    # Do NOT spawn qa's normal pipeline mode — this row has no task branch/handoff to check out.
    Agent("qa", context... + head.next_action + " mode=verify-committed", run_in_background=true)
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
  JUMP TO end
```

- **Claim** (`scripts/devteam-review-claim-qa-drain.jq`): picks the OLDEST (by `updated_at // reviewed_at // created_at`, missing timestamp treated as oldest — age-ordered, NOT priority-ordered, per the row's own remedy) `review[]` row where `status == "REVIEW"` (excludes BLOCKED — negative control) AND `effective_next_agent == "qa"` (PRIMARY set only; the null/non-qa subset is a different, not-yet-covered owner-triage class, surfaced non-silently by the report script below, never silently treated as fine). Moves `review[] -> qa[]`, status `REVIEW -> QA`, sets `.head.next_agent = "qa"` directly.
- Write goes through `scripts/orch-apply.sh` ONLY. Idempotency + Zod-schema + conservation dry-run verified 2026-07-22.
- **Visibility instrument (non-gating):** `scripts/audits/devteam-review-lane-drain-report.sh` — read-only; PRIMARY table = the auto-dispatched set above; SECONDARY table = the null/non-qa `next_agent` subset (PO/architect triage queue, per PO AC(1) — never silently dropped).
- **Acceptance instrument:** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — shared with BOUNDED-1/SLS/RLC; asserts this lane's gate FIRES and DRAINS (`review[]` shrinks, `qa[]` grows) against the live-shaped saturated fixture (review≈32).

---

<!-- jump:session-gate -->
**Session Gate:** `docs/data/orch/orch-state.json` `.task_board` empty AND no Telegram reports AND `pendingSignals` empty → `send_telegram(channel="work", message="[dev-team] Dev loop idle.")` → JUMP TO `end`.

---

<!-- jump:po-triage -->
## Step 1 — PO Triage

```
# S3 dispatcher-wrap — dedup guard before PO spawn:
triage_key  = "task:po-triage-" + $(date -u +"%Y%m%d")   # e.g. task:po-triage-20260521
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: triage_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds: 1800,
  payload: "{\"site\":\"S3\",\"spawning\":\"po\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
})
if not outer_claim.claimed:
  log "[dev-team] SKIP PO triage — already running in peer session"
  JUMP TO end   # do NOT spawn po
# Claim succeeded — spawn PO:
```
→ Spawn `po` with: `pendingSignals[]`, `read_telegram_reports(status="new")`, `list_unresolved_reports()`, `docs/data/orch/orch-state.json .task_board`, `git log --oneline -30`, `git branch` — `run_in_background=true` (background) — BGFAN-1; await task notification, then release triage_key
→ PO contract: `docs/agents/po/flow/main.md` § Role in dev-team flow
→ Return: `NOTHING` (→ idle EXIT) | `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])`
```
# After PO spawn returns:
call_tool(server="vn-market", tool="task_release", arguments={ task_id: triage_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
```

---

<!-- jump:planning -->
## Step 2 — Planning

| Type | Tag emitted | Sequence | Notes |
|---|---|---|---|
| FIX | — | (skip) | direct to Step 3 |
| SPIKE | — | (skip) | direct to developer with `feature-spike.md`; throwaway branch, findings doc only |
| SPRINT-S | — | architect → pm | each reads own flow |
| SPRINT-M | — | ba → architect → pm | sequential |
| SPRINT-L | — | ba → architect → pm; post-merge architect review | sequential |
| NEW-SERVICE | `BUILD-STANDARD: full` | ba → architect → pm → dev-`<svc>` → qa | Full relay + G1–G12 + three-level dashboard. dev-`<svc>` loads standard at Step 0c. |
| NEW-FEATURE | `BUILD-STANDARD: lean` | pm → dev-`<svc>` | One dev-`<svc>` agent, no relay. Fence + sandbox/replay DoD mandatory. dev-`<svc>` loads standard at Step 0c. |
| UNBLOCK | — | S4: see dispatch block below | `send_telegram(channel="work", message="[dev-team] Unblocked: [brief]")` → EXIT |
| CLEAN | — | S4: see dispatch block below | qa flow handles cleanup → EXIT |

**S4 UNBLOCK dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "task:" + batch_id,
  task_kind:            "sprint-task",   # live enum: cowork-slot|sprint-task|dashboard-row|commit-mutex — "dev-team" is NOT valid (verified 2026-06-05)
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          3600
})
if result.claimed:
  spawn {route_to} run_in_background=true   # (background) — BGFAN-1
  # DJ-GATE-1 (journal-before-DONE — canonical gate → docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate):
  # Worker writes journal entry; if absent, router writes STEP via skill .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: batch_id].
  # Gate: grep docs/agent-memory/decisions/sprint-*-*.md for "task-id:** {batch_id}" — absent → run skill, then flip.
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
else:
  log "[dev-team] SKIP UNBLOCK " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

**S4 CLEAN dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "task:" + batch_id,
  task_kind:            "sprint-task",   # live enum: cowork-slot|sprint-task|dashboard-row|commit-mutex — "dev-team" is NOT valid (verified 2026-06-05)
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          3600
})
if result.claimed:
  spawn qa with branch list run_in_background=true   # (background) — BGFAN-1
  # DJ-GATE-1 (journal-before-DONE — canonical gate → docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate):
  # CLEAN auto-close: router is sole actor → run skill .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: batch_id] directly before flip.
  # Gate: grep docs/agent-memory/decisions/sprint-*-*.md for "task-id:** {batch_id}" — absent → run skill, then flip.
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
else:
  log "[dev-team] SKIP CLEAN " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

Architect MUST set `ZONE: apps/<service>/` in RETURN — PM propagates into handoff/RETURN per task. Step 3 zone-routes by this field. Agent contracts: each agent's `flows/<agent>/main.md` § Role in dev-team flow.

---

<!-- jump:execute -->
## Step 3 — Execution

<!-- SF-1 heartbeat: renew singleton session lock at Step 3 entry to cover long sprint ticks beyond initial 5400s TTL -->
<!-- P2-PRESENCE heartbeat: renew presence row alongside SF-1; update current_task to active task id -->
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "dev-team-cron-singleton", owner_client_session: $CLAUDE_CODE_SESSION_ID })
# ok=false → lock stolen (peer recovered after stall) → log BUG + exit cleanly; do NOT fight the steal.

# P2-PRESENCE: heartbeat presence row (renews TTL; payload.current_task advisory update via release+reclaim if desired)
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# ok=false → presence row expired between PREFLIGHT and Step 3 (long tick) → non-fatal; reclaim on next tick
```

**Fallback — `mcp__gateway__call_tool` Claude-tool absent from session (not a transport error, the tool
itself isn't loaded):** every `call_tool(server="vn-market", ...)` in this file and `execute-tier.md`
(heartbeats, dispatcher-wrap `task_claim`/`task_release`, `send_telegram`, `read_telegram_reports`, etc.)
has an equivalent bash/curl path via `scripts/agents-flow/mcp-call.sh`'s `mcp_call()` function — the same
stateless vn-market HTTP bridge `dev-team-tick-preflight.sh` already uses for its own lock claims. `source
scripts/agents-flow/mcp-call.sh` then call `mcp_call "<tool_name>" "<json_args>"` (note: `task_claim` via
this path requires `owner_client_session` explicitly in the args — it is not implicit). If a tick hits this
absence, do a single clean check (not a retry loop) before falling back to this bridge; live-confirmed
2026-07-09T17:07Z after the 16:37Z tick parked at this exact step for a full cycle.

→ Run sub-flow: `docs/agents/dev-team/flow/execute-tier.md`

Covers: tier grouping, zone routing (3-tier resolution: explicit → infer → report), parallel spawn rules, conflict check, merge gate.

> Status-flip = lane-move (MUST, no exceptions) — any agent flipping a task `.status` to a terminal/review token (REVIEW/QA/DONE/DONE_VERIFIED/BLOCKED/etc.) MUST move that task's array-membership into the matching `.task_board.<newlane>[]` (and sync `.head` if it was the active task) in the SAME `orch-apply.sh` write — never patch `.status` in place → full clause + FORBIDDEN statement: `docs/agents/dev-team/flow/execute-tier.md` § MUST — Status-Flip = Lane-Move (CANONICAL:SSOT-STATUSFLIP-LANEMOVE).

---

<!-- jump:post-cycle -->
## Step 4 + 4.5 — Scan + Compact

→ Run sub-flow: `docs/agents/dev-team/flow/post-cycle.md`

Covers: post-execution checks (4.0–4.1), Compact Checkpoint (4.5), doc self-heal.

---

## Reusable Scripts

- `scripts/devteam-session-trace.py` — extract compact workflow trace from a dev-team session `.jsonl` transcript; audits agent spawns, lock contention, Telegram narration, and workflow-smell hits. Usage: `devteam-session-trace.py <session.jsonl>`.
- `scripts/router-d1-claim.jq` — router board claim: moves a task from `ready[]` to `in_progress[]` with gate-guard; sets `.head` for unambiguous dispatch on resume. Usage: `jq --arg now "$NOW" -f scripts/router-d1-claim.jq docs/data/orch/orch-state.json`.
- `scripts/devteam-backlog-promote-bounded1.jq` + `scripts/devteam-backlog-claim-bounded1.jq` — generalized (no hardcoded task IDs), idempotent BOUNDED-1 backlog→ready→in_progress pickup for the Idle-capacity backlog pickup step above (SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1); promote applies a depends_on eligibility gate (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08) plus the detail-DEFERRED / non-dev-owner / plan-only / non-dev-next_agent gates (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE + FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE + FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12; plan-only + non-dev-next_agent generalized to effective board-OR-detail by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE, 2026-07-16, subsuming FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE) — see step description above. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-backlog-promote-bounded1.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` then the claim script the same way (claim script unchanged, no `--slurpfile` needed).
- `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` — read-only regression verifier for the FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE + PLAN-ONLY-GATE + DETAIL-NEXTAGENT-NONDEV-GATE + EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE gates above; builds synthetic/dynamic single-row fixtures from live `docs/data/orch/orch-state.json` + `backlog-detail.json` data (discovered dynamically where possible, no hardcoded task IDs; never writes back, no `orch-apply.sh` call) and asserts a detail-DEFERRED* row, a non-dev-owner+null-next_agent row, a plan_only row (board-inline or detail), a non-dev-next_agent row (board-inline or detail, with or without a null board next_agent), are NEVER promoted while a clean/dev-routable row still is. Usage: `bash scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` (exit 0 = pass).
- `scripts/devteam-backlog-promote-supervised-lane-sweep.jq` + `scripts/devteam-backlog-claim-supervised-lane-sweep.jq` — generalized (no hardcoded task IDs), idempotent Supervised-Lane Sweep (SLS) backlog→ready→in_progress pickup for the doubly-gated `effective_supervised == true AND effective_plan_only == true` class (FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER, 2026-07-21) — see § Supervised-Lane Sweep above. Promote resolves + stamps `dispatch_lane` (`effective_next_agent` → `effective_owner` → `"developer"`) WITHOUT clearing `supervised`/`plan_only`; claim sets `.head.next_agent` to that resolved lane directly (no zone-detect indirection). Shares the pre-existing WIP≤2 invariant's second slot with human/router dispatch — never raises it. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` then the claim script the same way (no `--slurpfile` needed).
- `scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh` — read-only regression verifier for the PROSE-SEQUENCING GATE above (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE); SYNTHETIC fixtures assert a `po_sequencing_*`-carrying row with empty `depends_on` is NEVER promoted, the same row IS promoted once `depends_on` is populated (dep `DONE_VERIFIED`), the detail-side variant of the prose key is equally caught, and a clean row (no `po_sequencing_*` key) is unaffected; a LIVE dynamic-discovery check (no hardcoded task IDs) confirms any current row shaped like `UC-CDC-P5` (prose key + non-empty-but-unsatisfied `depends_on`) stays held by `deps_satisfied`, not spuriously double-gated. Usage: `bash scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh` (exit 0 = pass; never writes back).
- `scripts/audits/bounded1-supervised-lane-report.sh` — read-only acceptance/regression instrument for FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER; replays the same `effective_supervised`/`effective_plan_only`/`effective_owner`/`effective_next_agent` predicates against live data, lists every supervised+plan_only backlog row with its resolved `dispatch_lane` + age in days, and exits 1 if any such row's lane is `none`. Secondary (non-gating) section lists the wider supervised-XOR-plan_only set for visibility. TERTIARY (non-gating, FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE, 2026-07-23) lists every backlog row where `has_unbacked_sequencing_prose` is true, so a prose-only-sequenced row does not silently idle forever. Usage: `bash scripts/audits/bounded1-supervised-lane-report.sh` (exit 0 = pass). **Tests LANE RESOLUTION only — NOT gate satisfiability**; see the satisfiability instrument below.
- `scripts/lib/devteam-eligibility.jq` — UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-22): shared `include`-able eligibility/detail-resolution predicate library (`effective_supervised`, `effective_plan_only`, `effective_owner`, `effective_next_agent`, `effective_depends_on`/`deps_satisfied`/`dep_status_map`, `is_epic_wrapper`, `is_detail_deferred`, `is_non_dev_owner_unrouted`, `is_non_dev_next_agent_unrouted`, `has_unbacked_sequencing_prose`, `priority_rank`, `wip_in_progress`, `resolved_dispatch_lane`, `is_bounded1_eligible`, `detail_items_from`) consolidating what was previously 3 independently hand-copied def sets (`devteam-backlog-promote-bounded1.jq`, `devteam-backlog-promote-supervised-lane-sweep.jq`, `bounded1-supervised-lane-report.sh`) per the design principle adopted from SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW. `include "scripts/lib/devteam-eligibility";` resolves relative to CWD — every caller in this repo already runs from the project root (verified empirically, jq 1.8.1). Used by BOUNDED-1's, SLS's, RLC's, and QA-Drain's scripts plus both report scripts below. `has_unbacked_sequencing_prose` (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE, 2026-07-23) is wired as a conjunct into `is_bounded1_eligible` only (the mis-promote it closes was a BOUNDED-1 incident) — defined here, not in that one caller, so SLS/RLC can adopt the same predicate later without re-copying it, per the file's own one-shared-contract principle.
- `scripts/devteam-backlog-claim-ready-lane-consumer.jq` — Ready-Lane Consumer (RLC), UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-22) — see § Ready-Lane Consumer above. Claims the top-priority `ready[]` row (any source — BOUNDED-1/SLS/PM-decomposition) carrying a resolved next_agent/owner, not supervised/plan_only/epic-wrapper, `depends_on`-satisfied. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-backlog-claim-ready-lane-consumer.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/devteam-review-claim-qa-drain.jq` — Review-Lane QA-Drain, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-22), FOLDS FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN — see § Review-Lane QA-Drain above. Age-ordered claim of the oldest `review[]` row with `status==REVIEW && next_agent=='qa'`, moves review[]→qa[]. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-review-claim-qa-drain.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/audits/devteam-review-lane-drain-report.sh` — read-only visibility instrument (non-gating) for the Review-Lane QA-Drain's PRIMARY (auto-dispatched, `next_agent=='qa'`) vs SECONDARY (null/non-qa `next_agent`, PO/architect triage queue — PO AC(1), never silently dropped) split. Usage: `bash scripts/audits/devteam-review-lane-drain-report.sh [STALE_DAYS=3]`.
- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — **THE DoD/acceptance instrument for UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK.** Builds a live-shaped saturated fixture (pads to ready≈36/review≈32 if the live board has already drained, forces in_progress=1) and replays the REAL promote/claim scripts end-to-end, asserting each gate FIRES and DRAINS (row counts move between lanes) — not lane-resolution. Includes a negative control (in_progress padded to the WIP≤2 cap — confirms SLS/RLC would not be invoked). Usage: `bash scripts/audits/devteam-dispatch-gate-satisfiability.sh` (exit 0 = pass; never writes to the live file).

## Invariants

- WIP ≤ 2 (`.task_board.in_progress` length ONLY — corrected 2026-07-22, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK; `ready[]`/`review[]` are staging lanes, never counted toward concurrency) | `docs/data/orch/orch-state.json` `.task_board.active_sprints[].tasks` count ≤ 80 per sprint | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- Notify WORK at: fix shipped | sprint complete | blocker resolved | idle
- **DRAIN-INJECTION-SAFE (FLEET-HOST-SAFETY):** NEVER interpolate a signal/payload/DASHBOARD field into a `/bin/sh` command line. Safe patterns only: (a) `jq --arg` bound variables for any bash JSON/SQL step; (b) structured JSON object passed directly to `call_tool` MCP gateway `arguments` (no shell exposure); (c) write SQL to a tmp file then `sqlite3 db < file`. ALL `task_claim` payload fields in this flow and sub-flows MUST use pattern (b) — never a concatenated shell string. Reference: `feedback_signal_payload_shell_injection`. Violation = WORK alert + halt.

---

<!-- jump:end -->
## Session Exit

All JUMP TO `end` paths converge here.

```
# SF-1 release — always run on clean exit (TTL expiry is fallback for crash path)
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "dev-team-cron-singleton", owner_client_session: $CLAUDE_CODE_SESSION_ID })
# ok=false is acceptable (TTL already expired after a long tick, or SF-1 was never claimed on SKIP path)

# P3-FIRE-ELECTION release (TASK_1994) — run ONLY if fire-election was won (FIRE_TICK is set).
# FIRE_TICK is not set when we reach jump:end via the SF-1 skip path (early exit before Step [3]).
# On fire-election loss: we EXIT before jump:end (SF-1 released inline, fire-election not claimed).
# All other jump:end paths (HEAD.lock, session-gate, post-cycle) have FIRE_TICK set.
if FIRE_TICK is set:
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id:              "cron:dev-team:" + FIRE_TICK,
    owner_client_session: $CLAUDE_CODE_SESSION_ID
  })
  # ok=false acceptable (TTL=600s expired after long tick — crash-safety backstop served its purpose)
```
