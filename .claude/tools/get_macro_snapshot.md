---
name: get_macro_snapshot
type: tool
package: market-analysis, financial-analysis, unified-coordination
related_tools: get_market_context, get_sector_rotation, get_supply_chain_exposure, get_energy_grid_signals
complexity: moderate
---

# get_macro_snapshot

Fetch live macro indicators: commodity prices (Brent crude, gold, USD/VND) from Yahoo Finance and central bank rates (overnight, refinancing, official FX) from the State Bank of Vietnam (SBV). Returns a formatted macro intelligence summary with signal cascade indicators for energy, gold, banking, real estate and aviation sectors. **Each source fetch is independently error-isolated** — if Yahoo fails, SBV data still returned.

## Arguments

- **include_signals** (boolean) — optional, default: true
  - Include sector cascade signals (energy bullish if oil up, etc.). If false, return raw macro data only.

- **hours_back** (number) — optional, default: 24
  - How far back to fetch data for trend analysis. Typical: 24 for 1-day trends, 168 for weekly.

## Return Type

```typescript
{
  success: boolean,
  macro: {
    commodities: {
      brent_usd_per_barrel: number,
      brent_1d_change_pct: number,
      gold_usd_per_oz: number,
      gold_1d_change_pct: number
    },
    fx: {
      usdvnd: number,
      usdvnd_1d_change_pct: number,
      usd_strength_signal: "strong" | "neutral" | "weak"  // vs basket of currencies
    },
    rates: {
      overnight_rate: number,  // SBV overnight lending rate
      refinancing_rate: number,
      credit_growth_rate_yoy: number,  // Latest month vs prior year
      trend: "tightening" | "neutral" | "easing"
    },
    sentiment: {
      risk_appetite: "high" | "neutral" | "low",  // Inferred from commodity/FX moves
      inflation_concern: "high" | "neutral" | "low"
    }
  },
  cascades: Array<{
    sector: "energy" | "gold" | "banking" | "real_estate" | "aviation" | "export_oriented",
    signal_type: "bullish" | "bearish" | "neutral",
    reasoning: string,
    affected_stocks?: string[]
  }>,
  errors?: {
    yahoo: string | null,
    sbv: string | null
  },
  timestamp: string
}
```

## Example Usage

### News Scout — Macro Event Detection
```typescript
const macro = await call_tool("vn-market", "get_macro_snapshot", {
  include_signals: true,
  hours_back: 24
});

// Oil spike = export opportunity (VND weakness, shipping cost for importers)
if (macro.macro.commodities.brent_1d_change_pct > 3.0) {
  const signal = {
    headline: `Oil spike +${macro.macro.commodities.brent_1d_change_pct.toFixed(1)}% (${macro.macro.commodities.brent_usd_per_barrel.toFixed(2)}/bbl)`,
    impact: macro.cascades.find(c => c.sector === "energy"),
    opportunity: "Export stocks (GAS, PVD, STB) bullish; import-heavy stocks (VJC, TCH) headwind"
  };

  await call_tool("vn-market", "post_agent_signal", {
    agent: "alert-commander",
    signal_type: "chain_catalyst",  // Macro event cascading through sectors
    confidence: macro.macro.commodities.brent_1d_change_pct > 5.0 ? 0.75 : 0.60,
    data: signal
  });
}

// USD strength = sector rotation (FX headwind for exporters, inflow to banking/real estate)
if (Math.abs(macro.macro.fx.usdvnd_1d_change_pct) > 0.5) {
  console.log(`USD/VND move: ${macro.macro.fx.usdvnd_1d_change_pct > 0 ? "VND weakness" : "VND strength"}`);
  const rotations = macro.cascades.filter(c => ["banking", "export_oriented"].includes(c.sector));
  for (const rotation of rotations) {
    console.log(`  → ${rotation.sector}: ${rotation.signal_type} (${rotation.reasoning})`);
  }
}
```

### Market Watcher — Daily Macro Briefing
```typescript
const macro = await call_tool("vn-market", "get_macro_snapshot", {
  include_signals: false,  // Just raw data for briefing
  hours_back: 168  // Weekly view
});

const briefing = `📊 **Macro Snapshot (Weekly)**

Commodities:
  🛢️ Brent: $${macro.macro.commodities.brent_usd_per_barrel.toFixed(2)}/bbl (${macro.macro.commodities.brent_1d_change_pct > 0 ? "↑" : "↓"} ${Math.abs(macro.macro.commodities.brent_1d_change_pct).toFixed(2)}%)
  🥇 Gold: $${macro.macro.commodities.gold_usd_per_oz.toFixed(2)}/oz (${macro.macro.commodities.gold_1d_change_pct > 0 ? "↑" : "↓"} ${Math.abs(macro.macro.commodities.gold_1d_change_pct).toFixed(2)}%)

FX:
  💱 USD/VND: ${macro.macro.fx.usdvnd.toFixed(2)} (${macro.macro.fx.usdvnd_1d_change_pct > 0 ? "VND weak" : "VND strong"})

Rates:
  📈 Overnight: ${macro.macro.rates.overnight_rate.toFixed(2)}% (trend: ${macro.macro.rates.trend})

Sentiment: Risk appetite ${macro.macro.sentiment.risk_appetite}`;

await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: briefing
});
```

### Financial Analyst — Sector Cascade Validation
```typescript
const macro = await call_tool("vn-market", "get_macro_snapshot", {
  include_signals: true
});

// Match macro signals with BCTC data for validation
for (const cascade of macro.cascades) {
  if (cascade.signal_type === "bullish") {
    const stocks = cascade.affected_stocks || [];
    for (const stock of stocks.slice(0, 3)) {
      // Check if BCTC aligns with macro bullish signal
      const bctc = await call_tool("vn-market", "get_bctc_full", {
        stock: stock,
        quarter: "2026-Q1"
      });

      if (bctc.report?.revenue_yoy > 1.10) {
        // Bullish macro + BCTC growth = strong validation
        await call_tool("vn-market", "post_agent_signal", {
          agent: "alert-commander",
          signal_type: "verified_chain",
          confidence: 0.78,
          data: {
            stock,
            macro_catalyst: cascade.reasoning,
            bctc_validation: `Revenue +${((bctc.report.revenue_yoy - 1) * 100).toFixed(1)}% YoY`
          }
        });
      }
    }
  }
}
```

## When to Use

- **Daily/hourly macro updates** — Market Watcher checks for commodity/FX shifts
- **News analysis** — News Scout validates headlines against macro context
- **Sector rotation detection** — Cascades feed Market Watcher sector rotation logic
- **Credit/liquidity analysis** — Financial Analyst uses rates for valuation context
- **NOT for real-time alerts** — Macro changes are slower; check hourly, not per-minute

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_market_context` | Includes macro in compound context snapshot |
| `get_sector_rotation` | Sector rotation may be driven by macro (oil up → energy bullish) |
| `get_supply_chain_exposure` | Cross-reference macro FX moves with supply chain sensitivity |
| `get_energy_grid_signals` | Energy sector deep-dive if oil signals are high |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `macro: null, errors.yahoo: "timeout"` | Yahoo Finance unreachable | Use cached commodity prices, proceed with SBV data only |
| `macro: null, errors.sbv: "parsing error"` | SBV page format changed | Log to WORK @ops, use cached rates |
| `commodities.brent_usd_per_barrel: -1` | Data fetch failed but was masked | Sentinel value indicates stale data; use prior snapshot |
| Both `errors.yahoo` and `errors.sbv` present | Full macro pipeline failure | Submit feedback to @ops; fall back to last-known snapshot |

## Notes

- **Independent source isolation:** Yahoo failure doesn't block SBV data. Partial data is better than none.
- **Caching:** Macro data cached for 60 minutes (macro changes slowly). First call per hour hits sources; others return cached.
- **Cascade thresholds:** Oil > 3% → energy bullish; USD/VND > 0.5% → FX cascade
- **Signal confidence:** Shorter timeframes (1-day) lower confidence; add `hours_back: 168` for weekly trends
- **Sector mapping:** See `.claude/knowledge/stock-classification.md` for sector→stock mapping

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 3 workflow examples, error isolation, cascade validation)
