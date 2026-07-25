# get_transition_probabilities

**Purpose:** Get state transition probabilities for macro phases

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `hexagram_number` | number (req) | I-Ching hexagram number (1-64), e.g. 15 for Khiêm. NOT `ticker` — passing a ticker string fails validation ("Expected number, received nan"). |

**Returns:** Transition matrix with current state

**Example:**
```javascript
call_tool(server="vn-market", tool="get_transition_probabilities", arguments={
  hexagram_number: 15
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
