<!-- size-justification: 107L — cohesive slot-matching block: resolve UTC, run matcher script (+UC-CDC-P7 Phase 2a metadata capture), drift guard, silent-exit if no matches, collision-detection guard. Child of main.md. FIX-CHEF-MARKER-KEY-ANCHOR-2 2026-08-23 (agent-father): +9L (98→107) — `scheduled_utc_time` documented on `slots[]`, previously documented only on `catchup_raw[]` even though ANCHOR-1 now emits it on both; the null-degradation contract and the deliberate `scheduled_key_part` asymmetry are the two things a consumer gets wrong without it. In-place growth in the existing Script SSOT paragraph, no new section. -->
<!-- TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 (2026-07-02): on the normal SILENT/WORK path Steps 1-3
     (resolve UTC, run cowork-match-slots.js, drift guard) now run deterministically inside
     scripts/agents-flow/cowork-tick-preflight.sh Step 6 — same script, invoked as-is, no
     reimplementation. This file's Steps 1-3 are reached only on the preflight script's ERROR
     verdict (fallback — see main.md § JUMP-TO table). Step 4b (collision-detection guard) is
     REUSED on the WORK path too — main.md § WORK continuation runs it directly against
     `$VERDICT_JSON.slots[]`. Kept verbatim — never deleted. -->

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
# UC-CDC-P7 Phase 2a: MATCHES above already has Step 4.5 freshness-downgrade + Step 4.5c
# CHEF mutex applied in-script (see pressure-cadence.md — both are documentation no-ops on
# this ERROR-fallback path too, same as the WORK path). Capture the observability fields for
# Step 6 telemetry — mirrors cowork-tick-preflight.sh's WORK-path $VERDICT_JSON passthrough.
PRESSURE_MODE_META=$(echo "$RAW" | jq -r '.pressure_mode // "legacy"')
DOWNGRADED_META=$(echo "$RAW" | jq -c '.downgraded // []')
SUPPRESSED_CADENCE_META=$(echo "$RAW" | jq -c '.suppressed_cadence // []')
CHEF_MUTEX_APPLIED_META=$(echo "$RAW" | jq -r '.chef_mutex_applied // false')
DUE_REASONS_META=$(echo "$RAW" | jq -c '.due_reasons // {}')
CADENCE_MINUTES_META=$(echo "$RAW" | jq -c '.cadence_minutes // {}')
```

Script SSOT: `scripts/agents-flow/cowork-match-slots.js` — reads `docs/data/cowork-schedule.json`, filters `enabled && !_disabled_by`, cron ±2min window, returns `{"slots": [{slot_id, agent, flow_path, cron, trigger_prompt, scheduled_utc_time}, ...], "drift_min": <N>, "catchup_raw": [...], "pressure_mode", "downgraded", "suppressed_cadence", "chef_mutex_applied", "due_reasons", "cadence_minutes"}`. `drift_min` = `actualUTCMinute − nominalTick` (always 0–14).

`scheduled_utc_time` on `slots[]` (FIX-CHEF-MARKER-KEY-ANCHOR-1/-2, architect brief `docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` §2 Component A): ISO8601 Zulu string — the cron's own **nominal** fire instant, not the wall clock at which the tick actually ran, and timezone-free. This is the SAME field name and the SAME derivation `catchup_raw[]` already carries (both call `cowork-catchup-predicate.mostRecentCronFireBefore` — ONE derivation, not two; re-deriving the window downstream is the "two peers, two derivations" bug that produced the 2026-07-22 19:55Z/20:01Z straddle). Live sample, verified by executing the exported `annotateScheduledUtc()` against the real schedule at `2026-08-23T13:50:00Z`: slot `digest-sunday`, cron `47 13 * * 0` → `"2026-08-23T13:47:00.000Z"`.

- **Consumers MUST anchor on this value, never on their own `date` call.** It is propagated to every spawned agent as the `scheduled_utc=<ISO8601>` prompt token by `spawn-fanout.md` Step 5.2.
- **Degrades to `null`, never throws** — predicate module unavailable, absent/malformed `cron`, or no fire inside the bounded 8-day lookback. A `null` on one slot never blocks its siblings in the same batch. A consumer seeing `null` falls back to its own wall-clock read, exactly as before this field existed.
- **Asymmetry with `catchup_raw[]`, deliberate:** live `slots[]` entries carry `scheduled_utc_time` ONLY. `catchup_raw[]` entries additionally carry `scheduled_key_part` (the date portion) and `expected_publish_task_id`, because the catch-up path needs the marker key itself to probe for delivery evidence. A live consumer that needs the date part takes it from `scheduled_utc_time`'s own leading 10 characters — do not expect `scheduled_key_part` on `slots[]`.
- Pure superset of the pre-existing per-slot shape; input slot objects are never mutated.

`catchup_raw` (FR-9a, TASK-COWORK-CATCHUP-2): guaranteed-slot catch-up candidates computed by `cowork-catchup-predicate.js` — array, empty on the common no-catch-up tick, one record per considered `guaranteed:true` slot not already in `.slots[]` this tick: `{slot_id, dish_type, agent, flow_path, trigger_prompt, guaranteed:true, scheduled_utc_time, scheduled_key_part, expected_publish_task_id, catchup_eligible, reason}`. Not yet consumed here — wiring `catchup_raw` into a Step 4.55 sub-flow (`task_list_held` delivery-evidence check, union into `MATCHES`) is a later task in this sprint per architecture brief §2.3/§2.1 (`docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md`).

**On script error** (non-zero exit / non-JSON output / schedule.json missing):
- `send_telegram(channel="work", message="[cowork-team] slot-matcher failed: <stderr first line>")`
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
  send_telegram(channel="work",
    message="[cowork-team] WARN drift_min=${DRIFT_MIN} exceeds 10min threshold; slot lock safety margin narrowing. Review system load. Safe limit: drift_min < 15.")
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
send_telegram(channel="work",
  message="[cowork-team] WARN collision: agent_id=<id> matched <N> slots: <slot_id_1>, <slot_id_2>, ... — all will spawn (R3). Check schedule schema if unexpected.")
```

This is a WARNING only — do NOT block spawns. Intentional multi-slot fires (e.g. `*/15` slots) are expected per brief §5 R3.

Declared `supersedes` pairs (`docs/data/cowork-schedule.json`, e.g. `market-watcher-eod.supersedes: ["market-watcher-offhours"]`) are resolved deterministically in-script (`cowork-match-slots.js` `finish()`, see `pressure-cadence.md` Step 4.5d) BEFORE this WARN check ever runs — this WARN stays live as-is (unmodified) as the safety net for any future UNDECLARED same-agent collision; it will simply never fire for a declared pair again post-fix, since the named victim slot no longer co-occurs in `MATCHES` (FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-COLLISION-SCHEDULE-AND-PATHSPEC).

<!-- spawn-guard: policy-only — no runtime assertion; enforced by convention, not code check (ITEM-16 doc note, 1967-10). NEVER spawn dev-team agents from this dispatcher. -->
