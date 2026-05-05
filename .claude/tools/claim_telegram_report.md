---
name: claim_telegram_report
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# claim_telegram_report

Đặt quyền sở hữu (ownership lock) cho một báo cáo để tránh hai agent xử lý cùng lúc. Dùng trước khi gọi process_telegram_report. Nếu đã có agent khác claim rồi, trả về thông báo 'Already claimed by {claimant}'.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "claim_telegram_report", {
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
