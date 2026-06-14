<!-- size-justification: 375L — thin orchestration dispatcher; JUMP-TO table + Steps 0a (sub-flow) + 0a.5 CI-health probe (sub-flow pointer, +6L) + 0b session-gate (inline, expanded for v2 head-only read + legacy v1 fallback) + 1 PO triage (inline 5L) + 2 planning matrix + 3/4 sub-flow pointers + invariants. PREFLIGHT expanded c57: T1 lsof capture, T2 lock-size logging, T5 worktree prune, T6 24h expiry sweep. c59-T2 F4 retry ref (+2L). Steps 0b/1/2 too small to extract; sub-flows absorb Steps 0a/0a.5/3/4. c-obs: cron-start announce + start_epoch for elapsed tracking (+5L). Team Boundary expanded 2026-05-31: full 5-lane taxonomy + mutex-wrap pseudocode for on-demand maintenance/cowork spawns (+24L). PREFLIGHT self-arm cron-detect-loop skill pointer (+3L, -3L T1-future-comment = net 0). Step 0b expanded: pipeline-state v2 head-only read + legacy v1 fallback + narrative lazy-load contract (+12L). DRAIN-INJECTION-SAFE 2026-06-02: payload strings → structured objects + INVARIANT block (+4L). WF-1 2026-06-06: BLOCKED-task guard in Step 0b (+17L, AC-WF1-5). BGFAN-1 2026-06-07: background spawn mandate inline markers (+6L). FIX-DJ-GATE-DISPATCHER-SELFLIP-LEAK 2026-06-08: DJ-GATE-1 inline in S4 UNBLOCK + S4 CLEAN router self-flip paths (+6L). CI-HEALTH-FIX-BRIDGE 2026-06-08: Step 0a.5 CI probe sub-flow pointer (+6L). DEV-TEAM-TOOL-CONTRACT-CRON-OVERLAP 2026-06-14: SF-1 single-flight guard (task_claim dev-team-cron-singleton TTL=5400s) + GCC-PREFLIGHT read directive in Step 0-PREFLIGHT; SF-1 heartbeat at Step 3 entry; SF-1 release at jump:end (+20L). -->
# Dev Team — Cron Orchestration Flow (Thin Dispatcher)

<!-- BGFAN-1: ALL Agent spawns from THIS dispatcher MUST use run_in_background=true. Canonical rule + rationale → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate. Background ≠ parallel: gated chain (po→ba→…→qa) still serializes on completion notification; independent tier tasks fan out concurrently. Commit-mutex serialization unchanged. -->

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
  task_id:     agent_spawn_key,
  task_kind:   "sprint-task",
  owner_agent: "dev-team",
  ttl_seconds: 3600,
  payload:     "{\"site\":\"on-demand\",\"spawning\":\"" + agent_id + "\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
})
if not outer_claim.claimed:
  log "[dev-team] SKIP on-demand " + agent_id + " — cron holds lock (" + outer_claim.current_holder.owner_agent + ")"
  send_telegram(channel="work", message="[dev-team] on-demand " + agent_id + " SKIP — cron holds lock")
  # fall through; do NOT spawn
else:
  try:
    Agent(agent_id, context..., run_in_background=true)   # (background) — BGFAN-1
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: agent_spawn_key })
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

# SF-1: SINGLE-FLIGHT GUARD — session-level cron overlap prevention (TTL-only, no owner-session binding)
# Survives mcp-server restart: TTL clock continues; orphaned lock expiry is natural. → memory: lock_orphaned_by_rebuild
sf_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "dev-team-cron-singleton",
  task_kind:   "sprint-task",
  owner_agent: "dev-team",
  ttl_seconds: 5400,          # 90min — 1.5× observed 99th-pct tick duration; TTL-only, no owner-session pin
  payload:     {"site": "SF-1", "tick": ts}   # structured object — DRAIN-INJECTION-SAFE
})
if not sf_result.claimed:
  log "[dev-team] SF-1 SKIP — session already running (holder: " + sf_result.current_holder.owner_agent + " since " + sf_result.current_holder.claimed_at + ")"
  call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: "[dev-team] cron SKIP — single-flight held by peer (TTL ~" + sf_result.current_holder.expires_in_s + "s)"})
  JUMP TO end   # exit immediately — do NOT run any step

# SF-1 claimed — proceed with full cron tick

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
## Step 0a — Drain `docs/signals/`

→ Run sub-flow: `docs/agents/dev-team/flow/drain-signals.md`

Output: `pendingSignals[]` for Step 1, or empty.

If empty AND `docs/data/orch/orch-state.json` `.task_board` empty AND no Telegram reports → JUMP TO `session-gate`.

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

**v1 legacy (no `head` key):** field names were `status`/`activeTaskId`/`nextAgent`/`updatedAt` directly at root. Self-heal to v3 on next write (first writer detects `_schema` absent or < "v3" and writes v3 envelope).

- `head.status == "in_progress"` AND `head.next_agent` non-null AND `head.updated_at < 24h` →
  **WF-1 BLOCKED-task check (AC-WF1-5 — run FIRST, before S2 dispatcher-wrap):**
  ```bash
  task_status=$(jq -r --arg tid "$head_active_task" \
    '.task_board.active_sprints[].tasks[] | select(.id == $tid or .task_id == $tid) | .status' \
    docs/data/orch/orch-state.json | head -1)
  if [ "$task_status" = "BLOCKED" ]; then
    # BLOCKED task — reset head to idle so pipeline-resume never re-spawns it
    tmp=$(mktemp); now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
      '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
      docs/data/orch/orch-state.json > "$tmp"
    [ -s "$tmp" ] && jq -e '.head' "$tmp" > /dev/null && mv "$tmp" docs/data/orch/orch-state.json
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
    owner_agent: "dev-team", ttl_seconds: 3600,
    payload: "{\"site\":\"S2\",\"spawning\":\"" + head.next_agent + "\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
  })
  if not outer_claim.claimed:
    log "[dev-team] SKIP pipeline resume " + resume_key + " — held by peer session"
    # fall through to Step 1 (do NOT spawn)
  else:
    try:
      Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1; await task notification before next gate
    finally:
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key })
      # ok=false is acceptable (TTL expired or inner self-claim already released)
    JUMP TO execute
  ```
- `head.status == "in_progress"` AND `head.updated_at ≥ 24h` → stale crash, reset `head.status` to `"idle"`. Fall through to Step 1.
- `head.status == "idle"` or `head` missing or v1 schema → fall through to Step 1.

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
  owner_agent: "dev-team", ttl_seconds: 1800,
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
| UNBLOCK | — | S4: see dispatch block below | `send_telegram(channel="work", message="[dev-team] Unblocked: [brief]")` → EXIT |
| CLEAN | — | S4: see dispatch block below | qa flow handles cleanup → EXIT |

**S4 UNBLOCK dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + batch_id,
  task_kind:   "sprint-task",   # live enum: cowork-slot|sprint-task|dashboard-row|commit-mutex — "dev-team" is NOT valid (verified 2026-06-05)
  owner_agent: "dev-team",
  ttl_seconds: 3600
})
if result.claimed:
  spawn {route_to} run_in_background=true   # (background) — BGFAN-1
  # DJ-GATE-1 (journal-before-DONE — canonical gate → docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate):
  # Worker writes journal entry; if absent, router writes STEP via skill .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: batch_id].
  # Gate: grep docs/agent-memory/decisions/sprint-*-*.md for "task-id:** {batch_id}" — absent → run skill, then flip.
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id })
else:
  log "[dev-team] SKIP UNBLOCK " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

**S4 CLEAN dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + batch_id,
  task_kind:   "sprint-task",   # live enum: cowork-slot|sprint-task|dashboard-row|commit-mutex — "dev-team" is NOT valid (verified 2026-06-05)
  owner_agent: "dev-team",
  ttl_seconds: 3600
})
if result.claimed:
  spawn qa with branch list run_in_background=true   # (background) — BGFAN-1
  # DJ-GATE-1 (journal-before-DONE — canonical gate → docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate):
  # CLEAN auto-close: router is sole actor → run skill .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: batch_id] directly before flip.
  # Gate: grep docs/agent-memory/decisions/sprint-*-*.md for "task-id:** {batch_id}" — absent → run skill, then flip.
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id })
else:
  log "[dev-team] SKIP CLEAN " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

Architect MUST set `ZONE: apps/<service>/` in RETURN — PM propagates into handoff/RETURN per task. Step 3 zone-routes by this field. Agent contracts: each agent's `flows/<agent>/main.md` § Role in dev-team flow.

---

<!-- jump:execute -->
## Step 3 — Execution

<!-- SF-1 heartbeat: renew singleton session lock at Step 3 entry to cover long sprint ticks beyond initial 5400s TTL -->
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "dev-team-cron-singleton" })
# ok=false → lock stolen (peer recovered after stall) → log BUG + exit cleanly; do NOT fight the steal.
```

→ Run sub-flow: `docs/agents/dev-team/flow/execute-tier.md`

Covers: tier grouping, zone routing (3-tier resolution: explicit → infer → report), parallel spawn rules, conflict check, merge gate.

---

<!-- jump:post-cycle -->
## Step 4 + 4.5 — Scan + Compact

→ Run sub-flow: `docs/agents/dev-team/flow/post-cycle.md`

Covers: post-execution checks (4.0–4.1), Compact Checkpoint (4.5), doc self-heal.

---

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
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "dev-team-cron-singleton" })
# ok=false is acceptable (TTL already expired after a long tick, or SF-1 was never claimed on SKIP path)
```
