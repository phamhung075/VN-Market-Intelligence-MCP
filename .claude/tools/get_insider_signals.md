---
name: get_insider_signals
type: tool
package: financial-analysis, market-analyst-research
related_tools: get_bctc_full, get_earnings_calendar, get_insider_transactions
complexity: moderate
---

# get_insider_signals

Analyze executive insider trading (mua bán cổ phiếu của lãnh đạo công ty) and generate buy/sell/mass-buy signals for stocks. Insider buying especially for large blocks is strong bullish signal; mass selling indicates concerns.

## Arguments

- **days_back** (number) — optional, default: 30
  - Time window for insider transactions (in days). Typical: 30 for recent trends, 90 for seasonal patterns.

- **min_volume_vnd** (number) — optional, default: 1000000000 (1B VND)
  - Minimum transaction value to consider "significant" insider trade. Filters out noise.

- **include_directors** (boolean) — optional, default: true
  - Include board member transactions. If false, only C-level executives (CEO, CFO, etc.).

## Return Type

```typescript
{
  success: boolean,
  signals: Array<{
    stock_code: string,
    signal_type: "buy" | "sell" | "mass_buy" | "concern",
    confidence: number,  // 0-1
    reasoning: string,
    transactions: Array<{
      exec_name: string,
      exec_title: string,
      action: "buy" | "sell",
      shares: number,
      price_vnd: number,
      volume_vnd: number,
      date: string
    }>,
    historical_accuracy?: number  // From calibration model
  }>,
  timestamp: string
}
```

## Example Usage

### Financial Analyst — Insider Signal Integration
```typescript
const insiderSignals = await call_tool("vn-market", "get_insider_signals", {
  days_back: 30,
  min_volume_vnd: 2000000000,  // Require significant trades
  include_directors: true
});

// Match insider signals with BCTC earnings
const bctcData = await call_tool("vn-market", "get_bctc_full", {
  stock: "FPT",
  quarter: "2026-Q1"
});

// Synthesize: insider buying + earnings beat → strong bullish
for (const signal of insiderSignals.signals) {
  if (signal.signal_type === "mass_buy" && signal.confidence >= 0.75) {
    const matchingBCTC = bctcData.report;
    if (matchingBCTC && matchingBCTC.revenue_yoy > 1.15) {
      // Confirmed: insider buying + growth → cascade to alert commander
      await call_tool("vn-market", "post_agent_signal", {
        agent: "alert-commander",
        signal_type: "verified_chain",
        confidence: 0.82,
        data: {
          stock: signal.stock_code,
          insider_reason: signal.reasoning,
          earnings_beat: `Revenue +${(matchingBCTC.revenue_yoy * 100 - 100).toFixed(1)}% YoY`,
          recommendation: "watchlist_opportunity"
        }
      });
    }
  }
}
```

### Market Analyst — Quarterly Insider Pattern Review
```typescript
// Track insider activity by sector and quarter
const allInsiders = await call_tool("vn-market", "get_insider_signals", {
  days_back: 90,  // Full quarter
  min_volume_vnd: 500000000  // Lower threshold for pattern analysis
});

// Group by signal type and sector
const bySignalType = {};
for (const sig of allInsiders.signals) {
  const sector = getStockSector(sig.stock_code);
  const key = `${sector}:${sig.signal_type}`;
  if (!bySignalType[key]) bySignalType[key] = { count: 0, confidence: 0 };
  bySignalType[key].count += 1;
  bySignalType[key].confidence = (bySignalType[key].confidence + sig.confidence) / 2;
}

// Report sector rotation signals
console.log("Insider activity by sector (Q1 2026):");
Object.entries(bySignalType).forEach(([key, data]) => {
  console.log(`  ${key}: ${data.count} signals, avg confidence ${data.confidence.toFixed(2)}`);
});

// Post as research signal
await call_tool("vn-market", "post_agent_signal", {
  agent: "digest-predict",
  signal_type: "verified_chain",
  confidence: 0.68,
  data: { analysis: "insider_activity_by_sector", patterns: bySignalType }
});
```

### Alert Commander — Insider Mass-Buy Escalation
```typescript
// High-priority insider signals trigger immediate alert
const insiders = await call_tool("vn-market", "get_insider_signals", {
  days_back: 14,  // Recent only
  min_volume_vnd: 5000000000  // Very high threshold for mass buys
});

for (const sig of insiders.signals) {
  if (sig.signal_type === "mass_buy" && sig.confidence >= 0.80) {
    // Insider mass-buy is rare and high-signal
    const message = `🚀 Insider Mass-Buy: ${sig.stock_code}\n${sig.reasoning}\nConfidence: ${(sig.confidence * 100).toFixed(0)}%`;

    await call_tool("vn-market", "send_telegram", {
      channel: "market",
      message: message
    });

    await call_tool("vn-market", "record_signal_outcome", {
      signal_id: sig.stock_code,
      outcome: "alert_sent",
      conviction: sig.confidence,
      reasoning: `Insider mass-buy triggered automatic alert`
    });
  }
}
```

## When to Use

- **At financial analysis cycles** — Financial Analyst includes insider signals in BCTC fundamental check
- **For cascade validation** — Insider buying + BCTC earnings beat = strong chain signal
- **Quarterly reviews** — Market Analyst reviews sector-level insider activity
- **For rare signals** — Insider mass-buy is high-confidence bullish → quick alert
- **NOT for daily noise** — Most insider trades are routine; use `min_volume_vnd` to filter

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_bctc_full` | Match insider trades with quarterly earnings reports |
| `get_earnings_calendar` | Track insider activity around earnings dates |
| `get_insider_transactions` | Raw transaction-level data (this tool provides analyzed signals) |
| `record_signal_outcome` | Track insider signal accuracy for calibration |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `signals: []` | No insider trades in window | Proceed; insider activity is sparse and meaningful only when present |
| `confidence: 0-0.3` | Very low-signal transaction | Filter out by raising `min_volume_vnd` |
| `historical_accuracy: null` | New signal type, no calibration yet | Accept but log confidence as estimate only |

## Notes

- **Insider buying > selling** — Single insider buy of 10B VND is stronger signal than 10 sells of 1B each
- **Sector patterns** — When multiple execs in same sector buy, confidence increases (validated insider intelligence)
- **Timing edge:** Insider trades 1-5 days before major announcements; early detection is valuable
- **Legal requirement:** All insider trades public in Vietnam within 2 business days
- **Calibration:** Historical accuracy improves as more transactions resolve (match with future stock price changes)

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 3 workflow examples, sector rotation, mass-buy escalation)
