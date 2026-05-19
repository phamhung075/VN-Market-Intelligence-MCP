<!-- size-justification: ~90L — single dispatcher flow; cron-match logic extracted to .claude/scripts/cowork-match-slots.js (Sprint 1951 follow-up: keeps flow scannable; full matcher is one node script call). Error boundary + telemetry + collision guard remain inline for auditability. -->

# cowork-team — Master Cron Dispatcher

## Team Boundary (Sprint 1951c)

This dispatcher spawns ONLY cowork-team agents per `docs/data/cowork-schedule.json`:
- **scheduled:** news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau
- **demand-spawnable:** report-analyzer, qa-responder, market-analyst

NEVER spawn dev-team agents (po, ba, architect, pm, developer, qa, fixer, dev-*, ops) from this dispatcher.

Cross-team work (e.g. a cowork agent finds a code bug or needs a dev-team action): write a signal row to `docs/signals/DASHBOARD.md` per skill `.claude/skills/signal-dashboard/SKILL.md`. The dev-team flow drains the dashboard (Step 0a-D in `drain-signals.md`) at its next cycle.

Maintenance agents (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) are invoked by main terminal or self-cron — NEVER spawned by this dispatcher.

Fires every 15 min via `*/15 * * * *` CronCreate (Claude Code CLI). Reads `docs/data/cowork-schedule.json`, matches current UTC ±2min, parallel-spawns all matching agents in one message block.

<!-- decision: OQ-1 — Spawn primitive shape. Confirmed: same subagent_type pattern as dev-team. The `agent_id` field in cowork-schedule.json maps 1:1 to subagent_type in the Agent tool call. Spawn prompt = "run <flow_path>  slot=<slot_id>" (mirrors existing trigger_prompt field). No new spawn primitive needed — Claude Code CLI Agent tool is the mechanism, identical to how dev-team spawns po/ba/architect etc. -->

<!-- decision: OQ-2 — Collision-detection guard. Added in Step 4b below: if two or more matching slots share the same agent_id, log a WARNING to WORK channel listing the duplicate agent_id and both slot_ids. This is a schema-drift guard — no collision exists in the current 16-slot inventory (chef-morning/eod/evening all have distinct minutes; */15 slots on the same agent_id are intentional co-fires). The guard does NOT block spawns — R3 from brief §5 explicitly allows same agent_id multi-slot firing. -->

**SSOT:** `docs/data/cowork-schedule.json`
**Fail-loud protocol:** `docs/protocols/fail-loud-protocol.md`

---

## Step 0a — Drain `docs/signals/DASHBOARD.md` (cross-team inbox)

Read DASHBOARD.md per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find all cowork-addressed sections (po, tran-ngoc-bau, unified-agent, alert-commander).
Collect `status=NEW` rows → load payloads → route to matching agent slot at Step 5 or log for PO.
Mark each processed row `NEW → READ`. If DASHBOARD.md missing → log `"[cowork-team] dashboard skip"` and continue. Never fail-loud on this step.

---

## Step 1 — Resolve current UTC

```bash
NOW_ISO=$(date -u +%Y%m%dT%H%M%SZ)
```

Save as NOW_ISO. Slot-matcher script reads the system clock directly — no field parsing needed.

---

## Step 2+3 — Match enabled slots (single call)

```bash
RAW=$(node .claude/scripts/cowork-match-slots.js)
MATCHES=$(echo "$RAW" | jq '.slots')
DRIFT_MIN=$(echo "$RAW" | jq '.drift_min')
```

Script SSOT: `.claude/scripts/cowork-match-slots.js` — reads `docs/data/cowork-schedule.json`, filters `enabled && !_disabled_by`, cron ±2min window, returns `{"slots": [{slot_id, agent, flow_path, cron, trigger_prompt}, ...], "drift_min": <N>}`. `drift_min` = `actualUTCMinute − nominalTick` (always 0–14).

**On script error** (non-zero exit / non-JSON output / schedule.json missing):
- `send_telegram(channel=work, "[cowork-team] slot-matcher failed: <stderr first line>")`
- Write `docs/signals/cowork-team-${NOW_ISO}-error.json` → `{from:"cowork-team", to:"po", type:"matcher-error", payload:{error:"<msg>"}, createdAt:"${NOW_ISO}"}`
- EXIT immediately.

---

## Step 4 — Silent exit if no matches

If MATCHES is `[]` or empty (i.e. `jq 'length == 0'` on the slots array):
- Write silent telemetry signal (Step 6, `silent: true`).
- EXIT. No WORK message, no spawns.

---

## Step 4b — Collision-detection guard (schema-drift warning)

Before spawning, group MATCHES by `agent_id`. For any `agent_id` that appears in ≥2 slots:

```
send_telegram(channel=work,
  "[cowork-team] WARN collision: agent_id=<id> matched <N> slots: <slot_id_1>, <slot_id_2>, ... — all will spawn (R3). Check schedule schema if unexpected.")
```

This is a WARNING only — do NOT block spawns. Intentional multi-slot fires (e.g. `*/15` slots) are expected per brief §5 R3.

---

## Step 5 — Parallel fan-out

Fire **all** MATCHES simultaneously in a single Agent tool message block. No sequential gating.

For each slot in MATCHES:

```
subagent_type : <slot.agent>
prompt        : "run <slot.flow_path>  slot=<slot.slot_id>"
description   : "<slot.slot_id> dispatch"
```

Track spawn results: success (no error) vs failure (agent tool returns error).

**On spawn failure for any slot:**
- Log to `errors[]` in telemetry (Step 6).
- `send_telegram(channel=work, "[cowork-team] spawn failed: <slot.slot_id> — <one-line error>")`
- Continue remaining spawns. R4: one slot failure never blocks others.

**On flow path missing** (slot.flow_path does not exist as a file — verify before spawn):
- `send_telegram(channel=work, "[cowork-team] flow missing: <slot.slot_id> → <slot.flow_path>")`
- Add to `errors[]`. Skip this slot's spawn.

---

## Step 6 — Write telemetry signal

After each fire cycle (whether spawns happened or silent exit):

```bash
ISO=${NOW_ISO}
mkdir -p docs/signals
cat > docs/signals/cowork-team-${ISO}.json <<EOF
{
  "from": "cowork-team",
  "to": "dev-team",
  "type": "cowork-fire",
  "payload": {
    "fire_time": "${ISO}",
    "matched_slots": [<slot_ids from MATCHES>],
    "spawned": [<flow_paths of successfully spawned slots>],
    "silent": <true if MATCHES empty, false otherwise>,
    "drift_min": ${DRIFT_MIN},
    "errors": [<{slot_id, error} per failed spawn>]
  },
  "priority": "low",
  "createdAt": "${ISO}"
}
EOF
```

---

## Error Guard

Wrap Steps 3–5 in try/catch. On any unhandled error:

```bash
ISO=${NOW_ISO}
mkdir -p docs/signals
cat > docs/signals/cowork-team-${ISO}-error.json <<EOF
{"from":"cowork-team","to":"po","type":"dispatcher-error","payload":{"error":"<message>","step":"<N>"},"createdAt":"${ISO}"}
EOF
```

`send_telegram(channel=work, "[cowork-team] ERROR ${ISO} — <message> (step <N>)")`

Then EXIT.
