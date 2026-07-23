# schedule_task

**Purpose:** Schedule a one-shot deferred task to fire at a future time.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `agent` | `string` | Target agent id — must be a known agent in the roster (required) |
| `deadline_at` | `integer` | Epoch-seconds UTC hard cutoff — task expires if now > deadline_at at sweep time |
| `dedup_key` | `string` | Idempotency key — collision returns existing row id with dedup_existed=true |
| `delay_seconds` | `integer` | Shorthand: fire_at = now + delay_seconds (mutually exclusive with fire_at) |
| `fire_at` | `integer` | Epoch-seconds UTC when to fire (mutually exclusive with delay_seconds) |
| `intent` | `string` | Short snake_case label, ≤80 chars (required) |
| `max_attempts` | `integer` | Max sweep attempts (default 1; >1 reserved for Phase-2) (default: 1) |
| `origin_ref` | `string` | Back-ref to triggering task/signal id (optional) |
| `prompt` | `string` | Full prompt/payload for spawn (COWORK) or signal body (DEV) (required) |
| `reason` | `string` | Human rationale ≥10 chars (audit log) (required) |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="schedule_task", arguments={
  "agent": ..., "deadline_at": ..., "dedup_key": ..., "delay_seconds": ..., "fire_at": ..., "intent": ..., "max_attempts": ..., "origin_ref": ..., "prompt": ..., "reason": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
