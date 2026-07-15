# cycle-snapshot-latest.json promotion never fires — adaptive-cadence loop is dark

**Detected:** 2026-07-15T19:51Z by cowork-team dispatcher (tick 19:45Z, drift_min=3)
**Status:** PLAN-ONLY — no fix attempted. Router/dispatcher does not implement.

## Observation (raw, this tick)

`emit_pressure_state` (telemetry.md Step 6.0) returned:

```json
{"success": true, "emitted_at": "2026-07-15T19:51:38.583Z",
 "pressure_state_path": "/app/docs/data/pressure-state.json",
 "cycle_snapshot_promoted": false, "stale_warning": true}
```

`docs/data/cycle-snapshot-latest.json` on disk:

```json
{"tick": "19:45", "created_at": "2026-07-07T19:47:26Z"}
```

→ **8 days stale.** `cycle_snapshot_promoted: false` on this tick.

This tick's dispatcher DID write a fresh snapshot: `docs/data/cycle-snapshot-19:50.json` (16373 bytes).

## Scope — what is NOT affected

Verified before filing, to avoid overclaiming:

- Cowork agents read `docs/data/cycle-snapshot-<HH:MM>.json`, **not** `-latest.json`
  (`.claude/skills/cycle-bootstrap/SKILL.md:59`). Published market content is **not**
  serving 8-day-old data.
- `pressure-state.json` itself updates correctly each tick (emitted_at is fresh).

## Scope — what IS affected

The only reader of `cycle-snapshot-latest.json` is `telemetry.md` Step 6.0, which sources:

- `last_regime` ← `<regime_status from cycle-snapshot-latest.json if known, else unknown>`
- `last_volatility_level` ← `<volatility_level from cycle-snapshot-latest.json if known, else unknown>`

Because promotion never fires, both are pinned to `"unknown"` every tick. Downstream
(`pressure-cadence.md` Step 4.4) `computeTiers` then derives `volatility_tier = low`
unconditionally. **The adaptive-cadence feedback loop is structurally dark.**

Compounding: `emit_pressure_state` returns `stale_warning: true` even on a fresh write,
and Step 4.2 treats `stale_warning == true` as an unconditional legacy fallback
(AC-P1-6-3). So `pressure_mode` is pinned to `legacy` regardless of freshness.
Cross-ref: existing memory `reference_isstale_stale_warning_forces_legacy`.

## Hypothesis (UNVERIFIED — needs dev-team confirmation)

`tick-snapshot.md` Step 4.7 names the file from the **actual fire time**:
`FILE_TICK=$(date -u +%H:%M)` → `cycle-snapshot-19:50.json`.
`emit_pressure_state` appears to promote from the **nominal tick** (`19:45`).
With `drift_min=3` the two never match → no promotion.

Supporting evidence: the last successful promotion (`cycle-snapshot-latest.json`,
2026-07-07) carries `tick: "19:45"` — i.e. it succeeded on a tick where actual HH:MM
happened to equal nominal. This is consistent with the hypothesis but does not prove it;
the tool's promotion source path was not read.

**Do not treat the hypothesis as diagnosed.** Confirm against the `emit_pressure_state`
implementation in the mcp-server before changing either side.

## Suggested next step (for dev-team / po triage)

Decide the canonical key and make writer + promoter agree:
either Step 4.7 names by nominal tick, or `emit_pressure_state` promotes the newest
`cycle-snapshot-*.json`. Whichever is chosen, `stale_warning: true`-on-fresh-write should
be triaged in the same pass — otherwise `pressure_mode` stays pinned to `legacy` and
fixing promotion alone changes nothing observable.
