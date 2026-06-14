---
name: four-factor-synthesis
description: >
  Trung 4-factor conviction matrix (T-4). Scores Financials / Valuation / Governance /
  BusinessModel and outputs one of 4 investment scenarios. Invoke after balance-sheet-first-read
  and ownership-governance-screen complete. Scenario 4 = hard SKIP. Feeds TNB Layer 5 Step 3
  as bottom-up company-level input.
---

## Four-Factor Synthesis (SKILL-3)

**Source technique:** T-4 (Trung)
**Cap:** 120L | **Ref brief:** docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md § SKILL-3

### Inputs required before running

| Input | Source |
|---|---|
| `rapid_screen_verdict`, `pe_band`, `pb_band` | SKILL-1 output |
| `asset_coverage`, `pb_ratio`, `balance_verdict`, `balance_flags` | SKILL-2 output |
| `governance_score`, `red_flags` | SKILL-4 output |
| `get_bctc_series` + `get_bctc_full` ratios | MCP tool calls |

### Factor F — Financials (Quantitative)

```
call_tool(server="vn-market", tool="get_bctc_series", arguments={
  "code": "<ticker>",
  "fields": ["roe", "debt_to_equity", "operating_cf", "net_profit", "eps"]
})
call_tool(server="vn-market", tool="get_bctc_full", arguments={"code": "<ticker>"})
```

Use series arrays (roe/debt_to_equity/operating_cf) for multi-period trend.
`get_bctc_full` fills charter_capital + any field absent from series enum (pe/pb may be N/A).

Score STRONG if ALL three hold:
1. ROE ≥ 12% (latest year — series roe[])
2. Debt-to-equity ≤ 1.5 (latest year — series debt_to_equity[])
3. CFO > 0 in ≥ 3 of last 4 years (series operating_cf[])

Score WEAK if any condition fails.
Also inherit `balance_verdict` from SKILL-2: INSOLVENT or WEAK → force Factor F = WEAK.

### Factor V — Valuation (Quantitative)

Inherit from SKILL-1 output (no extra call):

```
IF pe_band IN [CHEAP, FAIR] AND pb_band IN [CHEAP, FAIR] → ATTRACTIVE
IF pe_band = EXPENSIVE AND pb_band = EXPENSIVE             → DEMANDING
ELSE (mixed)                                               → ATTRACTIVE (with note)
```

### Factor G — Governance (Qualitative)

Inherit from SKILL-4 output:

```
governance_score = GREEN  → ACCEPTABLE
governance_score = YELLOW → ACCEPTABLE (with note; trigger SKILL-5 management-track-record)
governance_score = RED    → WEAK
```

Any SKILL-4 red_flags present AND governance_score ≠ GREEN → log flags in factor_scores.G detail.

### Factor B — Business Model / Moat (Qualitative)

Agent qualitative judgment (upstream market-watcher moat assessment if available):
```
STRONG  — stable/growing market + defensible position (pricing power, switching costs, moat, brand)
WEAK    — commoditised, no pricing power, declining share, easy substitution
```
If no upstream moat signal: make explicit judgment; document reasoning.

### Scenario mapping (2×2)

| Scenario | Condition | Label | Action |
|---|---|---|---|
| 1 | F=STRONG + V=ATTRACTIVE + G=ACCEPTABLE + B=STRONG | **CONVICTION** | Deep dive; 3-5yr hold candidate |
| 2 | F=STRONG + V=ATTRACTIVE + G=ACCEPTABLE + B=WEAK | **VALUE-TRAP-RISK** | Flag; require SKILL-6 before proceeding |
| 3 | F=STRONG + V=DEMANDING + G=ACCEPTABLE + B=STRONG | **GROWTH-PREMIUM** | Proceed only if growth thesis quantified |
| 4a | Any G=WEAK | **SKIP-GOVERNANCE** | Hard stop; do not publish |
| 4b | F=WEAK + V=DEMANDING | **SKIP-FUNDAMENTALS** | Hard stop; do not publish |

Scenario 4 (either 4a or 4b) = `conviction_gate = SKIP`. Non-negotiable.
Trung: F+V-only → value traps. DGC/PC/GVC: beautiful financials, severe governance → Scenario 4a.

### Output

```json
{
  "ticker": "<ticker>",
  "scenario": 1 | 2 | 3 | 4,
  "scenario_label": "CONVICTION | VALUE-TRAP-RISK | GROWTH-PREMIUM | SKIP-GOVERNANCE | SKIP-FUNDAMENTALS",
  "conviction_gate": "PASS | SKIP",
  "factor_scores": {
    "F": "STRONG | WEAK",
    "V": "ATTRACTIVE | DEMANDING",
    "G": "ACCEPTABLE | WEAK",
    "B": "STRONG | WEAK"
  },
  "flags": ["<inherited from SKILL-2 / SKILL-4>"]
}
```

### Decompose-before-conclude gate (T-44 EXTEND — 07-06)

Before writing any scenario verdict, run the 3-question decomposition check:

1. **Which component?** — name the specific driver (e.g. "transport CPI 20% weight", "electronics exports margin").
   A claim that names only the headline (e.g. "CPI rising") without a component attribution fails this gate.
2. **Direct or indirect to wallet?** — does the component reach the consumer wallet immediately (transport fuel → yes, construction materials → lagged) or indirectly (PPI → importer → retailer → consumer ~1 quarter lag)?
3. **Policy shock or structural trend?** — is this a one-off administered-price adjustment (education, health fees) or a demand-driven persistent trend? Policy shocks are front-loaded and self-correct; trends are durable.

**Gate rule:** If any of the 3 questions cannot be answered from available data → do NOT assert CONVICTION on the macro leg of the thesis. Downgrade macro contribution to LOW and flag `decompose_gap=true` in the output `flags[]`.

### TNB integration note

SKILL-3 → bottom-up input to TNB Layer 5 Step 3. Sequence: macro (TNB) → sector → SKILL-1/2/3/4 → Layer 5 audit.

### Usage in flow files

```
Step 5: four-factor-synthesis
  skill: .claude/skills/four-factor-synthesis/SKILL.md
  inputs: SKILL-1 + SKILL-2 + SKILL-4 outputs
  on conviction_gate=SKIP  → log scenario_label; drop ticker; do NOT publish
  on scenario=2 or 3       → also invoke SKILL-6 value-trap-avoidance
  on G=YELLOW              → also invoke SKILL-5 management-track-record
```
