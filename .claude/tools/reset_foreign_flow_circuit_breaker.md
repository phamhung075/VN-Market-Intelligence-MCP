---
name: reset_foreign_flow_circuit_breaker
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# reset_foreign_flow_circuit_breaker

Manually reset the foreign flow circuit breaker to closed state. Only call if OPS has confirmed the underlying issue is fixed (e.g., VPS endpoint responding). Warning: idempotent, but only use after verifying the pipeline is healthy. No parameters required.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "reset_foreign_flow_circuit_breaker", {
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
