# emit_pressure_state

**Purpose:** Emit pressure state (CPU/disk/memory) to monitoring system

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `state` | `string` | normal|high|critical |

**Returns:** Pressure metric recorded

**Example:**
```javascript
call_tool(server="vn-market", tool="emit_pressure_state", arguments={
  "state": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
