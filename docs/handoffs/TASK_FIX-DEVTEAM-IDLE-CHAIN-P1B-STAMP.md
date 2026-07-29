---
sprint: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
branch: task/idle-chain-p1b-stamp
size: S
zone: docs/agents/dev-team/flow/
depends_on: [FIX-DEVTEAM-IDLE-CHAIN-S1-SCHEMA-SELECTION]
blocks: [FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION]
---

## TLDR
Create `scripts/devteam-idle-chain-stamp.jq` new script and integrate its call into `main.md` rotation dispatcher: after the selected consumer's block runs (dispatch or no-op), unconditionally update `.dev_team_idle_chain.rotation[$SELECTED].last_served_tick = now()` to enforce fairness bound.

## [PM] Planning Context

- **Architect Brief:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §2.3 (stamp update)
- **Purpose:** Fairness bound — each tick strictly stamps the selected consumer to `now()` (freshest of the 5), so it cannot be picked again until all others have had a turn. Any 5-consecutive-tick window = each consumer served exactly once (worst-case wait = 4 intervening ticks).
- **Timing:** AFTER the selected consumer's block runs (dispatch or no-op, either way). Separate orch-apply.sh write, not threaded into each consumer's promote/claim script (zero-diff philosophy for existing tested scripts).

### New Script (infrastructure/tooling)

**File:** `scripts/devteam-idle-chain-stamp.jq` (new)

**Purpose:** Pure jq transform, reads orch-state.json, modifies `.dev_team_idle_chain.rotation[].last_served_tick` for the selected consumer.

**Invocation pattern (from main.md):**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg now "$NOW" --arg c "$SELECTED" \
  '(.dev_team_idle_chain.rotation[$c].last_served_tick = $now)
   | (.dev_team_idle_chain._updated_at = $now)
   | (.dev_team_idle_chain._updated_by = "dev-team")' \
  docs/data/orch/orch-state.json | bash scripts/orch-apply.sh || true
```

**Input:** orch-state.json (read from file)
**Output:** jq transform piped to orch-apply.sh
**Error handling:** `|| true` silences orch-apply.sh failure (log-only, do not halt)

**Script content (devteam-idle-chain-stamp.jq):**
```jq
# Stamp the selected consumer's last_served_tick to now, guaranteeing fairness bound
# Usage: jq --arg now "ISO8601Z" --arg c "consumer_id" -f scripts/devteam-idle-chain-stamp.jq orch-state.json | orch-apply.sh

def stamp_rotation($consumer_id; $now):
  if . | has("dev_team_idle_chain") | not then
    .dev_team_idle_chain = { rotation: {}, _updated_at: $now, _updated_by: "dev-team" }
  else . end
  | .dev_team_idle_chain.rotation[$consumer_id].last_served_tick = $now
  | .dev_team_idle_chain._updated_at = $now
  | .dev_team_idle_chain._updated_by = "dev-team";

stamp_rotation($c; $now)
```

**Or equivalently inline in main.md** (architect brief notes "may fold into the same transform as a micro-optimization") — either approach is acceptable. Recommend as separate script for clarity.

### Integration into main.md

**Location:** Immediately after the selected consumer's block runs (after the case/dispatch block for the 5 consumers, before Session Gate check).

**Call pattern (from brief §2.3):**
```bash
# After selected consumer's block finishes (dispatch or no-op)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg now "$NOW" --arg c "$SELECTED" \
  -f "$PROJECT_ROOT/scripts/devteam-idle-chain-stamp.jq" \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
  | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
  || true  # silent on orch-apply failure (stamp is observational, not blocking)
```

**Unconditional:** Runs every idle tick, whether the selected consumer dispatched, no-op'd, or was skipped. The stamp updates EVERY tick regardless of outcome (that's what guarantees the fairness bound).

### Acceptance Criteria

- [ ] `scripts/devteam-idle-chain-stamp.jq` created, implements stamp transform as specified
- [ ] jq function callable: `jq --arg now "2026-07-29T13:50:00Z" --arg c "bounded1" -f scripts/devteam-idle-chain-stamp.jq fixture.json` outputs valid orch-state.json
- [ ] Timestamp correctly updated: `.dev_team_idle_chain.rotation[consumer_id].last_served_tick == $now`
- [ ] Metadata fields set: `._updated_at` and `._updated_by = "dev-team"` also updated
- [ ] main.md integration: stamp call runs unconditionally after selected consumer's block, BEFORE Session Gate
- [ ] Error handling: `|| true` silences orch-apply.sh failure, stamp does not block dispatcher flow
- [ ] No changes to other orch-state fields (besides rotation stamps and metadata)

### Files to Read First

- `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§2.3, full stamp spec)
- `docs/agents/dev-team/flow/main.md` (understand where the call site goes: after rotation-dispatch consumer block)
- `scripts/orch-apply.sh` (understand error contract)
- Example `.dev_team_idle_chain` structure from schema (brief §2.1, live shape)

### Files to Create

- `scripts/devteam-idle-chain-stamp.jq` — new script

### Files to Modify

- `docs/agents/dev-team/flow/main.md` — add stamp call site after selected consumer's block

### Dependencies

- **Blocks:** FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION (needs this for fairness bound integration)
- **Depends on:** FIX-DEVTEAM-IDLE-CHAIN-S1-SCHEMA-SELECTION (schema key must exist)
- **Parallel siblings:** Can be developed in parallel with P1A-MAIN-ROTATION and P2A-DURABLE-DRAIN

### Knowledge Needed

- jq basics (def, assignment, has, ||)
- orch-state.json structure (dev_team_idle_chain key location)
- ISO 8601 timestamp format (already used everywhere else in codebase)
- orch-apply.sh error handling

### Risk & Constraints

- **Timestamp precision:** Use `date -u +%Y-%m-%dT%H:%M:%SZ` (same format as everywhere else in flow docs); no milliseconds
- **Fairness proof depends on this:** Without the unconditional stamp every tick, the rotation's fairness bound collapses — the selection algorithm depends on seeing updated timestamps
- **Separate write is OK:** orch-apply.sh CAS retry makes 2 small writes safe (one for consumer's own action, one for stamp)
- **Bootstrap safety:** If `.dev_team_idle_chain` key is missing, jq `// {}` fallback in rotation_selected means stamps will see null → "1970-01-01T00:00:00Z" → all five eligible on bootstrap tick
