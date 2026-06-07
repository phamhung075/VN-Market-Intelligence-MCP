# get_calibration_report

**Purpose:** Get calibration accuracy for macro predictions

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `model` | `string` | Model name |

**Returns:** Calibration chart and confidence band accuracy

**Example:**
```javascript
call_tool(server="vn-market", tool="get_calibration_report", arguments={
  "model": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
