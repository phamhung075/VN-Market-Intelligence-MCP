# create_prediction_claim

**Purpose:** File a new timestamped stock-level prediction claim for calibration tracking

**Parameters (verified live 2026-07-17 — NOT event/target_date/confidence, prior doc values never matched live tool signature):**
| Name | Type | Description |
|------|------|-------------|
| `stock` | `string` | Stock ticker code (e.g. "GAS") |
| `claim_text` | `string` | Full claim narrative, Vietnamese with diacritics — must be cross-checked against live tool output before calling (claim-truth-gate) |
| `probability` | `number` | 0.05–0.95 clamped, post-dampening if calibration degrading |
| `horizon_days` | `number` | 5 / 10 / 20 per daily-predict.md P-5 delta table |
| `resolution_criteria` | `string (JSON)` | `{"metric":"price_close","operator":">","value":<num>,"currency":"VND","description":"..."}` |

**Returns:** `Prediction claim created: id=<N>` + echoed stock/claim/probability/horizon/resolution_date

**Example:**
```javascript
call_tool(server="vn-market", tool="create_prediction_claim", arguments={
  "stock": "GAS",
  "claim_text": "...",
  "probability": 0.62,
  "horizon_days": 5,
  "resolution_criteria": "{\"metric\":\"price_close\",\"operator\":\">\",\"value\":78500,\"currency\":\"VND\",\"description\":\"...\"}"
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
