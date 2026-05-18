# Architecture Brief — Legal Risk Signal Pipeline Fix (SPIKE-1948e)

**Date:** 2026-05-18
**Sprint:** SPIKE-1948e child task 1948e-fix
**Zone:** `apps/mcp-server/` + `.claude/flows/news-scout/`
**Size:** S
**DDD Impact:** Infrastructure (enum) + Interface/flow (agent instruction)

---

## Context

`get_legal_risk_signals` returns empty for PC1 across 9+ cycles despite the 2026-05-16 chairman
arrest. SPIKE-1948e identified a three-point cascade gap:

1. `SignalTypeSchema` enum missing `"legal_risk"`
2. `stage-signals.md` has no `legal_risk` dispatch path
3. PC1 absent from primary watchlist (contributing factor, separate fix)

This brief covers the minimum-viable fix: points 1 + 2.

---

## What Is NOT Changing

- `legalRiskDetector.ts` — pattern library correct, no keyword changes
- `schema-news.ts` — `agent_signals` table accepts any `signal_type TEXT`, no migration
- `verdictResolutionJob.ts` — explicitly out of scope (1945 stabilisation window until 2026-05-20T07:22Z)
- `alert_accuracy` tables — out of scope
- `get_legal_risk_signals` tool — Task 1940a already queries `agent_signals`; read side is correct

---

## Change 1 — `agentSignalStore.ts`: Add `"legal_risk"` to `SignalTypeSchema`

**File:** `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`
**Layer:** Infrastructure
**DDD rule:** This is the signal bus SSOT for valid type strings. Additive enum change.

```typescript
// Before (L39-49)
export const SignalTypeSchema = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
  "signal_feedback",
]);

// After
export const SignalTypeSchema = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
  "signal_feedback",
  "legal_risk",           // ← added SPIKE-1948e-fix
]);
```

**Backward compatibility:** Existing rows in `agent_signals` are unaffected. No SQLite migration.
All callers using `signalType: SignalType` in TypeScript gain a new valid union member.

---

## Change 2 — `stage-signals.md`: Add `legal_risk` dispatch block

**File:** `.claude/flows/news-scout/stage-signals.md`
**Layer:** Interface (agent flow instruction)

Insert a new dispatch block **before** the existing `urgent_news` block. This block fires when
`legalRiskDetector.detectLegalRisk(articleText, watchlistCodes)` returns a non-empty result OR
when the article text contains any `CRIMINAL_PROSECUTION_KEYWORDS` AND a watchlist/reference-stock
code is detected in text.

```
Legal risk event detected (prosecution / asset freeze / investigation) → post `legal_risk`:
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "alert-commander",
  "signal_type": "legal_risk",
  "stock_code": "<TICKER>",
  "payload": {
    "title": "<headline>",
    "detail": "<riskType> — <matched patterns> — <article source>"
  },
  "ttl_minutes": 360,
  "finding_data": {
    "title": "<headline>",
    "detail": "<riskType> — <matched patterns>",
    "confidence_score": <0.95 for prosecution/asset_freeze | 0.85 for tax/license | 0.70 for investigation>
  }
})
```

**Dedup guard (R-1 from spike):** Before posting, check recent signals:
- Suppress if same `stock_code` + `signal_type = "legal_risk"` was posted within last 6 hours.
- Legal events are durable (court proceedings evolve slowly); 6h TTL is appropriate.

**Coverage:** The flow should check reference stocks (`mcp.config.json referenceStocks.*`) not
just primary watchlist — PC1 is in `referenceStocks.utilities`. Use `detectStocksInText()` from
`stockAliases.ts` which resolves aliases against the full ticker catalog, not just the SQLite
watchlist table.

---

## Change 3 (Optional, Separate Sub-Task) — Add PC1 to Primary Watchlist

**Files:** `apps/mcp-server/mcp.config.json`, `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts`, `docs/data/system-map.json`
**Scope:** Identical to TASK-1946a (PLX watchlist addition).

This improves news-scout's urgency scoring for PC1 but is not required for the legal_risk signal
path to work. Fix A+B alone are sufficient.

---

## Test Strategy

**New file:** `apps/mcp-server/src/__tests__/1948e-legal-risk-signal-type.test.ts`

| Test case | Assertion |
|-----------|-----------|
| TC1 | `post_agent_signal(signal_type: "legal_risk")` returns `success: true` (no Zod rejection) |
| TC2 | `get_legal_risk_signals(stock: "PC1")` returns the posted signal |
| TC3 | Other signal types still accepted (regression) |
| TC4 | `signal_type: "unknown_type"` is still rejected by Zod (regression) |

Can reuse `makeTestDb()` + `makeServer()` pattern from `1940a-pc1-legal-risk-agent-signals.test.ts`.

---

## DDD Layer Assignments

| Component | DDD Layer | Location |
|-----------|-----------|----------|
| `SignalTypeSchema` | Infrastructure | `infrastructure/db/agentSignalStore.ts` |
| `stage-signals.md` dispatch | Interface (agent) | `.claude/flows/news-scout/stage-signals.md` |
| `legalRiskDetector.ts` (no change) | Domain | `domain/services/legalRiskDetector.ts` |
| `get_legal_risk_signals` (no change) | Interface | `interface/mcp/tools/sector/legalRiskTools.ts` |

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| R-1: dedup — legal event re-posted every cycle | 6h dedup guard in flow |
| R-2: TNB critic gate rejects low-confidence legal signal | Use `confidence_score: 0.95` for prosecution (above TNB 0.6 threshold) |
| R-3: 1945 stabilisation window contamination | Fix A is `agentSignalStore.ts` only — no `verdictResolutionJob.ts` contact |
| R-4: `SIGNAL_TYPE_VALIDATORS` missing `legal_risk` | Passthrough for unknown types (L105-108) — no validator file needed |
