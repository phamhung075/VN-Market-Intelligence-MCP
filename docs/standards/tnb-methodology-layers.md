> Parent: [tnb-methodology.md](./tnb-methodology.md)

# TNB Methodology: Data Discipline & Economic Stacks (Layers 1-3, 9)

Báu strategic framework for auditing analytical quality. Enforces monthly>quarterly, state transitions, cause-effect chains.

**Layer 1 — Foundational data discipline**

Three non-negotiable rules. Violations = methodology gap.

1. **Monthly > Quarterly.** Prefer high-frequency monthly indicators (PMI, CPI, sentiment) over quarterly aggregates (GDP). GDP lags 1–2 quarters.
2. **State transitions, not levels.** Score on threshold crossings (PMI ↔ 50, USD/VND ↔ 25500, US10Y ↔ 4.5%). Reporting "PMI = 50.3" without flagging the regime cross = gap.
3. **Cause-effect, not correlation.** Every observation needs a cause (nhân) attached. Saying "VHM up 5%" without naming the catalyst = gap.

**Layer 2 — US economic health stack**

Audited indicators: manufacturing (PMI, orders, inventory, prices), consumer (sentiment trend), monetary (Fed rate, leadership), interbank plumbing (EFFR–IORB spread).

**Layer 3 — Vietnam economic health stack**

Source hierarchy: VIRA (primary), NOT WiData (unavailable), avoid IMF/ADB/WB as primary. Variables: USD/VND (26500 break), CPI, FX reserves.

---

**Layer 9 — Source Authority Hierarchy**

> Cross-ref: architect decision brief `docs/architecture-briefs/2026-05-13-source-tier-schema-decision.md`

Every data point in the analysis pipeline carries a mandatory `source_tier` integer that encodes its authority level. Consumers (financial-analyst, unified-agent, news-scout) use this field to weight signals correctly.

**`source_tier` enum: `1 | 2 | 3`**

| Tier | Label | Examples |
|------|-------|---------|
| `1` | Primary / Official | SBV (`sbv.gov.vn`), SSC portal (`congbothongtin.ssc.gov.vn`), HOSE/HNX direct exchange feeds, FRED (Federal Reserve), IMF DataMapper, GSO (Vietnam General Statistics Office) |
| `2` | Aggregator | TradingEconomics, Yahoo Finance, VnDirect broker API, Vietcombank XML (SBV proxy), Google News RSS, CafeF, VnExpress, VnEconomy, Reuters RSS, Vinahost VPS proxy (HOSE/HNX relay) |
| `3` | Derived / Computed | Any value computed from Tier 1 or Tier 2 inputs — RSI, MACD, carry-trade spread, yield-spread signal, investment-clock phase, sentiment trend, policy-impact scores, evidence scores, static computed schedules |

**Assignment rules:**

- **Compile-time constant.** `source_tier` is never computed at runtime. It is a static literal in each tool handler (`source_tier: 2 as const`), enforced by `tsc --noEmit`.
- **Conservative assignment.** When uncertain, assign the lower-authority tier. A source that re-packages official data without a direct official API = Tier 2.
- **Lowest-authority dominates.** For tools that aggregate multiple sources, the envelope `source_tier` equals the lowest tier among all contributing sources.
- **Derived always = Tier 3.** Any value computed from Tier 1 or Tier 2 data (indicators, signals, scores) is Tier 3 regardless of input quality.

**Wire format (MCP tool output):**

`source_tier` appears as the **first field** in every JSON envelope emitted by affected tools:

```typescript
// JSON-output tools
{ source_tier: 2, ...existingFields }

// Text-output tools (wrapped per architect brief)
{ source_tier: 2, text: existingFormattedString, fetchedAt: "..." }
```

**Backwards compatibility note:** `source_tier` is an **additive** field (NFR-1 in REQ_1881a). All existing fields remain at their prior paths and types. Consumers that do not read `source_tier` continue to work unchanged. No version bump required. The field is optional for consumers — existing agents may ignore it until they are updated to weight signals by authority tier.

**Fallback path annotation:** Tools with primary/fallback source paths that remain at the same tier (e.g. `get_foreign_flow`: VPS primary → cache fallback, both Tier 2) keep `source_tier` constant and add `source_note: "fallback:cache"` or `"fallback:sse"` to the envelope to distinguish the active path.

**Canonical tool-tier assignments** are maintained in `docs/REQ_1881a.md` § Tool Inventory (16 tools).
