# record_evidence_fragment

**Purpose:** Record a directional evidence fragment for a stock from an analysis agent. Called by News Scout, BCTC Analyst, Market Watcher, Alert Commander, and other agents to accumulate bullish/bearish/neutral evidence per stock. The nightly evidence accumulator aggregates these into `evidence_scores`; `baseRateComputationJob` further aggregates into `evidence_likelihood_ratios`.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `stock` | `string` | Stock ticker, e.g. `"VCB"` (or `"MARKET"` for market-wide/non-ticker-specific evidence) |
| `evidence_type` | `string` | Soft enum — no DB constraint, but reuse an ACTUAL seeded type where possible (e.g. `news_sentiment_stock`, `news_sentiment_macro`, `bctc_valuation_premium`, `bctc_roe_strong`, `bctc_roe_ratio`, `bctc_regulatory_compliance`, `bctc_report_overdue`, `bctc_net_profit`, `price_momentum_5d`, `price_momentum_20d`, `kinh_dich_signal`, `foreign_flow_institutional`). See `docs/architecture-briefs/2026-07-01-BA-PREDICTION-EVIDENCE-REVIVAL.md` §0-C3 for the live-verified seeded set — do not invent new type names without checking it first. |
| `direction` | `"bullish"\|"bearish"\|"neutral"` | Direction of the evidence signal |
| `magnitude` | `number` | Strength of the evidence: 0.0 (weak) to 1.0 (strong) |
| `confidence` | `number` | Confidence in this evidence: 0.0 to 1.0 |
| `source_agent` | `string` | Agent producing this fragment, e.g. `"news-scout"`, `"bctc-analyst"`, `"market-watcher"` |
| `ttl_days` | `number` (optional) | Days before this fragment expires. Default: 30 |

**Returns:** Fragment ID and storage confirmation.

**Example:**
```javascript
call_tool(server="vn-market", tool="record_evidence_fragment", arguments={
  "stock": "VCB",
  "evidence_type": "news_sentiment_stock",
  "direction": "bullish",
  "magnitude": 0.6,
  "confidence": 0.7,
  "source_agent": "news-scout",
  "ttl_days": 7
})
```

**Note (corrected 2026-07-01, TASK-EVIDENCE-HOP2-AGENTS):** this doc previously described a `thesis_id`/`content`/`source` contract that does not match the live tool schema (`apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:77-122`, live-verified). The parameter table above is the correct, currently-shipped contract.

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern | `get_evidence_summary` — read the current evidence picture for a stock.
