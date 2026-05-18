> Authored by: agents-architect | 2026-05-18T17:02:06Z
> Revised by: agents-architect | 2026-05-18T17:15:20Z — Runtime constraint: Claude Desktop cannot spawn subagents. Architecture refactored to RemoteTrigger-per-slot model.
> Status: READY — awaiting agent-father (cowork-schedule.json + RemoteTrigger creation) + pm (Sprint 1951 planning)

# Architecture Brief: Cowork Master Scheduler (v2 — RemoteTrigger Model)

---

## REVISION NOTICE

The original brief (commit `10d10883`, 2026-05-18T17:02:06Z) designed a `cowork-scheduler` dispatcher agent that spawns target agents as subagents. That architecture is **invalid for Claude Desktop**.

**User clarification (2026-05-18):**
1. Schedule files must live in the cowork workspace (Claude Desktop can read project-scoped files).
2. Claude Desktop **cannot spawn subagents** via the Agent tool — that is a Claude Code SDK-only capability.

**Consequence:** The cowork-scheduler dispatcher agent is invalidated. See Section 3 (new architecture).

The rest of this brief (problem statement, time-table SSOT, dependency gates, watchdog, acceptance criteria) is preserved and updated in-place.

---

## 1. Problem Statement

The cowork pipeline (9 agents, Sprint 1949 five-dish schedule) is deployed with schedule blocks fragmented across individual agent `.md` files. This produces three concrete failure modes:

**F1 — Session-evaporation.** `CronCreate` slots are session-scoped in Claude Desktop. When a session ends, all schedule registrations evaporate. Without a persistent root, there is no guarantee that slots re-register on the next cycle.

**F2 — Dependency ordering is implicit and brittle.** Sprint 1949 aligned `foreignFlowAlertJob` at `08:13 UTC` and EOD chef dish at `08:37 UTC` (24-minute gate). `macroIndicatorRefreshJob` fires at `19:13 UTC`, 24 minutes before Evening Preview at `19:37 UTC`. These gates exist only as comments in cron-registry.json — no agent reads them before running. Any drift in one side of the gate is invisible until content degrades.

**F3 — Scattered timing = scattered monitoring.** There is no single file to inspect to know whether all cowork slots fired today. The dev-team drain-signals step can detect missing chef output, but there is no structured health-check for the dispatch layer itself.

**Scope:** This brief covers only the cowork pipeline (9 agents listed in Section 3). The `7 * * * *` dev-team cron and all Docker-side Bun scheduler jobs are outside scope and must not be touched.

---

## 2. Runtime Constraint: Claude Desktop vs Claude Code

### 2.1 What Claude Desktop can and cannot do

| Capability | Claude Code (SDK) | Claude Desktop |
|---|---|---|
| Spawn subagent (Agent tool) | YES — native SDK capability | NO — Agent tool not available |
| Read project workspace files | YES | YES — project-scoped files |
| CronCreate (session-scoped) | YES | YES — but session-scoped only |
| RemoteTrigger (claude.ai code trigger) | YES | YES — each trigger is independent |
| Run `.claude/flows/<agent>/main.md` | YES (as subagent) | YES (as the trigger's own prompt) |

**Key implication:** A cowork-scheduler agent on Claude Desktop cannot dispatch to other agents by calling the Agent tool. Each cowork slot must be an **independent RemoteTrigger** whose prompt directly runs the target agent's flow.

### 2.2 What RemoteTrigger provides

A RemoteTrigger (claude.ai code trigger) is a standalone scheduled invocation with:
- Its own cron expression
- Its own prompt (the full `run .claude/flows/<agent>/main.md <slot_args>` instruction)
- Its own session lifecycle (isolated, not dependent on any other session being alive)
- Persistent registration (not session-scoped — survives session end)

This makes RemoteTrigger the correct primitive for the cowork schedule: **17 individual RemoteTriggers, one per slot**, each pointing directly at its target agent's flow.

### 2.3 OPEN QUESTION — RemoteTrigger granularity

**OQ-1:** Does the RemoteTrigger API support full cron expressions including range syntax (`2-8`) and step syntax (`*/15`)? Specifically, can `13 2-8 * * 1-5` (intraday chef scan) and `*/15 2-8 * * 1-5` (gatherer market-hours slots) be registered as single triggers, or must they be decomposed?

**OQ-2:** Is there a maximum number of RemoteTriggers per workspace? (17 triggers proposed.)

**OQ-3:** What is the exact API call syntax for RemoteTrigger creation — does it use the `CronCreate` MCP tool with a `remote: true` flag, or a separate tool?

Agent-father must verify these before implementing Sprint 1951 T1. If full cron syntax is unsupported, Phase 1 scope changes (more triggers needed for range/step decomposition).

### 2.3 SPIKE-1951a Findings

**Date:** 2026-05-18
**OQ-1 (cron range/step syntax):** SUPPORTED — Claude Code's CronCreate tool accepts standard 5-field cron expressions with full support for step syntax (`*/15`), ranges (`2-8`), and range+step combinations (`*/15 2-8`). Per https://code.claude.com/docs/en/scheduled-tasks.md, "All fields support wildcards (*), single values (5), steps (*/15), ranges (1-5), and comma-separated lists (1,15,30)." Extended syntax (L, W, ?) is not supported.

**OQ-2 (max trigger count):** UNKNOWN — No documented limit found in public Claude Code or Claude Platform documentation. Routines (cloud-based scheduled tasks) have a daily per-account cap on runs (not trigger count), and GitHub triggers have per-routine hourly caps, but no workspace-level maximum on trigger definitions was found. Desktop scheduled tasks and Cloud Routines documentation do not specify a cap. Recommendation: Contact Anthropic support for confirmation, or test with 17 triggers and monitor for errors.

**OQ-3 (exact API call syntax):** ANSWERED (2026-05-18, live RemoteTrigger API call). RemoteTrigger is a **separate MCP tool** — NOT `CronCreate` with a `remote: true` flag. The tool is `RemoteTrigger` with `action='create'` and a body containing:
- `name`: display name for the trigger
- `cron_expression`: standard 5-field cron string
- `job_config.ccr.environment_id`: `env_011CV1yonRDFUhYhGEdkVwqj` (VN-Market project environment ID)
- `job_config.ccr.events`: array with one event containing the full prompt text
- `session_context.model`: model string (e.g. `claude-sonnet-4-6`)
- `session_context.sources`: `[{"git_repository": {"url": "https://github.com/phamhung075/VN-Market-Intelligence-MCP"}}]`
- `mcp_connections`: array of MCP server connections (uuid, name, url) — must include vn-market MCP server for cowork triggers
- `enabled_plugins`: array for marketplace plugins (may be empty `[]`)
- `persist_session`: `false`

Current trigger count in workspace: **3** (qa-responder + 2 vault maintenance triggers). Sprint 1951 proposes adding 17 more = **20 total**.

**Phase 1 impact:** OQ-1, OQ-2 (partial), and OQ-3 all addressed. No trigger decomposition needed (OQ-1 affirmative). OQ-2 remains unverified but low risk (17 triggers, validate via test run). OQ-3 resolved — agent-father must use `RemoteTrigger` tool (not `CronCreate`) with environment ID `env_011CV1yonRDFUhYhGEdkVwqj` for all 17 trigger creations.

### 2.4 SPIKE-1951d Finding: Sub-hourly API Constraint (2026-05-18)

- **Constraint discovered at create-time (1951a):** RemoteTrigger API enforces an undocumented **minimum 1-hour cron interval** at runtime. SPIKE-1951a OQ-1 confirmed `*/15 2-8` syntax was *accepted by validation*, but actual `action=create` returns HTTP 400 for any cron firing >1/hr. The 4 affected supplemental slots: `news-scout-market`, `market-watcher-market`, `market-watcher-prepost`, `alert-commander-market` (all `guaranteed: false`).
- **PO decision (SPIKE-1951d):** **Option C — accept hourly cadence**. Rationale: 12/16 working triggers cover all `guaranteed: true` slots + off-hours gatherers. The 4 sub-hourly slots are supplemental market-hours gatherers (not pipeline-critical). Option A (CronCreate fallback) is self-defeating — it re-introduces F1 session-evaporation, the very failure Sprint 1951 was built to eliminate. Option B (self-requeue watchdog) is unproven and adds risk during the 1945 stabilisation window. Cost of Option C: news/prices/alerts during VN market hours now run hourly instead of every 15-30 min — non-guaranteed, additive gatherers, no MARKET dish degradation.
- **Follow-up:** Sprint 1951e (agent-father, size XS) recreates the 4 slots at hourly cadence (`0 2-8 * * 1-5` for market-hours, `0 * * * 1-5` for prepost) and updates `cowork-schedule.json` cron fields. OQ-1 finding text in §2.3 should be flagged as "syntax accepted, runtime min-interval = 1h" in any future architect work.

---

## 3. Architecture Design (v2 — RemoteTrigger-per-Slot)

### 3.1 Old vs new model

**OLD (invalidated):**
```
[Claude Desktop CronCreate]
  cron: "3,13,18,33,48 * * * *"
  └── cowork-scheduler agent spawned
        ├── bash: jq match cowork-schedule.json
        └── Agent tool: spawn target agent  ← IMPOSSIBLE on Claude Desktop
```

**NEW (valid):**
```
[claude.ai RemoteTrigger — per slot, 17 total]
  trigger-1: cron "23 5 * * 1-5"
    prompt: "run .claude/flows/unified-agent/main.md  slot=morning_dish"
  trigger-2: cron "13 2-8 * * 1-5"
    prompt: "run .claude/flows/unified-agent/main.md  slot=intraday_scan"
  ...
  trigger-17: cron "*/15 2-8 * * 1-5"
    prompt: "run .claude/flows/alert-commander/main.md  slot=market_hours_alert"

Each trigger → fires its own agent session independently → no inter-session dependency.
```

### 3.2 Schedule SSOT file — cowork-schedule.json

`docs/data/cowork-schedule.json` becomes the canonical time-table. It is a workspace file readable by Claude Desktop. Every RemoteTrigger is defined by a row in this file.

**Why keep the file if triggers are independent?**
- Single place to audit "what slots exist" (watchdog, developer, PM)
- Enables the dev-team watchdog check (read `last_fired` timestamps)
- Documents the dependency gates (foreignFlow → EOD, macroRefresh → Evening)
- Enables hot-disable: set `enabled: false` → dev-team or agent-father pauses the RemoteTrigger without deleting it

The file must live at `docs/data/cowork-schedule.json` in the project root so it is accessible to Claude Desktop workspace reads.

### 3.3 Dependency gate preservation

The foreignFlow→EOD and macroRefresh→Evening gates are Docker-side Bun jobs (not cowork cron). They write signal data to the DB. The cowork pipeline does NOT need to gate on those jobs completing in real-time — it simply fires 24 minutes after those jobs are expected to complete. The current offsets in Sprint 1949 already encode this gap.

In the RemoteTrigger model, gates are encoded as **time offsets in the trigger cron**, not as runtime checks. The `depends_on` field in `cowork-schedule.json` documents the logical dependency for human review; it is not enforced at runtime.

| Gate | Upstream job | Upstream time | Downstream trigger | Gap |
|---|---|---|---|---|
| foreignFlow→EOD | `foreignFlowAlertJob` (Bun) | 08:13 UTC Mon-Fri | `chef-eod` RemoteTrigger | 24 min |
| macroRefresh→Evening | `macroIndicatorRefreshJob` (Bun) | 19:13 UTC daily | `chef-evening` RemoteTrigger | 24 min |

### 3.4 The cowork-scheduler agent is eliminated

The `cowork-scheduler.md` agent definition and `.claude/flows/cowork-scheduler/main.md` flow are **no longer needed**. No new agent is created.

**What replaces it:** 17 RemoteTriggers in claude.ai, each autonomous.

**Lightweight watchdog (optional, Phase 3):** If any "scheduler" process persists, it is a watchdog-only reader in the dev-team drain-signals step (Step 0 already reads WORK silence). No new agent is needed for this. See Section 5.

### 3.5 Tradeoffs

| Dimension | OLD (cowork-scheduler dispatcher) | NEW (17 RemoteTriggers) |
|---|---|---|
| Trigger count | 1 master + subagent spawns | 17 independent triggers |
| Claude Desktop compatible | NO | YES |
| Session-evaporation risk | High (single point) | Eliminated (each trigger persists independently) |
| SPOF | cowork-scheduler crash = all cowork stops | No SPOF — each slot independent |
| Observability | Single heartbeat file | 17 `last_fired` timestamps in cowork-schedule.json |
| Dependency gate enforcement | Runtime `gate_condition` check | Time-offset encoding (simpler, already working in Sprint 1949) |
| Admin cost (enable/disable one slot) | Edit time-table + single process | Edit time-table + pause that trigger in claude.ai |
| Admin cost (change cron for one slot) | Edit time-table only | Edit time-table + update that trigger in claude.ai |

**Net verdict:** More triggers to manage (17 vs 1) but zero subagent dependency and zero SPOF. Correct for Claude Desktop.

---

## 4. Time-Table File — cowork-schedule.json

The actual file has been written to `docs/data/cowork-schedule.json` as a deliverable of this brief. See that file for the full 17-slot time-table.

### 4.1 Schema

```json
{
  "_ssot": "docs/data/cowork-schedule.json",
  "_maintained_by": "agent-father (via architect brief only)",
  "_query": "jq '.slots[] | select(.enabled)' docs/data/cowork-schedule.json",
  "_runtime": "claude.ai RemoteTrigger — one trigger per slot; NOT a Claude Desktop CronCreate dispatcher",
  "slots": [
    {
      "slot_id": "<unique-slug>",
      "cron": "<cron-expr>",
      "utc_description": "<human-readable UTC time>",
      "vn_description": "<human-readable VN time>",
      "agent": "<agent-id>",
      "flow_path": "<.claude/flows/agent/flow.md>",
      "trigger_prompt": "run <flow_path>  slot=<slot_id>",
      "dish_type": "<string — see Section 4.2>",
      "guaranteed": true,
      "depends_on": null,
      "enabled": true,
      "last_fired": null
    }
  ]
}
```

**Key fields:**
- `slot_id` — machine-readable slug; used as the `slot=` arg in trigger_prompt
- `cron` — original cron expression from agent .md (preserved exactly for gate integrity)
- `trigger_prompt` — the exact prompt string for the RemoteTrigger
- `depends_on` — null for most slots; documents logical upstream job (not runtime-enforced)
- `guaranteed` — true = agent must publish output; false = convergence/event-gated, may silent-exit
- `enabled` — false = RemoteTrigger should be paused in claude.ai (hot-disable without deletion)
- `last_fired` — written by each agent after successful run; read by dev-team watchdog

### 4.2 17-slot inventory

| slot_id | cron | agent | dish_type | guaranteed | depends_on |
|---|---|---|---|---|---|
| `chef-morning` | `23 5 * * 1-5` | `unified-agent` | `morning_dish` | true | null |
| `chef-intraday` | `13 2-8 * * 1-5` | `unified-agent` | `convergence_scan` | false | null |
| `chef-eod` | `37 8 * * 1-5` | `unified-agent` | `eod_dish` | true | `foreignFlowAlertJob:08:13` |
| `chef-evening` | `37 19 * * *` | `unified-agent` | `evening_preview` | true | `macroIndicatorRefreshJob:19:13` |
| `digest-sunday` | `47 13 * * 0` | `digest-predict` | `weekly_digest` | true | null |
| `digest-monday-predict` | `30 0 * * 1` | `digest-predict` | `monday_predict` | false | null |
| `tnb-audit` | `13 20 * * *` | `tran-ngoc-bau` | `daily_audit` | true | null |
| `financial-analyst-morning` | `0 0 * * *` | `financial-analyst` | `twice_daily_bctc` | false | null |
| `financial-analyst-midday` | `0 12 * * *` | `financial-analyst` | `twice_daily_bctc` | false | null |
| `news-scout-market` | `*/15 2-8 * * 1-5` | `news-scout` | `market_hours_gather` | false | null |
| `news-scout-offhours` | `0 */4 * * *` | `news-scout` | `off_hours_gather` | false | null |
| `news-scout-sentiment` | `0 5 * * 1-5` | `news-scout` | `batch_sentiment` | false | null |
| `market-watcher-market` | `*/15 2-8 * * 1-5` | `market-watcher` | `market_hours_gather` | false | null |
| `market-watcher-prepost` | `*/30 * * * 1-5` | `market-watcher` | `pre_post_gather` | false | null |
| `market-watcher-offhours` | `0 */4 * * *` | `market-watcher` | `off_hours_gather` | false | null |
| `market-watcher-eod` | `0 16 * * 1-5` | `market-watcher` | `eod_gather` | false | null |
| `alert-commander-market` | `*/15 2-8 * * 1-5` | `alert-commander` | `market_hours_alert` | false | null |

---

## 5. Failure Mode — Watchdog Design

### 5.1 Risk profile in the RemoteTrigger model

With 17 independent triggers, there is no single point of failure. The failure mode shifts from "scheduler crashes → all cowork stops" to "one trigger is paused or misconfigured → that slot silently misses". The watchdog must cover both cases.

### 5.2 Watchdog mechanism

**Layer 1 — Dev-team Step 0 channel audit (existing, extend).**

The dev-team cron fires at `7 * * * *`. Its Step 0 already reads WORK/BUG/MARKET. Add a `cowork_watchdog` check:

```
IF current UTC hour IN [8, 9, 10, 11, 12, 13]:  # after EOD dish expected at 08:37
  last_chef_msg = get_market_message_digest(agent="unified-agent", limit=1)
  if last_chef_msg.age > 6h:
    drop signal: docs/signals/{ts}-cowork-scheduler-silent.json
      {from: "dev-team", to: "po", type: "watchdog-alert",
       payload: "No chef dish in 6h — check cowork RemoteTriggers"}
```

**Layer 2 — last_fired staleness check (Phase 4).**

Each agent writes `last_fired` timestamp to its slot row in `cowork-schedule.json` after successful run. Dev-team drain-signals.md reads this file and alerts if any `guaranteed: true` slot is overdue by >2h.

```
FOR each slot WHERE guaranteed=true AND enabled=true:
  if last_fired is null OR (now - last_fired) > expected_interval + 2h:
    drop signal: cowork-slot-overdue.json → po
```

**Layer 3 — No scheduler heartbeat needed.**

In the original model, a cowork-scheduler notebook mtime was the heartbeat. In the RemoteTrigger model, the `last_fired` field in `cowork-schedule.json` per slot is the direct heartbeat. No extra file needed.

### 5.3 Recovery path

When watchdog fires signal: PO receives → opens SPRINT-S task → agent-father inspects and re-enables the affected RemoteTrigger in claude.ai. Recovery time: <30 min. No automated self-heal in scope for Phase 1.

---

## 6. Implementation Phases

### Phase 1 — Create SSOT file + RemoteTrigger setup

**Prerequisites:** Agent-father must resolve OQ-1, OQ-2, OQ-3 (Section 2.3) before creating triggers.

Tasks for agent-father:
1. Verify `docs/data/cowork-schedule.json` (already written — validate JSON, confirm 17 rows)
2. For each of the 17 slots in the file: create one RemoteTrigger in claude.ai with `cron` and `trigger_prompt` from the file
3. Verify each trigger is persistent (survives session close) — smoke test: close session, reopen, confirm trigger still registered
4. Run in parallel with existing agent `.md` schedule blocks for 24h (validation window)

**AC Phase 1:**
- `docs/data/cowork-schedule.json` is valid JSON with 17 slots
- All 17 RemoteTriggers registered in claude.ai
- At least 3 test ticks fire correctly (morning chef, EOD chef, TNB audit) with correct agent sessions launched
- OQ-1/OQ-2/OQ-3 answered and documented in a one-line note in cowork-schedule.json `_notes` field

### Phase 2 — Remove schedule blocks from agent .md files

Tasks for agent-father (same as original brief, Section 8 Edit list):
1. Remove `schedule:` block from `unified-agent.md` (4 slots)
2. Remove `schedule:` block from `news-scout.md` (3 slots)
3. Remove `schedule:` block from `alert-commander.md` (1 slot)
4. Remove `schedule:` block from `tran-ngoc-bau.md` (1 slot)
5. Remove `schedule:` block from `digest-predict.md` (2 slots)
6. Remove `schedule:` block from `financial-analyst.md` (1 slot)
7. Remove `schedule:` section from `docs/agents/market-watcher/knowledge.md` (4 slots)
8. Add `inter_agent.receives_from: {via: RemoteTrigger, trigger_source: cowork-schedule.json}` to each affected agent

**AC Phase 2:** No agent `.md` contains a `schedule:` block except `qa-responder` (Bun-side, exempt). Verified by: `grep -r "schedule:" .claude/agents/ | grep -v "qa-responder"` returns empty.

### Phase 3 — Wire dev-team Step 0 watchdog

Tasks for agent-father:
1. Edit `.claude/flows/dev-team/drain-signals.md` — add `cowork_watchdog` block (Section 5.2 Layer 1)
2. Add `cowork-scheduler-silent` signal type to signal type vocabulary
3. Test: manually pause one guaranteed RemoteTrigger for 1 cycle → verify watchdog signal appears

**AC Phase 3:** Dev-team WORK channel receives watchdog signal within 1 hour of guaranteed slot silence during market hours.

### Phase 4 — last_fired observability

Tasks for agent-father:
1. Add `last_fired` write step to each guaranteed-slot agent's flow (unified-agent, digest-predict, tran-ngoc-bau): after successful channel publish, write `last_fired` timestamp to matching slot in `cowork-schedule.json`
2. Dev-team drain-signals.md — add `last_fired` staleness check for `guaranteed: true` slots (Section 5.2 Layer 2)

**AC Phase 4:** `docs/data/cowork-schedule.json` shows `last_fired` timestamps after each guaranteed slot run. Dev-team detects overdue guaranteed slot within 2h.

### Phase 5 — Docs cascade

Tasks for agent-father:
1. Update `docs/data/system-map.json` — confirm NO `cowork-scheduler` agent is added (it was eliminated)
2. Update `docs/references/agent-roster.md` — no new row (cowork-scheduler removed from plan)
3. Update `docs/ARCHITECTURE.md` — add "Cowork Schedule — RemoteTrigger Model" section replacing any cowork-scheduler reference
4. Update `docs/data/cron-registry.json` — add 17 RemoteTrigger entries, mark old CronCreate slots in agent .md as migrated
5. Update `docs/standards/cron-jobs.md` — add RemoteTrigger rows to Chef Cook Schedule table

**AC Phase 5:** All structural docs reflect RemoteTrigger model. `docs/data/cron-registry.json` has 17 cowork RemoteTrigger entries.

---

## 7. Files-to-Change List

### New files (create or already created)
- `docs/data/cowork-schedule.json` — WRITTEN as deliverable of this brief

### Deleted from plan (no longer needed)
- ~~`.claude/agents/cowork-scheduler.md`~~ — eliminated (was dispatcher, incompatible with Claude Desktop)
- ~~`.claude/flows/cowork-scheduler/main.md`~~ — eliminated

### Edit (remove schedule blocks, Phase 2)
- `.claude/agents/unified-agent.md` — remove `schedule:` section (4 rows); add RemoteTrigger `receives_from`
- `.claude/agents/news-scout.md` — remove `schedule:` section (3 rows); add RemoteTrigger `receives_from`
- `.claude/agents/alert-commander.md` — remove `schedule:` section (1 row); add RemoteTrigger `receives_from`
- `.claude/agents/tran-ngoc-bau.md` — remove `schedule:` section (1 row); add RemoteTrigger `receives_from`
- `.claude/agents/digest-predict.md` — remove `schedule:` section (2 rows); add RemoteTrigger `receives_from`
- `.claude/agents/financial-analyst.md` — remove `schedule:` section (1 row); add RemoteTrigger `receives_from`
- `docs/agents/market-watcher/knowledge.md` — remove `schedule:` section (4 rows)
- `.claude/flows/dev-team/drain-signals.md` — add `cowork_watchdog` check block (Phase 3)

### Edit (docs cascade, Phase 5)
- `docs/data/system-map.json` — confirm cowork-scheduler NOT added
- `docs/references/agent-roster.md` — no new row
- `docs/ARCHITECTURE.md` — add RemoteTrigger model section
- `docs/data/cron-registry.json` — add 17 RemoteTrigger entries
- `docs/standards/cron-jobs.md` — update Chef Cook Schedule table

---

## 8. Acceptance Criteria

**AC-1 — Time-table coverage:** All 17 schedule slots in `docs/data/cowork-schedule.json` have correct cron expressions matching original agent `.md` definitions. Zero slots lost in migration.

**AC-2 — RemoteTrigger persistence:** Each of the 17 triggers survives session close and re-fires on schedule. Verified by: close cowork session, reopen workspace, confirm triggers still listed in claude.ai.

**AC-3 — Dependency-order preservation:** `chef-eod` slot cron is `37 8 * * 1-5` (24 min after `foreignFlowAlertJob` at `08:13 UTC`). `chef-evening` cron is `37 19 * * *` (24 min after `macroIndicatorRefreshJob` at `19:13 UTC`). Both offsets preserved exactly in `cowork-schedule.json`. No regression.

**AC-4 — No dependency-order regression:** After Phase 2 removal, unified-agent dish output quality (TNB 6-layer completeness, tran-ngoc-bau audit score) does not drop below Sprint 1949 baseline for 3 consecutive daily cycles.

**AC-5 — Watchdog detection:** When one guaranteed RemoteTrigger is manually paused for 2 hours during market hours (08:00-10:00 UTC), dev-team drain-signals emits `cowork-scheduler-silent` signal to PO within the next dev-team cron tick (≤60 min lag).

**AC-6 — Convergence-scan gating preserved:** `chef-intraday` slot (dish_type: `convergence_scan`, guaranteed: false) RemoteTrigger fires. Chef.md reads `guaranteed: false` arg → applies convergence rule → publishes only when rule fires. Verified by: 3 intraday cycles with zero qualifying clusters → MARKET receives zero intraday messages.

**AC-7 — Single SSOT:** `docs/data/cowork-schedule.json` is the only file containing cowork schedule data. No agent `.md` contains a `schedule:` block except `qa-responder` (Bun-side exempt). Verified by: `grep -r "schedule:" .claude/agents/ | grep -v "qa-responder"` returns empty.

**AC-8 — jq-queryable:** `jq '.slots[] | select(.agent=="unified-agent")' docs/data/cowork-schedule.json` returns 4 rows. `jq '.slots[] | select(.guaranteed==true)' docs/data/cowork-schedule.json` returns 5 rows (morning_dish, eod_dish, evening_preview, weekly_digest, daily_audit).

**AC-9 — No cowork-scheduler agent created:** `ls .claude/agents/cowork-scheduler.md` returns file-not-found. `jq '.project.agents[] | select(.id=="cowork-scheduler")' docs/data/system-map.json` returns empty.

---

## 9. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| RemoteTrigger cron syntax does not support range/step (`*/15`, `2-8`) | Medium | OQ-1 must be resolved in Phase 1 T1 before any trigger creation. If unsupported, agent-father decomposes into individual hourly triggers (increases count but logic unchanged). |
| RemoteTrigger count limit reached at 17 | Low | OQ-2 must be resolved. If limit exists, gatherer market-hours slots (lowest-priority) are candidates for deferral to Phase 2. |
| qa-responder schedule accidentally removed | Low | AC-7 grep explicitly exempts qa-responder; Phase 2 task list does not include qa-responder.md |
| One RemoteTrigger silently stops firing | Medium | Layer 2 last_fired watchdog (Phase 4) detects overdue guaranteed slots within 2h |
| Sprint 1949 cron expressions drift after Phase 2 | Low | cowork-schedule.json is SSOT; agent .md removal is one-way; any future schedule change goes through time-table + RemoteTrigger update |
| OQ-1/2/3 block Phase 1 entirely | LOW (resolved) | OQ-1 ANSWERED (cron syntax supported). OQ-3 ANSWERED (RemoteTrigger tool, env_id known). OQ-2 still unverified but non-blocking — proceed with 17 triggers. |
