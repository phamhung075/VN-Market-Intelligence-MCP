---
name: get_market_message_digest
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_market_message_digest

Returns a grouped digest of unreviewed MARKET channel messages, grouped by date and sending agent. Use this first thing in the morning to see what fired overnight. Each entry shows a count and a preview. Use the ids from each entry with batch_review_market_messages to label them all at once. limit_days controls how many calendar days back to look (default 7).



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_market_message_digest", {
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
