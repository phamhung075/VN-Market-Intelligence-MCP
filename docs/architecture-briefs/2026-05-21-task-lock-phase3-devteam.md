# Architecture Brief — Phase 3 Task-Lock Dev-Team Wiring

**Date:** 2026-05-21
**Sprint:** 1960 (task 1960a)
**Author:** architect
**Status:** READY FOR IMPLEMENTATION
**Predecessor briefs:**
- `docs/architecture-briefs/2026-05-20-task-lock-system.md` — full Phase 1+2+3 design
- `docs/protocols/task-lock-protocol.md` — claim/heartbeat/release contract
- `.claude/skills/task-lock/SKILL.md` — agent quick reference
**PO signal:** `docs/signals/po-1960-signoff.json`
**Next step:** PM plan (1960b) → agent-father wiring (1960c) → QA smoke (1960d) → docs (1960e)

---

## §0 — Scope & Goal

Wire `task_claim` / `task_heartbeat` / `task_release` into the dev-team flow lifecycle so multi-session collisions on **sprint-task** rows and **dashboard-row** consumption are eliminated. Phase 1 (DB + 4 MCP tools) and Phase 2 (cowork-team slot lock, Model 1) are already SHIPPED — this brief covers Phase 3 only.

Phase 3 introduces **Model 2 (agent-self heartbeat)** because dev-team tasks span 5 min – 60 min and must survive the next 15-min cron tick. Model 1 (master holds, no heartbeat) used in Phase 2 is unsuitable: master can't poll every dev-team subagent for liveness.

Out of scope: cron tick re-arming, Telegram alert dedup tuning, task_force_takeover tooling (deferred to Phase 4 if migration polling proves insufficient).

---

## §1 — Heartbeat Ownership Model

### Decision: Model 2 (Agent-Self Heartbeat) — default for all dev-team locks

Each agent owns the lock(s) it claims and heartbeats them itself before each major step (no wall-clock timer needed; flow-step granularity is sufficient because each step takes <5 min). Master dispatcher (dev-team cron) does NOT heartbeat on behalf of subagents.

**Rationale:**
- Dev-team subagents run inside the same Claude Code session as the master cron — `owner_session` UUID matches across the chain (po → architect → pm → developer → qa). Any agent in the chain can heartbeat the previous agent's lock without ownership mismatch.
- Each agent has natural step boundaries (TDD RED→GREEN→REFACTOR cycle for developer; pipeline checks for QA; etc.) — heartbeat at these boundaries gives ≤5-min cadence without a separate timer.
- Cross-session takeover requires no heartbeat handoff — TTL expiry is the recovery path (§4 migration logic).

### TTL Table (per task_kind + per-agent overrides)

| `task_kind` | Agent owner | `ttl_seconds` | Rationale |
|---|---|---|---|
| sprint-task | po (sprint-kickoff umbrella) | 3600 | Sprint runs ~1 h end-to-end in a typical cron tick. PO releases on signoff; if PO crashes, TTL=1 h auto-recovers. |
| sprint-task | ba | 1800 | Spec writing is fast (<30 min); short TTL allows fast peer-takeover after crash. |
| sprint-task | architect | 3600 | Brownfield scan + design can take full 1 h. |
| sprint-task | pm | 1800 | Planning is <30 min; heartbeat-extends existing developer lock rather than holding its own. |
| sprint-task | developer + dev-* | **3600** (PRIMARY) | Per PO signoff. Implementation cycle = 30–60 min typical. |
| sprint-task | qa | 3600 | Slow test suites + DDD/security checks can take full 1 h. |
| sprint-task | fixer | 1800 | Fixer constrained to 1–2 files + minimum change; <30 min by design contract. |
| sprint-task | agent-father (cross-cutting) | 3600 | Skill/agent edits + cascade validation. |
| dashboard-row | dev-team (drain-signals.md) | **1800** | Per PO signoff. Drain + PO triage cycle = ~30 min. |
| cowork-slot | cowork-team (Phase 2, shipped) | 900 | One 15-min cron window. (Reference only — not edited in Phase 3.) |

**TTL minimum / maximum bounds** are enforced by the MCP tool itself (`min=60`, `max=86400`); agents pass values per this table.

---

## §2 — CLAIM / HEARTBEAT / RELEASE Call-Points (Per-Agent Matrix)

This matrix is the authoritative spec for §4 (per-file insertion points). Every entry maps to an exact file:line target.

| Agent | Action | Lock target | Where (flow file + step) | When (boundary) |
|---|---|---|---|---|
| **po** | CLAIM | `task:<sprint_id>` (sprint-umbrella, e.g. `task:1960`) | `.claude/flows/po/sprint-kickoff.md` Step 4 (after BA task created) | First sprint-kickoff entry per session |
| **po** | RELEASE | `task:<sprint_id>` | `.claude/flows/po/sprint-signoff.md` Approve branch (before `## RETURN`) | Sprint approved + TASKS.md marked Done |
| **pm** | HEARTBEAT | `task:<sprint_id>` (umbrella) | `.claude/flows/pm/main.md` Step 3c (after RETURN with task list) | Plan signal emit (sprint kickoff round) |
| **pm** | HEARTBEAT | `task:<task_id>` (per-task, if pm extends a developer's lock during in_progress re-plan) | `.claude/flows/pm/main.md` Step 4 (set in_progress) | On `pending → in_progress` transition |
| **developer** | CLAIM | `task:<task_id>` | `.claude/flows/developer/main.md` Pre-code checklist between step 2 (branch verify) and step 3 (read handoff) | Branch checkout done, before any file read |
| **developer** | HEARTBEAT | `task:<task_id>` | `.claude/flows/developer/main.md` TDD workflow — after each RED→GREEN→REFACTOR loop | Each acceptance criterion completed |
| **developer** | RELEASE | `task:<task_id>` | `.claude/flows/developer/main.md` after `Append to handoff`, before `## RETURN` | Implementation done, before QA spawn |
| **dev-*** | CLAIM | `task:<task_id>` | `.claude/flows/developer/microservice-main.md` Pre-code checklist between step 6 (zone restriction) and step 7 (file-location lookup) | Branch checkout + zone verify done |
| **dev-*** | HEARTBEAT | `task:<task_id>` | `.claude/flows/developer/microservice-main.md` TDD workflow — after each RED→GREEN→REFACTOR loop | Each acceptance criterion completed |
| **dev-*** | RELEASE | `task:<task_id>` | `.claude/flows/developer/microservice-main.md` after `Append to handoff`, before `## RETURN` | Implementation done, before QA spawn |
| **qa** | HEARTBEAT | `task:<task_id>` | `.claude/flows/qa/main.md` Pipeline section, before `bun test` (full suite — slow step) | QA pipeline entry |
| **qa** | RELEASE | `task:<task_id>` | `.claude/flows/qa/main.md` Approval section (jump:approved), before `git checkout main` (merge step) | APPROVED verdict reached |
| **fixer** | HEARTBEAT | `task:<task_id>` | `.claude/flows/fixer/main.md` Trigger section, after step 2 (`git status` branch confirm) | Fixer entry (round trip) |
| **agent-father** | CLAIM | `task:<task_id>` (cross-cutting edit task) | `.claude/flows/agent-father/edit-apply.md` Step 5 (before any agent file write) | Edit-apply sub-flow entry |
| **agent-father** | HEARTBEAT | `task:<task_id>` | `.claude/flows/agent-father/edit-apply.md` Step 7 (after cascade validation) | Mid-cycle, before final write |
| **agent-father** | RELEASE | `task:<task_id>` | `.claude/flows/agent-father/edit-apply.md` Step 8 (diff summary), before `## RETURN` | Cascade complete |
| **dev-team master** | CLAIM | `dash:<recipient>:<row_id>` | `.claude/flows/dev-team/drain-signals.md` Step 0a-D before `NEW → READ` mark | Per-row drain |
| **dev-team master** | RELEASE | `dash:<recipient>:<row_id>` | `.claude/flows/dev-team/drain-signals.md` Step 0a-D after row appended to `pendingSignals[]` | Per-row drain done |

**Boundary rule:** The lock OWNER (the agent that CLAIMs) is the sole RELEASER. HEARTBEAT can be called by any in-session agent (same `owner_session` UUID), but RELEASE is owner-scoped. This matches §5 of brief 2026-05-20.

**Why developer is the primary claimer for `task:<task_id>` (not pm):** Setting `in_progress` in TASKS.md is the contract-binding moment. Developer flow Step 2 (branch verify) is the first natural pre-write boundary AFTER the task is logically picked up. PM's role is task decomposition, not exclusive task ownership — PM can be re-run within a sprint without violating ownership.

**Why qa releases (not developer):** Developer hands off to QA in the same session. If QA fails (CHANGES_REQUESTED → fixer → re-QA), the task is still in progress; releasing at developer-RETURN would create a TTL gap. QA holds through APPROVED merge, then releases atomically with `git push origin main`.

---

## §3 — Relationship to `docs/pipeline-state.json` (AUGMENT, NOT REPLACE)

### Decision

`docs/pipeline-state.json` continues as the **human-readable handoff trail + cross-session resume signal**. `task_locks` (coordination.db) is the **atomic guard + TTL-based crash recovery**. They serve different purposes and BOTH remain authoritative for their own concerns.

| Concern | SSOT |
|---|---|
| Who is the next agent in the chain? | `pipeline-state.json` `nextAgent` |
| What is the active sprint task? | `pipeline-state.json` `activeTaskId` |
| Free-text handoff prompt for re-spawn | `pipeline-state.json` `nextPrompt` |
| Atomic "is anyone working on this task right now?" | `task_locks` row |
| TTL-bound liveness signal | `task_locks.heartbeat_at` + `expires_at` |
| Cross-session race winner | `task_locks` INSERT OR IGNORE result |

### Migration logic on first `claim-fail`

When `task_claim` returns `claimed: false`, the calling agent MUST check `pipeline-state.json` BEFORE treating it as a peer-session collision. Pseudo-code (target: developer + dev-* + qa + fixer + agent-father):

```
result = task_claim({task_id, task_kind, owner_agent, ttl_seconds, payload})

if not result.claimed:
  ps = read $PROJECT_ROOT/docs/pipeline-state.json  // small file, single read
  current = result.current_holder
  now_s = unix epoch seconds

  // Strip "task:" prefix for comparison with pipeline-state.activeTaskId
  bare_task_id = task_id.startsWith("task:") ? task_id.slice(5) : task_id

  // Migration heuristic — same agent, same task, stale heartbeat
  is_logical_takeover = (
    ps.activeTaskId == bare_task_id
    AND ps.nextAgent == owner_agent
    AND current.owner_agent == owner_agent
    AND (now_s - current.heartbeat_at) > 300       // heartbeat stale >5 min
  )

  if is_logical_takeover:
    log "[<agent>] stale-lock takeover detected for " + task_id +
        " — pipeline-state owns, lock heartbeat " + (now_s - current.heartbeat_at) + "s stale. Awaiting natural TTL expiry."
    send_telegram(channel="work",
                  "[<agent>] takeover pending for " + task_id +
                  " — TTL expires in " + (current.expires_at - now_s) + "s")
    EXIT cycle (return PIPELINE: blocked, NEXT: idle, reason: stale-lock-takeover)
    // Next dev-team cron tick (15 min later) retries naturally; by then TTL expired
  else:
    // Real collision — peer session is actively heartbeating
    log "[<agent>] SKIP task " + task_id + " — held by peer session " + current.owner_session.slice(0,8)
    send_telegram(channel="work",
                  "[<agent>] SKIP task " + task_id +
                  " collision — held by " + current.owner_agent +
                  " session " + current.owner_session.slice(0,8))
    SKIP this task → move to next available task (PM Step 3c re-route)
```

This logic is centralised in `.claude/skills/task-lock/SKILL.md` (one new section: "On claim-fail: migration check"). All agents implementing CLAIM lazy-load the skill — single SSOT, no per-flow duplication.

**No new MCP tool is required for migration.** Polling (1 retry per 15-min cron) is acceptable because TTL=3600 means worst case ~4 cron ticks (1 h) before recovery. If user reports persistent stuck-takeovers in Phase 3 burn-in, Phase 4 can introduce `task_force_takeover(task_id, owner_agent, pipeline_state_proof)` — out of scope here.

---

## §4 — Exact Insertion Points (Per-File Edit Spec)

Each entry is **one file, one anchor, one snippet**. agent-father can apply mechanically.

### 4.1 `.claude/flows/po/sprint-kickoff.md`

**Insert AFTER step 4 (`Create BA task: …`), BEFORE step 5 (`Return:`):**

```markdown
**4b.** Claim sprint umbrella lock → load skill: `.claude/skills/task-lock/SKILL.md`
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + sprint_id,
  task_kind:   "sprint-task",
  owner_agent: "po",
  ttl_seconds: 3600,
  payload:     '{"sprint_id":"' + sprint_id + '","stage":"kickoff"}'
})
if not result.claimed:
  → Apply migration check per `.claude/skills/task-lock/SKILL.md` § On claim-fail
```

### 4.2 `.claude/flows/po/sprint-signoff.md`

**Insert in `Approve` branch BEFORE the existing `→ return:` block:**

```markdown
- **Release umbrella lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + sprint_id })
// ok=false is acceptable (TTL already expired across long sprint)
```
```

### 4.3 `.claude/flows/pm/main.md`

**Insert AFTER step 3c (return block with TASKS), BEFORE step 4 (`Set task status …`):**

```markdown
**3d.** Heartbeat umbrella lock → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + sprint_id })
// ok=false here = sprint umbrella expired or stolen; log only, do not abort planning
```
```

**Insert AFTER step 4 (`Set task status → in_progress`):**

```markdown
**4b.** Heartbeat developer's task lock if pre-existing:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
// silent on ok=false — developer will (re)claim on entry
```
```

### 4.4 `.claude/flows/developer/main.md`

**Insert AFTER pre-code checklist step 2 (`Branch setup`), BEFORE step 3 (`Read handoff`):**

```markdown
**2b. Claim sprint-task lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + task_id,
  task_kind:   "sprint-task",
  owner_agent: "developer",
  ttl_seconds: 3600,
  payload:     '{"task_title":"' + task_title + '","branch":"' + branch_name + '"}'
})
if not result.claimed:
  → Apply migration check per `.claude/skills/task-lock/SKILL.md` § On claim-fail
```
```

**Insert in TDD workflow block AFTER `REPEAT per acceptance criterion`:**

```markdown
- **After each TDD loop** → heartbeat:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
if hb.ok == false: → stolen-lock protocol per skill § Heartbeat (commit partial, BUG telegram, EXIT)
```
```

**Insert AFTER `Append to handoff` block, BEFORE `Notebook write`:**

```markdown
**Release sprint-task lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
// ok=false acceptable (QA will re-claim if needed; lock may already be moved to QA stage)
```
```

**Note:** Per §2 boundary rule, ideally developer DOES NOT release — QA inherits and releases. **Adopted simplification:** developer keeps lock alive via heartbeat handoff. Developer's "release" is OMITTED for the dev→qa session-continuous path. Edit the section to insert **only the comment line below** (no actual release call):

```markdown
**Lock handoff to QA** — same session, no release needed; QA will heartbeat + release.
```

This is the canonical wording. agent-father: insert the comment, not the release call.

### 4.5 `.claude/flows/developer/microservice-main.md`

**Same pattern as 4.4** with the following anchor differences:
- CLAIM insertion: AFTER step 6 (zone restriction check), BEFORE step 7 (file-location lookup) — `**6b. Claim sprint-task lock**`
- HEARTBEAT insertion: After TDD workflow (both TS/Bun and Python/FastAPI variants) — one block applies to both
- RELEASE (lock-handoff comment only): same insertion point as 4.4

`owner_agent` is the calling dev-* agent name (e.g. "dev-mcp-server", "dev-stock-price"). Resolved from `<agent-id>` placeholder already present in microservice-main.md Step 0b.

### 4.6 `.claude/flows/qa/main.md`

**Insert in Pipeline section (after `## Pipeline` header line, BEFORE the existing `bash` block):**

```markdown
**Heartbeat sprint-task lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
if hb.ok == false:
  // Lock stolen — developer's session terminated before QA ran in this session
  send_telegram(channel="bug", "[qa] lock stolen on " + task_id + " — re-claiming for QA review")
  → call task_claim(task_id, "sprint-task", "qa", 3600) — proceed even if claim fails (QA is non-mutating until merge)
```
```

**Insert in `<!-- jump:approved -->` section BEFORE `git checkout main`:**

```markdown
**Release sprint-task lock** (last step before merge — atomic with TASKS.md status update):
```
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
// Proceed with merge regardless of ok value — release is best-effort cleanup
```
```

### 4.7 `.claude/flows/fixer/main.md`

**Insert AFTER `Trigger` step 2 (`git status | grep task/` branch confirm), BEFORE step 3 (fix simplest first):**

```markdown
**2b. Heartbeat sprint-task lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
if hb.ok == false:
  → stolen-lock protocol per skill § Heartbeat (re-claim for fixer; EXIT if re-claim fails)
```
```

No CLAIM (developer already claimed; QA's heartbeat keeps it alive during the QA→fixer→QA round trip).
No RELEASE (fixer hands back to QA in same session).

### 4.8 `.claude/flows/agent-father/edit-apply.md`

**Insert at the top of edit-apply.md (after preamble, before the existing Step 5 description):**

```markdown
**5a. Claim cross-cutting task lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + task_id,
  task_kind:   "sprint-task",
  owner_agent: "agent-father",
  ttl_seconds: 3600,
  payload:     '{"task_title":"' + change_description + '","files":' + JSON.stringify(target_files) + '}'
})
if not result.claimed:
  → Apply migration check per `.claude/skills/task-lock/SKILL.md` § On claim-fail
```
```

**Insert after Step 7 (cascade validation), before Step 8 (diff summary):**

```markdown
**7b. Heartbeat lock** → `call_tool("task_heartbeat", {task_id: "task:" + task_id})`
if hb.ok == false: → stolen-lock protocol per skill
```

**Insert at end of Step 8 (after diff summary written), before `## RETURN`:**

```markdown
**8b. Release lock** → `call_tool("task_release", {task_id: "task:" + task_id})`
```

### 4.9 `.claude/flows/dev-team/drain-signals.md`

**Replace Step 0a-D body (current line 12–16) with:**

```markdown
**0a-D — Drain `docs/signals/DASHBOARD.md` (cross-team inbox):**

Read DASHBOARD.md per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find `## po` section (or any dev-team-addressed section). Collect `status=NEW` rows.

→ Load skill: `.claude/skills/task-lock/SKILL.md`

For each NEW row:
  row_key = "dash:" + section_name + ":" + row.id

  result = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:     row_key,
    task_kind:   "dashboard-row",
    owner_agent: "dev-team",
    ttl_seconds: 1800,
    payload:     '{"row_id":"' + row.id + '","from":"' + row.from + '","type":"' + row.type + '"}'
  })

  if not result.claimed:
    log "[dev-team] SKIP dashboard row " + row.id + " — held by " + result.current_holder.owner_agent
    continue                            // Do NOT add to pendingSignals[], do NOT mark READ

  // Claim succeeded — proceed with existing drain logic
  load payload if present → append to pendingSignals[] with source="dashboard"
  mark row NEW → READ
  call_tool("task_release", { task_id: row_key })   // release per-row claim immediately after row consumed

If DASHBOARD.md missing or no dev-team section → log "[dev-team] dashboard skip" and continue. Never fail-loud.
```

---

## §5 — Tool-Package Delta Audit

### Current state (verified 2026-05-21)

Packages **already listing** `task_claim` + `task_heartbeat` + `task_release` (11 total):
- `developer.md` (covers all 12 dev-* agents via `tools_package:` inheritance)
- `market-analyst.md`, `qa-responder.md`, `report-analyzer.md`, `tran-ngoc-bau.md`, `digest-predict.md`, `unified-agent.md`, `financial-analyst.md`, `news-scout.md`, `market-watcher.md`, `alert-commander.md` (10 cowork agents)

### Phase 3 delta — packages to EDIT (add 3 tools each)

Tools to add per package: `task_claim`, `task_heartbeat`, `task_release`. `task_list_held` is OPTIONAL (audit-only; add only to packages that benefit from debug visibility — flagged below).

| Package file | Action | Required tools | Notes |
|---|---|---|---|
| `.claude/tools/package/po.md` | EDIT | claim + heartbeat + release | Sprint umbrella claim/release per §4.1, §4.2 |
| `.claude/tools/package/pm.md` | EDIT | heartbeat | PM only heartbeats (§4.3); no claim/release. But add all 3 to keep package uniform with sibling dev-core packages. |
| `.claude/tools/package/architect.md` | EDIT | claim + heartbeat + release | For long brownfield scans. Per §1 TTL table, architect can claim if working >30 min. |
| `.claude/tools/package/ba.md` | EDIT | claim + heartbeat + release | Spec writing claim with shorter TTL (1800). |
| `.claude/tools/package/qa.md` | EDIT | claim + heartbeat + release + **task_list_held** | QA may need to audit stale locks when debugging multi-session race; add list-held. |
| `.claude/tools/package/fixer.md` | EDIT | heartbeat (+ optionally claim for stolen-lock re-claim) | Per §4.7. Add all 3 for uniformity. |
| `.claude/tools/package/agent-father.md` | EDIT | claim + heartbeat + release + **task_list_held** | Cross-cutting + may audit fleet locks during sweeps. |
| `.claude/tools/package/ops.md` | EDIT | **task_list_held** + release | Ops responds to stuck-lock incidents — needs list + force-release within own session. |
| `.claude/tools/package/system-auditor.md` | EDIT | **task_list_held** only | Read-only audit; never writes locks. |
| `.claude/tools/package/cowork-refactory-expert.md` | EDIT | claim + heartbeat + release | Cross-cutting agent rewrites; behaves like agent-father for lock purposes. |
| `.claude/tools/package/code-janitor.md` | EDIT | claim + heartbeat + release | Cross-cutting code edits; same pattern. |
| `.claude/tools/package/idea-forge.md` | EDIT | claim + heartbeat + release | Innovation strategist may hold locks for long design cycles. |

**Total: 12 packages to edit.**

### Dev-* agents — NO PACKAGE EDIT NEEDED

All 12 dev-* agents (dev-alert-engine, dev-api-gateway, dev-frontend, dev-kinh-dich, dev-macro-indicators, dev-mainserver-crawls, dev-mcp-server, dev-pdf-extractor, dev-rag-service, dev-stock-price, dev-technical-analysis, dev-vps-crawls) reference `tools_package: .claude/tools/package/developer.md` in their `.claude/agents/dev-*.md` frontmatter. Developer.md already lists all 3 required tools (§ "Task-Lock Coordination Tools" block).

**Correction to PO signoff 1960 audit:** The signoff listed "plus all 9 dev-* (…) which currently inherit via developer.md or own .md". The actual state has all 12 dev-* inheriting via developer.md (verified via `grep "tools_package:" .claude/agents/dev-*.md` — see §0 references). No dev-* package edits are needed in Phase 3.

### Tool package edit template (agent-father reference)

For each of the 12 packages above, insert this block after the existing "MCP Tools" / "Channel Permissions" section, BEFORE any closing footer:

```markdown
## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

Flow-level wiring per `.claude/flows/<agent>/main.md` (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 2 + 4).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint-task or dashboard-row lock | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew held lock at flow-step boundaries | `task_id` |
| `task_release` | Release on completion (owner-session scoped) | `task_id` |
| `task_list_held` (optional — only some packages) | List/audit current locks | `kind?, owner_agent?, expired?` |

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load when implementing locks).
Protocol: `docs/protocols/task-lock-protocol.md`.
```

---

## §6 — Phase 3 Failure-Mode Table

Extends `docs/protocols/task-lock-protocol.md` § Failure Modes with Phase 3–specific scenarios.

| ID | Mode | Symptom | Detection | Response |
|---|---|---|---|---|
| **P3-F1** | Heartbeat fails mid-task | `task_heartbeat` returns DB error or timeout | 3× exponential backoff (1s, 2s, 4s) all fail | Continue work, BUG telegram. Lock will auto-expire at TTL; duplicate-write is acceptable degraded mode. Inherit from §F1 of base brief. |
| **P3-F2** | Lock stolen mid-task | `task_heartbeat` returns `ok=false` | Single heartbeat call returns false → session mismatch | Commit idempotent partial state → BUG telegram → EXIT. Per skill § Heartbeat. |
| **P3-F3** | Pipeline-state ↔ task-lock desync | Migration heuristic triggers (own-agent + own-task + stale heartbeat) | On `claim-fail`, §3 logic detects own-takeover | EXIT cycle with `PIPELINE: blocked, reason: stale-lock-takeover`. Next 15-min cron tick retries; TTL=3600 means worst-case 4 retries (1 h). |
| **P3-F4** | TTL expiry mid-merge (QA approval phase) | QA at `<!-- jump:approved -->` step finds lock heartbeat stale (e.g. `bun test` ran 65 min) | QA's final pre-release heartbeat returns `ok=false` | (a) Re-claim under QA's `owner_agent="qa"` (best-effort); (b) proceed with `git checkout main && git merge --no-ff …` regardless — merge is atomic per git, task-lock is advisory at this point; (c) BUG telegram for visibility. Do NOT abort merge. |
| **P3-F5** | Two sessions race PO sprint-kickoff | Both PO instances try to claim `task:<sprint_id>` at same cron tick | One wins via INSERT OR IGNORE; loser sees `claimed: false` + non-matching `owner_session` | Loser's PO sees current_holder.owner_agent="po" but `owner_session != ps.last_session` → not a migration; SKIP sprint-kickoff this cycle (idempotent — TASKS.md state unchanged). WORK telegram noting race observed. |
| **P3-F6** | Cross-task lock orphan (developer skipped RELEASE) | Sprint completed but `task:<id>` row persists in coordination.db beyond TTL | `task_list_held(expired=true)` shows orphan after `dataAuditWeekly` cron sweep | Weekly cleanup (Phase 1 brief § 5 maintenance) auto-deletes rows older than 24 h expired. No agent action needed. |
| **P3-F7** | Dashboard-row claim succeeds but drain crashes | `dash:<recipient>:<row>` claimed, dev-team session dies before drain completes | Row stays `NEW` in DASHBOARD.md, lock held until TTL=1800 | Next dev-team cron tick (15 min later) finds NEW row + claim-fail → §3 migration heuristic applies. Worst case 2 ticks (~30 min) until natural recovery. Acceptable. |
| **P3-F8** | Migration false-positive (peer session looks idle) | Peer is actively heartbeating but heartbeat_at appears >5 min stale (clock skew, slow Docker write) | Migration heuristic triggers EXIT; peer's next heartbeat shifts heartbeat_at forward | Our exit was conservative — we lose ~1 cron tick of progress, peer continues. No data loss. Telegram log shows "takeover pending" then resolves automatically. |
| **P3-F9** | Sprint umbrella lock not released (PO crash post-approval) | `task:<sprint_id>` persists across cron ticks after sprint-signoff | Next PO at fresh sprint-kickoff finds collision on stale umbrella | §3 migration heuristic resolves (ps.activeTaskId no longer matches old sprint) → SKIP path. PO opens new sprint with next ID. Stale row TTL-expires within 1 h. |

**No data loss in any scenario.** All failure paths degrade gracefully to either (a) duplicate work, (b) one cron-tick delay, or (c) BUG telegram + continued execution. Task-lock is an advisory layer, never a hard gate.

---

## §7 — Test Plan for QA Task 1960d

QA delivers `apps/mcp-server/tests/integration/task-lock-phase3-devteam-smoke.test.ts` (or `scripts/smoke-task-lock-phase3.ts` following Phase 2 pattern) covering the scenarios below. Each scenario maps to one or more AC items in PO signoff 1960d.

### Scenario T1 — Two sessions race same sprint-task claim

**Setup:** Spawn 2 concurrent `task_claim` calls with identical `task_id="task:1960-test-a"`, `task_kind="sprint-task"`, `owner_agent="developer"`, simulating different `owner_session` UUIDs.

**Expected:**
- Exactly one returns `{claimed: true}`.
- Other returns `{claimed: false, current_holder: {owner_session: <winner's UUID>}}`.
- `task_list_held(kind="sprint-task")` returns exactly 1 row for `task:1960-test-a`.

**Maps to AC:** 1960d AC-1.

### Scenario T2 — Heartbeat extends TTL past initial expiry

**Setup:** Claim with `ttl_seconds=120` (short for test); after 60 s, call `task_heartbeat`; after another 90 s, attempt second claim (different session).

**Expected:**
- Heartbeat returns `{ok: true, expires_at: <renewed>}`.
- Second claim at t=150s still finds lock held (TTL refreshed by heartbeat).
- `task_list_held` shows `expires_at > now + 60s` post-heartbeat.

**Maps to AC:** 1960d AC-2.

### Scenario T3 — Stolen lock detection (heartbeat ok=false)

**Setup:** Session A claims `task:1960-test-b` with `ttl_seconds=60`. Wait 70 s (TTL expires). Session B claims same `task_id` (succeeds via steal). Session A calls `task_heartbeat`.

**Expected:**
- Session A's heartbeat returns `{ok: false, expires_at: 0}`.
- Session A enters stolen-lock EXIT path per skill (in real flow: BUG telegram + partial commit + EXIT).
- Session B holds the lock cleanly.

**Maps to AC:** 1960d AC-3.

### Scenario T4 — Dashboard-row claim prevents dual-drain

**Setup:** Simulate 2 dev-team cron sessions reading the same `## po` section row `1960-X-test` in DASHBOARD.md. Both call `task_claim` for `dash:po:1960-X-test`.

**Expected:**
- One session marks row `NEW → READ` and adds to `pendingSignals[]`.
- Other session sees `claimed: false`, skips the row (does NOT mark READ, does NOT add to pendingSignals).
- DASHBOARD.md ends with exactly one `READ` mark on the row.

**Maps to AC:** 1960d AC-4.

### Scenario T5 — Pipeline-state ↔ task-lock coexistence (no false-skip)

**Setup:**
- Write `docs/pipeline-state.json` with `{activeTaskId: "1960-test-c", nextAgent: "developer", updatedAt: <recent>}`.
- Claim `task:1960-test-c` as `owner_agent="developer"` with `ttl_seconds=120`.
- Simulate "session crash": stop heartbeating. Wait 310 s (heartbeat now appears stale).
- Spawn second session attempting `task_claim` for same `task:1960-test-c` with `owner_agent="developer"`.

**Expected:**
- Second session sees `claimed: false`.
- Migration heuristic (§3) detects: `ps.activeTaskId == "1960-test-c"` AND `ps.nextAgent == "developer"` AND `current_holder.owner_agent == "developer"` AND `(now - heartbeat_at) > 300` → TRUE.
- Second session EXITs with `PIPELINE: blocked, reason: stale-lock-takeover` (NOT a regular SKIP).
- After TTL=120s elapses, third claim attempt succeeds (steal path).

**Maps to AC:** 1960d AC-5.

### Scenario T6 — Cross-agent heartbeat within session (PO → developer → qa chain)

**Setup:** Within a single `owner_session` UUID, simulate the dev-team chain:
- PO claims `task:1960-test-d` as `owner_agent="po"` (umbrella; TTL=3600).
- Developer calls `task_heartbeat` for same `task_id` (same session).
- QA calls `task_heartbeat` for same `task_id`.
- QA calls `task_release`.

**Expected:**
- All heartbeats return `ok: true` (same `owner_session` matches).
- Release returns `ok: true` and removes the row.
- `task_list_held` returns empty for that `task_id` after release.

**Edge case:** Confirm that cross-session heartbeat (different UUID) returns `ok: false` for the same `task_id`.

**Maps to AC:** new — validates §1 heartbeat ownership model.

### Scenario T7 — Concurrent stale-steal race

**Setup:** Lock `task:1960-test-e` with `ttl_seconds=60`. Wait 65 s. Spawn 3 concurrent claim attempts (different sessions).

**Expected:**
- Exactly 1 claim succeeds with `{claimed: true, stolen: true}`.
- Other 2 claims return `{claimed: false}` with current_holder = the winner.
- No row in coordination.db has 2 owners; PRIMARY KEY enforces uniqueness.

**Maps to AC:** robustness — extends 1960d AC-1 to 3+ concurrent.

### Pass criteria

- All 7 scenarios green (`bun test apps/mcp-server/tests/integration/task-lock-phase3-devteam-smoke.test.ts`).
- `bun tsc --noEmit` zero errors.
- `bun test` full suite no regressions (≥ current baseline ~9290 pass).
- QA emits `docs/signals/qa-1960d-approved.json` on PASS with scenario→AC mapping.

---

## §8 — Implementation Sequencing for agent-father (1960c)

Per PO signoff dispatch_sequence T2: agent-father lands all flow + package edits in one cycle after 1960a+1960b approval.

**Recommended order (low-risk → high-risk):**

1. **Tool packages first** (12 files, §5) — no behavior change, just expands allowed-tools surface. tsc-neutral.
2. **Skill update** — append "On claim-fail: migration check" section to `.claude/skills/task-lock/SKILL.md` per §3 logic. SSOT for downstream flow edits.
3. **dev-team/drain-signals.md** (§4.9) — dashboard-row scope, isolated from sprint-task chain. Independently verifiable.
4. **developer/main.md** + **developer/microservice-main.md** (§4.4, §4.5) — primary claimers. Largest blast radius; do these together so dev + dev-* paths stay aligned.
5. **qa/main.md** (§4.6) — depends on §4.4 lock being present.
6. **fixer/main.md** (§4.7) — depends on §4.4 + §4.6 lock-handoff chain.
7. **pm/main.md** (§4.3) — heartbeat only; safe last.
8. **po/sprint-kickoff.md** + **po/sprint-signoff.md** (§4.1, §4.2) — umbrella lifecycle.
9. **agent-father/edit-apply.md** (§4.8) — meta (agent-father editing its own flow). Land LAST and verify via fresh agent-father spawn.

After all edits: tsc neutral (no .ts changes), but agent-father should run `bun tsc --noEmit` once at the end as a sanity check. PM 1960b plan should reflect this ordering.

---

## §9 — Open Questions / Future Phases

- **Phase 4 candidate: `task_force_takeover` tool.** If §3 polling (15-min retry) proves too slow in burn-in, introduce a single new MCP tool that requires (a) caller agent_name matches current holder agent_name AND (b) caller passes `pipeline_state_hash` proving ownership. Out of scope here.
- **Maintenance cron.** Phase 1 brief §5 mentioned a weekly stale-lock sweep in `dataAuditWeekly`. Phase 3 does not add this cron — F6 monitoring is sufficient for now. Re-evaluate after 30 days of Phase 3 operation.
- **Per-zone TTL tuning.** Initial 3600 covers typical dev cycles. Long microservice refactors (e.g. modular monolith sprints) may need 7200. Defer tuning until evidence accumulates.
- **Cowork-team (Phase 2) re-evaluation.** Model 1 used for cowork-slot; Model 2 chosen here. No conflict — Phase 2 stays as-is. If a cowork agent later requires sub-cron flexibility, brief a Phase 5 transition.

---

## §10 — Acceptance Criteria Coverage (AC ↔ Brief Section)

| 1960a AC | Brief section |
|---|---|
| Heartbeat ownership model + TTLs | §1 |
| CLAIM/HEARTBEAT/RELEASE call-points per agent | §2 + §4 |
| pipeline-state.json AUGMENT + migration | §3 |
| Exact insertion-point per flow file | §4 (.1–.9) |
| Tool-package delta | §5 |
| Phase 3 failure-mode table | §6 |
| Test-plan for QA 1960d | §7 |

**All 7 AC items addressed.** Brief ready for PM 1960b consumption and agent-father 1960c mechanical edits.

---

## Context References

- `docs/architecture-briefs/2026-05-20-task-lock-system.md` — base design
- `docs/protocols/task-lock-protocol.md` — claim/heartbeat/release contract
- `.claude/skills/task-lock/SKILL.md` — agent quick reference
- `docs/pipeline-state.json` — handoff trail SSOT
- `docs/signals/po-1960-signoff.json` — sprint kickoff signal
- `.claude/flows/dev-team/main.md` — orchestration parent
- `.claude/tools/package/developer.md` — inheritance source for 12 dev-* agents
