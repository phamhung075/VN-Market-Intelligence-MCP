# get_credit_flow_signal

**Purpose:** Get credit flow signals for macro timing

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| — | — | No parameters |

**Returns:** Credit aggregates with direction signal

**`structuredContent` (FDA-6, 2026-07-31):** RE-credit ratio (20%/19%) and total
credit (RE credit × 5) are ALWAYS hardcoded approximations — no live NHNN feed
for either. Mortgage rate and YoY credit growth are ALSO hardcoded fallbacks
(10.5%/11.0% and ±15%) whenever the caller omits them AND (for mortgage) no
live `sbv_rates_history` DB row is available. The VN `content` text already
discloses this ("[ƯỚC TÍNH]" banner + `is_estimate=true, source_tier=4` +
`static_seed` provenance lines); the same flags now also travel in
`structuredContent` so a downstream consumer reading the payload structurally
(not just parsing the Vietnamese prose) reliably sees the estimate provenance
— matching the `get_energy_grid_signals` FDA-5 precedent:
```json
{
  "is_estimate": true,
  "source_tier": 4,
  "estimated_fields": ["reCreditRatioPct", "totalCreditTrillion", "avgMortgageRatePct", "yoyGrowthPct"],
  "mortgage_is_estimate": true,
  "yoy_is_estimate": true,
  "fully_estimated": true,
  "direction": "up",
  "current_date": null,
  "previous_date": null
}
```
`current_date`/`previous_date` are the "as of" date for the underlying credit
snapshot — `null` (not a `new Date()` stamp) whenever `mortgage_is_estimate ||
yoy_is_estimate`, since a real calendar date on an estimate-backed row
previously falsely implied the hardcoded fallback was fetched live that day
(the FDA-6 defect). They are real ISO dates (`YYYY-MM-DD`) only when both
mortgage rate and YoY growth are live inputs (`fully_estimated: false`).
`reCreditRatioPct`/`totalCreditTrillion` are always listed in
`estimated_fields` regardless — those two never have a live source at all.
`fully_estimated` (`mortgage_is_estimate && yoy_is_estimate`) is a dedicated
machine-readable hook for a downstream consumer to fail-loud / suppress its
own derived output when neither mortgage rate nor YoY growth has any live
backing. Source: `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts:157-167`.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_credit_flow_signal", arguments={
  
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
