# Dev Team — Step 3: Execution (Tiered, Zone-Routed, Worktree-Parallel)

<!-- BGFAN-1: ALL Agent spawns in this file MUST use run_in_background=true. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate. Independent tier tasks fan out concurrently (parallel background); commit-mutex serialization unchanged. -->

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 3 dispatcher)

Read `pm` return for task list + dependency map. Each task carries `zone:` field (mandatory per PM/architect contract).

---

## Tier Grouping

```
Tier 1: no deps → spawn ALL in one message (parallel)
Tier 2: depends on Tier 1 → spawn after Tier 1 Done
Tier 3: depends on Tier 2 → etc.
```

## Zone Routing — 3-Tier Resolution

→ Load skill: `.claude/skills/zone-detect/SKILL.md` (`fail_loud: true`)

Apply the skill's 2-step inference logic per task. Full zone→specialist table and Tier-1/2/3 resolution rules are in the skill.

Tier 3 firing on any task in a cycle = upstream bug (PO emitted zone-less FIX). Each Tier-3 spawn auto-drops a `zone_missing_tier3` signal per the skill's signal schema. Cumulative count > 5 in one cycle = escalate to architect via WORK channel.

## Mode Flag

Batches of type SPIKE carry `mode: "spike"` — the spawned developer (or dev-* zone agent) reads `feature-spike.md` instead of its default flow. All other batch types use the default flow.

## Per-Tier Parallel Spawn

**Dispatcher-wrap (Phase 3.5):** Before spawning any agent in a tier batch, claim each task first. Spawn only claimed tasks. Release all after the batch returns.

```
# Step 1 — Claim each task in the tier batch:
spawned_batch = []
for each (agent, task_id) in tier_batch:
  # SAFE-JSON: payload built as a structured object — NEVER interpolate task_id/agent into a /bin/sh string.
  # INVARIANT: no agent-authored or PM-authored field (task_id, agent name, zone) may appear
  #            in a shell command line. Use jq --arg pattern if a bash step is ever needed here.
  outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:     "task:" + task_id,
    task_kind:   "sprint-task",
    owner_agent: "dev-team",
    ttl_seconds: 3600,
    payload:     JSON.stringify({site: "S1", spawning: agent})   // live schema requires a SERIALIZED JSON STRING (verified 2026-06-05); build object with bound params, stringify last — never shell-concatenate
  })
  if not outer_claim.claimed:
    log "[dev-team] SKIP task:" + task_id + " — held by " + outer_claim.current_holder.owner_agent
    send_telegram(work, "[dev-team] SKIP collision task:" + task_id + " — held by peer session")
  else:
    spawned_batch.append((agent, task_id))

# Step 2 + 3 — Spawn claimed tasks; release in finally (reachable on ALL exit paths):
try:
  → Agent(dev-stock-price, taskA, run_in_background=true) + Agent(dev-alert-engine, taskB, run_in_background=true)   # (background) devs parallel — BGFAN-1
  → Agent(qa, taskA, run_in_background=true) + Agent(qa, taskB, run_in_background=true)                               # (background) QA parallel (different branches)
  → Agent(fixer, taskA, run_in_background=true) + Agent(fixer, taskB, run_in_background=true)                         # (background) fixer if needed
  # (only tasks in spawned_batch are included)
finally:
  for each (agent, task_id) in spawned_batch:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
    # ok=false is acceptable (TTL expired or inner self-claim already released)
```

**Worktree isolation:** add `isolation: "worktree"` to each Agent call. Main terminal merges worktree branches (fast-forward if disjoint) after tier returns. See `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`. Sequential MANDATORY until c44 pass (Phase 3); Phase 4 relaxes after c44+c45.

### Conflict Check Before Parallel Spawn

- Different files, disjoint scopes → parallel (`isolation: "worktree"`)
- Same file modified by both → sequential (omit `isolation`)
- Task B `depends_on` Task A → sequential
- Shared SSOT write (`docs/data/orch/orch-state.json`, project-stats.json, any agent .md) → sequential
- Same test suite → parallel ok if different test files AND no shared SQLite DB

### Developer Spawn Constraint (Invariant)

All developer agents MUST use `git commit -m "..."` (index-only). NEVER use `git commit -am` or `git commit -a` — the `-a` flag greedily stages untracked index content from other sources and violates C2 atomicity (root cause of c47 incident).

## Merge Gate (After Each Tier — Sequential)

Enter only after ALL tier agents returned.

```
1. bash scripts/audits/index-check.sh  → abort + WORK alert if exit 1 (Control 1)
2. For each agent branch in tier order (one-by-one, NOT batch):
   a. git cherry-pick <sha>  OR  git merge --ff-only <branch>
   b. bash scripts/audits/tree-verify.sh <cherry-sha>  → if exit 1: STOP, WORK alert, Control 5
   c. git worktree remove <path>  (worktree agents only)
   d. git branch -d <branch>      (worktree agents only)
3. bash scripts/audits/c2-alert.sh <new-HEAD-sha>  (Control 4 — non-blocking, prints warning)
4. If Control 1 or Control 3 fired: STOP tier, WORK alert, await human.
   Recovery: bash scripts/audits/recovery-snapshot.sh  (operator-explicit only — Control 5)
5. All controls pass → spawn pm (run_in_background=true) (background — BGFAN-1) to update `docs/data/orch/orch-state.json` `.task_board` + unblock next tier
```
