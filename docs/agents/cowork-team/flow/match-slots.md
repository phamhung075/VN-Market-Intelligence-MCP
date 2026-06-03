<!-- size-justification: 80L — cohesive slot-matching block: resolve UTC, run matcher script, drift guard, silent-exit if no matches, collision-detection guard. Child of main.md. -->

## Step 1 — Resolve current UTC

```bash
NOW_ISO=$(date -u +%Y%m%dT%H%M%SZ)
```

Save as NOW_ISO. Slot-matcher script reads the system clock directly — no field parsing needed.

---

## Step 2+3 — Match enabled slots (single call)

```bash
RAW=$(node scripts/agents-flow/cowork-match-slots.js)
MATCHES=$(echo "$RAW" | jq '.slots')
DRIFT_MIN=$(echo "$RAW" | jq '.drift_min')
```

Script SSOT: `scripts/agents-flow/cowork-match-slots.js` — reads `docs/data/cowork-schedule.json`, filters `enabled && !_disabled_by`, cron ±2min window, returns `{"slots": [{slot_id, agent, flow_path, cron, trigger_prompt}, ...], "drift_min": <N>}`. `drift_min` = `actualUTCMinute − nominalTick` (always 0–14).

**On script error** (non-zero exit / non-JSON output / schedule.json missing):
- `send_telegram(channel=work, "[cowork-team] slot-matcher failed: <stderr first line>")`
- Write `docs/signals/cowork-team-${NOW_ISO}-error.json` → `{from:"cowork-team", to:"po", type:"matcher-error", payload:{error:"<msg>"}, createdAt:"${NOW_ISO}"}`
- EXIT immediately.

---

## §drift-min

<!-- anchor: §drift-min — reserved for L-10 delta-read. Do NOT merge into other steps. -->
<!-- collision-scope: drift_min commentary ONLY. Spawn-guard region (Step 4.6+) is reserved for TASK_1967-10. -->

## Step 3b — Drift threshold guard (TASK_1967-05 fix)

After receiving `DRIFT_MIN` from the slot-matcher script:

```
if DRIFT_MIN > 10:
  send_telegram(channel=work,
    "[cowork-team] WARN drift_min=${DRIFT_MIN} exceeds 10min threshold; slot lock safety margin narrowing. Review system load. Safe limit: drift_min < 15.")
  # Do NOT block — proceed to Step 4. Warning only.
```

**Drift envelope thresholds:**

| drift_min | Status | Action |
|-----------|--------|--------|
| 0 – 10 | Safe | None — floor-15min rounding absorbs lag |
| 11 – 14 | Caution | WORK telegram warning (above) |
| ≥ 15 | Collision risk | Two ticks could map to same nominal_tick key → duplicate slot-lock claim collision possible. Escalate immediately. |

**Rationale:** Floor-15min nominal_tick rounding absorbs drift safely up to drift_min=14. At drift_min ≥ 15, two ticks could map to the same nominal_tick key, causing a duplicate slot-lock claim collision. The 10-min warning provides a 5-minute safety margin to detect load drift before it becomes a structural risk.

**Current safe envelope:** drift_min max observed = 9 (2026-05-21). No spawn is blocked by this check. Warning threshold = 10. Danger threshold = 15.

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

<!-- spawn-guard: policy-only — no runtime assertion; enforced by convention, not code check (ITEM-16 doc note, 1967-10). NEVER spawn dev-team agents from this dispatcher. -->
