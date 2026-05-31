# Architecture Brief: Dev-Team Spawn Boundary Expansion

**Date:** 2026-05-31
**Author:** agents-architect
**Status:** READY-FOR-IMPLEMENTATION
**Target:** agent-father

---

## 1. Problem Statement

`docs/agents/dev-team/flow/main.md` lines 12 and 17 contain two hard NEVER-spawn fences that are too broad:

- **Line 12** bans all cowork agents (news-scout, market-watcher, bctc-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, fb-market-poster, qa-responder, market-analyst) from dev-team spawns.
- **Line 17** bans all maintenance agents (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) from dev-team spawns.

Consequence observed last cycle: dev-team encountered context-bloat breaches (tracked via the backstop hook signals in `docs/signals/`) but could not spawn `claude-manager-helper` to resolve them, leaving the maintenance lane completely dead-ended. The only workaround was YIELD — which halts productive work for an entire cron cycle.

Additionally, `apps/news-fetch/` has a well-defined zone with a flow file (`docs/agents/dev-news-fetch/flow/main.md`) but is absent from both `docs/data/system-map.json .project.agents[]` (as a `dev-zone` entry) and the dev-team roster comment, meaning zone routing silently falls to Tier-3 (generic `developer`), bypassing the zone-specific language lock and smoke-check rules.

---

## 2. Affected Files

| File | Change type |
|---|---|
| `docs/agents/dev-team/flow/main.md` | Edit — Team Boundary section (lines 4–17) |
| `docs/data/system-map.json` | Edit — add `dev-zone` entry for `apps/news-fetch/` |

No new agent `.md` files. No new cron slots. No new tool packages.

---

## 3. Safety Constraints — Non-Negotiable

The following constraints MUST be encoded in the implementation and must not be dropped by agent-father:

### 3.1 Recursion Guard — RETAINED

The hazard documented in memory `feedback_team_flow_is_dispatcher` is: spawning a **team dispatcher flow** (i.e. `cowork-team` or `dev-team`) inside `dev-team` causes infinite recursion. Individual cowork and maintenance agents are normal single-agent spawns and are safe.

**New rule (replaces the two current blanket bans):**
> dev-team may spawn ANY individual agent, but MUST NEVER spawn the `cowork-team` or `dev-team` dispatcher flows themselves.

The NEVER-spawn line must be retained and updated to name the two dispatcher flows explicitly.

### 3.2 Mutex-Wrap — Mandatory for Maintenance and Cowork On-Demand Spawns

Maintenance agents (claude-manager-helper, code-janitor, agent-father, agents-architect, system-auditor, cowork-refactory-expert, idea-forge) and cowork agents have their own cron schedules. To prevent dev-team from double-running a concurrently-executing cron instance, any on-demand spawn of these agents from dev-team MUST follow the dispatcher-wrap pattern already used at Steps 0b/1/2:

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
  log "[dev-team] SKIP on-demand spawn of " + agent_id + " — cron instance running (held by " + outer_claim.current_holder.owner_agent + ")"
  send_telegram(channel="work", "[dev-team] on-demand " + agent_id + " SKIP — cron holds lock")
  # fall through; do NOT spawn
else:
  try:
    Agent(agent_id, context...)
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: agent_spawn_key })
```

Skill reference: `.claude/skills/task-lock/SKILL.md` (dispatcher-wrap pattern).

This mutex-wrap applies to maintenance + cowork on-demand spawns only. Dev-core and dev-zone agents are task-claimed at execute-tier (existing mechanism in `execute-tier.md`) and do not need the new on-demand wrap.

### 3.3 SSOT Mirror Note — RETAINED

The roster comment on line 10 of `main.md` must be kept and updated to mirror the expanded roster:
```
<!-- roster mirrors docs/data/system-map.json .project.agents[]; re-sync here when roster changes -->
```

### 3.4 Cross-Team Signalling — UNCHANGED

The DASHBOARD.md signal-row handoff via `.claude/skills/signal-dashboard/SKILL.md` is NOT removed. On-demand cowork spawn is an ADDITIONAL option available when dev-team needs an immediate result from a cowork agent (e.g. re-run bctc-analyst on a ticker after a code fix). The normal cross-team handoff stays the primary channel for non-urgent cross-team work.

---

## 4. Exact Edits to `docs/agents/dev-team/flow/main.md`

### 4.1 Replace the Team Boundary section (lines 4–17)

**Remove (lines 4–17 in current file):**

```markdown
## Team Boundary (Sprint 1951c)

This flow fan out ONLY dev-team subagents:
- **dev-core:** po, ba, architect, pm, developer, qa, fixer
- **dev-zone:** dev-mcp-server, dev-api-gateway, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-pdf-extractor, dev-rag-service, dev-frontend, dev-mainserver-crawls, dev-vps-crawls
- **ops** lane (ops, ops-mainserver-fetch, ops-vps-fetch) — shared infra lane; spawned on infra/fetch incident, not cowork agents
<!-- roster mirrors docs/data/system-map.json .project.agents[]; re-sync here when roster changes -->

NEVER spawn cowork-team agents (news-scout, market-watcher, bctc-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, fb-market-poster, qa-responder, market-analyst) from this flow.
<!-- spawn-guard: policy-only — no runtime assertion; enforced by convention, not code check (ITEM-16 doc note, 1967-10) -->

Cross-team work (e.g. cowork agent reports a code bug): write a signal row to `docs/signals/DASHBOARD.md` per skill `.claude/skills/signal-dashboard/SKILL.md`. The cowork-team flow reads the dashboard at its next cycle.

Maintenance agents (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) are invoked by main terminal or self-cron — NEVER spawned by this dispatcher.
```

**Replace with:**

```markdown
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
```

---

## 5. Exact Edit to `docs/data/system-map.json`

### 5.1 Add `dev-news-fetch` dev-zone entry

In `docs/data/system-map.json`, locate the `"agents"` array. After the `dev-vps-crawls` entry (currently the last `dev-zone` type entry), insert:

```json
      {
        "id": "dev-news-fetch",
        "type": "dev-zone",
        "zone": "apps/news-fetch",
        "owner_agent": "developer",
        "note": "No dedicated specialist; generic developer routed here by zone. Flow: docs/agents/dev-news-fetch/flow/main.md"
      },
```

This registers the zone so that zone-detect skill resolves `apps/news-fetch/` tasks to the correct flow (with TS/Bun language lock) rather than falling to Tier-3 generic routing.

---

## 6. Size Budget

`docs/agents/dev-team/flow/main.md` is currently 172L (size-justification comment on line 1). The expanded Team Boundary section adds approximately 25L (the mutex-wrap pseudocode block). New total ≈ 197L, which is under the 200L soft cap. Agent-father MUST verify `wc -l` after edit and update the size-justification comment on line 1 if it changes.

If the new line count exceeds 200L, extract the on-demand mutex-wrap pseudocode to a new sub-file `docs/agents/dev-team/flow/on-demand-spawn.md` and replace the inline block with a pointer. Agent-father decides at implementation time based on actual count.

---

## 7. Sequencing

1. Edit `docs/data/system-map.json` — add dev-news-fetch entry. (No flow file changes needed for this; zone is already wired via `docs/agents/dev-news-fetch/flow/main.md`.)
2. Edit `docs/agents/dev-team/flow/main.md` — replace Team Boundary section, add dev-news-fetch to dev-zone roster line, update size-justification comment.
3. Verify `wc -l docs/agents/dev-team/flow/main.md` — update size-justification on line 1.
4. Commit both files atomically.

No Docker restart needed. No MCP server changes. No new cron slots.

---

## 8. Acceptance Criteria

- [ ] `docs/agents/dev-team/flow/main.md` Team Boundary section contains all four lanes (dev-core, dev-zone, ops, maintenance, cowork).
- [ ] `dev-news-fetch` appears in the dev-zone roster line of `main.md`.
- [ ] NEVER-spawn line names `cowork-team` and `dev-team` dispatcher flows explicitly (not a generic ban on cowork agents).
- [ ] Mutex-wrap pseudocode present for maintenance + cowork on-demand spawns.
- [ ] SSOT mirror comment retained.
- [ ] Cross-team DASHBOARD.md note retained.
- [ ] `docs/data/system-map.json` has a `dev-zone` entry with `"id": "dev-news-fetch"`, `"zone": "apps/news-fetch"`.
- [ ] Size-justification comment on line 1 of `main.md` updated to reflect new line count.
- [ ] Both files committed atomically in a single commit.
