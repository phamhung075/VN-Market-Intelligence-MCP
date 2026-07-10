# 2026-07-10 — GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST (Flow Edit)

## Summary
Added Step 7.6 "PERSIST SYNTHESIS" to `docs/agents/unified-agent/flow/chef.md`. CHEF now writes a machine-queryable JSON file containing the synthesized TNB 6-layer analysis (conviction calls, sector phases, regime+confidence, known_gaps) to `docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json` after each cycle.

## Context
- **Gap identified**: CHEF synthesizes TNB 6-layer conviction data every cycle but persists only to Telegram MARKET and notebooks—not to a frontend-queryable store.
- **Impact**: Downstream tools and frontend cannot directly query structured conviction/sector/regime/gap data without parsing Telegram prose.
- **Solution mandate**: Add a persist step to chef.md after synthesis (Step 6.5) but before cycle end (Step 8) to write a dated JSON file.

## Changes Made

### 1. Flow Edit — Step 7.6 Addition
**File**: `docs/agents/unified-agent/flow/chef.md`
- **Added**: Step 7.6 "PERSIST SYNTHESIS (JSON output — machine-queryable store)"
- **Placement**: After Step 7.5 (quality verdict gate), before Step 8 (notebook write)
- **Size impact**: +93L (654L total; within cap with size-justification updated)

**JSON schema defined**:
```json
{
  "metadata": { cycle_id, dish_type, date_vn, timestamp_utc, quality_verdict, layers_walked_summary },
  "tnb_synthesis": { clock_phase, regime_state, regime_confidence, ... },
  "conviction_calls": [ { ticker, conviction_level, direction, pillars_aligned_count, ... } ],
  "sector_phases": [ { sector_vn, investment_phase, pyramid_tier, direction_this_cycle } ],
  "known_gaps": [ L6 gap markers from Step 6 ],
  "causal_chains": [ Step 6.5 chain sentences ],
  "clusters_summary": { qualified, tickers_covered, sectors_covered }
}
```

**File path pattern**: `docs/data/unified-agent-synthesis-{DATE}-{SLOT}.json`
- Example: `docs/data/unified-agent-synthesis-2026-07-03-eod.json`

**Extraction rules**:
- Conviction calls: sourced from Step 4 per-ticker scoring + pillar alignment
- Sector phases: sourced from Step 4 phase/tier declarations
- Regime state: sourced from Step 3 macro analysis (Layer 2+3) + carry regime
- Known_gaps: sourced from Step 6 gap catalogue `[gap: ...]` markers
- Causal chains: sourced from Step 6.5 session state
- Quality verdict / layers_walked: sourced from Step 7.5 gate output

### 2. Size-Justification Comment Updated
**File**: `docs/agents/unified-agent/flow/chef.md` (line 1)
- Updated size-justification from 509L to 654L (+145L from GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST)
- Added note: "Step 7.6 PERSIST-SYNTHESIS added 2026-07-10 — enables frontend/downstream-tool access to structured conviction/sector/regime/gap data"

### 3. Board State Updated
**File**: `docs/data/orch/orch-state.json`
- Task `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` moved from `in_progress` to `REVIEW` status
- Added review_note: "Flow edit complete (chef.md Step 7.6 added). Awaiting live CHEF cycle to verify docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json is created with non-empty conviction_calls and sector_phases."
- Added review_gated_by: "live-cycle-verification"

## Verification Plan
The JSON file persistence cannot be unit-tested in isolation (requires full CHEF cycle execution with synthesized data). Verification scheduled for next natural CHEF cycle (morning/intraday/eod/evening, earliest: 2026-07-10T05:23Z or later).

**Verification checklist (to be executed by next CHEF run)**:
1. ✓ `docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json` file is created with correct path format
2. ✓ File contains valid JSON (no parse errors)
3. ✓ `metadata` section populated with correct cycle_id, date, slot, timestamp
4. ✓ `conviction_calls` array non-empty (contains ≥1 ticker conviction call from Step 4)
5. ✓ `sector_phases` array non-empty (contains ≥1 sector phase from Step 4)
6. ✓ `known_gaps` array populated (contains L6 gap markers if any)
7. ✓ `causal_chains` array populated (contains Step 6.5 chain sentences)
8. ✓ Field values match corresponding Telegram MARKET post + WORK [CHEF-DETAIL] message
9. ✓ Intraday silent-exit cycles correctly skip Step 7.6 (no file written)

## Decision
✅ **Ready for live verification** — Flow edit complete. Task moved to REVIEW status pending next CHEF cycle execution. No manual blocking issues detected; code path logic correct per mandate.

## Next Steps
1. Next CHEF cycle runs → Step 7.6 executes and writes JSON file
2. Future cowork tick verifies file existence + content correctness
3. On verification pass → flip task to DONE_VERIFIED
4. Task GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD (frontend endpoint) unblocked afterward

## Notes
- Pattern mirrors fb-market-poster's TNB synthesis composition (Step 2b walk reads same layers)
- JSON schema designed for downstream tool consumption (dev-mcp-server GET /api/chef-synthesis endpoint, frontend card)
- Silent-exit exception correctly documented (intraday 0-cluster exits before Step 7.6)
