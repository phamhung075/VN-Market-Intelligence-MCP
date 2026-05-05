---
name: get_market_snapshot
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_market_snapshot

Fetch live market prices from all Vietnamese exchanges (HOSE, HNX, UPCOM). Optionally provide a list of stock codes to look up; if omitted or empty, only the VN-Index benchmark is fetched. Each exchange fetch is error-isolated so a single exchange failure does not block results from the others.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_market_snapshot", {
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
