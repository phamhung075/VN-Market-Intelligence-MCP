# Skill: Impact Chain Analysis

## Purpose

Analyze a news item and trace its causal impact cascade from the global level down to specific Vietnamese stocks in the watchlist.

## The 4-level cascade

```
GLOBAL event
  → COUNTRY impact (Vietnam + related economies)
    → DOMAIN impact (Vietnamese sector)
      → ACTION impact (specific stocks in watchlist)
```

## Step-by-step process

### Step 1 — Classify the event (GLOBAL level)

Identify:
- Event category: `geopolitical | macro_economic | commodity | regulatory | financial_crisis | natural_disaster | tech_disruption`
- Affected commodities: oil, gold, steel, rice, rubber, coal...
- Affected trade routes or countries
- Initial sentiment: bullish / bearish / neutral for Vietnam

### Step 2 — Vietnam country impact (COUNTRY level)

Assess how this event propagates to Vietnam:
- **Trade impact**: Vietnam exports (electronics, textiles, seafood) — imports (machinery, oil, components)
- **Currency impact**: USD/VND, CNY/VND movements
- **Interest rate / monetary policy** ripple
- **FDI flows** — Vietnam is major manufacturing hub
- Key relationships: Vietnam ↔ China (50% trade), Vietnam ↔ US, Vietnam ↔ ASEAN

### Step 3 — Sector impact (DOMAIN level)

Map to Vietnamese sectors. Use this impact matrix:

| Event | Most impacted sectors |
|-------|-----------------------|
| Oil price ↑ | oil_gas (↑), aviation (↓), utilities (↓), transport cost (↓) |
| Oil price ↓ | aviation (↑), oil_gas (↓) |
| USD ↑ vs VND | real_estate (↓ debt cost), exporters (↑), importers (↓) |
| China slowdown | steel (↓), real_estate (↓), retail (↓) |
| US rate ↑ | banking (mixed), real_estate (↓), all highly leveraged (↓) |
| Vietnam rate ↑ | banking (↑ NIM), real_estate (↓), highly leveraged cos (↓) |
| Global trade ↓ | aviation (↓), retail (↓), tech exports (↓) |
| Commodity ↑ | steel/mining (↑), agriculture (↑), manufacturing input cost (↓) |

### Step 4 — Stock impact (ACTION level)

For each affected sector that intersects with the watchlist:
- List affected stocks from watchlist
- Assign `expectedImpact`: up / down / neutral
- Assign `confidence`: 0.0–1.0
- Write `reasoning`: 2–3 sentence explanation
- Assign `impactScore`: 0–10 (0 = no impact, 10 = extreme direct impact)
- Assign `timeHorizon`: short (days) / medium (weeks) / long (months)

## Impact score guide

| Score | Meaning |
|-------|---------|
| 8–10 | Direct, immediate, high confidence impact |
| 6–7  | Strong indirect impact, medium confidence |
| 4–5  | Moderate impact, sector is exposed but not direct |
| 2–3  | Low impact, distant causal chain |
| 0–1  | Negligible — sector not exposed |

## Output format

Return a structured `AnalysisEntry` (see `bctc-schema.ts`) with:
- `level`: start at 'global', create child entries for each lower level
- `hierarchy.parentIds` / `hierarchy.childIds` to link the chain
- `hierarchy.affectedDomains` and `hierarchy.affectedActions` at each level
- `analysis.reasoning`: always explain the causal chain step by step

## RAG context usage

Before finalizing, always:
1. Search LanceDB for similar past events: `search_similar_context(eventDescription, level='global')`
2. If similar events found, reference historical outcomes in the reasoning
3. Compare current impact score with historical patterns
