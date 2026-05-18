> Authored by: agents-architect | 2026-05-18T17:02:06Z
> Status: READY — awaiting agent-father (new agent + flow files) + pm (sprint sequencing)

# Architecture Brief: Cowork Master Scheduler

## 1. Problem Statement

The cowork pipeline (9 agents, Sprint 1949 five-dish schedule) is deployed with schedule blocks fragmented across individual agent `.md` files. This produces three concrete failure modes:

**F1 — Session-evaporation.** `CronCreate` slots are session-scoped in Claude Desktop. When a session ends, all schedule registrations evaporate. A scheduler agent spawned in the next cron tick starts fresh and re-registers — but only if it was itself scheduled by something persistent. The current design has no persistent root.

**F2 — Dependency ordering is implicit and brittle.** Sprint 1949 aligned `foreignFlowAlertJob` at `08:13 UTC` and EOD chef dish at `08:37 UTC` (24-minute gate). `macroIndicatorRefreshJob` fires at `19:13 UTC`, 24 minutes before Evening Preview at `19:37 UTC`. These gates exist only as comments in cron-registry.json — no agent reads them before spawning. Any drift in one side of the gate is invisible until content degrades.

**F3 — Scattered timing = scattered monitoring.** There is no single file to inspect to know whether all cowork slots fired today. The dev-team drain-signals step can detect missing chef output, but there is no structured health-check for the dispatch layer itself.

**Scope:** This brief covers only the cowork pipeline (9 agents listed in Section 3). The `7 * * * *` dev-team cron and all Docker-side Bun scheduler jobs are outside scope and must not be touched.

---

## 2. Affected Agents / Files / Flows

### Agents with schedule blocks to be removed

| Agent | Current schedule blocks | Block location |
|---|---|---|
| `unified-agent` | `morning_dish` `23 5 * * 1-5`, `intraday_scan` `13 2-8 * * 1-5`, `eod_dish` `37 8 * * 1-5`, `evening_preview` `37 19 * * *` | `.claude/agents/unified-agent.md § schedule` |
| `news-scout` | `market_hours` `*/15 2-8 * * 1-5`, `off_hours` `0 */4 * * *`, `batch2_sentiment` `0 5 * * 1-5` | `.claude/agents/news-scout.md § schedule` |
| `alert-commander` | `market_hours` `*/15 2-8 * * 1-5` | `.claude/agents/alert-commander.md § schedule` |
| `tran-ngoc-bau` | `daily_audit` `13 20 * * *` | `.claude/agents/tran-ngoc-bau.md § schedule` |
| `digest-predict` | `monday_predict` `30 0 * * 1`, `weekly_digest` `47 13 * * 0` | `.claude/agents/digest-predict.md § schedule` |
| `financial-analyst` | `twice_daily` `0 0,12 * * *` | `.claude/agents/financial-analyst.md § schedule` |
| `market-watcher` | `market_hours` `*/15 2-8 * * 1-5`, `pre_post_market` `*/30 * * * 1-5`, `off_hours` `0 */4 * * *`, `batch4_eod` `0 16 * * 1-5` | `docs/agents/market-watcher/knowledge.md § Schedule` |

**Note:** `qa-responder` schedule (`*/12 * * * *`) is driven by Docker-side `askQueueCheck` cron in cron-registry.json — it is NOT a cowork cron block. Do not remove it; it belongs to the Bun scheduler pipeline.

`report-analyzer` is event-driven (`event_driven: true`) — no schedule block to remove.

### New files

| File | Purpose |
|---|---|
| `docs/data/cowork-schedule.json` | SSOT time-table — array of schedule rows (spec in Section 4) |
| `.claude/agents/cowork-scheduler.md` | New cowork-scheduler agent definition |
| `.claude/flows/cowork-scheduler/main.md` | Scheduler dispatcher flow |

---

## 3. Architecture Design

### 3.1 Two-tier model: bash hook (gate) + agent (dispatch)

The user constraint says: if no slot is active, exit in <1s. A full LLM agent invocation has 2-5s cold-start cost minimum. Therefore the scheduler MUST have a pre-LLM gate.

**Recommended architecture: bash cron hook → LLM agent on match only.**

```
[macOS crontab / Claude Desktop cron]
  cron: "7,22,37,52 * * * *"
  └── cowork-scheduler agent spawned
        ├── Step 0 (bash): read UTC time → jq match against cowork-schedule.json
        │     no match → EXIT immediately (no LLM tokens consumed)
        └── Step 1 (LLM): slot matched → read slot row → spawn target agent
```

The cowork-scheduler agent's main.md flow runs a bash command as Step 0 before any LLM reasoning. If `jq` returns empty, the flow returns `NOOP` and exits. This keeps silent-exit cost to the overhead of spawning the agent process itself (~0.3-1s) rather than loading an LLM.

**Why not a pure bash script?** The spawn mechanism in this system is Claude Desktop's `CronCreate` which spawns agent sessions. A pure bash script cannot spawn a Claude agent. The hybrid model (agent with bash-first gate) is the minimum-cost correct path.

### 3.2 Offset convention: `7,22,37,52 * * * *`

Current reserved minutes to avoid (from cron-registry.json):
- `:00` — multiple Docker jobs
- `:17` — `signalOutcomeResolutionJob`
- `:30` — `walCheckpoint`, `bctcPdfPull`, others
- `:07` — `verdictResolutionJob`
- `:15` — `ohlcvStalenessCheckJob` (at `15 8 * * 1-5`)

The proposed scheduler fires at minutes `7, 22, 37, 52`. Wait — `7` conflicts with `verdictResolutionJob`. Revised: **`2,17,32,47 * * * *`**. Wait — `17` conflicts with `signalOutcomeResolutionJob`. Revised: **`3,18,33,48 * * * *`**. These minutes are clear in cron-registry.json.

**Decision: scheduler cron = `3,18,33,48 * * * *`** — fires 4 times per hour at clear minutes.

### 3.3 Dependency gate preservation

The foreignFlow→EOD and macroRefresh→Evening gates are Docker-side Bun jobs (not cowork cron). They write signal data to the DB. The cowork-scheduler does NOT need to gate on those jobs completing — it simply needs to fire chef 24 minutes after those jobs are expected to complete. The current offsets in Sprint 1949 already encode this gap. The scheduler's time-table preserves those exact cron expressions.

The cowork-scheduler reads the `gate_condition` field from the time-table row. For slots with `gate_condition: null`, it spawns immediately. For future gated slots (not current scope), the gate_condition field is reserved.

### 3.4 Intraday convergence — special case

`unified-agent` intraday scan at `13 2-8 * * 1-5` fires 7 times/day on weekdays. The master scheduler fires at `3,18,33,48` — so it does NOT naturally align with `:13`. Two options:

**Option A:** Add `:13` to the scheduler cron expression → `3,13,18,33,48 * * * *`. During market hours only (02-08 UTC), the `:13` tick spawns unified-agent for intraday scan. Outside market hours `:13` ticks get no match → NOOP.

**Option B:** Keep intraday scan as a separate CronCreate at `13 2-8 * * 1-5` in unified-agent.md. Only the 4 guaranteed-publish slots move to the master scheduler.

**Recommendation: Option A.** Consolidation is the goal. Adding `:13` adds a 5th scheduler tick during market hours. Silent-exit cost remains near-zero (bash jq match). The time-table row for intraday scan carries `dish_type: convergence_scan` and `guaranteed: false` — chef.md reads this field to decide whether to publish or silent-exit based on convergence rule. This preserves the convergence gating inside chef.md exactly as today.

**Final scheduler cron: `3,13,18,33,48 * * * *`**

---

## 4. Time-Table File Specification

### 4.1 Schema

```json
{
  "_ssot": "docs/data/cowork-schedule.json",
  "_maintained_by": "agent-father (via architect brief only)",
  "_query": "jq '.slots[] | select(.enabled)' docs/data/cowork-schedule.json",
  "slots": [
    {
      "id": "<unique-slug>",
      "cron": "<cron-expr>",
      "utc_description": "<human-readable UTC time>",
      "vn_description": "<human-readable VN time>",
      "agent": "<agent-id>",
      "flow": "<flow-path>",
      "dish_type": "<morning_dish|eod_dish|evening_preview|convergence_scan|weekly_digest|monday_predict|daily_audit|twice_daily_bctc|market_hours_gather|off_hours_gather|eod_gather>",
      "guaranteed": true,
      "gate_condition": null,
      "enabled": true
    }
  ]
}
```

**Key fields:**
- `id` — machine-readable slug, grep-friendly
- `cron` — preserved exactly from agent .md (the chef reads this for display; scheduler matches on UTC clock)
- `gate_condition` — null for current slots; reserved for future dependency chaining (e.g. `"foreignFlow:08:13:complete"`)
- `guaranteed` — true = agent must publish output; false = convergence-gated, may silent-exit
- `enabled` — false = scheduler skips without spawning agent; allows hot-disable without file edit

### 4.2 Seed content (Sprint 1949 + current slots)

| id | cron | agent | dish_type | guaranteed |
|---|---|---|---|---|
| `chef-morning` | `23 5 * * 1-5` | `unified-agent` | `morning_dish` | true |
| `chef-intraday` | `13 2-8 * * 1-5` | `unified-agent` | `convergence_scan` | false |
| `chef-eod` | `37 8 * * 1-5` | `unified-agent` | `eod_dish` | true |
| `chef-evening` | `37 19 * * *` | `unified-agent` | `evening_preview` | true |
| `digest-sunday` | `47 13 * * 0` | `digest-predict` | `weekly_digest` | true |
| `digest-monday-predict` | `30 0 * * 1` | `digest-predict` | `monday_predict` | false |
| `tnb-audit` | `13 20 * * *` | `tran-ngoc-bau` | `daily_audit` | true |
| `financial-analyst-morning` | `0 0 * * *` | `financial-analyst` | `twice_daily_bctc` | false |
| `financial-analyst-midday` | `0 12 * * *` | `financial-analyst` | `twice_daily_bctc` | false |
| `news-scout-market` | `*/15 2-8 * * 1-5` | `news-scout` | `market_hours_gather` | false |
| `news-scout-offhours` | `0 */4 * * *` | `news-scout` | `off_hours_gather` | false |
| `news-scout-sentiment` | `0 5 * * 1-5` | `news-scout` | `batch_sentiment` | false |
| `market-watcher-market` | `*/15 2-8 * * 1-5` | `market-watcher` | `market_hours_gather` | false |
| `market-watcher-prepost` | `*/30 * * * 1-5` | `market-watcher` | `pre_post_gather` | false |
| `market-watcher-offhours` | `0 */4 * * *` | `market-watcher` | `off_hours_gather` | false |
| `market-watcher-eod` | `0 16 * * 1-5` | `market-watcher` | `eod_gather` | false |
| `alert-commander-market` | `*/15 2-8 * * 1-5` | `alert-commander` | `market_hours_alert` | false |

**Note on `news-scout-market`, `market-watcher-market`, and `alert-commander-market`:** These fire every 15 min during market hours (02-08 UTC Mon-Fri). The scheduler at `3,13,18,33,48` catches all 15-min slots correctly (minute offsets within the 15-min cycle will be approximate — gatherers are stateless per cycle so ±3 min offset is inconsequential).

### 4.3 Matcher logic (in cowork-scheduler main.md Step 0)

```bash
NOW_MIN=$(date -u +%M | sed 's/^0//')
NOW_HOUR=$(date -u +%H | sed 's/^0//')
NOW_DOW=$(date -u +%u)  # 1=Mon ... 7=Sun

# jq: match slot whose cron covers this (hour, minute, dow) combination
MATCHES=$(jq -r --argjson h "$NOW_HOUR" --argjson m "$NOW_MIN" --argjson d "$NOW_DOW" \
  '[.slots[] | select(.enabled == true)] | ... ' docs/data/cowork-schedule.json)

if [ -z "$MATCHES" ]; then exit 0; fi
# else: pass MATCHES to LLM step for agent spawn
```

Full cron-matching logic is a known pattern (minute/hour/dow field expansion). Agent-father should use a small shell function or embed it inline in main.md. The complexity is: split cron field on `,` and `/` dividers, test range, test step. This is ~30 lines of bash — appropriate for an inline flow step.

---

## 5. Failure Mode — Watchdog Design

### 5.1 Risk: cowork-scheduler failure = ALL cowork stops

The master scheduler is a single point of failure. If it crashes or fails to spawn:
- No chef dishes → MARKET goes silent
- No gatherers → signals stale
- No alerts → position-danger events missed

### 5.2 Watchdog mechanism

**Layer 1 — Dev-team Step 0 channel audit (existing, extend).**

The dev-team cron fires at `7 * * * *`. Its Step 0 already reads WORK/BUG/MARKET. Add a check: if no `unified-agent` MARKET message has appeared in the last 6 hours during market hours (02:00-14:00 UTC window), open a BUG signal.

Specifically: dev-team drain-signals.md should add a `cowork_watchdog` check:
```
IF current UTC hour IN [8, 9, 10, 11, 12, 13]:  # after EOD dish expected at 08:37
  last_chef_msg = get_market_message_digest(agent="unified-agent", limit=1)
  if last_chef_msg.age > 6h:
    drop signal: docs/signals/{ts}-cowork-scheduler-silent.json
      {from: "dev-team", to: "po", type: "watchdog-alert", payload: "No chef dish in 6h"}
```

**Layer 2 — cowork-schedule.json `last_fired` field (optional, Phase 4).**

The cowork-scheduler appends a `last_fired` timestamp to each slot row after successful spawn. A separate health-check step in drain-signals.md can read this file and alert if any `guaranteed: true` slot is overdue by >2h.

**Layer 3 — Scheduler self-heartbeat.**

On every execution (even NOOP), cowork-scheduler writes a one-line heartbeat to `docs/agent-memory/notebooks/cowork-scheduler.md`. Dev-team can check mtime of this file: if last modified >2h, the scheduler process itself has stopped running.

### 5.3 Recovery path

When watchdog fires signal: PO receives → opens SPRINT-S task → agent-father restarts cowork-scheduler CronCreate registration. This is a <30 min recovery cycle. No automated self-heal in scope for Phase 1.

---

## 6. Implementation Phases

### Phase 1 — Create SSOT + scheduler agent (no breakage, runs in parallel)

Tasks for agent-father:
1. Create `docs/data/cowork-schedule.json` from Section 4.2 seed content
2. Create `.claude/agents/cowork-scheduler.md` — new agent definition (model: haiku, no LLM reasoning in NOOP path)
3. Create `.claude/flows/cowork-scheduler/main.md` — bash gate → jq match → spawn target agent or exit
4. Register `CronCreate` for `cowork-scheduler` at `3,13,18,33,48 * * * *`
5. Run in parallel with existing agent schedule blocks for 24h (validation window)

**AC Phase 1:** `cowork-schedule.json` exists and is valid JSON; scheduler spawns correct agent for 3 test ticks (morning, EOD, TNB-audit).

### Phase 2 — Remove schedule blocks from agent .md files

Tasks for agent-father:
1. Remove `schedule:` block from `unified-agent.md` (4 slots)
2. Remove `schedule:` block from `news-scout.md` (3 slots)
3. Remove `schedule:` block from `alert-commander.md` (1 slot)
4. Remove `schedule:` block from `tran-ngoc-bau.md` (1 slot)
5. Remove `schedule:` block from `digest-predict.md` (2 slots)
6. Remove `schedule:` block from `financial-analyst.md` (1 slot)
7. Remove `schedule:` section from `docs/agents/market-watcher/knowledge.md` (4 slots)
8. Add `inter_agent.receives_from: cowork-scheduler` to each affected agent

**AC Phase 2:** No agent .md contains a `schedule:` block except `qa-responder` (Bun-side, exempt). All 7 agents updated.

### Phase 3 — Wire dev-team Step 0 watchdog

Tasks for agent-father:
1. Edit `.claude/flows/dev-team/drain-signals.md` — add `cowork_watchdog` block (Section 5.2 Layer 1)
2. Add `cowork-scheduler-silent` to signal type vocabulary in `docs/signals/processed/` drain logic
3. Test: manually suppress cowork-scheduler for 1 cycle → verify watchdog signal appears

**AC Phase 3:** Dev-team WORK channel receives watchdog signal within 1 hour of cowork-scheduler silence during market hours.

### Phase 4 — Scheduler health observability

Tasks for agent-father:
1. Add `last_fired` field append to cowork-scheduler main.md (write to `docs/data/cowork-schedule.json` after each slot spawn)
2. Add `cowork-scheduler.md` notebook creation step (heartbeat on every tick, including NOOP)
3. Dev-team drain-signals.md — add `last_fired` staleness check for `guaranteed: true` slots (Section 5.2 Layer 2)

**AC Phase 4:** `docs/data/cowork-schedule.json` shows `last_fired` timestamps; dev-team detects overdue guaranteed slot within 2h.

### Phase 5 — Docs cascade

Tasks for agent-father:
1. Update `docs/data/system-map.json` — add `cowork-scheduler` to `project.agents` cowork team
2. Update `docs/references/agent-roster.md` — add cowork-scheduler row
3. Update `docs/ARCHITECTURE.md` — add "Cowork Master Scheduler" section
4. Update `docs/data/cron-registry.json` — add cowork-scheduler entry, mark old CronCreate slots as migrated
5. Update `docs/data/project-stats.json` — increment agent count

**AC Phase 5:** All structural docs reflect the new scheduler. `jq '.project.agents[] | select(.id=="cowork-scheduler")'` returns 1 result.

---

## 7. Agent Definition Sketch (cowork-scheduler)

```yaml
agent:
  id: cowork-scheduler
  name: Cowork Master Scheduler
  version: "2026-05-18"
  model: haiku
  description: >
    Dispatcher-only. Fires at 3,13,18,33,48 past each hour. Step 0 = bash jq match
    against docs/data/cowork-schedule.json. If no slot matches current UTC clock → 
    EXIT immediately (no LLM tokens). If match found → spawn target agent with correct flow.
    Writes heartbeat to notebook on every tick.

  permissions:
    channels:
      market: {write: false}
      work: {write: true, rule: watchdog_alerts_only}
      bug: {write: true, rule: errors_only}

  constraints:
    never_analyze: true       # No reasoning — dispatch only
    never_market_write: true
    silent_exit_on_noop: true
    session_log: mandatory

  schedule:
    dispatcher:
      cron: "3,13,18,33,48 * * * *"
      description: "Master cowork dispatcher — 5 ticks/hour; bash gate first, LLM only on slot match"
```

---

## 8. Files-to-Change List

### New files (create)
- `docs/data/cowork-schedule.json`
- `.claude/agents/cowork-scheduler.md`
- `.claude/flows/cowork-scheduler/main.md`

### Edit (remove schedule blocks)
- `.claude/agents/unified-agent.md` — remove `schedule:` section (4 rows); add `receives_from: cowork-scheduler`
- `.claude/agents/news-scout.md` — remove `schedule:` section (3 rows); add `receives_from: cowork-scheduler`
- `.claude/agents/alert-commander.md` — remove `schedule:` section (1 row); add `receives_from: cowork-scheduler`
- `.claude/agents/tran-ngoc-bau.md` — remove `schedule:` section (1 row); add `receives_from: cowork-scheduler`
- `.claude/agents/digest-predict.md` — remove `schedule:` section (2 rows); add `receives_from: cowork-scheduler`
- `.claude/agents/financial-analyst.md` — remove `schedule:` section (1 row); add `receives_from: cowork-scheduler`
- `docs/agents/market-watcher/knowledge.md` — remove `schedule:` section (4 rows)
- `.claude/flows/dev-team/drain-signals.md` — add `cowork_watchdog` check block

### Edit (docs cascade, Phase 5)
- `docs/data/system-map.json` — add `cowork-scheduler` agent
- `docs/references/agent-roster.md` — add row
- `docs/ARCHITECTURE.md` — add scheduler section
- `docs/data/cron-registry.json` — add scheduler entry
- `docs/data/project-stats.json` — increment agent count

---

## 9. Acceptance Criteria

**AC-1 — Time-table coverage:** All 17 schedule slots listed in Section 4.2 are present in `docs/data/cowork-schedule.json` with correct cron expressions, matching the original agent .md definitions. Zero slots lost in migration.

**AC-2 — Silent-exit performance:** When no slot matches current UTC clock, cowork-scheduler exits within 1 second of spawn. Verified by: spawning scheduler at an off-minute and measuring session duration.

**AC-3 — Dependency-order preservation:** `chef-eod` slot fires at `37 8 * * 1-5` (24 min after `foreignFlowAlertJob` at `08:13 UTC`). `chef-evening` fires at `37 19 * * *` (24 min after `macroIndicatorRefreshJob` at `19:13 UTC`). Both offsets preserved exactly in `cowork-schedule.json`. No regression.

**AC-4 — No dependency-order regression:** After Phase 2 removal, unified-agent dish output quality (TNB 6-layer completeness, tran-ngoc-bau audit score) does not drop below Sprint 1949 baseline for 3 consecutive daily cycles.

**AC-5 — Watchdog detection:** When cowork-scheduler is manually disabled for 2 hours during market hours (08:00-10:00 UTC), dev-team drain-signals emits `cowork-scheduler-silent` signal to PO within the next dev-team cron tick (≤60 min lag).

**AC-6 — Convergence-scan gating preserved:** `chef-intraday` slot (dish_type: `convergence_scan`, guaranteed: false) fires via scheduler. Chef.md reads `guaranteed: false` → applies convergence rule → publishes only when rule fires. Verified by: 3 intraday cycles with zero qualifying clusters → MARKET receives zero intraday messages.

**AC-7 — Single SSOT:** `docs/data/cowork-schedule.json` is the only file containing cowork schedule data. No agent .md contains a `schedule:` block except `qa-responder` (Bun-side exempt). Verified by: `grep -r "schedule:" .claude/agents/ | grep -v "qa-responder" | grep -v "cowork-scheduler"` returns empty.

**AC-8 — jq-queryable:** `jq '.slots[] | select(.agent=="unified-agent")' docs/data/cowork-schedule.json` returns 4 rows. `jq '.slots[] | select(.guaranteed==true)' docs/data/cowork-schedule.json` returns the 3 guaranteed-publish chef slots + tnb-audit + sunday digest.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bash cron-matcher logic incorrect for edge cases (`*/15`, day-of-week ranges) | Medium | Agent-father unit-tests matcher with known time fixtures before Phase 2 go-live |
| `3,13,18,33,48` minute list conflicts with future Docker job | Low | cowork-schedule.json `_reserved_minutes` field documents in-use minutes; PM checks before adding new Docker jobs |
| qa-responder schedule accidentally removed | Low | AC-7 grep explicitly exempts qa-responder; Phase 2 task list does not include qa-responder.md |
| cowork-scheduler fails silently (spawn error, not exit error) | Medium | Layer 3 heartbeat (notebook mtime) detects stale scheduler within 2h |
| Sprint 1949 cron expressions drift after Phase 2 (agent .md removed, table not synced) | Low | cowork-schedule.json is SSOT; agent .md removal is one-way; any future schedule change goes through time-table only (enforced by agent-father constraint in cowork-scheduler.md) |
