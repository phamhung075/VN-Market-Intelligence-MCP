---
name: get_label_accuracy_report
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_label_accuracy_report

Returns per-agent signal accuracy computed from human verdict labels on MARKET channel messages. Each row shows how often an agent's messages were labelled 'signal' vs 'noise' by the user. Use this alongside get_calibration_report to understand which agents generate genuine signals. since_days controls the lookback window (default 90 days, matching the calibration engine window).



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_label_accuracy_report", {
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
