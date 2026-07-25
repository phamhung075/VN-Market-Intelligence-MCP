# get_evidence_summary

**Purpose:** Get directional evidence fragments (bullish/bearish/neutral scores + likelihood-ratio-weighted fragments) for a specific stock ticker

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `stock` | `string` | Stock ticker code (e.g. "FPT") — verified live 2026-06-24..2026-07-17 across multiple digest-predict cycles; NOT `thesis_id` (prior doc value never matched live tool signature — see feedback_local doc-self-heal note in digest-predict.md notebook 2026-07-16) |

**Returns:** `Evidence Summary: <TICKER>` text block — score_date, Bullish/Bearish/Neutral directional scores, fragment_count, and top fragments (source, magnitude, confidence, LR, sample_size n, TRUSTED/UNTRUSTED tag). Returns `"No evidence accumulated yet for <TICKER>"` when nothing scored.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_evidence_summary", arguments={
  "stock": "FPT"
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
