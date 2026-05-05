---
name: bctc_skip_queue_item
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# bctc_skip_queue_item

Mark a BCTC queue item as SKIPPED (PDF not found on VPS fetch). Increments the attempts counter and records last_attempt timestamp. Called by the VPS fetch-bctc.sh script when a PDF fetch returns 404 or fails. Prevents infinite retry loops by transitioning status from pending to skipped.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "bctc_skip_queue_item", {
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
