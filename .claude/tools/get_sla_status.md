---
name: get_sla_status
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_sla_status

Returns formatted table showing data freshness SLA status for all 5 signal sources (price, bctc, news, sbv_fx, foreign_flow). Shows current data age in minutes, SLA threshold, breach status (ok/breached), and severity (-, HIGH, CRITICAL). Useful for monitoring data pipeline health and detecting stale sources.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_sla_status", {
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
