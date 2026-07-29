---
sprint: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
branch: task/idle-chain-main-completion
size: M
zone: docs/agents/dev-team/flow/
depends_on: [FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION, FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN]
blocks: [FIX-DEVTEAM-IDLE-CHAIN-TEST-FAIRNESS, FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE]
---

## TLDR
Integrate Step 1 PO Triage durable inbox consumption into `main.md` (§695-717): replace in-memory `pendingSignals[]` build with read from `.dev_team_idle_chain.pending_triage_inbox`, and add inbox clear (subtract by envelope_id) after PO successfully triages.

## [PM] Planning Context

- **Part 2 Completion:** Step 1 read/clear logic (Part 2 durability append is separate task)
- **Architect Brief:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §3.2 (consumption), §3.3 (worked example)
- **PO Ruling:** Part 2 mandatory with Part 1. Rotation alone bounds latency but not loss. Without durable handoff, rotation drops ~80% of signals.
- **Precondition:** P1A-MAIN-ROTATION + P2A-DURABLE-DRAIN tasks must be landed first; this task integrates their outputs into Step 1.

### Change Scope (main.md §695-717 Step 1, integration)

**File:** `docs/agents/dev-team/flow/main.md`

**Current Step 1 logic (around line 695):**
```bash
# Step 1: PO Triage
# ... reads pendingSignals[] from drain-signals.md stdout
# ... calls `spawn po with pendingSignals`
```

**New logic:**
```bash
# Step 1: PO Triage — durable inbox consumption (§3.2)
if [ "$SELECTED" == "step1_triage" ]; then
  # Read durable inbox from orch-state.json (not in-memory artifact)
  pendingSignals=$(jq -c '.dev_team_idle_chain.pending_triage_inbox' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
  
  if [ "$(echo "$pendingSignals" | jq 'length')" -gt 0 ] || [ other conditions ]; then
    # Spawn PO with pendingSignals + reports + task_board (dispatcher-wrap unchanged)
    spawn po with pendingSignals
    
    # After PO completes successfully:
    # Clear the consumed signals by envelope_id
    consumed_ids=$(echo "$pendingSignals" | jq -c '[.[].envelope_id]')
    jq --argjson ids "$(json consumed_ids)" \
      '.dev_team_idle_chain.pending_triage_inbox |= map(select(.envelope_id as $i | ($ids|index($i))|not))' \
      "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
  else
    # no-op turn: no signals, no reports, no action
    # Fall through to Session Gate
  fi
else
  # Not step1_triage's turn, skip to Session Gate
fi
```

### Key Design Points (from brief §3.2)

1. **Read durable inbox:** `jq '.dev_team_idle_chain.pending_triage_inbox'` — no longer in-memory
2. **Subtractive clear:** Remove by `envelope_id`, not blind `= []` (defensive against concurrent append)
3. **Duplicate-safe failure mode:** If crash after PO triages but before clear lands, next turn re-delivers same signals → PO dedup guards handle it (e.g., `zone_missing_tier3` checks for existing board entry)
4. **No-op turn:** If durable inbox empty AND no reports AND no unresolved — fall through (silent, no Telegram — handled by revised Session Gate)

### Acceptance Criteria

- [ ] Step 1 block only runs when `$SELECTED == "step1_triage"` (part of rotation dispatch)
- [ ] `pendingSignals` read from `.dev_team_idle_chain.pending_triage_inbox` (durable, not in-memory)
- [ ] PO spawn call unchanged (dispatcher-wrap reused verbatim)
- [ ] After PO completes: inbox cleared by `envelope_id` subtractive filter, not replaced with `[]`
- [ ] No-op turn (inbox empty + no reports) does NOT spawn PO, does NOT produce Telegram (Session Gate handles)
- [ ] jq syntax correct: `map(select(.envelope_id as $i | ($ids|index($i))|not))` (or equivalent subtractive logic)
- [ ] orch-apply.sh called for clear operation, error handling via `|| true` (non-blocking)

### Files to Read First

- `docs/agents/dev-team/flow/main.md` (full file, especially §695-717 current Step 1 logic)
- `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§3.2 consumption, §3.3 worked example)
- `docs/agents/dev-team/flow/drain-signals.md` (understand pendingSignals[] original role)
- Example envelope structure (from P2A-DURABLE-DRAIN task description or brief §3.1)

### Files to Create

None

### Files to Modify

- `docs/agents/dev-team/flow/main.md` — replace Step 1 pendingSignals build + add clear logic

### Dependencies

- **Blocks:** FIX-DEVTEAM-IDLE-CHAIN-TEST-FAIRNESS, FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE (tests run against this final code)
- **Depends on:** FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION (rotation logic), FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN (durable append), FIX-DEVTEAM-IDLE-CHAIN-P1B-STAMP (stamp call site exists)

### Knowledge Needed

- Current Step 1 PO spawn logic (dispatcher-wrap, passthrough)
- jq subtractive filter pattern (`map(select(...|not))`)
- Durable inbox structure (envelope object with envelope_id, source, payload, etc.)
- PO dedup guard semantics (why re-delivery is OK)
- orch-state.json schema (dev_team_idle_chain.pending_triage_inbox location)

### Risk & Constraints

- **Backward compatibility (one tick):** Migration tick after this lands, `.dev_team_idle_chain` absent from live file → jq must treat as `[]` by default (safe, no signals lost on bootstrap)
- **Concurrent append race:** Deliberately subtracts by `envelope_id` not blind replace, because inbox may accumulate entries across ticks while Step 1 waits for its turn
- **Lost signals risk is LOW:** Unlike prior design (destructive before PO gets it), new design persists FIRST (durable append succeeds before any move/flip) — signal is only removed from inbox AFTER PO confirms it acted
- **PO's own dedup:** PO already carries dedup for certain signal types (e.g., `zone_missing_tier3` checks board for existing rows) — re-delivery of an already-handled signal is a duplicate, not a loss
