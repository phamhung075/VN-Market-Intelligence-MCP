# get_volatility_indicators

**Purpose:** VN-Index realized volatility + regime band for P1 Fear & Greed gauge.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `tickers` | `array<string>` | Optional list of stock tickers (e.g. ['FPT','VCB']) to compute per-ticker ATR%(14). When omitted, only market-wide VN-Index volatility metrics are returned. |

**Returns:** (1) rv_10d_pct / rv_20d_pct / rv_60d_pct — annualized realized volatility (log-returns);     rv_60d null until Sprint-0 backfill provides ≥61 bars; (2) gk_vol_20d_pct — Garman-Klass estimator rolling 20d; (3) vol_regime — LOW/NORMAL/ELEVATED/CRISIS label from percentile rank; (4) vol_regime_pct — the percentile rank (0–1) used for regime classification…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_volatility_indicators", arguments={
  "tickers": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
