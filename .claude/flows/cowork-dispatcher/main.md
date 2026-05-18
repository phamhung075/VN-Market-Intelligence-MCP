# cowork-dispatcher

Fires every 15 min via RemoteTrigger. Reads schedule → matches cron ±2min → fans out.
Single-trigger architecture (API_MIN_INTERVAL workaround for sub-hour slots).

---

## Step 1 — Resolve current UTC

```bash
date -u "+%M %H %d %m %u"
```

Format: `<minute> <hour> <dom> <month> <dow_iso>` (dow_iso: 1=Mon … 7=Sun).
Save as NOW_FIELDS.

---

## Step 2 — Match enabled slots

```bash
node -e "
const fs = require('fs');
const sched = JSON.parse(fs.readFileSync('docs/data/cowork-schedule.json','utf8'));

const [M,H,DOM,MON,DOWI] = process.argv.slice(1).map(Number);
// DOWI: ISO weekday 1=Mon..7=Sun → convert to cron DOW 0=Sun..6=Sat
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
  // Sunday = 0 or 7 in cron
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
" \$NOW_FIELDS 2>&1
```

Save JSON array as MATCHES. On bash error → jump to **Error Guard**.

---

## Step 3 — Exit if empty

If MATCHES is `[]` or empty → **stop silently**. No log, no Telegram.

---

## Step 4 — Parallel fan-out

For each slot in MATCHES, emit **one Agent tool block** with all calls together
(parallel execution = all in same tool-use message):

```
For each slot:
  subagent_type : <slot.agent>
  prompt        : "run <slot.flow_path>  slot=<slot.slot_id>"
  description   : "<slot.slot_id> dispatch"
```

Do NOT await individual results — fire and continue.

Log to WORK after spawning:

```
[cowork-dispatcher] <ISO> — fired <N> slot(s): <slot_id_1>, <slot_id_2>, ...
```

Use `send_telegram` tool, channel=WORK.

---

## Error Guard

Wrap Steps 2–4 in try/catch. On any error:

**Write error signal:**
```bash
ISO=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p docs/signals
cat > docs/signals/cowork-dispatcher-${ISO}-error.json <<EOF
{"ts":"${ISO}","error":"<message>","step":"<step_number>"}
EOF
```

**Alert WORK channel** via `send_telegram`:
```
[cowork-dispatcher] ERROR <ISO> — <message> (step <N>)
```

Then exit.

---

## Notes

- Schedule SSOT: `docs/data/cowork-schedule.json`
- Skipped/warnings: `docs/data/cowork-schedule-skipped.json`
- Trigger spec: `docs/data/cowork-dispatcher-trigger.json`
- Off-minute slots (cron minute ≠ 0/15/30/45) may be missed by ±2min window.
  See warnings in skipped.json. Router to realign in follow-up sprint.
