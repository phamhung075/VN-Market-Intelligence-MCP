---
name: get_calibration_report
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_calibration_report

Returns the latest weekly calibration report for the prediction engine. Shows overall Brier score, breakdown by agent/stock/direction, calibration curve (predicted probability vs actual hit rate), trend vs last week, and top/worst predictions. Data is at most 7 days stale (written weekly Sunday 20:00 VN). If no snapshots exist yet (first 1-2 weeks after Phase C deploy), returns a clear message. Pass date= to retrieve a specific Sunday's historical report.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_calibration_report", {
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
