---
name: get_user_positions_for_analysis
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_user_positions_for_analysis

Return enriched position data for Cowork analysis agents. Each position includes: qty, avg_cost, current price (from market_prices), absolute and percentage P&L (null if no live price), stop-loss floor (avg_cost × 0.93), and TP ladder (+10%/+20%/+30%). Optional ticker filter narrows results to a single stock. Returns an empty JSON array when the portfolio has no open positions.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_user_positions_for_analysis", {
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
