# Cowork Master Cron — Runbook

**Owner:** agent-father
**Last updated:** 2026-06-13 (FIX-COWORK-GUARANTEED-BACKSTOP — Layer-A restored for 5 guaranteed slots)
**Related skill:** `.claude/skills/cron-cowork-team/SKILL.md`
**Schedule SSOT:** `docs/data/cowork-schedule.json`
**Dispatcher flow:** `docs/agents/cowork-team/flow/main.md`
**System-auditor Tier-1 link:** see `docs/protocols/system-audit-runbook.md` — if Tier-1 detects cowork silence, follow this runbook.

---

## 1. Architecture in one paragraph

The cowork pipeline uses two overlapping layers of persistence — **both layers are permanently active and MUST COEXIST** until the §9 stability gate clears (see §9):

**Layer A — RemoteTriggers (5 guaranteed slots, session-independent, RESTORED 2026-06-13):**
Registered in claude.ai workspace `env_011CV1yonRDFUhYhGEdkVwqj`. Fire their own independent CLI sessions. Survive CLI session end and deliberate session restarts. Cover the 5 `guaranteed: true` slots:

| slot_id | cron | trigger_id | status |
|---|---|---|---|
| chef-morning | `15 5 * * 1-5` | pending router creation | awaiting router |
| chef-eod | `45 8 * * 1-5` | pending router creation | awaiting router |
| chef-evening | `45 19 * * *` | pending router creation | awaiting router |
| digest-sunday | `47 13 * * 0` | pending router creation | awaiting router |
| tnb-audit | `13 20 * * *` | pending router creation | awaiting router |

Note: trigger_ids will be written to `docs/data/cowork-schedule.json` by the router after RemoteTrigger creation. Previous trigger_ids (trig_019n…, trig_011H…, trig_01CL…, trig_014G…, trig_01Lp…) were deleted in error before the §9 stability gate was met — this sprint restores them.

**Layer B — Master CronCreate (*/15, session-scoped):** Registered via Claude Code CLI `CronCreate`. Fires every 15 minutes, reads `docs/data/cowork-schedule.json`, fans out to matching slots (including sub-hourly market-hours slots not coverable by RemoteTriggers). **This layer evaporates on CLI session end.**

When both layers are active, coverage is complete. When Layer B evaporates (session-end), Layer A keeps guaranteed dishes running. The `*/15` sub-hourly slots (news-scout-market, market-watcher-market, alert-commander-market) go dark until Layer B is re-armed.

**Dedup:** Both layers may fire the same guaranteed slot within the same window. The published-marker gate (`published:<slot_id>:<work_date>` task_claim, first-writer-wins) inside each agent's own flow (`chef.md`, `tran-ngoc-bau/flow/main.md`, `digest-predict/flow/main.md`) prevents double-publish. Gate added AC-5 / FIX-COWORK-GUARANTEED-BACKSTOP 2026-06-13.

---

## 2. Silence-detection signatures

### Signature A — Master CronCreate evaporated (session ended)

| Signal | Threshold | Action |
|---|---|---|
| chef (unified-agent) last MARKET message age | > 6 hours during VN market hours (02:00–09:00 UTC Mon-Fri) | Suspect Layer B dead — check CronList |
| alert-commander last MARKET message age | > 24 hours on any weekday | Suspect Layer B dead — check CronList |
| No `cowork-team-*.json` signal files in `docs/signals/` | > 20 min during VN market hours (02:00–08:30 UTC Mon-Fri) | Layer B confirmed dead |

VN market hours in UTC: **02:00–08:30 UTC Monday–Friday** (09:00–15:30 VN GMT+7).

### Signature B — Individual RemoteTrigger dead (slot-level failure)

A guaranteed slot that fired yesterday is silent today. Layer B telemetry signals (`cowork-team-*.json`) ARE present (Layer B alive), but a specific agent's output is missing.

- chef-morning (guaranteed): expected daily by 06:00 UTC Mon-Fri. Silent = RemoteTrigger `trig_019nwLpkYELqFdE1DZaRhPUk` likely paused.
- chef-eod (guaranteed): expected daily by 09:00 UTC Mon-Fri. Silent = RemoteTrigger `trig_011HNsRMNiQwa3vNwN1b9Anh` likely paused.
- tnb-audit (guaranteed): expected daily by 21:00 UTC. Silent = RemoteTrigger `trig_01LpUxJ98v2aK22FqLSBtL1G` likely paused.

For Signature B, skip to Section 5 (RemoteTrigger recovery).

---

## 3. Session-start procedure (MANDATORY after every CLI restart)

Every time Claude Code CLI is restarted or a new session begins:

**Step 1:** Type `/cron-cowork-team` in the Claude Code CLI.

**Step 2:** Observe the response:
- `[cron-cowork-team] Master dispatcher already registered` → no-op, you are done.
- `[cron-cowork-team] Master dispatcher registered. Next tick: ...` → re-armed, wait up to 15 min for first tick.
- Any error → follow Section 4 (Recovery flow).

**Step 3 (optional sanity check):** Verify with `CronList`. Confirm entry shows `cron: */15 * * * *` and `description` containing `cowork-team`.

This takes under 30 seconds. Do it every session start.

---

## 4. Recovery flow — Layer B (CronCreate evaporated)

Use when: no `cowork-team-*.json` signals in `docs/signals/` for >20 min during market hours, OR when CronList shows no `*/15` entry for `cowork-team`.

```
Step 1: CronList
  → Look for entry: description contains "cowork-team", cron="*/15 * * * *"
  → If ABSENT: proceed to Step 2
  → If PRESENT but no signals: check dispatcher flow health (Step 4)

Step 2: Type /cron-cowork-team
  → Skill re-registers the master CronCreate
  → Confirm: "Master dispatcher registered. Next tick: <time>"

Step 3: Wait up to 15 min for next tick
  → Tick fires: docs/signals/cowork-team-<ISO>.json appears
  → If signals appear: DONE. Layer B restored.

Step 4: If no signal after 2 ticks (30 min):
  → Read docs/agents/cowork-team/flow/main.md — check for syntax errors
  → Verify docs/data/cowork-schedule.json is valid JSON:
      jq '.' docs/data/cowork-schedule.json
  → Check scripts/agents-flow/cowork-match-slots.js exists
  → If any file missing: escalate to dev-mcp-server (Section 6)
```

**Expected outcome:** Within 15 min of `/cron-cowork-team`, `docs/signals/cowork-team-<ISO>.json` appears. Within 30 min, at least one MARKET channel message fires from a matching slot.

---

## 5. Recovery flow — Layer A (RemoteTrigger paused or deleted)

Use when: Layer B telemetry signals are present but a guaranteed slot is silent.

```
Step 1: Identify the affected trigger_id from docs/data/cowork-schedule.json
  jq '.slots[] | select(.slot_id=="<slot_id>") | {trigger_id, cron, trigger_status}' \
    docs/data/cowork-schedule.json

Step 2: Check trigger status (via Claude Code CLI or claude.ai dashboard):
  RemoteTrigger(action="get", trigger_id="<trigger_id>")

Step 3a: If trigger is paused → re-enable:
  RemoteTrigger(action="update", trigger_id="<trigger_id>", enabled=true)

Step 3b: If trigger is deleted → recreate from SSOT:
  - Read slot row from docs/data/cowork-schedule.json (trigger_prompt, cron fields)
  - RemoteTrigger(action="create", cron_expression="<cron>", prompt="<trigger_prompt>", ...)
  - Update docs/data/cowork-schedule.json: set new trigger_id, trigger_status="active"

Step 4: Verify next fire time ≤ expected schedule
```

RemoteTrigger environment_id for this workspace: `env_011CV1yonRDFUhYhGEdkVwqj` (from spike_1951a_oq3 in cowork-schedule.json).

---

## 6. Diagnostic commands

### Check CronList for master dispatcher

```
CronList
```

Expected output entry:
```
id          : <some-cron-id>
description : cowork-team master dispatcher — fires every 15 min, fans out to schedule SSOT
cron        : */15 * * * *
durable     : true
status      : active
```

If absent → dispatcher evaporated → run `/cron-cowork-team`.

### Verify cowork-team signal telemetry (last 30 min)

```bash
ls -lt docs/signals/cowork-team-*.json | head -5
```

Each tick writes one file. Absence during VN market hours = dispatcher dead or slot-matcher failing.

### Verify cowork-schedule.json is valid

```bash
jq '.' docs/data/cowork-schedule.json | head -5
```

### Check slot-matcher script

```bash
ls scripts/agents-flow/cowork-match-slots.js
node scripts/agents-flow/cowork-match-slots.js
```

Expected: JSON output `{"slots": [...], "drift_min": <N>}`. Non-JSON output or non-zero exit = script error → escalate to dev-mcp-server.

### Find which slots are enabled

```bash
jq '.slots[] | select(.enabled == true) | {slot_id, cron, agent, trigger_status}' \
  docs/data/cowork-schedule.json
```

### Check guaranteed slots for last_fired staleness

```bash
jq '.slots[] | select(.guaranteed == true) | {slot_id, cron, last_fired, trigger_status}' \
  docs/data/cowork-schedule.json
```

`last_fired: null` on a guaranteed slot = that slot has never fired in the current SSOT — investigate.

---

## 7. When to escalate to dev-mcp-server

Escalate (drop signal `docs/signals/agent-father-<ISO>-cowork-escalation.json`, type `bug-escalation`, to `dev-mcp-server`) when:

- `/cron-cowork-team` succeeds (CronList shows dispatcher), telemetry signals appear, but **2 full ticks pass with zero MARKET messages** during active VN market hours.
- `cowork-match-slots.js` exits non-zero or returns non-JSON output consistently across 2 ticks.
- `docs/data/cowork-schedule.json` is missing or invalid JSON.
- `docs/agents/cowork-team/flow/main.md` returns a parse or execution error visible in telemetry.

These indicate an infrastructure or flow-file defect, not a session-evaporation issue. dev-mcp-server handles Docker/MCP layer; agent-father handles flow/skill/schedule-file layer.

---

## 8. Sanity tests (run to verify full recovery)

After recovery, confirm:

| Test | Command | Pass condition |
|---|---|---|
| T1: Dispatcher in CronList | `CronList` | Entry with `*/15 * * * *` and `cowork-team` in description |
| T2: Signal telemetry appears | `ls docs/signals/cowork-team-*.json` | New file within 15 min of dispatcher registration |
| T3: Market-hours slot fires | Wait for next `:00` or `:15` or `:30` or `:45` UTC during 02:00–08:30Z | `cowork-team-<ISO>.json` has non-empty `matched_slots` array |
| T4: MARKET channel message | Check Telegram MARKET channel | Any cowork agent message within 30 min of first slot fire |
| T5: RemoteTriggers active | `jq '[.slots[] | .trigger_status] | unique' docs/data/cowork-schedule.json` | Only `"active"` values (no `"pending_delete"`) |

All 5 pass = full recovery confirmed.

---

## 9. Preventing recurrence

- **Always invoke `/cron-cowork-team` at session start.** Add it to personal workflow before any other CLI work during VN market hours.
- **Layer-A deletion lock (ACTIVE):** `docs/data/cowork-schedule.json._notes.layer_a_deletion_locked = true`. The 5 guaranteed-slot RemoteTriggers MUST NOT be deleted until the stability_log below shows ≥2 session-restart survivals AND PO explicitly clears the lock via a dedicated sprint task. The previous deletion (before 2026-06-13) happened before the gate was met and caused the 32h gap. Do not repeat.
- **Layer A + Layer B COEXIST PERMANENTLY** until the lock is cleared. Both firing the same slot is expected and safe — the published-marker gate inside each agent flow prevents double-publish.
- **System-auditor Tier-1 check:** The system-auditor agent (30-min cron) monitors cowork silence. If it detects no chef output in >6h during market hours, it drops a signal row to `docs/data/orch/orch-state.json .signal_queue.rows[]` with `to: "ops"`. Ops reads this and invokes the recovery flow (Section 4 above).

### §9.stability_log — Layer-A Restart Survival Log

Two documented session-restart survivals required before any Layer-A deletion is proposed.
Seed: empty — awaiting first verified survival (target: Mon 2026-06-16 chef-morning at 05:15 UTC).

| # | Date (UTC) | Restart type | Slot survived | Layer-A trigger_id | Verified by |
|---|---|---|---|---|---|
| — | awaiting Mon 2026-06-16 | deliberate CLI kill | chef-morning (05:15Z) | pending router creation | — |
| — | (2nd restart — TBD) | TBD | TBD | TBD | — |

**Fill condition:** After a deliberate CLI session kill (no `/cron-cowork-team` re-arm), observe `cowork-schedule.json chef-morning.last_fired` update AND a Telegram MARKET message — this confirms Layer-A fired independently. Log date + trigger_id + verifying agent.

**Deletion lock clearance:** PO creates an explicit sprint task after 2 rows are filled. Agent-father then sets `layer_a_deletion_locked: false` and updates this table.
