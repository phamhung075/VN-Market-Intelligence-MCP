---
name: get_macro_calendar
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_macro_calendar

Returns upcoming macro events (FOMC meetings, GSO CPI/GDP releases, Vietnam PMI, SBV policy meetings) within the next N days (default 60). Each event is annotated with isPivotWindow=true when it falls in months 3, 6, 9, or 12 (quarter-end periods of heightened VN market sensitivity). Also returns currentMonthIsPivotWindow, nextPivotWindow label, and a warning if within 14 days of a pivot month.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_macro_calendar", {
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
