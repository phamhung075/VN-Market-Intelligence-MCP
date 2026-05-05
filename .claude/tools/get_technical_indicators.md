---
name: get_technical_indicators
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_technical_indicators

Compute RSI(14), MACD(12,26,9), MA(5/20/50), and Bollinger Bands(20,2σ) for a VN stock ticker using existing price history. Returns a Vietnamese-friendly plain-text report with a TANG/GIAM/TRUNG TINH conclusion block. Reads from the local market_prices_history table — no new data fetches.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_technical_indicators", {
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
