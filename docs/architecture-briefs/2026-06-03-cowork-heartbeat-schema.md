# Architecture Brief: Cowork Heartbeat Signal Schema Reconciliation

**ID:** FU-COWORK-HEARTBEAT-SCHEMA  
**Date:** 2026-06-03T20:35:08Z  
**Author:** agents-architect  
**Priority:** LOW  
**Status:** DESIGN-DONE-IMPL-QUEUED

---

## Problem Statement

Two writers produce `docs/signals/cowork-team-*.json` files with incompatible schemas.
All 37+ on-disk files use the flat schema (Writer 2). The drain consumer requires the enveloped schema.

---

## Writers and Schema Shapes

### Writer 1 — `scripts/agents-flow/cowork-tick-autosilent.sh`

Emits the **enveloped schema** (CORRECT):

```json
{
  "from": "cowork-team",
  "to": "dev-team",
  "type": "cowork-fire",
  "payload": {
    "fire_time": "...",
    "nominal_tick": "...",
    "matched_slots": [],
    "won_slots": [],
    "held_by_other": [],
    "all_held": false,
    "spawned": [],
    "silent": true,
    "drift_min": 0,
    "errors": [],
    "note": "..."
  },
  "priority": "low",
  "createdAt": "..."
}
```

Matches `docs/agents/cowork-team/flow/main.md` Step 6 spec exactly. This writer is correct — no change needed.

### Writer 2 — `docs/agents/cowork-team/flow/main.md` live LLM runtime

Emits the **flat schema** (INCORRECT, DRIFTED):

```json
{
  "classification": "SILENT",
  "reason": "no_cron_match",
  "tick_nominal": "20:33",
  "drift_min": 3,
  "matcher_slots": [],
  "leader_lock": "not_acquired_silent",
  "spawns": 0,
  "dev_head": "idle",
  "devq": 1,
  "signal_backlog": 9,
  "notes": "...",
  "written_at": "20260603T203328Z"
}
```

Root cause: the LLM runtime executing main.md drifted from the Step 6 spec. No envelope fields (`from`, `to`, `type`, `payload`, `createdAt`). All 37+ on-disk `cowork-team-*.json` files in `docs/signals/` are this shape.

---

## Canonical Schema: ENVELOPED

**Canonical = Step 6 spec / cowork-tick-autosilent.sh shape** for the following reasons:

1. **Consumer requires it.** `docs/agents/dev-team/flow/drain-signals.md` Step 0a-1 globs `docs/signals/*.json` and reads `from`, `to`, `type`, `priority`, `payload`, `createdAt` to build fingerprints (`sha256(from + type + JSON.stringify(payload) + createdAt)`) and route via the signal routing table. Flat files produce `from=undefined`, `type=undefined`, and route as "unknown type" to PO — noise.

2. **Historical processed files confirm it.** All pre-drift files in `docs/signals/processed/cowork-team-*.json` (2026-05-27) use enveloped schema — `['from', 'to', 'type', 'payload', 'priority', 'createdAt']`.

3. **Step 6 spec is authoritative.** main.md Step 6 (L759–788) explicitly documents enveloped schema. The flat output is runtime drift from the spec.

4. **Autosilent.sh is already correct.** No change to the shell script needed.

---

## Impact Assessment

**Current harm:** Low (no functional breakage discovered today). Flat files are drained by dev-team as "unknown type → PO" noise. The cowork-team Step 0a already excludes them from signal_backlog count. No active consumer relies on the flat fields.

**Latency risk:** If dev-team drain ever adds a `type=cowork-fire` routing rule (to suppress cowork telemetry from PO routing), flat files would silently miss that gate.

---

## Required Changes

### Change 1 — `docs/agents/cowork-team/flow/main.md` Step 6 (IMPL — agent-father lane)

The LLM runtime producing Step 6 output is deviating from its own spec. The spec at L759–788 is correct and must be reinforced so the runtime stops writing flat output.

**One-line change:** At the top of Step 6, add an explicit INVARIANT guard before the bash heredoc:

```
> INVARIANT (Step 6): output MUST use the enveloped schema {from, to, type, payload, priority, createdAt}.
> NEVER write flat root-level fields (classification/reason/tick_nominal/written_at).
> All observability fields (classification, tick_nominal, drift_min, matcher_slots, leader_lock,
> spawns, dev_head, devq, signal_backlog, notes) MUST be nested inside payload:{}.
```

Target file: `docs/agents/cowork-team/flow/main.md` around L752 (before Step 6 heredoc).

### Change 2 — `scripts/agents-flow/cowork-tick-autosilent.sh`

No change. Already emits enveloped schema correctly.

---

## Payload Field Mapping (flat → enveloped)

The flat runtime fields carry useful telemetry and should be preserved inside `payload`:

| Flat field | Enveloped location |
|---|---|
| `classification` | `payload.classification` |
| `reason` | `payload.reason` |
| `tick_nominal` | `payload.nominal_tick` |
| `drift_min` | `payload.drift_min` |
| `matcher_slots` | `payload.matched_slots` |
| `leader_lock` | `payload.leader_lock` |
| `spawns` (int) | `payload.spawned` (array — list slot_ids; or `payload.spawn_count` int) |
| `dev_head` | `payload.dev_head` |
| `devq` | `payload.devq` |
| `signal_backlog` | `payload.signal_backlog` |
| `notes` | `payload.note` |
| `written_at` | `createdAt` (envelope root) |

The canonical Step 6 spec already includes `matched_slots`, `won_slots`, `held_by_other`, `all_held`, `spawned`, `silent`, `drift_min`, `errors` plus the Phase-2 adaptive fields. The flat-unique fields (`classification`, `reason`, `leader_lock`, `dev_head`, `devq`, `signal_backlog`, `notes`) should be added to the Step 6 `payload` block as telemetry extensions.

---

## Deliverable for agent-father

**File to edit:** `docs/agents/cowork-team/flow/main.md`  
**Location:** Step 6 header (~L752), immediately after `## Step 6 — Write telemetry signal`  
**Change:** Insert the INVARIANT guard block above.  
**Also:** Extend the Step 6 `payload` block to include the flat-unique telemetry fields (`classification`, `reason`, `leader_lock`, `dev_head`, `devq`, `signal_backlog`, `note`) so no observability data is lost in the migration.

No change to `scripts/agents-flow/cowork-tick-autosilent.sh` — it is already correct.

No doc-only fix is sufficient here: the spec (Step 6) is already correct. The issue is that the LLM runtime ignores it. An explicit INVARIANT block in the flow text is the enforcement mechanism.

---

## Signal

Signal to agent-father: `docs/signals/cowork-heartbeat-schema-20260603T203508Z.json`
