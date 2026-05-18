# SPIKE-1948e — PC1 Legal Risk Signal Pipeline Review

**Date:** 2026-05-18
**Architect:** architect
**Timebox:** 2h (read-only — no production code)
**Zone:** `apps/mcp-server/`
**Status:** COMPLETE — root cause confirmed, child task recommended

---

## Problem Statement

Since 2026-05-16, alert-commander's notebook carries a carry-over note for 9+ consecutive cycles:
"PC1 legal_risk gap — news-scout/financial-analyst should emit legal_risk signal."
`get_legal_risk_signals` returns empty for PC1 every cycle. The chairman arrest is a textbook legal
event (prosecution — `khởi tố`) yet no `legal_risk` signal type row exists in `agent_signals` for
PC1.

---

## Root Cause Analysis — Three Layers Investigated

### Layer 1 — The `agent_signals` allowlist (`SignalTypeSchema`)

**File:** `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` L39–49

```typescript
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
```

**`legal_risk` is absent from this enum.** The `post_agent_signal` MCP tool uses this schema as its
`signal_type` parameter validator (via `agentSignalTools.ts` L179). Any call with
`signal_type: "legal_risk"` would be rejected with a Zod validation error before any DB write.

This is the **primary technical blocker**: even if news-scout tried to post a `legal_risk` signal,
the MCP layer would reject it.

However, the evidence below shows news-scout never attempted to post one — the gap starts earlier
in the agent flow.

---

### Layer 2 — news-scout flow (`stage-signals.md`): no `legal_risk` dispatch path

**File:** `.claude/flows/news-scout/stage-signals.md`

The flow defines exactly two signal dispatch paths:
1. `urgent_news` — for watchlist-hit breaking news
2. `chain_catalyst` — for crisis/macro catalysts

There is no path for `signal_type: "legal_risk"`. The only way news-scout could emit a legal risk
signal would be through `chain_catalyst` with `event_type: "legal"` — but this is a different
signal type and does not write to the read path that `get_legal_risk_signals` queries.

**Confirmed from news-scout notebook (2026-05-18 04:22 UTC cycle):**
> "PC1 chairman arrest (impact 5-6 neutral) — not in watchlist, sector ripple noted last cycle."

This entry confirms the agent *recognised* the event but took no signal-posting action because:
(a) PC1 is not in the primary watchlist, and
(b) there is no `legal_risk` signal path in the flow.

---

### Layer 3 — PC1 not in primary watchlist (root cause of suppression)

**File:** `apps/mcp-server/mcp.config.json` L44–58 (primary watchlist array)
**File:** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` (WATCHLIST_SEED array)

PC1 appears in `mcp.config.json` `referenceStocks.utilities` (L68) and `referenceStocks.energy`
(L75) but is **absent from the primary `watchlist` array** (L44–58) and absent from
`WATCHLIST_SEED`.

`legalRiskDetector.ts` stock resolution strategy (Tier 1 + Tier 2) will correctly match "PC1" in
article text via direct ticker detection. However:

1. The `get_legal_risk_signals` tool reads from `alerts` table and `agent_signals` table — it does
   not call `legalRiskDetector.ts` at query time. It is a **read-only database query tool**. It
   can only surface signals that were previously *written* by an upstream agent.

2. There is no scheduler job or cron that runs `legalRiskDetector.ts` against incoming news and
   writes results to `agent_signals`.

3. `policyImpactMapper.ts` has a `legal_risk` PolicyType (L31) and recognises prosecution keywords
   (L71–94) — but this classifier is used only inside `runImpactChain.ts` (application layer) and
   does not write to `agent_signals` with `signal_type = 'legal_risk'`.

---

## Root Cause Summary — Three-Point Cascade

| Layer | Gap | Evidence |
|-------|-----|----------|
| news-scout flow | No `legal_risk` dispatch path in `stage-signals.md` | Flow only defines `urgent_news` + `chain_catalyst` paths |
| `SignalTypeSchema` allowlist | `legal_risk` absent from Zod enum in `agentSignalStore.ts:39-49` | Any `post_agent_signal(signal_type: "legal_risk")` would be Zod-rejected |
| PC1 watchlist absence | PC1 not in primary watchlist → news-scout treats it as low-priority sector ripple, not watchlist hit | news-scout notebook 2026-05-18 04:22 UTC: "not in watchlist, sector ripple noted" |

**The proximate cause is the missing dispatch path in news-scout's flow.** The `SignalTypeSchema`
gap is a secondary blocker that would surface if the flow were fixed without the enum. Both must
be fixed.

PC1's watchlist absence is a **contributing factor** (degrades urgency classification) but not the
root cause — `legalRiskDetector.ts` would still detect "PC1" via direct ticker match even without
watchlist membership. The flow gap is decisive.

---

## What Already Works (do not touch)

- `legalRiskDetector.ts` — pattern library is correct; covers `khởi tố` / `bắt tạm giam` / all
  prosecution patterns. No keyword changes needed.
- `get_legal_risk_signals` tool — Task 1940a already extended it to query `agent_signals` table for
  `signal_type = 'legal_risk'`. The read side is correct.
- `schema-news.ts` `agent_signals` table — `signal_type TEXT NOT NULL`, no DB-level constraint
  blocks `legal_risk`. Schema is neutral.
- `regimeConfidenceThreshold.ts` — only enforces thresholds for `urgent_news`; `legal_risk` would
  bypass it.
- `policyImpactMapper.ts` + `CRIMINAL_PROSECUTION_KEYWORDS` — already recognise prosecution as
  `legal_risk` PolicyType. Can be reused as classification guidance.

---

## Recommended Fix — Size S

Two targeted changes, both in `apps/mcp-server/`:

### Fix A — Add `legal_risk` to `SignalTypeSchema` (infrastructure layer)

**File:** `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`
**Change:** Add `"legal_risk"` to the `z.enum([...])` at L39–49.

This unblocks `post_agent_signal` from accepting `signal_type: "legal_risk"` calls.
One-line change. Zero schema migration needed (SQLite `signal_type TEXT` accepts any string).

### Fix B — Add `legal_risk` dispatch step to news-scout flow

**File:** `.claude/flows/news-scout/stage-signals.md`
**Change:** Add a new dispatch block BEFORE the `urgent_news` block. Trigger: any article where
`legalRiskDetector.detectLegalRisk(text, watchlistCodes)` returns a non-empty result OR where
`policyImpactMapper.classifyPolicy(text)?.policyType === "legal_risk"`.

The dispatch call should use:
```
signal_type: "legal_risk"
payload.title: <headline>
payload.detail: <riskType> — <summary>
stock_code: <detected ticker>
ttl_minutes: 240  (legal events are durable — longer TTL than price signals)
finding_data: { title, detail, confidence_score }
```

No `finding_data` schema validator is required (unknown types pass through `validateSignalPayload`
with a warning — see `agentSignalTools.ts` L105–108). This means Fix A alone already unblocks DB
write; Fix B is the flow change that tells the agent to actually call it.

### Optional Fix C — Add PC1 to watchlist (separate concern)

**Files:** `apps/mcp-server/mcp.config.json`, `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts`
**Change:** Add PC1 to primary watchlist array and WATCHLIST_SEED.

This is a SEPARATE concern from the legal_risk gap. SPIKE-1946 (PLX) followed this same pattern.
Recommend as a **separate** sub-task scoped to `docs/data/system-map.json` + `mcp.config.json` +
`seedWatchlist.ts` — identical to 1946a scope.

---

## Fix Sizing

| Fix | Size | Zone | Risk |
|-----|------|------|------|
| A — `SignalTypeSchema` enum addition | S | `apps/mcp-server/src/infrastructure/db/` | LOW — additive, backward compatible |
| B — flow dispatch path | S | `.claude/flows/news-scout/` | LOW — agent flow instruction only, no code |
| C — PC1 watchlist (optional) | S | `apps/mcp-server/` + `docs/data/` | LOW — identical to 1946a |

Combined: **Size S** (Fixes A+B are 1 code file + 1 flow file, no new DB schema, no new tests
beyond adding `"legal_risk"` to existing test fixtures).

---

## Risk Flags

**R-1 — `legal_risk` TTL + dedup.** `urgent_news` has a 240-min 4-hour dedup window. The
news-scout inter-cycle dedup gate (stage-signals.md) uses same-event_type + same-stock_code
matching. A `legal_risk` signal does not have `event_type` in `finding_data` — it bypasses the
inter-cycle dedup check. Add explicit dedup logic in Fix B: suppress if same `stock_code` +
`signal_type = "legal_risk"` posted within 6 hours (legal events persist, no need to re-post
every 20-min cycle).

**R-2 — TNB critic gate.** `postSignalWithCriticGate` runs for all signals. `legal_risk` signals
with a `confidence_score < 0.6` may be rejected on first attempt. Recommend `retry_count: 0`
(standard) and ensure `finding_data.confidence` is set to `legalRiskDetector` confidence value
(0.95 for `prosecution`, 0.85 for `asset_freeze`). These are above the TNB gate threshold.

**R-3 — `verdictResolutionJob.ts` isolation.** Fix A (schema change in `agentSignalStore.ts`)
does NOT touch `verdictResolutionJob.ts` or `alert_accuracy` tables. 1945 stabilisation window
(until 2026-05-20T07:22Z) is not impacted.

**R-4 — Backward compatibility.** All existing `get_agent_signals` consumers filter by
`signal_type`; adding `legal_risk` to the enum does not change any existing signal rows or
query paths.

---

## Decision: File Child Task

**YES.** File child task `1948e-fix`.

Size S, single zone (`apps/mcp-server/` for Fix A; `.claude/flows/news-scout/` for Fix B).
No sprint gate applies — Fix A+B are independent of the 1945 stabilisation window.

---

## Child Task Handoff Stub

**Task:** `1948e-fix` — Add legal_risk to SignalTypeSchema + news-scout dispatch path

**Zone:** `apps/mcp-server/` + `.claude/flows/news-scout/`
**Agent:** developer (news-scout flow) + dev-mcp-server (code)
**Size:** S (estimated 30–45 min)
**Gate:** None — independent of 1945 stabilisation window

**Acceptance Criteria:**
1. `SignalTypeSchema` in `agentSignalStore.ts` includes `"legal_risk"`
2. `stage-signals.md` has a `legal_risk` dispatch block with 6h dedup guard
3. `post_agent_signal(signal_type: "legal_risk", stock_code: "PC1", ...)` does NOT return Zod error
4. `get_legal_risk_signals(stock: "PC1")` returns the newly posted signal
5. No changes to `verdictResolutionJob.ts` or `alert_accuracy` tables

**Files to change:**
- `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` — add `"legal_risk"` to `SignalTypeSchema`
- `.claude/flows/news-scout/stage-signals.md` — add `legal_risk` dispatch block
- `apps/mcp-server/src/__tests__/1948e-legal-risk-signal-type.test.ts` — new test (post + get roundtrip)

**Optional (separate sub-task):** Add PC1 to `mcp.config.json` watchlist + `seedWatchlist.ts`
(identical scope to 1946a).

---

## Brownfield Notes

- `SIGNAL_TYPE_VALIDATORS` in `agentSignalTools.ts` L77–84 has no entry for `legal_risk` — this
  means `validateSignalPayload("legal_risk", ...)` will warn but return `{ valid: true }` (L105–108
  passthrough for unknown types). No validator file needed for Fix A+B.
- `agentSignalTools.ts` L339–341: `AUDIT_SIGNAL_TYPES = new Set(["price_confirmation", "urgent_news"])`.
  `legal_risk` is deliberately excluded from the quality audit path — this is correct, legal events
  are not scored by accuracy/confidence the same way price signals are.
- The 1940a test file (`1940a-pc1-legal-risk-agent-signals.test.ts`) already sets up all test
  scaffolding; the new 1948e test can reuse `makeTestDb()` and `makeServer()` helpers by importing
  them or copying the pattern.
