---
name: get_evidence_summary
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_evidence_summary

Returns the current evidence picture for a single stock: latest evidence scores, top 5 contributing fragments by magnitude*confidence, and applicable likelihood ratios from evidence_likelihood_ratios for the bullish direction at 10-day horizon. If no evidence has been accumulated yet for the stock, returns a clear message. Data is at most 23 hours stale (sourced from nightly evidence_scores aggregate).



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_evidence_summary", {
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
