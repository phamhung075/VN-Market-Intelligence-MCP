<!-- size-justification: 697L — thin orchestration dispatcher; JUMP-TO table + Steps 0a (sub-flow) + 0a.5 CI-health probe (sub-flow pointer, +6L) + 0b session-gate (inline, expanded for v2 head-only read + legacy v1 fallback) + 1 PO triage (inline 5L) + 2 planning matrix + 3/4 sub-flow pointers + invariants. PREFLIGHT expanded c57: T1 lsof capture, T2 lock-size logging, T5 worktree prune, T6 24h expiry sweep. c59-T2 F4 retry ref (+2L). Steps 0b/1/2 too small to extract; sub-flows absorb Steps 0a/0a.5/3/4. c-obs: cron-start announce + start_epoch for elapsed tracking (+5L). Team Boundary expanded 2026-05-31: full 5-lane taxonomy + mutex-wrap pseudocode for on-demand maintenance/cowork spawns (+24L). PREFLIGHT self-arm cron-detect-loop skill pointer (+3L, -3L T1-future-comment = net 0). Step 0b expanded: pipeline-state v2 head-only read + legacy v1 fallback + narrative lazy-load contract (+12L). DRAIN-INJECTION-SAFE 2026-06-02: payload strings → structured objects + INVARIANT block (+4L). WF-1 2026-06-06: BLOCKED-task guard in Step 0b (+17L, AC-WF1-5). BGFAN-1 2026-06-07: background spawn mandate inline markers (+6L). FIX-DJ-GATE-DISPATCHER-SELFLIP-LEAK 2026-06-08: DJ-GATE-1 inline in S4 UNBLOCK + S4 CLEAN router self-flip paths (+6L). CI-HEALTH-FIX-BRIDGE 2026-06-08: Step 0a.5 CI probe sub-flow pointer (+6L). DEV-TEAM-TOOL-CONTRACT-CRON-OVERLAP 2026-06-14: SF-1 single-flight guard (task_claim dev-team-cron-singleton TTL=5400s) + GCC-PREFLIGHT read directive in Step 0-PREFLIGHT; SF-1 heartbeat at Step 3 entry; SF-1 release at jump:end (+20L). P2-PRESENCE 2026-06-28 (TASK_1990): session-presence claim in PREFLIGHT before SF-1; heartbeat at Step 3 alongside SF-1 heartbeat (+30L). P3-FIRE-ELECTION 2026-06-28 (TASK_1994): Step [3] fire-time election after SF-1, before HEAD.lock guard; on loss release SF-1 + EXIT; FIRE_TICK release at jump:end (+35L). TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 2026-07-02: new Step 0-PREFLIGHT — deterministic scripts/agents-flow/dev-team-tick-preflight.sh replaces the presence/SF-1/fire-election chain on the common RUN/SKIP path (+~28L); original inline pseudocode split into jump:preflight-fallback (presence/SF-1/fire-election, ERROR-fallback only) + jump:gcc-preflight (GCC-PREFLIGHT/HEAD.lock/worktree-GC, shared RUN+fallback continuation) — both UNCHANGED, kept verbatim. P1-IDLE-DEVTEAM-FLOW-BRANCH 2026-07-04: new `RUN-IDLE` row in the Step 0-PREFLIGHT JUMP-TO table — script Step 5 idle-check (empty board+signals) mirrors cowork silent-release: log + release both locks + JUMP TO `end` directly, bypassing `gcc-preflight` and Step 0a `drain-signals` entirely (zero commit on idle ticks) (+1L). SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1 2026-07-04: new "Idle-capacity backlog pickup (BOUNDED-1)" step in Step 0b's head-idle fall-through, BEFORE Step 1 PO triage — closes the gap where PO triage never sweeps plain backlog[] rows; wires scripts/devteam-backlog-promote-bounded1.jq + scripts/devteam-backlog-claim-bounded1.jq (both orch-apply.sh-gated, no hardcoded task IDs) capped at WIP<1 for this lane; JUMP TO execute on successful claim (+29L, Reusable Scripts entry included). FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE 2026-07-12: Promote bullet gains two sibling gates (DETAIL-DEFERRED + NON-DEV-OWNER), same detail-authoritative precedence pattern as SUPERVISED/EPIC-WRAPPER/DEPENDS-ON above; new Reusable Scripts pointer for the read-only regression verifier (+~14L). FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE 2026-07-12: Promote bullet gains 4th sibling gate (NON-DEV-NEXT_AGENT, keys off detail `.next_agent` instead of `.owner` — catches rows where `owner` is absent but `next_agent` names a non-dev handler); Reusable Scripts pointer updated in place (+~5L). FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE 2026-07-13: one-line MUST pointer added after the Step 3 execute-tier.md sub-flow pointer — SSOT clause lives in execute-tier.md § MUST — Status-Flip = Lane-Move (kept thin here per ≤200L-per-doc discipline; execute-tier.md has headroom, main.md does not) (+2L). Leading total corrected 681L→697L (pre-existing drift from untracked prior edits, fixed while this line was already touched). -->
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

```bash
WIP=$(jq '(.task_board.ready|length)+(.task_board.in_progress|length)' docs/data/orch/orch-state.json)
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
# WIP>=1, or nothing eligible was promoted/claimed -> fall through unchanged, continue to Session Gate / Step 1 PO triage
```

- **Promote** (`scripts/devteam-backlog-promote-bounded1.jq`): selects the SINGLE top-priority row from `.task_board.backlog[]` where `status ∈ {BACKLOG, TODO}` AND `effective_supervised != true` AND NOT an epic wrapper AND `depends_on` is eligible AND NOT detail-DEFERRED* AND NOT a non-dev-owner+null-next_agent row — the Phase-1 supervised set (see `.head.note` history) stays held for router-adjudicated dispatch and is NEVER auto-promoted here. **SUPERVISED GATE (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09):** `effective_supervised` = true if EITHER inline `.supervised` on the board row OR — detail-authoritative — `docs/data/orch/archive/backlog-detail.json` `.items[<id>].supervised` is true (no `.detail_ref` precondition; lookup is keyed purely by `.id`); absent/null in both = NOT supervised (promotable). Closes the 2026-07-09T15:48Z near-miss where the old board-row-only check silently treated every detail_ref'd supervised row as unsupervised. **EPIC-WRAPPER GATE (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10):** `is_epic_wrapper` = true if EITHER inline `.children` on the board row OR `docs/data/orch/archive/backlog-detail.json` `.items[<id>].children` resolves to a non-empty array (same no-`.detail_ref`-precondition precedence as the supervised gate) — decomposition-container rows (e.g. `mode=audit-epic`/multi-child SPIKEs) are NEVER auto-promoted, independent of the `supervised` flag's value. Closes the 2026-07-09T23:17Z near-miss (`AUDIT-FETCH-COMPLETE` auto-claimed, point-fixed by hand with `supervised:true`) plus the structurally identical `FACTORY-GUARD-CI-REGRESSION-SPIKE` row, which the supervised gate alone could not catch (`supervised:null` everywhere). **DEPENDS-ON GATE (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08):** effective `depends_on` = inline `.depends_on` on the board row if non-empty, else — for `detail_ref`'d rows — the lookup in `docs/data/orch/archive/backlog-detail.json` `.items[<id>].depends_on`, else `[]`; a dep is satisfied ONLY if it resolves to `status == "DONE_VERIFIED"` in ANY task_board lane (plain `DONE` is NOT sufficient), and a dep id found in NO lane is treated as UNSATISFIED (conservative-skip). Filter applies during candidate selection so a blocked top-ranked row cannot starve an eligible lower-ranked one. Requires `--slurpfile detail docs/data/orch/archive/backlog-detail.json` on the invocation (see block above). **DETAIL-DEFERRED GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12):** a row is gated if `docs/data/orch/archive/backlog-detail.json` `.items[<id>].status` is a non-null string whose ascii-downcased value STARTS WITH `"deferred"` (case-insensitive; covers `DEFERRED`, `DEFERRED-INFRA`, and any future `DEFERRED-<reason>` variant — 11 detail rows carry a detail-DEFERRED* status live today); looked up purely by `.id` (no `.detail_ref` precondition, same precedence as the supervised/children gates); absent/null detail status = NOT gated (promotable). Closes the 2026-07-12 near-miss where `BCTC-HIST-VPS-BACKFILL` (detail status `DEFERRED-INFRA`) was re-picked at 09:37Z and 10:07Z because the board layer never mirrors a detail DEFERRED* disposition back onto the thin backlog[] row's own `status` field. **NON-DEV-OWNER GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12):** a row is gated ONLY if BOTH hold — (1) `docs/data/orch/archive/backlog-detail.json` `.items[<id>].owner` is a non-empty string that does NOT match the dev-role pattern `^dev(-|$)|^developer$` (case-insensitive, i.e. it names a deliberate-launch owner such as po/ops/architect/agents-architect/ba/pm/qa/agent-father/system-auditor), AND (2) the BOARD row's `.next_agent` is null/absent/empty (see the "NON-CODE / DESIGN row `next_agent` gap" note below — with no `next_agent`, zone-detect's Tier-3 fallback would mis-route the row to the generic `developer` placeholder). Scoped to THIS unattended idle-pickup lane only — gated rows still launch normally via the router-adjudicated path; conservative default (absent/empty owner, dev-role owner, or a non-empty `next_agent`) = NOT gated (promotable). Closes the 2026-07-12 near-miss where the next two queued BOUNDED-1 picks behind `BCTC-HIST-VPS-BACKFILL`, `FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW` and `IND-ROADMAP-LEDGER` (both `owner:"po"`, `next_agent:null`), were the same structural class. **PLAN-ONLY GATE (FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE, 2026-07-12):** a row is gated if `docs/data/orch/archive/backlog-detail.json` `.items[<id>].plan_only` is exactly `true` — looked up purely by `.id` (no `.detail_ref` precondition, same precedence as the sibling gates above); conservative default (absent/null detail `plan_only`) = NOT gated (promotable). `plan_only:true` detail rows are plan-first / architect-recon asks, not autonomous code-fixes, and are withheld from idle auto-pickup — route them via deliberate architect/PO dispatch instead. Closes the 2026-07-12 near-miss where `FIX-MCP-MEMORY-CODE-LEAK` (board `status:BACKLOG, next_agent:null`, detail `plan_only:true, next_agent:"architect", owner:"dev", status:"TODO"`) defeated both the DETAIL-DEFERRED gate (`status:"TODO"` doesn't start with "deferred") and the NON-DEV-OWNER gate (`owner:"dev"` is a dev-role owner) and was auto-picked/routed to a dev specialist as an autonomous code-fix. **NON-DEV-NEXT_AGENT GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12):** sibling of NON-DEV-OWNER but keys off detail `.next_agent` instead of `.owner` — a row is gated ONLY if BOTH hold: (1) `docs/data/orch/archive/backlog-detail.json` `.items[<id>].next_agent` is a non-empty string that does NOT match the dev-role pattern (same regex/precedence as NON-DEV-OWNER), AND (2) the BOARD row's `.next_agent` is null/absent/empty; conservative default = NOT gated (promotable). Closes the 2026-07-12 near-miss where `FEAT-SEVERITY-OVERRIDE-SURFACING` (detail `next_agent:"architect"`, no `owner` field at all) defeated the NON-DEV-OWNER gate (silent on an absent `owner`) and would have been auto-promoted for a single-`developer` Tier-3 zone-detect mis-route, skipping the required ba→architect→pm relay. Regression verifier: `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` (dynamic live-data fixtures, no hardcoded task IDs — see Reusable Scripts below). Moves the picked row backlog→ready, stamps `promoted_at`/`promoted_by`/`promotion_note` + `.task_board.last_triaged_at`/`last_triaged_by`. No-op (identity) if `WIP >= 1` or nothing eligible.
- **Claim** (`scripts/devteam-backlog-claim-bounded1.jq`): moves the bounded-1-stamped ready row → in_progress, sets `.head.status="in_progress"`, `.head.active_task_id=<id>`, `.head.next_agent` (the row's own `next_agent` if set, else `"developer"` placeholder — Step 3's zone-detect skill re-resolves the real specialist from the task's `zone`/files). No-op if nothing bounded-1-stamped is waiting in `ready[]`.
- Both writes go through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite.
- **NON-CODE / DESIGN row `next_agent` gap (found 2026-07-09T17:48Z, `ARCH-HEADLESS-GATEWAY-COWORK-NOPOST`):** `.claude/skills/zone-detect/SKILL.md` only ever resolves a task to `dev-<service>` or generic `developer` (Tier 1/2 need `apps/<service>/`-shaped `zone`/`files`; Tier 3 fallback is also `developer`) — it has **no path to `agents-architect`, `architect`, `ba`, `pm`, or any non-dev-* specialist**. A BOUNDED-1-picked row whose thin board entry has no `next_agent` gets the `"developer"` placeholder above regardless of `type`. Before letting zone-detect run on the claimed row, check `docs/data/orch/archive/backlog-detail.json .items[<id>].owner` (and `.type`) — if `owner` names a non-dev-* agent (e.g. `agents-architect` for `type:"design"` root-cause/architecture asks), correct `.head.next_agent` (and the task row's own `next_agent`) to that owner via `orch-apply.sh` BEFORE dispatch, instead of routing a design/doc deliverable to `developer` through zone-detect's Tier-3 fallback.

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
- `scripts/devteam-backlog-promote-bounded1.jq` + `scripts/devteam-backlog-claim-bounded1.jq` — generalized (no hardcoded task IDs), idempotent BOUNDED-1 backlog→ready→in_progress pickup for the Idle-capacity backlog pickup step above (SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1); promote applies a depends_on eligibility gate (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08) plus the detail-DEFERRED / non-dev-owner / plan-only / non-dev-next_agent gates (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE + FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE + FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12) — see step description above. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-backlog-promote-bounded1.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` then the claim script the same way (claim script unchanged, no `--slurpfile` needed).
- `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` — read-only regression verifier for the FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE + PLAN-ONLY-GATE + DETAIL-NEXTAGENT-NONDEV-GATE gates above; builds synthetic single-row fixtures from live `docs/data/orch/orch-state.json` + `backlog-detail.json` data (discovered dynamically, no hardcoded task IDs; never writes back, no `orch-apply.sh` call) and asserts a detail-DEFERRED* row, a non-dev-owner+null-next_agent row, a plan_only row, and a non-dev-detail-next_agent+null-board-next_agent row are NEVER promoted while a clean row still is. Usage: `bash scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` (exit 0 = pass).

## Invariants

- WIP ≤ 2 | `docs/data/orch/orch-state.json` `.task_board.active_sprints[].tasks` count ≤ 80 per sprint | project-stats.json updated each sprint
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
