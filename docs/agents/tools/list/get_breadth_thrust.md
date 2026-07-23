# get_breadth_thrust

**Purpose:** HOSE market breadth time-series analysis for P1 Fear & Greed gauge.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| — | — | No parameters |

**Returns:** (1) Advance-Decline Line (ADL) cumulative sum + 60-session history; (2) RANA today (Ratio-Adjusted Net Advances, range -100 to +100); (3) McClellan Oscillator (EMA19-EMA39 of RANA; null until 39 sessions); (4) McClellan Summation (running sum of McClellan Osc; null until 39 sessions); (5) Floor Panic flag (floor/total > 15%) and Ceiling FOMO flag (ceiling/total > 15%)…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_breadth_thrust", arguments={})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
