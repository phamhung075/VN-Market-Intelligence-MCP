---
name: trigger_news_vps_fetch
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# trigger_news_vps_fetch

Manually triggers a news RSS fetch run on the Vinahost VPS for diagnosis. Returns pipeline state: which sources are configured, RSS URLs, push endpoint status. Use dry_run=true to inspect without triggering SSH. Service: vn-news-fetch.service (every 15min, 10 RSS sources + Playwright for bot-guarded). Returns: { service, attempted, success, failed: [{source, reason}], log_tail }



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "trigger_news_vps_fetch", {
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
