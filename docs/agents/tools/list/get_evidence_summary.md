# get_evidence_summary

**Purpose:** Get macro evidence fragments for a thesis

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `thesis_id` | `string` | Thesis identifier |

**Returns:** Evidence items with sources and weighting

**Example:**
```javascript
call_tool(server="vn-market", tool="get_evidence_summary", arguments={
  "thesis_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
