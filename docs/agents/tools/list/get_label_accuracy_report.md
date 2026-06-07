# get_label_accuracy_report

**Purpose:** Get accuracy report for signal labels (market-analyst)

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `signal_type` | `string` | Signal type to review |

**Returns:** Precision, recall, F1 score by label

**Example:**
```javascript
call_tool(server="vn-market", tool="get_label_accuracy_report", arguments={
  "signal_type": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
