# get_market_breadth

**Purpose:** Fetch HOSE market breadth and liquidity for the latest session.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| — | — | No parameters |

**Returns:** advances (mã tăng), declines (mã giảm), noChange (mã đứng), noTrade (mã không khớp), ceilingStocks (mã trần), floorStocks (mã sàn). Liquidity: totalTurnoverBn (tổng thanh khoản tỷ đồng), nmTurnoverBn (khớp lệnh), ptTurnoverBn (thoả thuận), turnoverDeltaPct (% thay đổi so hôm qua)…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_market_breadth", arguments={})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
