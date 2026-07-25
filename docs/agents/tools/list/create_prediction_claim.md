# create_prediction_claim

**Purpose:** File a new timestamped stock-level prediction claim for calibration tracking

**Parameters (verified live 2026-07-17 — NOT event/target_date/confidence, prior doc values never matched live tool signature; direction/expected_move_pct added 2026-07-25 per FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT):**
| Name | Type | Description |
|------|------|-------------|
| `stock` | `string` | Stock ticker code (e.g. "GAS") |
| `claim_text` | `string` | Full claim narrative, Vietnamese with diacritics — must be cross-checked against live tool output before calling (claim-truth-gate) |
| `probability` | `number` | 0.05–0.95 clamped, post-dampening if calibration degrading |
| `horizon_days` | `number` | 5 / 10 / 20 per daily-predict.md P-5 delta table |
| `resolution_criteria` | `string (JSON)` | `{"metric":"price_close","operator":">","value":<num>,"currency":"VND","description":"..."}` |
| `direction` | `"bullish" \| "bearish"` (optional) | Directional stance. Optional — only affects `target_price`, does NOT gate whether the claim is created. |
| `expected_move_pct` | `number` (optional, 0.001–0.5) | Expected % move, e.g. `0.05` for 5%. Only affects `target_price`. |

**creation_price contract (2026-07-25):** the tool ALWAYS looks up the latest close from `daily_ohlcv` for `stock` and stores it as `creation_price` — this happens regardless of whether `direction`/`expected_move_pct` are supplied. If no OHLCV row exists for the ticker, the call is **REJECTED** (`No price data found for <ticker> — cannot compute creation_price`) and NO row is inserted — a claim without a creation-time baseline price can never be resolved by `predictionResolutionJob`, so the store boundary (`predictionClaimStore.ts::insertPredictionClaim`) also independently refuses any write with a null `creation_price` via a Zod contract. Prior to this fix, the price lookup only ran when `direction`+`expected_move_pct` were BOTH supplied — every claim that omitted them (100% of claims minted since 2026-06-14) silently persisted with `creation_price=NULL` and could never be scored.

**Returns:** `Prediction claim created: id=<N>` + echoed stock/claim/probability/horizon/resolution_date/creation_price, OR an error string (no row inserted) when no price data exists for the ticker.

**Example:**
```javascript
call_tool(server="vn-market", tool="create_prediction_claim", arguments={
  "stock": "GAS",
  "claim_text": "...",
  "probability": 0.62,
  "horizon_days": 5,
  "resolution_criteria": "{\"metric\":\"price_close\",\"operator\":\">\",\"value\":78500,\"currency\":\"VND\",\"description\":\"...\"}",
  "direction": "bullish",
  "expected_move_pct": 0.05
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
