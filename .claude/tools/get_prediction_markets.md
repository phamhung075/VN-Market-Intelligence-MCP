---
name: get_prediction_markets
type: tool
package: digest-synthesis, market-analyst-research
related_tools: create_prediction_claim, get_calibration_report
complexity: moderate
---

# get_prediction_markets

Returns current **Polymarket prediction markets relevant to Vietnamese stocks**, with detected probability shift and volume spike signals. Use **filter='signals_only'** to focus on markets with active anomalies (smart money moves). Markets include: earnings beats/misses, stock price targets, sector rotations, and macro outcomes (USD/VND, oil prices).

## Arguments

- **filter** (enum) — optional, default: "all"
  - `"all"` — Return all active markets
  - `"signals_only"` — Only markets with probability shifts or volume spikes (trader activity)
  - `"resolved"` — Historical markets (for calibration)

- **watchlist_only** (boolean) — optional, default: true
  - If true, filter to markets for watchlist stocks only

- **hours_back** (number) — optional, default: 24
  - Show probability changes over this window

## Return Type

```typescript
{
  success: boolean,
  markets: Array<{
    market_id: string,
    title: string,  // e.g., "FPT closes above 90k VND by May 31"
    outcome_type: "stock_price" | "earnings_beat" | "sector_rotation" | "macro",
    stock_code?: string,
    resolution_date: string,
    current_probability: number,  // Crowd estimate (0-1)
    probability_24h_ago: number,
    probability_change_pct: number,  // % point change (e.g., 0.55 → 0.60 = +5ppt)
    volume_24h_usd: number,
    volume_increase: boolean,  // True if spike detected
    yes_odds: number,  // Decimal odds on YES outcome
    no_odds: number,
    liquidity_usd: number  // Ability to enter/exit position
  }>,
  signal_summary: {
    major_shifts: Array<{  // >5ppt probability move in 24h
      market: string,
      direction: "up" | "down",
      shift_ppt: number,
      volume_signal: "normal" | "spike"
    }>,
    smart_money_markets: Array<string>  // Markets with volume + probability move
  },
  timestamp: string
}
```

## Example Usage

### Digest & Predict — Consensus Check (External Wisdom)
```typescript
// Check if Polymarket consensus aligns with internal predictions
const markets = await call_tool("vn-market", "get_prediction_markets", {
  filter: "all",
  watchlist_only: true,
  hours_back: 24
});

console.log(`Active markets: ${markets.markets.length}`);

// Compare internal conviction vs. crowd probability
const internalPredictions = [
  { stock: "FPT", prediction: "reaches 90k", conviction: 0.75 },
  { stock: "VNM", prediction: "earns beat Q2", conviction: 0.68 }
];

for (const pred of internalPredictions) {
  const crowdMarket = markets.markets.find(m =>
    m.stock_code === pred.stock &&
    m.title.includes(pred.prediction)
  );

  if (crowdMarket) {
    const diff = pred.conviction - crowdMarket.current_probability;
    console.log(`${pred.stock}: Internal ${(pred.conviction * 100).toFixed(0)}%, Crowd ${(crowdMarket.current_probability * 100).toFixed(0)}%, Diff: ${diff > 0 ? "+" : ""}${(diff * 100).toFixed(0)}ppt`);

    // If we're 20+ ppts ahead, we have an edge
    if (Math.abs(diff) > 0.20) {
      const direction = diff > 0 ? "bullish" : "bearish";
      console.log(`  → Potential ${direction} opportunity vs. crowd consensus`);
    }
  }
}
```

### Smart Money Detection — Volume Spikes
```typescript
// Monitor for smart money moves (volume spikes + probability shifts)
const signals = await call_tool("vn-market", "get_prediction_markets", {
  filter: "signals_only",  // Only markets with anomalies
  watchlist_only: true
});

for (const shift of signals.signal_summary.major_shifts) {
  console.log(`💡 Major shift: ${shift.market}`);
  console.log(`   Direction: ${shift.direction} (${shift.shift_ppt}ppt)`);
  console.log(`   Volume: ${shift.volume_signal}`);

  // Smart money signal: volume spike + probability shift (20+ ppts)
  if (shift.volume_signal === "spike" && Math.abs(shift.shift_ppt) >= 20) {
    console.log(`   🔥 Smart money detected!`);

    // Alert team to investigate
    await call_tool("vn-market", "submit_feedback", {
      agent: "digest-predict",
      title: `Smart money signal in Polymarket: ${shift.market}`,
      category: "enhancement",
      detail: `${shift.direction === "up" ? "📈" : "📉"} ${shift.market}: probability ${shift.shift_ppt > 0 ? "+" : ""}${shift.shift_ppt}ppt, high volume. May indicate: (1) institutional trade, (2) insider anticipation, or (3) market mispricing.`,
      to: "@po"
    });
  }
}
```

### Market Analyst — Calibration Check (Resolved Markets)
```typescript
// At month-end, check historical prediction accuracy
const resolved = await call_tool("vn-market", "get_prediction_markets", {
  filter: "resolved",
  watchlist_only: true
});

// Analyze: did high-probability predictions resolve as expected?
let accurate = 0;
let inaccurate = 0;

for (const market of resolved.markets.filter(m => m.resolution_date < new Date().toISOString())) {
  const predicted = market.current_probability > 0.55;  // What market predicted
  const actual = market.yes_odds > 1.0;  // What happened (approximate)

  if (predicted === actual) accurate += 1;
  else inaccurate += 1;
}

const accuracy = accurate / (accurate + inaccurate);
console.log(`Polymarket accuracy: ${(accuracy * 100).toFixed(1)}% (${accurate}/${accurate + inaccurate} correct)`);

// If crowd is >70% accurate, it's a good calibration baseline
if (accuracy > 0.70) {
  console.log("✅ Polymarket is well-calibrated; use as reference for thresholds");
} else {
  console.log("⚠️ Polymarket is miscalibrated; may have systematic bias");
}
```

### Risk Monitor — Black Swan Detection
```typescript
// Detect sudden macro market moves (10+ ppt shift in 24h = unusual)
const markets = await call_tool("vn-market", "get_prediction_markets", {
  filter: "all",
  watchlist_only: false  // Look at macro markets too
});

// Filter to macro markets
const macroMarkets = markets.markets.filter(m => m.outcome_type === "macro");

// Find black swan candidates (large moves, low liquidity = risk)
const blackSwans = macroMarkets.filter(m =>
  Math.abs(m.probability_change_pct) > 10 &&
  m.liquidity_usd < 50000  // Illiquid = more volatile
);

if (blackSwans.length > 0) {
  console.log(`⚠️ Potential black swan signals detected (${blackSwans.length}):`);
  for (const swan of blackSwans) {
    console.log(`  ${swan.title}: ${Math.abs(swan.probability_change_pct).toFixed(1)}ppt move, low liquidity`);

    // Alert: may indicate tail risk
    await call_tool("vn-market", "post_agent_signal", {
      agent: "alert-commander",
      signal_type: "crisis_velocity",  // Use crisis signal for rare events
      confidence: 0.50,  // Lower confidence due to uncertainty
      data: {
        black_swan_marker: swan.title,
        probability_move: swan.probability_change_pct,
        liquidity: swan.liquidity_usd
      }
    });
  }
}
```

## When to Use

- **Weekly check** — Consensus check against internal predictions
- **Real-time monitoring** — Smart money detection (filter='signals_only')
- **Monthly calibration** — Resolved markets accuracy review
- **Macro risk monitoring** — Black swan detection in USD/oil/macro markets
- **NOT daily** — Polymarket updates slower than stock markets; check 1-2x weekly

## Related Tools

| Tool | Use Case |
|------|----------|
| `create_prediction_claim` | Internal predictions (compare to Polymarket crowd consensus) |
| `get_calibration_report` | Track if your conviction aligns with Polymarket outcomes |
| `post_agent_signal` | Post smart_money or crisis_velocity signals when anomalies detected |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `markets: []` | No Polymarket markets for watchlist (rare for major stocks) | Proceed; Polymarket coverage is selective |
| `liquidity_usd: 0` | Market has zero liquidity | Can't trade; observe-only |
| `probability_change_pct: NaN` | Market just opened (no 24h baseline) | Log to WORK, wait 24h for meaningful signal |

## Notes

- **Crowd wisdom:** Polymarket is generally well-calibrated for macro/political events. Less good for illiquid/niche markets.
- **Smart money markers:** Volume spike + 20+ ppt probability move = potential insider/institutional positioning.
- **Liquidity matters:** Low-liquidity markets (< $50k) are volatile and thin. Avoid basing decisions solely on illiquid markets.
- **Resolution time:** Markets must have active trading right up to resolution date. Markets that stop trading early may diverge from spot price.
- **Calibration:** Compare Polymarket consensus (resolved outcomes) to your internal models. Use the gap to adjust future thresholds.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, smart money detection, black swan monitoring)
