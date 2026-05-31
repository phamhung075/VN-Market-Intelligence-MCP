<!-- size-justification: 280L — thin orchestration dispatcher; JUMP-TO table + Steps 0a (sub-flow) + 0b session-gate (inline 12L) + 1 PO triage (inline 5L) + 2 planning matrix + 3/4 sub-flow pointers + invariants. PREFLIGHT expanded c57: T1 lsof capture, T2 lock-size logging, T5 worktree prune, T6 24h expiry sweep. c59-T2 F4 retry ref (+2L). Steps 0b/1/2 too small to extract; sub-flows absorb Steps 0a/3/4. c-obs: cron-start announce + start_epoch for elapsed tracking (+5L). Team Boundary expanded 2026-05-31: full 5-lane taxonomy + mutex-wrap pseudocode for on-demand maintenance/cowork spawns (+24L). PREFLIGHT self-arm cron-detect-loop skill pointer (+3L, -3L T1-future-comment = net 0). -->
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

**Cross-team work** (cowork agent reports a code bug): write a signal row to `docs/signals/DASHBOARD.md` per skill `.claude/skills/signal-dashboard/SKILL.md`. This remains the primary channel. Direct on-demand cowork spawn is ADDITIONAL (for cases where dev-team needs immediate cowork output after a code change).

**On-demand spawn of maintenance/cowork agents — mutex-wrap REQUIRED:**
Before spawning any agent from the maintenance or cowork lanes, claim a lock keyed on the agent id to prevent double-running a concurrent cron instance:
```
agent_spawn_key = "task:on-demand:" + agent_id + ":" + $(date -u +"%Y%m%d")
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     agent_spawn_key,
  task_kind:   "sprint-task",
  owner_agent: "dev-team",
  ttl_seconds: 3600,
  payload:     '{"site":"on-demand","spawning":"' + agent_id + '"}'
})
if not outer_claim.claimed:
  log "[dev-team] SKIP on-demand " + agent_id + " — cron holds lock (" + outer_claim.current_holder.owner_agent + ")"
  send_telegram(channel="work", "[dev-team] on-demand " + agent_id + " SKIP — cron holds lock")
  # fall through; do NOT spawn
else:
  try:
    Agent(agent_id, context...)
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: agent_spawn_key })
```
Skill ref: `.claude/skills/task-lock/SKILL.md` § Dispatcher-Wrap Pattern.

## Input
`read_telegram_reports(status="new")` | `list_unresolved_reports()` | docs/TASKS.md | git log (last 30 commits) | `git branch`

## Output
Tasks executed → docs/TASKS.md updated → WORK notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md`

| Spawn context | JUMP TO | Detail file |
|---|---|---|
| Cold start / cron tick | `preflight` | inline below |
| HEAD.lock cleared / preflight pass | `drain-signals` | `drain-signals.md` (includes Step 0a-D: DASHBOARD.md cross-team drain) |
| Pipeline resume (`in_progress`) | `pipeline-resume` | inline below |
| FIX / direct task | `execute` | `execute-tier.md` |
| Post-execution verification only | `post-cycle` | `post-cycle.md` |
| Empty signals + empty TASKS.md + no reports | `session-gate` | inline below |

---

<!-- jump:preflight -->
## Step 0-PREFLIGHT — HEAD.lock Guard + Worktree GC

> Full algorithm + escalation tree → `docs/protocols/head-lock-self-cure.md`

```
ts          = $(date -u +%Y%m%dT%H%M%SZ)
start_epoch = $(date +%s)
ts_human    = $(date "+%Y-%m-%d %H:%M:%S %Z")   # local wall-clock for readability
send_telegram(channel="work", message="[dev-team] cron START — actual fire {ts_human} ({ts})")
# Self-arm detect→plan loop (idempotent — skill Step 1 CronList guard makes this a no-op once armed)
→ skill: .claude/skills/cron-detect-loop/SKILL.md
# Guarantees system-auditor Tier-1/2/3 + dev-team crons stay live while this always-on session runs.

if .git/HEAD.lock not exists:
  # T5: worktree prune (always, lock absent branch)
  pruned = $(git worktree prune -v 2>&1 | head -20)
  if pruned non-empty: send_telegram(work, "[PREFLIGHT] git worktree prune: {pruned}")
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
    send_telegram(work, "[PREFLIGHT] HEAD.lock removed — age={age}s size={lock_size}B pid_alive=false — {ISO timestamp}")
    session_headlock_count++
    if session_headlock_count >= 3 within 24h:
      send_telegram(work, "HEAD.lock recurred 3x in 24h — architect rethink needed")
      write docs/signals/{ts}-headlock-recurrence.json:
        {from: "dev-team", to: "architect", type: "recurring-bug", payload: {module: ".git/HEAD.lock", count: 3}}
    # T5+T6: run worktree gc after lock clearance too
    pruned = $(git worktree prune -v 2>&1 | head -20)
    if pruned non-empty: send_telegram(work, "[PREFLIGHT] git worktree prune: {pruned}")
    if .claude/worktrees/ exists:
      for each f in .claude/worktrees/*/.git/*.lock:
        age_h = (now() - mtime(f)) / 3600
        if age_h > 24: log "[PREFLIGHT] expired worktree lock: {f} age={age_h}h removed"; rm -f {f}
    JUMP TO drain-signals

  elif age <= 60s:
    send_telegram(bug, "HEAD.lock too young ({age}s) size={lock_size}B — may be active write — escalate ops")
    JUMP TO end

  elif pid_alive:
    send_telegram(bug, "HEAD.lock held by live git pid size={lock_size}B — escalate ops")
    JUMP TO end
```

---

<!-- jump:drain-signals -->
## Step 0a — Drain `docs/signals/`

→ Run sub-flow: `docs/agents/dev-team/flow/drain-signals.md`

Output: `pendingSignals[]` for Step 1, or empty.

If empty AND TASKS.md empty AND no Telegram reports → JUMP TO `session-gate`.

---

<!-- jump:pipeline-resume -->
## Step 0b — Pipeline Resume + Session Gate

- `in_progress` AND `nextAgent` AND `updatedAt < 24h` → dispatcher-wrap then spawn `nextAgent`. JUMP TO `execute`.
  ```
  # S2 dispatcher-wrap:
  bare_task_id = pipeline_state.activeTaskId   # read from docs/pipeline-state.json
  resume_key   = "task:" + bare_task_id
  outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: resume_key, task_kind: "sprint-task",
    owner_agent: "dev-team", ttl_seconds: 3600,
    payload: '{"site":"S2","spawning":"' + nextAgent + '"}'
  })
  if not outer_claim.claimed:
    log "[dev-team] SKIP pipeline resume " + resume_key + " — held by peer session"
    # fall through to Step 1 (do NOT spawn)
  else:
    try:
      Agent(nextAgent, context...)
    finally:
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key })
      # ok=false is acceptable (TTL expired or inner self-claim already released)
    JUMP TO execute
  ```
- `in_progress` AND `updatedAt ≥ 24h` → stale crash, reset to `"idle"`. Fall through to Step 1.
- `"idle"` or missing → fall through to Step 1.

<!-- jump:session-gate -->
**Session Gate:** TASKS.md empty AND no Telegram reports AND `pendingSignals` empty → `send_telegram(work, "Dev loop idle.")` → JUMP TO `end`.

---

<!-- jump:po-triage -->
## Step 1 — PO Triage

```
# S3 dispatcher-wrap — dedup guard before PO spawn:
triage_key  = "task:po-triage-" + $(date -u +"%Y%m%d")   # e.g. task:po-triage-20260521
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: triage_key, task_kind: "sprint-task",
  owner_agent: "dev-team", ttl_seconds: 1800,
  payload: '{"site":"S3","spawning":"po"}'
})
if not outer_claim.claimed:
  log "[dev-team] SKIP PO triage — already running in peer session"
  JUMP TO end   # do NOT spawn po
# Claim succeeded — spawn PO:
```
→ Spawn `po` with: `pendingSignals[]`, `read_telegram_reports(status="new")`, `list_unresolved_reports()`, `docs/TASKS.md`, `git log --oneline -30`, `git branch`
→ PO contract: `docs/agents/po/flow/main.md` § Role in dev-team flow
→ Return: `NOTHING` (→ idle EXIT) | `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])`
```
# After PO spawn returns:
call_tool(server="vn-market", tool="task_release", arguments={ task_id: triage_key })
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
| UNBLOCK | — | S4: see dispatch block below | `send_telegram(work, "Unblocked: [brief]")` → EXIT |
| CLEAN | — | S4: see dispatch block below | qa flow handles cleanup → EXIT |

**S4 UNBLOCK dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + batch_id,
  task_kind:   "dev-team",
  owner_agent: "dev-team",
  ttl_seconds: 3600
})
if result.claimed:
  spawn {route_to}
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id })
else:
  log "[dev-team] SKIP UNBLOCK " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

**S4 CLEAN dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + batch_id,
  task_kind:   "dev-team",
  owner_agent: "dev-team",
  ttl_seconds: 3600
})
if result.claimed:
  spawn qa with branch list
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id })
else:
  log "[dev-team] SKIP CLEAN " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

Architect MUST set `ZONE: apps/<service>/` in RETURN — PM propagates into handoff/RETURN per task. Step 3 zone-routes by this field. Agent contracts: each agent's `flows/<agent>/main.md` § Role in dev-team flow.

---

<!-- jump:execute -->
## Step 3 — Execution

→ Run sub-flow: `docs/agents/dev-team/flow/execute-tier.md`

Covers: tier grouping, zone routing (3-tier resolution: explicit → infer → report), parallel spawn rules, conflict check, merge gate.

---

<!-- jump:post-cycle -->
## Step 4 + 4.5 — Scan + Compact

→ Run sub-flow: `docs/agents/dev-team/flow/post-cycle.md`

Covers: post-execution checks (4.0–4.1), Compact Checkpoint (4.5), doc self-heal.

---

## Invariants

- WIP ≤ 2 | docs/TASKS.md ≤ 80 lines | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- Notify WORK at: fix shipped | sprint complete | blocker resolved | idle
