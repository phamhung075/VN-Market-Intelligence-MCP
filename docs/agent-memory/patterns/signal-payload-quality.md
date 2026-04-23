# Pattern: Signal Payload Quality Gap

**recurrence**: 3x (Sprint 228+, Sprint 1293 incident)
**severity**: HIGH
**root_cause**: Type definition gap + job implementation gap + no validation
**detection_date**: 2026-04-23 02:36 UTC

---

## Definition

News Scout + Market Watcher emit incomplete signal payloads on enrichment chain signals (`chain_catalyst`, `price_confirmation`). Alert Commander receives signals missing required numeric verification fields (`confidence`, `direction`, `summary` in finding_data), then synthesizer falls back to 0 values, degrading conviction scores below firing thresholds.

**Symptom**: 4-AND alerts suppressed despite matching criteria (incident: 5 bullish signals suppressed 2026-04-23).

---

## Root Causes

1. **Type definition gap** — `SignalPayload` interface is intentionally permissive (`[key: string]: unknown`)
2. **Job implementation gap** — Agents skip finding_data entirely under response budget pressure
3. **Integration gap** — MCP tool validates only `cross_validate` signals, not enrichment chain signals
4. **Testing gap** — RED tests do not assert on missing fields; GREEN fills with placeholders

---

## Expected Behavior

Each signal type carries strict finding_data requirements:

| Signal Type | Required Fields | Source |
|-------------|-----------------|--------|
| `chain_catalyst` | event_type, direction, confidence, affected_stocks, headline, source | News Scout (01-news-scout.md line 92) |
| `price_confirmation` | price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence | Market Watcher (04-market-watcher.md line 155) |
| `urgent_news` | confidence, direction, event_type | News Scout (01-news-scout.md line 95) |

Chain synthesizer accesses these fields without null guards:
- `findingData["confidence"]` → defaults to 0 if undefined
- `findingData["direction"]` → defaults to "" if undefined
- `findingData["summary"]` → used for narrative building

---

## Prevention Checklist (Post-TECH-1295)

### For Agent Developers (Using Builders)

- [ ] Import builder from domain: `const builder = createChainCatalystBuilder()`
- [ ] Use fluent API: `.setEventType(...).setDirection(...).setConfidence(...)`
- [ ] Call `.build()` BEFORE posting (throws if incomplete)
- [ ] Catch builder errors and retry with complete data
- [ ] Do NOT post object literals directly (builders enforce type safety)

### For Agent Implementers (MCP Tool Fallback)

Before merging changes to agent prompt files (.claude/agents/*.md):
- [ ] All signal_type post calls include complete finding_data
- [ ] All numeric fields have realistic values (0.0–1.0 for confidence, not placeholder "0")
- [ ] All enum fields (direction, event_type) use only documented values
- [ ] At least one test case posts incomplete signal and expects MCP tool rejection

### For Code Reviewers (Before Merge)

Before merging changes to agent specs or signal posting code:
- [ ] Builders used when available (1295a+)
- [ ] MCP tool validation still in place (1293b fallback)
- [ ] No regression in signal rejection audit metrics (1295c)

Before merging changes to agentSignalTools.ts:
- [ ] Validators exist for all enrichment chain signal types
- [ ] Validators reject payloads missing required fields
- [ ] Error messages explain which fields are missing and why (reference task #1293)

Before merging changes to chainSynthesizer.ts:
- [ ] Defensive fallbacks handle undefined fields gracefully
- [ ] Log warnings when finding_data fields are missing
- [ ] Conviction calculation does not crash (degrades safely)

---

## Prevention: Use Typed Builders (Task 1295a+)

Instead of constructing signal payloads as object literals (error-prone), use typed builders from `src/domain/signals/signalBuilders.ts`. Builders enforce complete field set at build-time, before posting to MCP tools.

### Why Builders Matter

Object literals allow incomplete data:
```javascript
// DANGEROUS: missing confidence, source, affected_sectors
const finding = {
  event_type: "credit_policy",
  direction: "bullish",
  affected_stocks: ["VIC"]
};
post_agent_signal(..., finding_data=finding); // MCP tool will reject
```

Builders catch incompleteness at emit time:
```javascript
// SAFE: builder throws if any required field is missing
const finding = createChainCatalystBuilder()
  .setEventType("credit_policy")
  .setDirection("bullish")
  .addStock("VIC")
  // forgot .setConfidence() + .setSource()
  .build(); // throws ZodError before posting
```

### Builder Classes (TECH-1295)

| Builder Class | Required Fields | Use When |
|---------------|-----------------|----------|
| `ChainCatalystBuilder` | event_type, direction, confidence, affected_stocks, affected_sectors, headline, source | News Scout posts chain catalyst signals (macro/policy/earnings events) |
| `PriceConfirmationBuilder` | price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence | Market Watcher confirms price movement against catalyst direction |
| `UrgentNewsBuilder` | headline, source, severity | News Scout signals urgent breaking news requiring immediate attention |
| `CrossValidateBuilder` | direction, confidence, summary | Cross-validator signals contradictions/confirmations from multiple sources |

### Usage Examples

**Example 1: Chain Catalyst (News Scout)**

```javascript
const { createChainCatalystBuilder } = require("@domain/signals/signalBuilders");

const finding = createChainCatalystBuilder()
  .setEventType("credit_policy")                    // central bank policy shift
  .setDirection("bullish")                           // increases borrowing ease
  .setConfidence(0.8)                                // high conviction
  .addStock("VIC")                                   // Bank of Investment
  .addStock("BID")                                   // BIDV
  .addSector("Banking")                              // entire sector affected
  .setHeadline("SBV cuts policy rates to stimulate credit")
  .setSource("cafef")                                // credible financial news
  .build();                                          // validates all fields

post_agent_signal(
  from_agent="news-scout",
  to_agent="all",
  signal_type="chain_catalyst",
  stock_code="VIC",
  payload={ title: finding.headline, detail: "SBV rate cut → lower borrowing costs", impact_score: 8 },
  finding_data=finding,
  ttl_minutes=30
);
```

**Example 2: Price Confirmation (Market Watcher)**

```javascript
const { createPriceConfirmationBuilder } = require("@domain/signals/signalBuilders");

const confirmation = createPriceConfirmationBuilder()
  .setPriceChangePct(3.2)                            // stock rose 3.2% intraday
  .setVolumeRatio(2.1)                               // volume 2.1x average
  .setConfirmsDirection(true)                        // price ↑ matches catalyst (bullish)
  .setFullyPriced(false)                             // 60% of move unexplained (room to run)
  .setConfidence(0.85)                               // high confidence in confirmation
  .build();

post_agent_signal(
  from_agent="market-watcher",
  to_agent="all",
  signal_type="price_confirmation",
  stock_code="VIC",
  payload={ title: "VIC price confirms SBV catalyst", detail: "VIC +3.2%, vol 2.1x" },
  finding_data=confirmation,
  causal_ref=<chain_finding_id>,
  chain_depth=2,
  ttl_minutes=30
);
```

**Example 3: Urgent News (News Scout)**

```javascript
const { createUrgentNewsBuilder } = require("@domain/signals/signalBuilders");

const urgentNews = createUrgentNewsBuilder()
  .setHeadline("MWG announces major M&A: acquires KKR stake")
  .setSource("vnexpress")
  .setSeverity("critical")                           // market-moving event
  .build();

post_agent_signal(
  from_agent="news-scout",
  to_agent="market-watcher",
  signal_type="urgent_news",
  stock_code="MWG",
  payload={ title: "Urgent: MWG M&A announcement", detail: "Major strategic shift", impact_score: 9 },
  finding_data=urgentNews,
  ttl_minutes=120
);
```

### Error Handling Pattern

All builders throw `ZodError` on incomplete or invalid data. Handle gracefully:

```javascript
try {
  const finding = createChainCatalystBuilder()
    .setEventType("credit_policy")
    .setDirection("bullish")
    .setConfidence(0.8)
    .addStock("VIC")
    .setHeadline("SBV rate cut")
    // forgot: .setSource(...), .addSector(...)
    .build(); // throws ZodError
} catch (error) {
  if (error.name === "ZodError") {
    // Log which fields are missing
    console.error("Missing fields:", error.errors.map(e => e.path).join(", "));
    // Retry with complete data or skip signal
    submit_feedback(
      category="builder_failure",
      title="ChainCatalyst incomplete",
      detail=error.message,
      priority="high"
    );
  }
}
```

### Prevention Checklist

Before posting ANY signal:

- [ ] Import correct builder: `createChainCatalystBuilder()` | `createPriceConfirmationBuilder()` | `createUrgentNewsBuilder()` | `createCrossValidateBuilder()`
- [ ] Use fluent API (method chaining): `.setEventType(...).setDirection(...)`
- [ ] Call `.build()` BEFORE `post_agent_signal()`
- [ ] Handle `ZodError` thrown by `.build()` — do not post incomplete signals
- [ ] Do NOT use object literals for enrichment chain payloads (chain_catalyst, price_confirmation, urgent_news, cross_validate)
- [ ] Verify enum values match schema (event_type, direction, severity, source)
- [ ] Numeric fields in correct range: confidence ∈ [0.0, 1.0], price_change_pct ∈ [-100, 100], volume_ratio > 0

### Benefits

1. **Pre-emit validation**: Agents catch missing fields before API call (fail fast)
2. **Type safety**: TypeScript compiler ensures setter method names are correct
3. **Clear error messages**: Zod validation reports exactly which fields are missing or invalid
4. **Fluent API**: Method chaining encourages building complete objects
5. **Reduced MCP tool load**: Builders filter invalid payloads before reaching post_agent_signal
6. **Audit trail**: Failed builds can be logged separately from MCP rejections (build_failure vs signal_rejection)

### Related Tasks

- **TECH-1293**: MCP tool validation (fallback for non-builder signals)
- **TECH-1295a**: Builder implementation (✅ MERGED 2026-04-22)
- **TECH-1295b**: Agent spec updates (this task — docs)
- **TECH-1295c**: Signal quality audit service (metrics + SLO)
- **TECH-1295d**: Integration tests (builders → synthesis chain)

---

## Fix Procedure (TECH-1293 + TECH-1295)

### Phase 1: Validation Infrastructure (TECH-1293, MERGED)

| Task | Scope | Estimate | Status |
|------|-------|----------|--------|
| 1293a | Create strict signal type interfaces (domain layer) | 4h | ✅ MERGED |
| 1293b | MCP tool validation for all chain signals | 6h | ✅ MERGED |
| 1293c | DB audit log for signal rejections | 4h | ✅ MERGED |
| 1293d | Defensive fallbacks in synthesizer | 3h | ✅ MERGED |

See `docs/TECH_1293_ROOTCAUSE.md` for implementation details.

### Phase 2: Pre-Emit Enforcement (TECH-1295, READY)

| Task | Scope | Estimate | Status |
|------|-------|----------|--------|
| 1295a | Signal Builders (4 types, typed pre-emit) | 8h | READY |
| 1295b | Agent Spec Updates (use builders) | 4h | READY |
| 1295c | Signal Quality Audit Service + Job | 4h | READY |
| 1295d | Integration Tests (builders → synthesis) | 2h | READY |

See `docs/TECH_1295.md` for full implementation plan.

---

## Verification (Post-Merge)

- [ ] 0 signal rejections over 24h window (get_signal_rejection_summary)
- [ ] Alert Commander conviction scores ≥0.75 (historical baseline)
- [ ] 4-AND alerts resume firing (watchlist-opportunity threshold met)
- [ ] Agent memory logs confidence penalty = 0 (no missing fields detected)

---

## Related Issues

- Task #693 (cross_validate validation) — single-type validator, not generalized
- Sprint 230 (signalValidator service) — confidence penalty applied post-synthesis, not pre-emit
- Pattern DDD-violations.md — independent issue (layer crossing in signal emission)

---

## Author

Architect (2026-04-23)
Source: Recurring bug escalation #1293
