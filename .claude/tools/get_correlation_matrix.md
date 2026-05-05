---
name: get_correlation_matrix
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_correlation_matrix

Tính ma trận tương quan Pearson cho tất cả cặp cổ phiếu trong watchlist. Sử dụng lịch sử giá tích lũy trong SQLite (market_prices_history). Trả về bảng tương quan có phân loại mức độ (rất thấp / thấp / trung bình / cao / rất cao) và điểm đa dạng hóa danh mục (0-1). Compute Pearson correlation matrix for all watchlist stock pairs using price history.



## Return Type

TODO — describe what this tool returns (see MCP schema)

## Example Usage

```typescript
// TODO — add call_tool() example
const result = await call_tool("vn-market", "get_correlation_matrix", {
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
