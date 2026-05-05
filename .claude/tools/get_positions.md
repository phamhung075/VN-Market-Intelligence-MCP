---
name: get_positions
type: tool
package: unified-coordination, market-analyst-research
related_tools: get_market_snapshot, get_watchlist, get_portfolio_conviction
complexity: simple
---

# get_positions

List all open stock positions with **live P&L computed from latest market prices**. Displays cost basis, current value, unrealized profit/loss (amount and %) for each position, plus aggregate portfolio totals. Prices sourced from the market_prices table (updated continuously by the intelligence cycle).

## Arguments

- **sort_by** (enum) — optional, default: "value"
  - `"value"` — Positions sorted by current market value (largest first)
  - `"pnl_pct"` — Sorted by return % (best/worst performers first)
  - `"code"` — Alphabetical by stock code

- **include_closed** (boolean) — optional, default: false
  - If true, include recently closed positions (last 30 days) for tax planning

## Return Type

```typescript
{
  success: boolean,
  positions: Array<{
    stock_code: string,
    shares: number,
    cost_basis_vnd: number,  // Total cost (shares × avg_purchase_price)
    current_price_vnd: number,
    current_value_vnd: number,  // shares × current_price
    unrealized_pnl_vnd: number,
    unrealized_pnl_pct: number,
    last_updated: string  // Timestamp of last price update
  }>,
  portfolio: {
    total_cost_basis_vnd: number,
    total_current_value_vnd: number,
    total_unrealized_pnl_vnd: number,
    total_unrealized_pnl_pct: number,
    largest_position: {
      stock_code: string,
      pct_of_portfolio: number
    },
    best_performer: {
      stock_code: string,
      pnl_pct: number
    },
    worst_performer: {
      stock_code: string,
      pnl_pct: number
    }
  },
  timestamp: string
}
```

## Example Usage

### Alert Commander — Daily Position Check
```typescript
// At cycle start, check portfolio health
const positions = await call_tool("vn-market", "get_positions", {
  sort_by: "pnl_pct"
});

console.log(`Portfolio: ${positions.portfolio.total_unrealized_pnl_pct > 0 ? "↑" : "↓"} ${Math.abs(positions.portfolio.total_unrealized_pnl_pct).toFixed(2)}%`);

// Flag any positions with major losses
const losers = positions.positions.filter(p => p.unrealized_pnl_pct < -10);
if (losers.length > 0) {
  console.log(`\n⚠️ Underwater positions (>${10}% loss):`);
  for (const loser of losers) {
    console.log(`  ${loser.stock_code}: ${loser.unrealized_pnl_pct.toFixed(2)}% (${loser.unrealized_pnl_vnd.toLocaleString()} VND)`);

    // Post signal to evaluate stop-loss or hold
    await call_tool("vn-market", "post_agent_signal", {
      agent: "alert-commander",
      signal_type: "price_anomaly",  // Significant loss
      confidence: 0.70,
      data: {
        stock: loser.stock_code,
        loss_pct: loser.unrealized_pnl_pct,
        loss_vnd: loser.unrealized_pnl_vnd,
        action: "evaluate_stop_loss"
      }
    });
  }
}
```

### Market Analyst — Weekly Portfolio Review
```typescript
const positions = await call_tool("vn-market", "get_positions", {
  sort_by: "value"  // Largest positions first
});

// Analyze portfolio concentration
const topThree = positions.positions.slice(0, 3);
const concentrationMsg = `
📊 **Portfolio Review (${new Date().toISOString().split("T")[0]})**

Total Value: ${positions.portfolio.total_current_value_vnd.toLocaleString()} VND
P&L: ${positions.portfolio.total_unrealized_pnl_pct > 0 ? "↑ +" : "↓ "}${Math.abs(positions.portfolio.total_unrealized_pnl_pct).toFixed(2)}% (${positions.portfolio.total_unrealized_pnl_vnd.toLocaleString()} VND)

Top 3 Positions (${(topThree.reduce((a,p) => a + (p.current_value_vnd / positions.portfolio.total_current_value_vnd), 0) * 100).toFixed(1)}% of portfolio):
${topThree.map(p => `  • ${p.stock_code}: ${p.current_value_vnd.toLocaleString()} VND (${p.unrealized_pnl_pct.toFixed(2)}%)`).join("\n")}

Best: ${positions.portfolio.best_performer.stock_code} (${positions.portfolio.best_performer.pnl_pct.toFixed(2)}%)
Worst: ${positions.portfolio.worst_performer.stock_code} (${positions.portfolio.worst_performer.pnl_pct.toFixed(2)}%)
`;

await call_tool("vn-market", "send_telegram", {
  channel: "work",
  message: concentrationMsg
});
```

### Risk Monitor — Drawdown Alert
```typescript
const positions = await call_tool("vn-market", "get_positions", {});

// Check for portfolio drawdown
const maxDrawdown = positions.positions
  .filter(p => p.unrealized_pnl_pct < -15)  // Stocks down > 15%
  .length;

if (maxDrawdown > 2) {
  console.log(`⚠️ Portfolio stress: ${maxDrawdown} positions > 15% underwater`);

  await call_tool("vn-market", "submit_feedback", {
    agent: "market-analyst",
    title: "Portfolio drawdown alert: Multiple positions > 15% loss",
    category: "alert_quality",
    detail: `${maxDrawdown} positions underwater > 15%: ${positions.positions.filter(p => p.unrealized_pnl_pct < -15).map(p => `${p.stock_code} (${p.unrealized_pnl_pct.toFixed(1)}%)`).join(", ")}. Evaluate risk management.`,
    priority: "high",
    to: "@po"
  });
}
```

### Unified Agent — Position-Based Signal Gating
```typescript
// Positions can gate certain signals (e.g., don't buy if already 25% of portfolio)
const positions = await call_tool("vn-market", "get_positions", {
  sort_by: "value"
});

const signals = await call_tool("vn-market", "get_agent_signals", {
  agent: "unified-agent",
  signal_type: "verified_chain"
});

for (const sig of signals.signals) {
  const stock = sig.data.stock_code;
  const existingPos = positions.positions.find(p => p.stock_code === stock);

  if (existingPos) {
    const positionSize = existingPos.current_value_vnd / positions.portfolio.total_current_value_vnd;

    if (positionSize > 0.25) {
      // Already 25%+ of portfolio; suppress buy signals to avoid over-concentration
      console.log(`${stock}: Suppressing buy signal (already ${(positionSize * 100).toFixed(1)}% of portfolio)`);

      await call_tool("vn-market", "post_agent_signal", {
        agent: "alert-commander",
        signal_type: "suppress",
        confidence: 0.85,
        data: {
          stock,
          reason: `Position size ${(positionSize * 100).toFixed(1)}% > 25% threshold. Avoid over-concentration.`
        }
      });
    }
  }
}
```

## When to Use

- **Daily portfolio check** — Alert Commander starts cycle by checking position P&L
- **Weekly reviews** — Market Analyst analyzes concentration and risk
- **Risk gates** — Use position sizes to suppress signals that would over-concentrate
- **Tax planning** — Include `include_closed: true` at year-end for tax loss harvesting
- **NOT real-time** — Position values are snapshot at last price update; check daily, not per-minute

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_market_snapshot` | Individual stock prices (this tool aggregates to portfolio level) |
| `get_watchlist` | Target holdings (position sizes relative to watchlist allocation targets) |
| `get_portfolio_conviction` | Overall portfolio bullish/bearish stance (compare vs conviction on individual positions) |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `positions: []` | No open positions (all cash) | Proceed; this is a valid state |
| `unrealized_pnl_pct: null` | Price data stale or missing | Use last-known price; log to WORK |
| `portfolio: {total_current_value: 0}` | Price fetch failed | Proceed with prior snapshot |

## Notes

- **Live calculation:** Current value = shares × current_price. No transaction fees applied (displayed value assumes cost basis is actual cost, not commission-adjusted).
- **Price freshness:** Values reflect latest price from market_prices table. If market is closed or VPS down, values are stale.
- **Closed positions:** Default excludes them. Enable `include_closed: true` for realized P&L tracking (useful for tax planning).
- **Concentration:** Risk management rule: single position < 30%, sector < 50%, avoid > 30% cash drag.
- **Rebalancing:** Use position data to identify rebalancing needs (e.g., losers underperforming, winners running too large).

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, drawdown detection, concentration gating)
