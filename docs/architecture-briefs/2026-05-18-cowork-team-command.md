> Authored by: agents-architect | 2026-05-18T20:11:09Z
> Status: READY — awaiting agent-father (implement cowork-team.md + CronCreate registration)
> Parent: [workflow-map.md](../references/workflow-map.md) · [cron-jobs.md](../standards/cron-jobs.md)
> Sprint: 1951 (pivot from per-slot RemoteTrigger to dev-team-pattern master cron)

<!-- size-justification: ~180L — 10-section spec per CONTEXT brief; each section load-bearing for agent-father -->

# Architecture Brief: cowork-team Master Cron Command

---

## 1. Problem Statement — Why Pivot

The RemoteTrigger-per-slot model (prior brief `2026-05-18-cowork-master-scheduler.md`) hit two physical walls:

**Wall A — API_MIN_INTERVAL.** RemoteTrigger enforces ≥1h minimum cron interval at create-time (HTTP 400). Four slots require sub-hourly cadence: `news-scout-market` (`*/15 2-8`), `market-watcher-market` (`*/15 2-8`), `market-watcher-prepost` (`*/30 * * * 1-5`), `alert-commander-market` (`*/15 2-8`). These are blocked as `trigger_error: API_MIN_INTERVAL` in `docs/data/cowork-schedule.json`.

**Wall B — Claude Desktop cannot spawn subagents.** A dispatcher agent on Claude Desktop cannot call the Agent tool (Claude Code SDK only). Any "smart scheduler" on Claude Desktop is impossible.

**User decision:** Copy the `dev-team.md` pattern — a single `*/15 * * * *` CronCreate in Claude Code CLI reads `docs/data/cowork-schedule.json`, matches current UTC ±2min, and parallel-spawns all matching agents in one router message. Same runtime that already hosts dev-team, code-janitor, system-auditor, claude-manager-helper.

---

## 2. Exemplar Pattern — dev-team.md

`.claude/commands/dev-team.md` = 6-word command file: "Read and execute `.claude/flows/dev-team/main.md`"

The registered CronCreate prompt: `Launch subagent (subagent_type=dev-team). Read and execute .claude/commands/dev-team.md`

The new command is identical in structure: `.claude/commands/cowork-team.md` dispatches `.claude/flows/cowork-team/main.md`.

---

## 3. Schema — cowork-schedule.json

**Canonical SSOT:** `docs/data/cowork-schedule.json` (already exists, maintained by agent-father via architect brief only).

**Required fields per slot** (additions/clarifications over the existing schema):

```json
{
  "slot_id": "chef-morning",          // machine slug; passed as slot= arg to flow
  "cron": "23 5 * * 1-5",            // original cron expression (preserved for match algo)
  "agent_id": "unified-agent",        // maps to subagent_type in spawn call
  "flow_path": ".claude/flows/unified-agent/chef.md",
  "enabled": true,                    // false = skip without error
  "parallel_group": "chef",           // optional; slots sharing a group fire in the same spawn batch
  "_disabled_by": null                // free-text reason when enabled=false (e.g. "Sprint 1950-T5")
}
```

**Existing fields retained:** `utc_description`, `vn_description`, `dish_type`, `guaranteed`, `depends_on`, `last_fired`, `trigger_id` (kept for audit; no longer operative for routing).

**New field: `parallel_group`** — informational tag. The dispatcher spawns ALL matching slots concurrently regardless; this field is metadata for human audit (e.g. "why did unified-agent get two spawns at 05:00?").

---

## 4. Match Algorithm

The master cron fires every 15 minutes. Slot crons are arbitrary (e.g. `23 5 * * 1-5`, `0 */4 * * *`). The dispatcher must detect which slots are due at each fire.

```
AT EACH FIRE (currentUTC):
  FOR each slot WHERE enabled=true:
    Expand slot.cron → set of fire-times for this day
    IF any fire-time IN [currentUTC - 2min, currentUTC + 2min]:
      ADD slot to fire_list
  IF fire_list is empty → SILENT EXIT (no output, no signal)
  ELSE → parallel-spawn all fire_list slots (see §5)
```

**Jitter window ±2min** is the canonical tolerance. The master cron fires at :00/:15/:30/:45. Slot crons whose minute field falls within ±2min of those marks are captured. For slots with `*/15` or `*/30` cadence (sub-hourly), the match fires every master tick that overlaps — this is the key advantage over RemoteTrigger (no API_MIN_INTERVAL constraint in Claude Code CLI CronCreate).

**Cron evaluation** uses standard 5-field expansion. The dispatcher reads `slot.cron` and evaluates it against `currentUTC` using the same logic as Claude Code's native CronCreate engine (node-cron or equivalent). No custom parser needed — the match only requires: "would this cron expression fire within ±2min of now?"

**Day-of-week / month fields:** evaluated fully. `0` in day-of-week = Sunday. `1-5` = Mon-Fri. Example: `chef-morning` (`23 5 * * 1-5`) only fires on weekdays at ~05:23 UTC.

---

## 5. Parallel-Spawn Rules

All slots in the current `fire_list` spawn concurrently in a single router message block:

```
Spawn [agent_id=news-scout, flow=.claude/flows/news-scout/main.md, slot=news-scout-market]
Spawn [agent_id=market-watcher, flow=.claude/flows/market-watcher/main.md, slot=market-watcher-market]
Spawn [agent_id=alert-commander, flow=.claude/flows/alert-commander/main.md, slot=alert-commander-market]
```

**Rules:**
- R1: All matching slots spawn simultaneously (no sequential gating inside the dispatcher).
- R2: Dependency gates (`depends_on` field) are time-offset encoded in the `cron` field, not runtime-enforced. The dispatcher does not check `depends_on`.
- R3: If the same `agent_id` appears in multiple matching slots (e.g. `news-scout` has `news-scout-market` + `news-scout-offhours` both matching), both spawns go out. Each carries its own `slot=` arg; agents are idempotent per slot.
- R4: Spawn failure for one slot does not block other slots. Failure is logged to telemetry (§6) and a fail-loud signal drops to WORK.

---

## 6. Telemetry — cowork-team Signal

After each fire (whether spawns happened or silent exit), the dispatcher writes:

```
docs/signals/cowork-team-<ISO>.json
{
  "from": "cowork-team",
  "to": "dev-team",
  "type": "cowork-fire",
  "payload": {
    "fire_time": "<ISO UTC>",
    "matched_slots": ["chef-morning"],
    "spawned": ["unified-agent/chef.md"],
    "silent": false,
    "errors": []
  },
  "priority": "low",
  "createdAt": "<ISO>"
}
```

**Silent cycle:** if `fire_list` is empty, `matched_slots: []`, `spawned: []`, `silent: true`. Signal still written (low-priority) for watchdog use. dev-team drain-signals reads these to detect prolonged silence on guaranteed slots.

**Error entry format:** `{"slot_id": "chef-morning", "error": "spawn failed: <one-line>"}` per failed spawn.

---

## 7. Idempotency Guard

**Problem:** During the 24h parallel-run (RemoteTrigger + cowork-team both active), the same slot may fire twice per window — once from the old RemoteTrigger, once from cowork-team.

**Guard mechanism:**
- Each agent flow already checks its slot's `last_fired` timestamp before publishing. If `last_fired` is within the expected cadence window (e.g. chef-morning fired < 30min ago), the agent exits silently.
- The dispatcher itself does NOT de-duplicate spawns — idempotency is enforced at the agent flow layer, consistent with Sprint 1949 design (AC-6 from po cycle c197 and SPRINT_1951_PLAN.md §1951b AC-3).
- **Double-publish detection:** if the same agent publishes to MARKET twice within 10min (same `dish_type` + same UTC hour), dev-team drain-signals logs `double_publish` to BUG channel. This is the parallel-run idempotency monitor.

---

## 8. Cutover Plan

**Phase 0 (before cowork-team goes live):** Update `docs/data/cowork-schedule.json` — add `agent_id` and `parallel_group` fields where missing. File already has `agent` field; rename/add `agent_id` as alias. Set `trigger_status: pending_delete` (already set) for all 16 enabled RemoteTrigger slots.

**Phase 1 — Register cowork-team master cron (Sprint 1951 pivot):**
1. agent-father creates `.claude/commands/cowork-team.md` (6-word pattern, see §2).
2. agent-father creates `.claude/flows/cowork-team/main.md` (dispatcher flow: read SSOT → match → spawn → telemetry).
3. Register single `CronCreate` in Claude Code CLI: `*/15 * * * *` with prompt `Launch subagent (subagent_type=cowork-team). Read and execute .claude/commands/cowork-team.md`.
4. **24h parallel-run:** both RemoteTrigger slots and cowork-team active. Idempotency guard (§7) prevents double-publish.

**Phase 2 — Delete 16 RemoteTriggers:**

Slots with `trigger_status: pending_delete` (trigger IDs from `cowork-schedule.json`):

| slot_id | trigger_id |
|---|---|
| `chef-morning` | `trig_019nwLpkYELqFdE1DZaRhPUk` |
| `chef-intraday` | `trig_015M6yJMwShWmVcm6XNpVQ3U` |
| `chef-eod` | `trig_011HNsRMNiQwa3vNwN1b9Anh` |
| `chef-evening` | `trig_01CLotVE4XinDFxM2jErUCir` |
| `digest-sunday` | `trig_014GzK19w1ZNpwnRjA91ce3P` |
| `tnb-audit` | `trig_01LpUxJ98v2aK22FqLSBtL1G` |
| `financial-analyst-morning` | `trig_01Du7kZ59vzagGh5GvkTY3Gi` |
| `financial-analyst-midday` | `trig_011JSNKJEMs5fQwGCmLUkuWT` |
| `news-scout-offhours` | `trig_01Mooo3zi5MFysRAWsHwaztd` |
| `news-scout-sentiment` | `trig_016gauuJbAhdbzNcA3LYCFSh` |
| `market-watcher-offhours` | `trig_01W62B3yS7AERMwsGrap4e7U` |
| `market-watcher-eod` | `trig_01PUAqNa8gMWRjc6DWqcV7xh` |

Plus 4 slots with `trigger_error: API_MIN_INTERVAL` (no trigger_id — were never created): `news-scout-market`, `market-watcher-market`, `market-watcher-prepost`, `alert-commander-market`. No deletion needed; they simply move under cowork-team coverage.

`digest-monday-predict` is `enabled: false` — skip.

**Phase 3 — Update cowork-schedule.json** after RemoteTrigger deletion: clear `trigger_id` fields, set `trigger_status: migrated`, update `_runtime` note to `cowork-team dispatcher (*/15 CronCreate)`.

---

## 5b. Chef Pipeline Scope — Include vs Keep on RemoteTrigger

**Recommendation: include ALL 16 enabled cowork slots under cowork-team.**

Justification:
- The 4 chef slots (morning/intraday/eod/evening) are currently on RemoteTrigger. Their cron intervals are ≥1h so they are not blocked by API_MIN_INTERVAL. However, keeping them on RemoteTrigger while moving gatherers to cowork-team creates a two-runtime model — harder to audit, harder to disable cleanly.
- cowork-team runs in Claude Code CLI, the same process that already handles dev-team (fully stable). No additional runtime risk.
- Unified telemetry: all 16 slots emit to `docs/signals/cowork-team-<ISO>.json` — single pane for watchdog.
- TNB-audit and digest-predict are already in `cowork-schedule.json` with `trigger_status: pending_delete` — architect consistency.

**Exception:** `qa-responder` (Bun-side, `0 */1 * * *`) remains on its own RemoteTrigger — it is not a cowork flow and is explicitly exempt per AC-7 of the prior brief.

---

## 9. Failure Modes

| Failure | Detection | Response |
|---|---|---|
| `cowork-schedule.json` malformed / unreadable | dispatcher catch at parse step | fail-loud to WORK: `[cowork-team] schedule.json parse failed: <error>`; drop signal to po; EXIT |
| Agent flow path missing (`.claude/flows/<agent>/main.md` not found) | spawn attempt returns error | log to telemetry `errors[]`; send_telegram WORK `[cowork-team] flow missing: <slot_id>`; continue other spawns |
| Spawn fails (agent crash / SDK error) | spawn promise rejects | log to telemetry `errors[]`; send_telegram WORK; continue |
| Master cron itself stops (CronCreate lost) | dev-team drain-signals: no `cowork-team-*.json` signal in >2h during expected fire window | dev-team signals po; po opens sprint task |
| Double-publish during parallel-run | drain-signals detects same dish_type + UTC hour in MARKET twice | send_telegram BUG `[cowork-team] double-publish: <agent> <dish_type> <UTC>`; log; no auto-fix |

All fail-loud calls follow [fail-loud-protocol.md](../protocols/fail-loud-protocol.md).

---

## 10. Acceptance Criteria

**AC-1 — Command file exists:** `.claude/commands/cowork-team.md` created with dev-team pattern (≤10 words, points to flow).

**AC-2 — Flow file exists:** `.claude/flows/cowork-team/main.md` implements match algorithm (§4), parallel-spawn (§5), telemetry write (§6), all failure modes (§9).

**AC-3 — Master cron registered:** `CronList` shows one `*/15 * * * *` entry pointing to `cowork-team` prompt.

**AC-4 — Sub-hourly slots fire:** `news-scout-market`, `market-watcher-market`, `market-watcher-prepost`, `alert-commander-market` fire within 15min of expected VN market-open (02:00 UTC Mon). Previously blocked by API_MIN_INTERVAL — cowork-team resolves this.

**AC-5 — Silent cycles produce no noise:** At `03:00 UTC` on a weekday (no slot due), dispatcher exits with `silent: true` telemetry, zero WORK/MARKET messages.

**AC-6 — Idempotency during parallel-run:** 24h overlap period — no MARKET duplicate dishes. Verified by: BUG channel receives zero `double_publish` signals during 24h window.

**AC-7 — Telemetry written:** After each fire cycle with ≥1 spawn, `docs/signals/cowork-team-<ISO>.json` exists with correct `matched_slots`, `spawned`, `errors` fields.

**AC-8 — RemoteTrigger deletion:** After parallel-run passes AC-6, all 12 RemoteTriggers with `trigger_status: pending_delete` are deleted. `RemoteTrigger action=list` returns ≤8 triggers (qa-responder + 2 vault + up to 5 margin).

**AC-9 — cowork-schedule.json updated:** All deleted-trigger rows have `trigger_id: null`, `trigger_status: migrated`. `_runtime` field updated to `cowork-team dispatcher`.

**AC-10 — docs/standards/cron-jobs.md updated:** Chef Cook Schedule table updated to reference `*/15 cowork-team CronCreate` as the dispatch layer. RemoteTrigger rows removed.

---

## Open Questions

**OQ-1 (OPEN):** Does the cowork-team flow use `subagent_type` as the spawn mechanism (same as dev-team), or does it use a different spawn primitive? Confirm with agent-father before implementation — the spawn call shape determines whether `agent_id` in schema maps 1:1 to `subagent_type`.

**OQ-2 (OPEN):** The ±2min jitter window may produce false matches if two distinct slots have crons that both fall within ±2min of a :00/:15/:30/:45 boundary (e.g. `chef-morning` at :23 is never within ±2min of :15 or :30, so no collision). Agent-father should add a collision-detection log in the flow: if two slots match the same fire window AND same `agent_id`, log a warning. Currently no such collision exists in the 16-slot inventory, but the guard prevents future schema drift.
