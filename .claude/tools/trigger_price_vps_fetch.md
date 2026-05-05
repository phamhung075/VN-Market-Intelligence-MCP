---
name: trigger_price_vps_fetch
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# trigger_price_vps_fetch

Manually triggers a stock price fetch run on the Vinahost VPS for diagnosis. Returns pipeline state: which step would run, source URLs, push endpoint status. Use dry_run=true to inspect without triggering SSH. Use tickers filter to debug a specific stock's price fetch. Service: vn-price-fetch.service (every 60s). Returns: { service, attempted, success, failed: [{ticker, reason}], log_tail }



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "trigger_price_vps_fetch", {
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
