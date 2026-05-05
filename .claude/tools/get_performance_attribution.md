---
name: get_performance_attribution
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_performance_attribution

Performance attribution: shows which signal types drove the best investment returns. For each signal type (price_drop, price_surge, news_mention, etc.), shows total alerts, hit count (correct direction), miss count (wrong direction), average 3-day return %, and win rate. Directional signals (price_drop/price_surge) are scored; neutral signals (news_mention) are counted but not scored. Output is a Vietnamese formatted attribution table.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_performance_attribution", {
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
