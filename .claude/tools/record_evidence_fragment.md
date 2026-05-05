---
name: record_evidence_fragment
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# record_evidence_fragment

Store a directional evidence fragment for a stock from an analysis agent. Called by News Scout, BCTC Collector, Market Watcher, Alert Commander, and other agents to accumulate bullish/bearish/neutral evidence per stock. The nightly evidence accumulator aggregates these into evidence_scores. evidence_type examples: news_sentiment_macro, news_sentiment_stock, bctc_revenue_growth, bctc_pe_ratio, bctc_debt_equity, price_momentum_5d, price_momentum_20d, kinh_dich_signal.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "record_evidence_fragment", {
  // TODO — add sample arguments
});
```

## When to Use

TODO — describe business context for when/why to call this tool

## Related Tools

TODO — list 2-3 complementary tools

## Error Handling

TODO — common error scenarios and recovery strategies

## Notes

- TODO — add any important behavior notes
- TODO — usage constraints or gotchas

## Last Updated

Generated: 2026-05-04 (boilerplate)  
Enriched: TODO
