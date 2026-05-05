---
name: run_impact_chain
type: tool
package: news-analysis, market-analyst-research, unified-coordination
related_tools: post_agent_signal, get_sector_rotation, get_cascade_metrics
complexity: complex
---

# run_impact_chain

Run the causal cascade engine on a news headline or event text. Traces the impact from **global/macro level** → **affected sectors** → **specific stocks in your watchlist**. Returns the full reasoning chain with confidence scores at each level. **Core reasoning system for news-to-portfolio impact.**

## Arguments

- **headline** (string) — **required**
  - News headline or event description. Example: "Central Bank cuts overnight rate by 50 bps"

- **event_type** (enum) — **required**
  - Category of event for cascade rules. Options:
    - `"macro"` — FX, rates, inflation, commodities
    - `"policy"` — regulatory, tax, law changes
    - `"news"` — M&A, earnings, scandal, accident
    - `"supply_chain"` — logistics, shortage, geopolitics

- **urgency** (enum) — optional, default: "normal"
  - `"immediate"` — requires fast analysis (market still processing)
  - `"normal"` — standard cascade analysis
  - `"historical"` — post-analysis, for learning

## Return Type

```typescript
{
  success: boolean,
  impact_chain: {
    headline: string,
    event_type: string,
    macro_impact: {
      description: string,
      affected_macro_variables: string[],  // ["overnight_rate", "fx_pressure"]
      direction: "bullish" | "bearish" | "mixed",
      confidence: number  // 0-1, macro level analysis
    },
    sector_cascades: Array<{
      sector: string,
      cascade_reasoning: string,
      direction: "bullish" | "bearish" | "neutral",
      confidence: number,
      affected_stocks: string[],
      opportunity_type: "buy" | "sell" | "trim" | "hold"
    }>,
    watchlist_impact: Array<{
      stock_code: string,
      sector: string,
      price_target_delta_pct?: number,
      conviction: number,
      reasoning: string,
      action: "buy" | "sell" | "hold" | "wait"
    }>,
    reasoning_depth: {
      macro_to_sector_steps: number,
      sector_to_stock_steps: number,
      total_chain_length: number
    },
    alternative_cascades: Array<{  // If impact could go multiple directions
      scenario: string,
      probability: number,
      opposite_recommendation: string
    }>
  },
  confidence_summary: {
    overall_impact_confidence: number,
    data_recency: string,
    cascade_model_version: string
  },
  timestamp: string
}
```

## Example Usage

### News Scout — Breaking News Cascade Analysis
```typescript
const cascadeResult = await call_tool("vn-market", "run_impact_chain", {
  headline: "Vietnam Central Bank cuts overnight lending rate by 50 basis points",
  event_type: "macro",
  urgency: "immediate"
});

console.log(`Impact Chain Analysis:`);
console.log(`  Macro: ${cascadeResult.impact_chain.macro_impact.direction} (${cascadeResult.impact_chain.macro_impact.confidence.toFixed(2)})`);

// Sector-level cascade
for (const sector of cascadeResult.impact_chain.sector_cascades) {
  console.log(`  ${sector.sector}: ${sector.direction} (${sector.confidence.toFixed(2)})`);
  console.log(`    Reasoning: ${sector.cascade_reasoning}`);
  console.log(`    Stocks: ${sector.affected_stocks.join(", ")}`);
}

// Post signal with highest-conviction impacts
const topWatchlist = cascadeResult.impact_chain.watchlist_impact
  .sort((a, b) => b.conviction - a.conviction)
  .slice(0, 3);

for (const impact of topWatchlist) {
  await call_tool("vn-market", "post_agent_signal", {
    agent: "financial-analyst",  // Cascade to analyst for BCTC validation
    signal_type: "chain_catalyst",
    confidence: impact.conviction,
    data: {
      headline: cascadeResult.impact_chain.headline,
      stock: impact.stock_code,
      sector: impact.sector,
      price_target_delta: impact.price_target_delta_pct,
      reasoning: impact.reasoning,
      cascade_chain_length: cascadeResult.impact_chain.reasoning_depth.total_chain_length
    }
  });
}
```

### Financial Analyst — Cascade Validation Against BCTC
```typescript
// News Scout passes chain cascade to analyst
const cascade = {
  headline: "Energy prices surge (Oil +8%)",
  stocks_impacted: ["GAS", "PVD", "BSR"],
  sector_direction: "bullish",
  cascade_conviction: 0.78
};

// Analyst validates cascade against BCTC fundamentals
for (const stock of cascade.stocks_impacted) {
  const bctc = await call_tool("vn-market", "get_bctc_full", {
    stock,
    quarter: "2026-Q1"
  });

  // Energy surge is bullish for exporters, BUT check cost structure
  if (bctc.report && bctc.report.cost_of_goods_pct < 0.4) {
    // Strong margin buffer — oil is tailwind, not headwind
    const validation = "BCTC confirms: low COGS %, oil expense < 20% of cost. Bullish cascade validated.";

    await call_tool("vn-market", "post_agent_signal", {
      agent: "alert-commander",
      signal_type: "verified_chain",  // Upgraded: news → cascade → BCTC validation
      confidence: 0.82,  // Boosted from 0.78
      data: {
        cascade_headline: cascade.headline,
        stock,
        bctc_validation: validation,
        recommendation: "watchlist_opportunity"
      }
    });
  } else {
    // Margin squeeze — oil surge is headwind
    await call_tool("vn-market", "post_agent_signal", {
      agent: "alert-commander",
      signal_type: "suppress",
      confidence: 0.85,
      data: {
        stock,
        reason: "Oil cascade bullish, but BCTC shows high COGS. Margin squeeze risk."
      }
    });
  }
}
```

### Alert Commander — Cascade-Driven Alert Strategy
```typescript
// Use cascade outputs to set watchlist alert levels
const macroEvent = await call_tool("vn-market", "run_impact_chain", {
  headline: "Fed signals 2-3 rate hikes in 2026 (hawkish pivot)",
  event_type: "macro",
  urgency: "immediate"
});

// Bearish macro cascade → lower alert thresholds, wait for confirmation
if (macroEvent.impact_chain.macro_impact.direction === "bearish") {
  const baseThreshold = 0.70;
  const cascadeMultiplier = 1 + (1 - macroEvent.confidence_summary.overall_impact_confidence) * 0.2;
  const raisedThreshold = Math.min(0.90, baseThreshold * cascadeMultiplier);

  console.log(`Bearish cascade detected: Raising alert threshold from ${baseThreshold} to ${raisedThreshold.toFixed(2)}`);

  // Only alert on highest-conviction signals in bearish environment
  const signals = await call_tool("vn-market", "get_agent_signals", {
    agent: "alert-commander"
  });

  for (const sig of signals.signals) {
    if (sig.confidence >= raisedThreshold) {
      // Only send alerts for very high-conviction signals in bearish market
      await call_tool("vn-market", "send_telegram", {
        channel: "market",
        message: `Alert: ${sig.data.stocks[0]} (${(sig.confidence * 100).toFixed(0)}% conviction, bearish macro backdrop)`
      });
    }
  }
}
```

### Market Analyst — Quarterly Cascade Review
```typescript
// Collect all cascades run over last quarter
const cascadeHistory = [];  // Would normally fetch from session logs
const qtrCascades = cascadeHistory.filter(c => c.timestamp.startsWith("2026-Q1"));

// Analyze cascade accuracy: did predicted stocks actually move as predicted?
const accuracy = {
  correct_direction: 0,
  wrong_direction: 0,
  no_move: 0
};

for (const cascade of qtrCascades) {
  const currentPrice = await call_tool("vn-market", "get_market_snapshot", {
    stock: cascade.impacted_stocks[0]
  });

  // Compare predicted vs actual
  const predicted_direction = cascade.sector_cascades[0].direction;  // e.g., "bullish"
  const actual_direction = currentPrice.price_change_pct > 2 ? "bullish" : "bearish";

  if (predicted_direction === actual_direction) accuracy.correct_direction += 1;
  else if (predicted_direction !== actual_direction) accuracy.wrong_direction += 1;
}

// Report cascade model calibration
const calibration = (accuracy.correct_direction / qtrCascades.length).toFixed(2);
console.log(`Q1 cascade accuracy: ${calibration} (${accuracy.correct_direction}/${qtrCascades.length} correct)`);

await call_tool("vn-market", "post_agent_signal", {
  agent: "unified-agent",
  signal_type: "price_confirmation",  // Calibration signal
  confidence: parseFloat(calibration),
  data: {
    cascade_model_accuracy_q1: calibration,
    quarterly_calibration_report: accuracy
  }
});
```

## When to Use

- **On breaking news** — News Scout immediately cascades headlines to portfolio impact
- **Before major signals** — Always run impact chain to understand full reasoning
- **Cascade validation** — Feed results to Financial Analyst for BCTC confirmation
- **Alert threshold tuning** — Cascade results condition Alert Commander thresholds
- **Quarterly model review** — Analyst reviews cascade accuracy for model calibration

## Related Tools

| Tool | Use Case |
|------|----------|
| `post_agent_signal` | Cascade outputs fed as chain_catalyst signals to downstream agents |
| `get_sector_rotation` | Validate cascade predictions against observed sector momentum |
| `get_cascade_metrics` | Review historical cascade accuracy and model version |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `cascade_reasoning: "no_matching_rules"` | Headline doesn't match known cascade patterns | Manual analysis required; treat as low-confidence signal |
| `overall_impact_confidence < 0.4` | Very uncertain cascade (e.g., ambiguous headline) | Wait for more context; don't alert yet |
| `alternative_cascades: many` | Multiple valid interpretations of event | Post both scenarios as separate signals, let downstream agents pick |

## Notes

- **Cascade model:** Rules-based reasoning (not LLM). See `.claude/knowledge/cascade-rules.md` for all patterns.
- **Chain length:** Longer chains (5+ steps) have lower overall confidence. Shorter chains (2-3 steps) are more robust.
- **Macro → Sector → Stock:** Always 3-level cascade. Confidence multiplies at each level (e.g., 0.9 × 0.85 × 0.9 = 0.69 overall).
- **Urgency affects depth:** `urgency: "immediate"` returns 2-level cascade (macro → sector). `urgency: "normal"` includes stock level.
- **Alternative scenarios:** If impact could go both ways (e.g., VND weak = bullish for exporters, bearish for importers), both returned.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — return schema, 4 workflow examples, cascade validation, alert tuning, calibration)
