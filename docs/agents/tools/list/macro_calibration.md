# get_calibration_report

**Module:** `interface/mcp/tools/macro/calibrationTools.ts`

**Category:** Macro (Prediction Engine)

## Overview

Provides the `get_calibration_report` tool for reading weekly calibration snapshots from the prediction engine. Shows prediction accuracy metrics, Brier score, and confidence calibration curves.

## Tool Signature

```typescript
get_calibration_report(date?: string) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date` | string | no | latest | ISO date of snapshot to retrieve (e.g., "2026-05-01"). Default: latest available |

## Output Format

JSON structured report with accuracy and calibration data:

```json
{
  "snapshot_date": "2026-05-05",
  "total_resolved": 45,
  "total_active": 12,
  "avg_brier_score": 0.178,
  "trend": "improving",
  "trend_delta": -0.023,
  "confidence_by_bucket": [
    {
      "predicted_probability": "0.0-0.1",
      "actual_frequency": 0.05,
      "count": 20,
      "over_confident": -0.05,
      "well_calibrated": true
    },
    {
      "predicted_probability": "0.4-0.6",
      "actual_frequency": 0.52,
      "count": 25,
      "over_confident": 0.02,
      "well_calibrated": false
    },
    {
      "predicted_probability": "0.8-1.0",
      "actual_frequency": 0.88,
      "count": 42,
      "over_confident": 0.08,
      "well_calibrated": false
    }
  ],
  "by_sector": {
    "banking": { "accuracy": 0.78, "count": 12 },
    "energy": { "accuracy": 0.65, "count": 8 },
    "export": { "accuracy": 0.71, "count": 15 }
  },
  "by_source": {
    "news_scout": { "accuracy": 0.72, "count": 18 },
    "market_watcher": { "accuracy": 0.75, "count": 22 },
    "bctc_collector": { "accuracy": 0.68, "count": 12 }
  },
  "recent_misses": [
    {
      "stock": "VCB",
      "claim_id": "claim-vcb-20260415",
      "predicted": "up",
      "actual": "down",
      "confidence": 0.72,
      "reasoning": "Expected rate cut support, but negative BCTC surprise overrode"
    }
  ],
  "recommendations": [
    "Mid-range confidence (40-60%) predictions need recalibration",
    "Banking sector showing strong calibration, maintain current approach",
    "News Scout calibration improved; consider increasing weight"
  ]
}
```

## Key Metrics

### Brier Score

Measures overall prediction accuracy (lower is better):

```
Brier Score = Mean((predicted_probability - actual_outcome)²)
```

- **0.0** = Perfect predictions
- **0.25** = Random guessing (50% confidence for binary outcomes)
- **0.50** = Uninformed guessing

Typical ranges:
- < 0.15 = Excellent calibration
- 0.15–0.25 = Good
- 0.25–0.35 = Fair
- > 0.35 = Poor

### Confidence Calibration

Compares stated confidence vs. actual accuracy:

| Confidence | Meaning | Example |
|-----------|---------|---------|
| Perfectly calibrated | Predicted 70% → actually 70% correct | "over_confident" = 0 |
| Over-confident | Predicted 80% → actually 65% correct | "over_confident" = +0.15 |
| Under-confident | Predicted 60% → actually 75% correct | "over_confident" = -0.15 |

### Trend Analysis

- **improving** = Brier score decreased vs. last week (trend_delta < -0.01)
- **stable** = Within ±1% of last week (trend_delta between -0.01 and 0.01)
- **degrading** = Brier score increased vs. last week (trend_delta > 0.01)

## Data Sources

- **Table:** `calibration_snapshots` (weekly, pre-computed)
- **Job:** `calibrationReportJob` (scheduler) — runs every Sunday 20:00 VN time
- **Input data:** `prediction_claims` resolved + `evidence_scores` (per-sector)

## Output Conditions

| Condition | Output |
|-----------|--------|
| total_resolved < 1 | Show NO_DATA_MESSAGE: "No calibration data available yet..." |
| total_resolved >= 1 | Full report with all sections |

## NO_DATA_MESSAGE

Shown when calibration_snapshots table is empty:

```
No calibration data available yet. Prediction claims are being accumulated and will appear after
the first resolution cycle completes (resolution_date + predictionResolutionJob run).
Check back next Sunday.
```

## Usage Examples

```
Digest & Predict → get_calibration_report()
Returns latest weekly calibration snapshot

Risk Manager → get_calibration_report(date="2026-04-28")
Returns calibration for specific date (previous week)

Prediction Synthesizer → Consults before weighting new predictions
Checks which agent sources are well-calibrated
```

## Error Handling

- **No data:** Returns NO_DATA_MESSAGE (not an error)
- **Invalid date:** Returns "Invalid date format; use ISO 8601 (e.g., '2026-05-01')"
- **Database error:** Returns error message
- **Date not found:** Returns "No snapshot for [date]; available dates: [list]"

## Integration Notes

- Called by: Digest & Predict, Risk Manager, Prediction Synthesizer
- Read path only: Uses pre-computed snapshots from `calibrationReportJob`
- Feeds into: Model weighting, agent feedback, calibration improvements
- Not called in real-time cycles (too slow); references snapshots from previous week

## Prediction Resolution Cycle

**Weekly flow:**

1. Sunday 17:00 — predictionResolutionJob runs
   - Finds all claims with resolution_date <= today
   - Fetches actual close prices
   - Records outcomes (correct/incorrect)

2. Sunday 18:00 — calibrationReportJob runs
   - Reads resolved claims
   - Computes Brier score, confidence buckets, per-sector accuracy
   - Stores snapshot in calibration_snapshots

3. Sunday 20:00+ — Digest & Predict can call get_calibration_report()
   - Latest snapshot available
   - Used to recalibrate model weights

## Recommendations Auto-Generation

Engine auto-generates recommendations based on:
- Over-confident buckets (too many wrong predictions at high confidence)
- Under-confident sectors (good accuracy but low stated confidence)
- Per-source performance (highlight well-calibrated agents)
- Trend (praise improving agents, investigate degrading ones)

---

**Added:** Task 1129 (get_calibration_report MCP tool)
**Status:** STABLE
