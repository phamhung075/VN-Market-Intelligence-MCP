---
name: run_backtest
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# run_backtest

Replay historical trading signals against actual OHLCV prices to compute strategy performance metrics. Returns portfolio return, max drawdown, Sharpe ratio, win rate, and a per-ticker breakdown. Requires at least 6 months of OHLCV data for statistically meaningful results — run ohlcv_backfill first if data is sparse. Only 1 backtest can run at a time per server instance.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "run_backtest", {
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
