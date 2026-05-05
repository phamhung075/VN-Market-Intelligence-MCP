---
name: batch_review_market_messages
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# batch_review_market_messages

Labels a list of MARKET channel messages with a single verdict in one call. Pass the ids from get_market_message_digest. Use verdict='noise' to clear low-value overnight messages, 'signal' for genuine alerts. Returns a count of how many were updated and which ids were not found.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "batch_review_market_messages", {
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
