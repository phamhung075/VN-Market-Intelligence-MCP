---
name: search_similar_context
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# search_similar_context

Semantically search the RAG memory for past analyses similar to a query. Useful for finding historical precedents and building context around an event. Supports filtering by analysis level (global/country/domain/action) or specific stock code. Results are re-ranked by recency-weighted score (REQ_056 Fix C): final_score = cosine_similarity * recency_weight, where recency_weight = max(0.1, 1.0 - (age_days / recency_days) * 0.9).



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "search_similar_context", {
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
