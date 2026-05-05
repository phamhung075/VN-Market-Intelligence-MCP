---
name: get_yield_spread_signal
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_yield_spread_signal

Computes the yield spread signal for the Dinh Gia (valuation) layer of the Trần Ngọc Báu macro framework (Phase 2). Reads the market earnings yield from tracked_indicators (source: bau_phase2) and the SBV max deposit rate from sbv_rates, then classifies the spread into one of: CHEAP (spread >2pp), FAIRLY_VALUED (0 < spread ≤ 2pp), EXPENSIVE (spread ≤ 0), or UNKNOWN (data unavailable). Returns label, spread, earningYield, depositRate, reasoning, and computedAt.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_yield_spread_signal", {
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
