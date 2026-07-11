---
agent: cowork-refactory-expert
sprint: ANALYSIS-QUALITY-CONVERGENCE
task: FR-1-CHEF-LEG-FR-2-ATOMIC
date: 2026-07-11
---

# Task: FR-1-CHEF-LEG-FR-2-ATOMIC — CHEF Indicator Wiring + Anti-Fabrication Gate

## Scope
Wire 4 new indicators (momentum/RS/52w/insider) into CHEF flow (unified-agent/chef.md) AND extend Rule AF-1 anti-fabrication regex. ATOMIC constraint: both changes in ONE commit (architect brief §2.2 load-bearing — splits reopen FIX-CHEF-FABRICATED-TA-NUMBERS vector).

## Execution Summary

### Step 0 GATHER Wiring (P0 Market Indicator Suite)
Added 4 tools to existing P0 block:
- `get_roc_momentum` → extracts roc, z_score, decile (momentum family)
- `get_relative_strength` → extracts rs, percentile, composite_score (strength family)
- `get_52w_proximity` → extracts pct_from_52w_high, pct_from_52w_low (valuation positioning)
- `get_insider_sentiment` → extracts net_sentiment_score (insider activity)

All OPTIONAL with honest-NULL/[SKIP] degrade on tool unavailability (NFR-1 compliance).

### Step 3 Context Layers (3 new subsections)
1. **Momentum & Relative Strength Context:** decile ≥8 + high RS percentile → accumulation; decile ≤2 + low RS → distribution
2. **52-Week Proximity Context:** pricing near 52w-high (>80%) + weak momentum → resistance risk; near 52w-low (<20%) + rising → recovery opportunity
3. **Insider Activity Context:** positive net_sentiment_score + bullish setup → corroboration; negative contradicting bullish → Layer 6 risk divergence

### Step 4 Conviction Scoring (new subsection)
Added 5 conviction/risk refinement rules:
- Bullish + strong momentum (decile ≥8) + high RS percentile + positive insider → elevate to HIGH (accumulation confirmation)
- Bullish + weak momentum (decile ≤2) + low RS → cap at MEDIUM (thesis pending accumulation)
- Bearish + falling momentum + low RS → elevate to HIGH (distribution confirmation)
- Pricing at 52w-high + falling momentum + thesis reversal → Layer 6 risk flag (top-of-range vulnerability)
- Pricing at 52w-low + rising momentum + recovery thesis + positive insider → flag as oversold recovery opportunity

### Step 6.7 Rule AF-1 Anti-Fabrication Gate Extension
Extended BLOCKED tokens regex from 5 families → 9 families:

```
OLD: RSI \d+\.?\d* | MACD \d+\.?\d* | BB \d+\.?\d* | σ \d+\.?\d* | MA\d+ = \d+

NEW: (above) + roc -?\d+\.?\d* | z_score -?\d+\.?\d* | decile \d+ | percentile \d+ | rs \d+ | composite_score \d+\.?\d* | pct_from_52w_high \d+\.?\d* | pct_from_52w_low -?\d+\.?\d* | net_sentiment_score -?\d+\.?\d*
```

Updated Step 6.7 Pre-Publish Self-Check to:
- Reference the 4 new tool sources (not just `get_technical_indicators`)
- Provide Vietnamese qualitative fallbacks for each family
- Log strip actions when fabricated tokens are detected

### Commit Chain (ATOMIC)
1. **feat commit (3ab600af9):** both FR-1 wiring edits + FR-2 regex extension (56 insertions/31 deletions)
2. **chore commit (639ea9796):** board row status flip BACKLOG→IN_PROGRESS→REVIEW

## Acceptance Verification
- ✓ AC-6 (Rule AF-1 extended): regex now blocks all 9 indicator families
- ✓ AC-5 (additive-only): zero regression to existing steps; all new sections contextual
- ✓ Atomic delivery: wiring + regex in single feature commit
- ✓ Honest-NULL maintained: all new calls have graceful [SKIP] degrade on unavailability
- ✓ Zone discipline: only docs/agents/unified-agent/ + orch-state changes

## Cross-Reference
- Architecture brief: docs/architecture-briefs/2026-07-11-analysis-quality-convergence-lanes.md §2.1–2.2
- BA spec: docs/handoffs/BA-ANALYSIS-QUALITY-CONVERGENCE.md FR-1/FR-2
- FIX-CHEF-FABRICATED-TA-NUMBERS prevention: §2.2 load-bearing constraint (no split commit)

## Next Step
QA review: verify live CHEF cycle audit shows zero un-sourced numeric tokens from new families (AC-6 gate).
