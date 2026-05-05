---
name: get_prediction_accuracy
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_prediction_accuracy

Returns retrospective accuracy metrics for Polymarket prediction signals — how often volume_spike or probability_shift signals actually predicted VN stock moves. Precision = confirmed / (confirmed + false_positive). Outcomes are validated weekly by comparing signal direction against ±2% price moves in the 48h window.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_prediction_accuracy", {
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
