---
name: get_insider_transactions
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_insider_transactions

Return insider transaction history from SSC disclosures. Includes on-the-fly streak detection for accumulation patterns (>= 2 distinct buy days by same insider). If code is omitted, returns all watchlist stocks. Data is populated by insiderCheckJob (daily 08:00 VN time, Task 1145).



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_insider_transactions", {
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
