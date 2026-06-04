---
name: value-trap-avoidance
description: >
  Value-trap heuristic (Báu/Trung T-3/T-4/T-5). 2-failure-signal check (chronically
  cheap + price-earnings divergence), moat absence, DGC-pattern governance-trap, and
  conviction test. Invoke when four-factor-synthesis returns Scenario 2 (VALUE-TRAP-RISK)
  or when a stock appears cheap on P/B and P/E but analyst is uncertain. Complements
  TNB Layer 6 gap catalogue at company level.
---

## Value-Trap Avoidance (SKILL-6)

**Source techniques:** T-3 (valuation history), T-4 Scenario 2 warning, T-5 (Thành price-earnings sync)
**Cap:** 120L | **Ref brief:** docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md § SKILL-6

**Trigger:** scenario = 2 (VALUE-TRAP-RISK) OR stock cheap on P/B < 1 / P/E < 8 with uncertainty

### Step 1 — 2-failure-signal heuristic

Fetch price history and earnings history (last 24 months minimum):

```
call_tool(server="vn-market", tool="get_market_snapshot", arguments={"code": "<ticker>", "period": "24m"})
call_tool(server="vn-market", tool="get_bctc_full", arguments={"code": "<ticker>", "years": 3})
```

**Signal A — Chronically cheap (T-3):**
```
SIGNAL-A fires if:
  P/B < 1 OR P/E < 8 for > 18 consecutive months
  with NO price convergence toward book or earnings
```

**Signal B — Price-earnings divergence (T-5 Type B pattern):**
```
SIGNAL-B fires if:
  earnings grew (EPS up ≥ 10%) during same 18-month window
  BUT price did NOT follow (price change < 5% or negative)
  → Type B company: price moves independently of fundamentals
```

```
LIKELY-TRAP if SIGNAL-A AND SIGNAL-B both fire
```

Thành: "khó quá thì bỏ qua" — cannot explain price/earnings divergence → do NOT invest.

VN-specific Type B mechanics: (a) price pumped for pledged-share refinancing LTV; (b) price raised to 10,000 VND floor for new share issuance; (c) convertible bond requiring price support.

### Step 2 — Moat absence check

Agent qualitative judgment (no additional tool call required):

```
MOAT-ABSENT flag if ALL of:
  - no pricing power (cannot raise prices without losing customers)
  - commoditised industry (product undifferentiated, margin pressure = market price)
  - no switching costs, regulatory moat, or brand advantage
```

Moat-absent + P/B < 1 = value trap risk even at deep discount. The market priced the deterioration correctly.

### Step 3 — DGC-pattern governance trap

Inherit from SKILL-3 and SKILL-4 outputs (no additional tool call):

```
GOVERNANCE-TRAP flag if:
  Factor F = STRONG (ROE > 20%, growing revenue, positive CFO) AND
  governance_score = RED (from SKILL-4)
```

This is the DGC/PC/GVC pattern: beautiful financials, severe governance defects that experienced investors already knew about. The financial numbers are real but the governance structure ensures minority shareholders do not benefit from them long-term.

Explicit label: "high financial score, low governance score — GOVERNANCE-TRAP."

### Step 4 — Conviction test

Analyst must answer in ≤2 sentences: **WHY will the valuation discount close?**

```
conviction_test_passed = false  (default)

Acceptable (specific catalyst): buyback program, dividend initiation with yield,
  sector re-rating with named trigger, asset revaluation with scheduled appraisal.

NOT acceptable (vague = stays false): "cheap vs peers", "earnings should improve",
  "management seems capable".
```

If conviction_test_passed = false → LIKELY-TRAP regardless of signal count.

### Step 5 — Output

```json
{
  "ticker": "<ticker>",
  "trap_signals": ["SIGNAL-A", "SIGNAL-B", "MOAT-ABSENT", "GOVERNANCE-TRAP"],
  "trap_verdict": "SAFE | TRAP-RISK | LIKELY-TRAP",
  "conviction_test_passed": true | false,
  "conviction_statement": "<2-sentence analyst statement or null>",
  "type_b_mechanics_identified": "<string describing identified mechanism or null>"
}
```

Verdict rules:
- `LIKELY-TRAP` if (SIGNAL-A AND SIGNAL-B) OR GOVERNANCE-TRAP OR conviction_test_passed = false
- `TRAP-RISK` if any single signal present but conviction test passed
- `SAFE` if no signals AND conviction test passed

### Usage in flow files

```
Step 6a: value-trap-avoidance
  skill: .claude/skills/value-trap-avoidance/SKILL.md
  invoke when: scenario = 2 OR (pe_band = CHEAP AND pb_band = CHEAP AND uncertainty flagged)
  on LIKELY-TRAP  → override conviction_gate to SKIP; do NOT publish thesis
  on TRAP-RISK    → publish as WATCHLIST-ONLY; never as CONVICTION call
  on SAFE         → proceed to full deep-research publication path
```
