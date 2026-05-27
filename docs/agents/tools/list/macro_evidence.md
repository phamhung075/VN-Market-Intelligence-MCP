# record_evidence_fragment, get_evidence_summary, create_prediction_claim

**Module:** `interface/mcp/tools/macro/evidenceTools.ts`

**Category:** Macro (Evidence & Prediction Engine)

## Overview

Three related tools for the prediction engine:
- `record_evidence_fragment` — Write directional evidence fragments (Phase A, Sprint 057)
- `get_evidence_summary` — Read current evidence picture for a stock (Phase B, Sprint 059)
- `create_prediction_claim` — Insert a structured prediction claim (Phase B, Sprint 059)

## Tool Signatures

```typescript
record_evidence_fragment(
  stock: string,
  direction: "bullish" | "bearish" | "neutral",
  evidence_type: string,
  weight?: number,
  source?: string,
  notes?: string
) → string

get_evidence_summary(stock: string, days?: number) → string

create_prediction_claim(
  stock: string,
  direction: "up" | "down" | "sideways",
  target_price?: number,
  resolution_date: string,
  confidence?: number,
  reasoning?: string
) → string
```

## Input Parameters

### record_evidence_fragment

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `stock` | string | yes | — | Stock code (e.g., "VCB", "VNM") |
| `direction` | string | yes | — | "bullish", "bearish", or "neutral" |
| `evidence_type` | string | yes | — | Type of evidence (see Evidence Types table) |
| `weight` | number | no | 1.0 | Evidence weight (0.5–2.0, default 1.0) |
| `source` | string | no | "agent" | Source name (e.g., "news_scout", "market_watcher") |
| `notes` | string | no | null | Optional reasoning text |

### get_evidence_summary

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `stock` | string | yes | — | Stock code |
| `days` | number | no | 30 | Lookback period in days (1–365) |

### create_prediction_claim

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `stock` | string | yes | — | Stock code |
| `direction` | string | yes | — | "up", "down", or "sideways" |
| `target_price` | number | no | null | Optional target price in VND |
| `resolution_date` | string | yes | — | ISO date when prediction resolves (e.g., "2026-07-31") |
| `confidence` | number | no | 0.50 | Confidence level 0–1.0 (default 0.50) |
| `reasoning` | string | no | null | Optional reasoning text |

## Evidence Types (Standard)

| Type | Agent | Description |
|------|-------|-------------|
| `news_sentiment_macro` | News Scout | Macro news sentiment (inflation, rates, growth) |
| `news_sentiment_stock` | News Scout | Stock-specific news sentiment |
| `bctc_revenue_growth` | BCTC Collector | Revenue growth trend from quarterly reports |
| `bctc_pe_ratio` | BCTC Collector | P/E valuation signal from BCTC |
| `bctc_debt_equity` | BCTC Collector | Debt-to-equity trend signal |
| `price_momentum_5d` | Market Watcher | 5-day price momentum signal |
| `price_momentum_20d` | Market Watcher | 20-day price momentum signal |
| `foreign_flow_accumulation` | Market Watcher | Foreign investor accumulation pattern |
| `insider_accumulation` | Financial Analyst | Insider buying streak signal |
| `kinh_dich_signal` | Any agent | Kinh Dich hexagram signal |
| `policy_signal` | News Scout | Policy announcement affecting sector |

## Output Format

### record_evidence_fragment Success

```
Evidence Fragment Recorded

Stock: VCB
Direction: bullish
Evidence Type: bctc_revenue_growth
Weight: 1.5
Source: bctc_collector
Notes: Q1 2026 revenue +15% YoY, beating expectations
Recorded At: 2026-05-05T10:30:00Z

Next step: Use get_evidence_summary(stock="VCB") to see accumulated evidence.
```

### get_evidence_summary Output

```
Evidence Summary — VCB (30 days)

Bullish Fragments: 6
  bctc_revenue_growth (weight 1.5)
  foreign_flow_accumulation (weight 1.0)
  insider_accumulation (weight 2.0)
  price_momentum_20d (weight 0.8)
  ...

Bearish Fragments: 2
  bctc_debt_equity (weight 0.9)
  news_sentiment_macro (weight 0.5)

Neutral Fragments: 1
  kinh_dich_signal (weight 1.0)

Net Signal Strength: +3.4 (bullish lean)
Latest Evidence Score: 0.67 (moderate bullish)
Last Updated: 2026-05-05T12:00:00Z
```

### create_prediction_claim Success

```
Prediction Claim Created

Stock: VCB
Direction: up
Target Price: 95,000 VND
Resolution Date: 2026-07-31
Confidence: 0.75
Reasoning: Revenue growth confirmed by BCTC, foreign buying accumulation, technical breakout
Claim ID: claim-vcb-20260505-001
Status: open
Created: 2026-05-05T10:45:00Z

Prediction will be resolved on 2026-07-31. Outcome will be tracked for calibration.
```

## Data Model

### evidence_fragments table

| Field | Type | Notes |
|-------|------|-------|
| id | INT | Auto-increment |
| stock | VARCHAR | Stock code |
| direction | VARCHAR | "bullish", "bearish", "neutral" |
| evidence_type | VARCHAR | Type from Evidence Types table |
| weight | DECIMAL | 0.5–2.0 (default 1.0) |
| source | VARCHAR | Agent/source that recorded |
| notes | TEXT | Optional reasoning |
| recorded_at | TIMESTAMP | When recorded |

### prediction_claims table

| Field | Type | Notes |
|-------|------|-------|
| id | VARCHAR | Unique claim ID |
| stock | VARCHAR | Stock code |
| direction | VARCHAR | "up", "down", "sideways" |
| target_price | DECIMAL | Optional target |
| resolution_date | DATE | When claim resolves |
| confidence | DECIMAL | 0–1.0 (forecast probability) |
| reasoning | TEXT | Optional reasoning |
| status | VARCHAR | "open", "resolved", "expired" |
| actual_price | DECIMAL | Close price on resolution_date |
| outcome | VARCHAR | "correct", "incorrect", "expired" |
| created_at | TIMESTAMP | When claim created |
| resolved_at | TIMESTAMP | When claim resolved |

## Usage Examples

```
News Scout → record_evidence_fragment(
  stock="VCB",
  direction="bullish",
  evidence_type="news_sentiment_macro",
  weight=0.8,
  notes="SBV cuts rates, supportive for banking"
)

Market Watcher → get_evidence_summary(stock="VCB", days=60)
Returns 60-day evidence picture

Prediction Synthesizer → create_prediction_claim(
  stock="VCB",
  direction="up",
  target_price=95000,
  resolution_date="2026-07-31",
  confidence=0.65,
  reasoning="Revenue growth + foreign buying + rate cut support"
)
```

## Error Handling

- **record_evidence_fragment:**
  - Invalid direction: "direction must be 'bullish', 'bearish', or 'neutral'"
  - Invalid weight: "weight must be between 0.5 and 2.0"
  - Database error: "Failed to record evidence: [error]"

- **get_evidence_summary:**
  - Stock not found: "No evidence found for [stock]"
  - Returns empty summary if no fragments

- **create_prediction_claim:**
  - Invalid resolution_date: "Must be a future ISO date (e.g., '2026-07-31')"
  - Invalid confidence: "Confidence must be 0–1.0"
  - Database error: "Failed to create claim: [error]"

## Integration Notes

- Called by: All analysis agents (News Scout, Market Watcher, BCTC Collector, Financial Analyst)
- Evidence aggregated nightly by: `evidenceAccumulatorJob` (Phase A)
- Prediction claims resolved by: `predictionResolutionJob` (Phase C)
- Used by: Prediction Synthesizer, Digest & Predict
- Related to: `get_calibration_report()` (prediction accuracy metrics)

## Evidence Aggregation (Phase A)

Nightly job `evidenceAccumulatorJob`:
1. Reads all evidence_fragments for each stock
2. Weights fragments by evidence_type and weight field
3. Computes evidence_scores (0–1.0, bullish/bearish ratio)
4. Stores in evidence_scores table
5. Triggers if confidence >= threshold (0.60)

## Prediction Resolution (Phase C)

Scheduled job `predictionResolutionJob` (weekly):
1. Finds claims with resolution_date <= today
2. Fetches actual close price on resolution_date
3. Compares actual vs. predicted direction
4. Records outcome (correct/incorrect)
5. Feeds into `get_calibration_report()` accuracy metrics

---

**Added:** Task 1117 (record_evidence_fragment), Task 1124 (get_evidence_summary, create_prediction_claim)
**Status:** STABLE
