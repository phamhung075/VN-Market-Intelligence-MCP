---
name: get_foreign_flow
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_foreign_flow

Retrieve and analyze foreign investor flow history for a VN stock. Returns direction (net_buy / net_sell / neutral), severity (LOW/MEDIUM/HIGH), consecutive streak days, net volume over 3d and 5d windows, holding ratio change, and a daily history table. Severity HIGH = 3+ consecutive days in same direction AND total net volume > 100k shares. If foreign flow data has not been collected yet (all volumes are 0), returns a clear no-data message. Data freshness depends on the VPS push-foreign-flow pipeline (Task 1132/1135).



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_foreign_flow", {
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
