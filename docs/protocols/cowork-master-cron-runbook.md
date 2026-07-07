# Cowork Master Cron — Runbook

**Owner:** agent-father
**Last updated:** 2026-07-07 (DOC-COWORK-CRON-RUNBOOK-FRESHEN — RemoteTrigger "Layer A" retirement reflected; runbook was stale since 2026-06-13 and still described it as active/deletion-locked)
**Related skill:** `.claude/skills/cron-cowork-team/SKILL.md`
**Schedule SSOT:** `docs/data/cowork-schedule.json`
**Dispatcher flow:** `docs/agents/cowork-team/flow/main.md`
**System-auditor Tier-1 link:** see `docs/protocols/system-audit-runbook.md` — if Tier-1 detects cowork silence, follow this runbook.
**Architecture brief (SPOF diagnosis + backstop in flight):** `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`

---

## 1. Architecture in one paragraph

**RemoteTrigger ("Layer A") is RETIRED — it is not part of the live system.** Standing directive `feedback_no_remote_trigger_all_local` (2026-06-22, user, verbatim "no remote trigger all working on this server") retired the cloud RemoteTrigger backstop entirely: the project runs ENTIRELY on this local server, no cloud RemoteTrigger jobs/backstops/triggers. Every slot row in `docs/data/cowork-schedule.json` now carries `"_superseded_by": "cowork-dispatcher"`. Any RemoteTrigger objects that still exist server-side on claude.ai are inert residue — the RemoteTrigger MCP tool exposes no delete action, so cleanup is a workspace-side chore, not a functional dependency (brief §8). **Do not follow RemoteTrigger recovery steps for a silent guaranteed slot — that mechanism does nothing today.** (This section previously said the opposite — "permanently active and MUST COEXIST" — for three weeks after retirement; that is the defect this freshen fixes.)

**The one active mechanism is the master CronCreate dispatcher (`*/15 * * * *`, session-scoped):** registered via Claude Code CLI `CronCreate` per `.claude/skills/cron-cowork-team/SKILL.md`. It fires every 15 minutes, reads `docs/data/cowork-schedule.json`, and fans out to every slot whose `next_fire_at ≤ now` (± drift window via `scripts/agents-flow/cowork-match-slots.js`) — both the guaranteed daily/weekly slots and the sub-hourly market-hours slots (news-scout-market, market-watcher-market, alert-commander-market).

**This dispatcher is a known single point of failure (SPOF): it evaporates the instant the Claude Code CLI session ends.** `durable:true` on the CronCreate entry survives process restarts *within* a session; it never survives session-end. This is the confirmed root cause of a ~73h guaranteed-slot outage 2026-07-04T16:05Z → 2026-07-07T17:30Z (no live CLI session for the whole window — chef-evening silent ×3, chef-morning/chef-eod ×2 each, digest-sunday ×1, fb-daily ×2), and a recurring failure class (prior instance: fb-daily, 2026-06-30). Full diagnosis: `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` §1-2.

**Mandatory mitigation today:** re-arm at every session start (§3). There is currently no general session-independent backstop for guaranteed slots — the sole exception is `scripts/cowork-fb-daily-firer.sh` (fb-daily/fb-weekend only, launchd-based; field-proven 2026-07-01→07-04, then silently unloaded with nothing detecting the unload — a second gap the brief also found, see §3.8 of the brief).

**In flight — do not block on this, but keep this doc current once it ships:** `F1-LAUNCHD-COWORK-BACKSTOP` (owner: `developer`, task row in `docs/data/orch/orch-state.json`, spawned from the same 2026-07-07 brief) generalizes the fb-only firer into `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` + `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist` — an OS-level, session-independent launchd job that reuses the *same* matcher (`cowork-match-slots.js`) the live dispatcher uses, filtered to `guaranteed === true` slots. A companion task, `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED`, extends the Tier-1 self-check to assert the launchd label stays loaded, so a silent unload is itself detected next time. **Whoever lands `F1-LAUNCHD-COWORK-BACKSTOP` must update this runbook (§1, §5, §8 T5) in the same change** — do not let this doc go stale again the moment the backstop ships; check `docs/data/orch/orch-state.json` task id `F1-LAUNCHD-COWORK-BACKSTOP` for current status before citing it as live.

**Dedup (unchanged, still correct):** any two layers firing the same guaranteed slot in the same window is safe by design. The published-marker gate (`published:<slot_id>:<work_date>` task_claim, first-writer-wins) inside each agent's own flow (`chef.md`, `tran-ngoc-bau/flow/main.md`, `digest-predict/flow/main.md`, `fb-market-poster/flow/main.md`) prevents double-publish. This is what let the fb-daily-firer launchd job coexist safely with the live dispatcher 2026-07-01→07-04, and it is the same mechanism the incoming generalized firer relies on — no new dedup mechanism is needed.

---

## 2. Silence-detection signatures

### Signature A — Master CronCreate evaporated (session ended)

| Signal | Threshold | Action |
|---|---|---|
| chef (unified-agent) last MARKET message age | > 6 hours during VN market hours (02:00–09:00 UTC Mon-Fri) | Suspect Layer B dead — check CronList |
| alert-commander last MARKET message age | > 24 hours on any weekday | Suspect Layer B dead — check CronList |
| No `cowork-team-*.json` signal files in `docs/signals/` | > 20 min during VN market hours (02:00–08:30 UTC Mon-Fri) | Layer B confirmed dead |

VN market hours in UTC: **02:00–08:30 UTC Monday–Friday** (09:00–15:30 VN GMT+7).

### Signature B — Guaranteed-slot backstop silent

A guaranteed slot that fired yesterday is silent today, AND signature A also confirms Layer B (the master dispatcher) was dead for the same window — this is exactly the SPOF scenario in §1. **Until `F1-LAUNCHD-COWORK-BACKSTOP` ships and is installed, there is no independent recovery path beyond re-arming Layer B** (§3/§4) — the fix IS the re-arm.

`fb-daily`/`fb-weekend` are the one exception today: check `launchctl list | grep com.vn-market.fb-daily-firer` for that specific firer's health.

RemoteTrigger-specific recovery (`RemoteTrigger(action="get"/"update"/"create", ...)`) is **retired — do not use it.** Those objects are inert (§1).

---

## 3. Session-start procedure (MANDATORY after every CLI restart)

Every time Claude Code CLI is restarted or a new session begins:

**Step 1:** Type `/cron-cowork-team` in the Claude Code CLI.

**Step 2:** Observe the response:
- `[cron-cowork-team] Master dispatcher already registered` → no-op, you are done.
- `[cron-cowork-team] Master dispatcher registered. Next tick: ...` → re-armed, wait up to 15 min for first tick.
- Any error → follow Section 4 (Recovery flow).

**Step 3 (optional sanity check):** Verify with `CronList`. Confirm entry shows `cron: */15 * * * *` and `description` containing `cowork-team`.

This takes under 30 seconds. Do it every session start. This is the single most important mitigation for the §1 SPOF until `F1-LAUNCHD-COWORK-BACKSTOP` ships.

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

## 5. Recovery flow — session-independent backstop

**RemoteTrigger recovery is retired — do not use it.** The steps that used to live here (identify `trigger_id`, `RemoteTrigger(action="get"/"update"/"create", ...)`) targeted a mechanism that no longer exists in this system (standing directive `feedback_no_remote_trigger_all_local`, 2026-06-22).

**Today (pre-`F1-LAUNCHD-COWORK-BACKSTOP`):** there is no general independent recovery lever for guaranteed slots — the only fix is re-arming Layer B (§4). The one exception is `fb-daily`/`fb-weekend`:

```
launchctl list | grep com.vn-market.fb-daily-firer
```
Absent → the fb-only launchd firer itself unloaded; reload per `scripts/cowork-fb-daily-firer.sh` + `launchd/com.vn-market.fb-daily-firer.plist` (ops-owned local machine state, not a repo file change).

**Once `F1-LAUNCHD-COWORK-BACKSTOP` lands** (check status in `docs/data/orch/orch-state.json`), this section must be rewritten with the real recovery procedure against the shipped script + plist — e.g. `launchctl list | grep com.vn-market.cowork-guaranteed-slot-firer`, inspect the firer's own log, `launchctl unload`/`launchctl load` to force a restart. Do not backfill this speculatively; write it from the actual shipped artifacts.

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

Note: `trigger_id`/`trigger_status` fields are legacy RemoteTrigger annotations, kept for historical audit trail only — they no longer drive any live behavior. `_superseded_by: "cowork-dispatcher"` on a slot row is the operative signal.

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
| T5: (NOT YET APPLICABLE) launchd backstop loaded | `launchctl list \| grep com.vn-market.cowork-guaranteed-slot-firer` | Entry present — only test this once `F1-LAUNCHD-COWORK-BACKSTOP` ships and is installed; until then, T1–T4 = full recovery confirmed |

T1–T4 pass = full recovery confirmed today. T5 was formerly "RemoteTriggers active" — retired along with Layer A (§1); repurposed for the incoming launchd backstop, not yet live.

---

## 9. Preventing recurrence

- **Always invoke `/cron-cowork-team` at session start.** Add it to personal workflow before any other CLI work during VN market hours. This is the primary mitigation for the SPOF below until the backstop ships.
- **Known SPOF (this is the epic this runbook lives under):** the master CronCreate dispatcher (§1) is session-scoped — the only thing standing between "guaranteed slot fires" and "silent multi-day outage" is a live CLI session. `F1-LAUNCHD-COWORK-BACKSTOP` (in flight, owner `developer`) is the durable fix; track via `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` and `docs/data/orch/orch-state.json` task id `F1-LAUNCHD-COWORK-BACKSTOP`. A companion self-check, `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED`, closes the "silent unload of the backstop itself" gap once it ships.
- **RemoteTrigger Layer A is retired, not merely paused.** `docs/data/cowork-schedule.json._notes.layer_a_deletion_locked` has been cleared/rewritten to reflect this (was previously gating a deletion that is now moot — there is nothing left to delete-guard once the mechanism itself is retired). Do not re-introduce RemoteTrigger-based guaranteed-slot coverage — standing directive `feedback_no_remote_trigger_all_local` (2026-06-22) is still in force: everything runs locally on this server.
- **System-auditor Tier-1 check:** the system-auditor agent (30-min cron) monitors cowork silence. If it detects no chef output in >6h during market hours, it drops a signal row to `docs/data/orch/orch-state.json .signal_queue.rows[]` with `to: "ops"`. Ops reads this and invokes the recovery flow (Section 4 above). `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED` (in flight) extends this check to also assert the launchd backstop label stays loaded, once `F1-LAUNCHD-COWORK-BACKSTOP` ships.

### §9.stability_log — Layer-A Restart Survival Log (ARCHIVED — RemoteTrigger Layer A retired 2026-06-22)

This table tracked deletion-lock clearance for the now-retired RemoteTrigger Layer A. It is no longer applicable — do not add new rows here. Kept for historical audit trail only. The equivalent survival test for the incoming launchd backstop is specified in `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` §6 (QA session-down survival test) and should be run against `F1-LAUNCHD-COWORK-BACKSTOP` once it ships.

| # | Date (UTC) | Restart type | Slot survived | Layer-A trigger_id | Verified by |
|---|---|---|---|---|---|
| — | awaiting Mon 2026-06-16 | deliberate CLI kill | chef-morning (05:15Z) | pending router creation | — |
| — | (2nd restart — TBD) | TBD | TBD | TBD | — |

This log was never filled in before Layer A was retired — the deletion-lock clearance process it fed never completed and is now moot.
