# batch_review_market_messages

**Purpose:** Batch label multiple market messages as signal/noise

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `message_ids` | `string[]` | IDs to review |
| `label` | `string` | signal|noise |

**Returns:** Updated count and status

**Example:**
```javascript
call_tool(server="vn-market", tool="batch_review_market_messages", arguments={
  "message_ids": ..., "label": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
