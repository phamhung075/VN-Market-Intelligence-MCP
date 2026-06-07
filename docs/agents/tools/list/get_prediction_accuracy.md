# get_prediction_accuracy

**Purpose:** Get prediction accuracy metrics

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `model` | `string` | Model name |
| `lookback` | `number` | Days |

**Returns:** Accuracy statistics and confusion matrix

**Example:**
```javascript
call_tool(server="vn-market", tool="get_prediction_accuracy", arguments={
  "model": ..., "lookback": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
