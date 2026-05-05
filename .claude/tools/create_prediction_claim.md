---
name: create_prediction_claim
type: tool
package: digest-synthesis
related_tools: get_prediction_accuracy, get_calibration_report
complexity: moderate
---

# create_prediction_claim

Insert a structured, **falsifiable prediction claim for a stock**. Intended to be called by Digest & Predict agent. Used for: (1) creating auditable records of predictions made, (2) tracking prediction accuracy over time, (3) calibrating model confidence levels.

**Key:** `resolution_criteria` must be valid JSON with fields: `metric`, `operator`, `value`, `currency`, `description`. Duplicate claims (same stock + claim_text + resolution_date) are **silently skipped**.

## Arguments

- **stock_code** (string) — **required**
  - Target stock (e.g., "FPT", "ACB", "VNM")

- **claim_text** (string) — **required**
  - Plain-language prediction (max 200 chars). Example: "FPT price reaches 90k VND by 2026-06-30"

- **conviction** (number) — **required**, range: 0-1
  - Your confidence in this prediction. Used for calibration; higher conviction predictions must be more accurate.

- **resolution_criteria** (object) — **required**
  - Structured resolution rules. Example:
  ```json
  {
    "metric": "closing_price",
    "operator": ">=",
    "value": 90000,
    "currency": "VND",
    "description": "Stock closes at or above 90k VND"
  }
  ```

- **resolution_date** (string) — **required**, ISO format
  - When this claim resolves (e.g., "2026-06-30")

- **reasoning** (string) — optional, max 500 chars
  - Why you made this prediction. Useful for post-resolution analysis.

- **source_signals** (array) — optional
  - Array of signal IDs that informed this prediction. Enables impact tracing.

## Return Type

```typescript
{
  success: boolean,
  claim_id: string,
  stock_code: string,
  created_at: string,
  status: "created" | "duplicate_skipped",
  resolution_date: string,
  conviction: number,
  timestamp: string
}
```

## Example Usage

### Digest & Predict — Weekly Prediction Synthesis
```typescript
// After analyzing all signals this week, create predictions
const predictions = [
  {
    stock: "FPT",
    claim: "FPT breaks above 90k resistance",
    conviction: 0.72,
    criteria: {
      metric: "closing_price",
      operator: ">=",
      value: 90000,
      currency: "VND",
      description: "Close >= 90k VND"
    },
    resolution_date: "2026-05-25",
    reasoning: "Strong earnings (Q1 +22% revenue), insider buying (CEO 5M shares), sector rotation bullish (tech inflow). Resistance at 85-90k should break."
  },
  {
    stock: "VIC",
    claim: "VIC dividend yield >= 4% by year-end",
    conviction: 0.68,
    criteria: {
      metric: "dividend_yield",
      operator: ">=",
      value: 0.04,
      currency: "unitless",
      description: "Annual dividend yield >= 4%"
    },
    resolution_date: "2026-12-31",
    reasoning: "Retail sector stabilizing (2026 +3.2% revenue growth), management committed to high payout ratio (30-40%)."
  }
];

// Create each prediction claim
for (const pred of predictions) {
  const claim = await call_tool("vn-market", "create_prediction_claim", {
    stock_code: pred.stock,
    claim_text: pred.claim,
    conviction: pred.conviction,
    resolution_criteria: pred.criteria,
    resolution_date: pred.resolution_date,
    reasoning: pred.reasoning,
    source_signals: ["sig_2026050412345", "sig_2026050412346"]  // From analysis
  });

  console.log(`Created prediction: ${claim.claim_id} for ${pred.stock} (${(pred.conviction * 100).toFixed(0)}% conviction)`);
}

// Send digest to Telegram
await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: `📈 **Weekly Predictions\n${predictions.map(p => `• ${p.stock}: ${p.claim} (${(p.conviction * 100).toFixed(0)}%)`).join("\n")}`
});
```

### Calibration Model — Conviction Accuracy Tracking
```typescript
// After resolution date passes, check accuracy
const pastClaims = []; // Fetch from DB after 2026-05-25

for (const claim of pastClaims) {
  const currentPrice = await call_tool("vn-market", "get_market_snapshot", {
    stock: claim.stock_code
  });

  const resolved = claim.criteria.operator === ">="
    ? currentPrice.price >= claim.criteria.value
    : currentPrice.price < claim.criteria.value;

  // Track: conviction 0.72, prediction was correct/incorrect
  // This trains the calibration model: "72% claims usually hit 72% of the time"
  console.log(`Claim ${claim.claim_id}: conviction ${claim.conviction.toFixed(2)}, resolved: ${resolved}`);
}

// Get calibration report to see if we're overconfident or underconfident
const calib = await call_tool("vn-market", "get_calibration_report", {});
console.log(`Current calibration: ${calib.overall_accuracy}% accurate`);
// If we're 72% confident but only 60% accurate, raise future conviction thresholds
```

### Multi-Agent Prediction Chain
```typescript
// News Scout detects bullish news for FPT
const newsSignal = {
  stock: "FPT",
  headline: "FPT wins major cloud contract with VietBank",
  impact: 0.82
};

// News Scout → Financial Analyst (cascades for BCTC validation)
await call_tool("vn-market", "post_agent_signal", {
  agent: "financial-analyst",
  signal_type: "urgent_news",
  confidence: 0.82,
  data: newsSignal
});

// Financial Analyst validates with BCTC, then passes to Digest & Predict
const bctc = await call_tool("vn-market", "get_bctc_full", { stock: "FPT" });
if (bctc.report.revenue_growth_yoy > 1.20) {
  // Analyst confirms: news + BCTC growth
  await call_tool("vn-market", "post_agent_signal", {
    agent: "digest-predict",
    signal_type: "verified_chain",
    confidence: 0.78,
    data: { ...newsSignal, bctc_validation: "Revenue +22% YoY" }
  });
}

// Digest & Predict synthesizes: news + BCTC → creates high-conviction prediction
const prediction = await call_tool("vn-market", "create_prediction_claim", {
  stock_code: "FPT",
  claim_text: "FPT reaches 95k VND (new ATH) by 2026-06-30",
  conviction: 0.78,
  resolution_criteria: {
    metric: "closing_price",
    operator: ">=",
    value: 95000,
    currency: "VND",
    description: "Close >= 95k"
  },
  resolution_date: "2026-06-30",
  reasoning: "Bullish news (VietBank cloud contract) + BCTC validation (Q1 +22% revenue) + insider buying signals. Cloud services are high-margin growth driver.",
  source_signals: ["sig_news_vietbank", "sig_bctc_fpt_q1"]
});

console.log(`Prediction created: ${prediction.claim_id}`);
```

## When to Use

- **Weekly/monthly synthesis** — Digest & Predict creates predictions from aggregated signals
- **After major thesis shifts** — When conviction changes, update with new prediction
- **For calibration** — Every prediction feeds accuracy model for future threshold tuning
- **Audit trail** — All predictions are permanent records (good for post-mortem analysis)
- **NOT real-time** — Create predictions on scheduled cycles, not on every signal

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_prediction_accuracy` | Check your track record on past predictions |
| `get_calibration_report` | See if your conviction levels are well-calibrated |
| `send_telegram` | Announce predictions to MARKET channel for user visibility |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `status: "duplicate_skipped"` | Exact same claim already exists | Normal; silently skipped to avoid duplicates |
| `conviction > 1 or < 0` | Invalid range | Clamp to [0, 1] or fail with validation error |
| `resolution_criteria: invalid JSON` | Malformed resolution spec | Validate JSON before calling |
| `resolution_date < today` | Past resolution date | Use future date or mark as historical test |

## Notes

- **Falsifiability:** Predictions must be testable against market data. Vague claims won't resolve.
- **Conviction discipline:** Track your accuracy at each conviction level. Overconfident? Reduce future conviction ceilings.
- **Source linking:** Include `source_signals` to enable impact tracing: "Did the news actually drive the price move?"
- **Deduplication:** Duplicate claims (same stock + text + resolution_date) silently skipped. Useful for idempotent workflows.
- **Resolution window:** Typical prediction windows: 1-4 weeks for technical targets, 3-12 months for fundamental thesis.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, calibration tracking, multi-agent chain)
