---
name: get_carry_trade_signal
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_carry_trade_signal

Computes the VND carry trade signal for the Thien Thoi (global liquidity) layer of the Trần Ngọc Báu macro framework. Reads the SBV max deposit rate from sbv_rates and the US Fed Funds rate from tracked_indicators (source: FRED), then classifies the carry spread into one of: HOT_MONEY_INFLOW (spread >2.5%), NEUTRAL (0.5–2.5%), FII_OUTFLOW_RISK (<0.5%). Returns regime, carrySpread, vndDepositRate, fedFundsRate, reasoning, and computedAt.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_carry_trade_signal", {
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
