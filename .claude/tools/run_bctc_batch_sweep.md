---
name: run_bctc_batch_sweep
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# run_bctc_batch_sweep

Trigger a BCTC quarterly report batch sweep for all watchlist tickers (default: 30). Fetches BCTC data for each ticker concurrently (max 5 at a time). Per-ticker failures are isolated — one failure does not abort the batch. Sends a completion digest to the MARKET channel and individual failure alerts to BUG channel. Use dry_run=true to preview the ticker list without triggering any fetches. Returns: { processed, succeeded, failed, failures: [{ticker, reason}], digestSent, durationMs }



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "run_bctc_batch_sweep", {
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
