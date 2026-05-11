# get_policy_signals

**Module:** `interface/mcp/tools/macro/policyTools.ts`

**Category:** Macro

## Overview

Queries recent policy-related news from RAG analyses and classifies them using the policyImpactMapper. Returns structured policy signals with impact scores, affected sectors, and reasoning.

## Tool Signature

```typescript
get_policy_signals(days?: number, sector?: string) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | number | no | 30 | How many days back to search for policy news (1–365) |
| `sector` | string | no | null | Optional sector filter (e.g., "banking", "energy", "retail") |

## Output Format

Plain text list of policy signals with structured sections:

```
Policy Signals (last N days)

[POLICY SIGNAL]
Date: 2026-05-03
Title: SBV raises deposit rates by 0.5pp
Impact: POSITIVE | Confidence: high | Severity: medium
Affected Sectors: banking, mortgage, insurance
Reasoning: Higher deposit rates reduce mortgage demand, improve bank NII
Affected Tickers: VCB, BID, TCB, MBB, VPB

[POLICY SIGNAL]
Date: 2026-04-28
Title: GSO expects CPI spike in May (inflation warning)
Impact: NEGATIVE | Confidence: medium | Severity: high
Affected Sectors: consumer_goods, food_processing, retail
Reasoning: Inflation erodes margins for commodity-exposed sectors
Affected Tickers: MSN, FPT, MWG, BHN

...
```

## Policy Signal Components

| Field | Type | Description |
|-------|------|-------------|
| Date | ISO 8601 | When the policy news was published |
| Title | string | News headline from source |
| Impact | POSITIVE\|NEGATIVE\|NEUTRAL | Directional impact on market |
| Confidence | low\|medium\|high | Confidence in classification |
| Severity | low\|medium\|high\|critical | Market impact magnitude |
| Affected Sectors | list | Sectors impacted by policy (derived by policyImpactMapper) |
| Reasoning | string | Short explanation of policy mechanism and impact |
| Affected Tickers | list | Example stocks in affected sectors |

## Data Source

- **Table:** `rag_analyses`
- **Filter:** created_at >= (now - N days), level IN ('country', 'domain', 'global')
- **Classification:** Domain service `classifyPolicy()` via policyImpactMapper

## Classification Logic

**policyImpactMapper** analyzes:
1. **Policy keywords:** Rate hikes, tax changes, regulations, subsidies, trade
2. **Sector mapping:** Banking (rates), Energy (subsidies), Tech (regulations), etc.
3. **Impact direction:** Positive (supportive), Negative (restrictive), Neutral
4. **Confidence scoring:** Based on keyword match strength and source credibility

## Policy Impact Mapping Examples

| Policy | Sectors | Impact | Reasoning |
|--------|---------|--------|-----------|
| SBV raises rates 0.5pp | Banking, Mortgage, Insurance | POSITIVE | Higher NII, improved deposit margins |
| GSO warns inflation risk | Consumer, Food, Logistics | NEGATIVE | Cost pressures, margin compression |
| Tax breaks for renewable | Energy, Infrastructure | POSITIVE | Lower capex, higher ROI |
| Tightened lending rules | Banking, Real Estate | NEGATIVE | Reduced loan growth, higher costs |

## Usage Examples

```
Digest & Predict → get_policy_signals(days=30)
Returns all policy signals from last 30 days (no sector filter)

Market Watcher → get_policy_signals(days=60, sector="banking")
Returns 60-day policy signals affecting banking sector only

News Scout → get_policy_signals(days=7)
Returns last week's policy signals (quick update)
```

## Error Handling

- Returns empty list if no matching policy news found
- Returns error message if database query fails
- Graceful fallback: always returns text response
- Missing sector filter shows all sectors

## Integration Notes

- Called by: News Scout, Market Watcher, Digest & Predict, Alert Commander
- Complements `get_macro_snapshot` (commodity prices, rates)
- Used to contextualize sudden market moves (e.g., rate hike → banking rally)
- Input to "verified chain" synthesis (policy announcement + market reaction)
- Often triggers sector rotation alerts

## Sector Classification Reference

**Core sectors:**
- banking, mortgage, insurance
- energy, oil_gas, power
- retail, consumer_goods, food_processing
- technology, telecom, e_commerce
- real_estate, construction, materials
- healthcare, pharma, education
- logistics, transportation, aviation
- industrials, machinery

## Related Tools

- **`get_macro_snapshot()`** — Live rates, commodity prices (macro data)
- **`get_market_snapshot()`** — Current stock prices (to verify sector impact)
- **`record_evidence_fragment(evidence_type="policy_signal")`** — Store policy evidence

---

**Added:** Task 245 (Policy Signals MCP Tool)
**Status:** STABLE
