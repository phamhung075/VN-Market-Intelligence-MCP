<!-- size-justification: ~130L — single dispatcher flow; Steps 1-6 are all inline (no sub-flows warranted at this size); error boundary + telemetry + collision guard each require full inline spec to be auditable without lazy-loading additional files. -->

# cowork-team — Master Cron Dispatcher

Fires every 15 min via `*/15 * * * *` CronCreate (Claude Code CLI). Reads `docs/data/cowork-schedule.json`, matches current UTC ±2min, parallel-spawns all matching agents in one message block.

<!-- decision: OQ-1 — Spawn primitive shape. Confirmed: same subagent_type pattern as dev-team. The `agent_id` field in cowork-schedule.json maps 1:1 to subagent_type in the Agent tool call. Spawn prompt = "run <flow_path>  slot=<slot_id>" (mirrors existing trigger_prompt field). No new spawn primitive needed — Claude Code CLI Agent tool is the mechanism, identical to how dev-team spawns po/ba/architect etc. -->

<!-- decision: OQ-2 — Collision-detection guard. Added in Step 4b below: if two or more matching slots share the same agent_id, log a WARNING to WORK channel listing the duplicate agent_id and both slot_ids. This is a schema-drift guard — no collision exists in the current 16-slot inventory (chef-morning/eod/evening all have distinct minutes; */15 slots on the same agent_id are intentional co-fires). The guard does NOT block spawns — R3 from brief §5 explicitly allows same agent_id multi-slot firing. -->

**SSOT:** `docs/data/cowork-schedule.json`
**Fail-loud protocol:** `docs/protocols/fail-loud-protocol.md`

---

## Step 1 — Resolve current UTC

```bash
date -u "+%M %H %d %m %u"
```

Format: `<minute> <hour> <dom> <month> <dow_iso>` (dow_iso: 1=Mon…7=Sun).
Save as NOW_FIELDS. Save ISO timestamp as NOW_ISO (`date -u +%Y%m%dT%H%M%SZ`).

---

## Step 2 — Load + parse schedule

```bash
cat docs/data/cowork-schedule.json
```

On parse error (malformed JSON / file missing / <50 chars):
- `send_telegram(channel=work, "[cowork-team] schedule.json parse failed: <error>")`
- Write `docs/signals/cowork-team-${NOW_ISO}-error.json` → `{from:"cowork-team", to:"po", type:"schedule-parse-error", payload:{error:"<msg>"}, createdAt:"${NOW_ISO}"}`
- EXIT immediately. Do NOT proceed.

---

## Step 3 — Match enabled slots (cron ±2min)

Run node inline to evaluate which slots are due:

```bash
node -e "
const fs = require('fs');
const sched = JSON.parse(fs.readFileSync('docs/data/cowork-schedule.json','utf8'));

const [M,H,DOM,MON,DOWI] = process.argv.slice(1).map(Number);
// ISO weekday 1=Mon..7=Sun → cron DOW 0=Sun..6=Sat
const DOW = DOWI === 7 ? 0 : DOWI;

function field(expr, val) {
  if (expr === '*') return true;
  if (expr.includes(',')) return expr.split(',').map(Number).includes(val);
  if (expr.startsWith('*/')) return val % parseInt(expr.slice(2)) === 0;
  if (expr.includes('-')) {
    const [a,b] = expr.split('-').map(Number);
    return val >= a && val <= b;
  }
  return parseInt(expr) === val;
}

function dowMatch(expr, dow) {
  if (expr === '*') return true;
  return field(expr, dow) || (dow === 0 && field(expr, 7));
}

function cronMatches(cron) {
  const [cm, ch, cdom, cmon, cdow] = cron.split(' ');
  for (let d = -2; d <= 2; d++) {
    let m = M + d, h = H;
    if (m < 0)  { m += 60; h--; }
    if (m >= 60) { m -= 60; h++; }
    if (h < 0 || h >= 24) continue;
    if (field(cm,m) && field(ch,h) && field(cdom,DOM) && field(cmon,MON) && dowMatch(cdow,DOW))
      return true;
  }
  return false;
}

const hits = sched.slots.filter(sl => sl.enabled && !sl._disabled_by && cronMatches(sl.cron));
process.stdout.write(JSON.stringify(hits));
" $NOW_FIELDS 2>&1
```

Save JSON array as MATCHES. On node error → jump to **Error Guard** (Step 5).

---

## Step 4 — Silent exit if no matches

If MATCHES is `[]` or empty:
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
