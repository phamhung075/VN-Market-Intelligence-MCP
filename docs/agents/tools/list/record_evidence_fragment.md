# record_evidence_fragment

**Purpose:** Record a macro evidence fragment

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `thesis_id` | `string` | Thesis ID |
| `content` | `string` | Evidence text |
| `source` | `string` | Source |

**Returns:** Fragment ID and storage confirmation

**Example:**
```javascript
call_tool(server="vn-market", tool="record_evidence_fragment", arguments={
  "thesis_id": ..., "content": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
