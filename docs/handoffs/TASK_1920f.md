# TASK 1920f — Activate signal_quality_audit writer

**Sprint:** 1920 | **Tier:** 4 | **Type:** FIX | **Zone:** apps/mcp-server/ | **Size:** S
**DDD Layer:** infrastructure (new store) + interface/tools (wire point)
**Owner:** dev-mcp-server
**Status:** Ready for Dev

---

## Context

`signalValidator.ts:183` (domain layer) defines `prepareSignalAuditRecord(result, context)` which returns a plain `Record<string, unknown>` shaped for the `signal_quality_audit` table. It explicitly says "Does NOT perform database insertion (DDD separation)."

The `signal_quality_audit` table is fully defined in `schema-system.ts:324` with 16 columns and a UNIQUE constraint on `signal_id`.

The `post_agent_signal` tool in `agentSignalTools.ts` is the canonical write path for agent signals. It already calls `validateSignalPayload()` and `logSignalRejection()`. It does NOT call `prepareSignalAuditRecord()` or insert into `signal_quality_audit`.

Current state of `signal_quality_audit`: zero rows at runtime. The `monthlySignalQualityAuditJob` queries `signal_rejections` (not `signal_quality_audit`) — these are separate tables.

**Important distinction:**
- `signal_rejections` = records of FAILED/REJECTED signals (written by `logSignalRejection`)
- `signal_quality_audit` = records of VALIDATED price-type signals with confidence scoring (Task 233b intent)

The audit table is designed for price-signal quality tracking (confidence, fallback tiers, staleness). It is NOT appropriate to write an audit row for every `post_agent_signal` call (would produce thousands of rows daily). The write should only occur for signals with `signal_type = "price_confirmation"` or `signal_type = "urgent_news"` where `finding_data.confidence` is present — these are the signals where price validation occurred.

---

## Requirements

### FR-1 — New infrastructure store: signalQualityAuditStore.ts
**DDD layer:** infrastructure/db

Create `apps/mcp-server/src/infrastructure/db/signalQualityAuditStore.ts` with a single function:

```typescript
export function insertSignalQualityAudit(
  db: Database,
  record: Record<string, unknown>,
): void
```

Implementation: `INSERT OR IGNORE INTO signal_quality_audit (…) VALUES (…)`. Use the UNIQUE `signal_id` constraint to deduplicate retries. Wrap in try/catch — write failure is non-fatal (log `console.warn`).

The `record` shape matches the object returned by `prepareSignalAuditRecord()`:
- `signal_id`, `signal_type`, `ticker`, `source_primary`, `source_fallback`
- `fallback_tier`, `fallback_source`, `confidence_score`, `confidence_score_final`, `confidence_penalty`
- `price`, `price_age_minutes`, `vps_breaker_state`, `coverage_gap`, `staleness_warning`, `created_at`

### FR-2 — Wire audit write in post_agent_signal handler
**DDD layer:** interface/tools

In `agentSignalTools.ts`, after the successful `postSignal(db, signalInput)` call (line ~299), add a conditional audit write:

```
IF signal_type IN ['price_confirmation', 'urgent_news']
  AND finding_data.confidence IS a number
THEN:
  1. Build ValidationResult-like object from finding_data fields
  2. Build SignalAuditContext from args
  3. Call prepareSignalAuditRecord(validationResult, auditContext)
  4. Call insertSignalQualityAudit(db, auditRecord)
```

This is fire-and-forget: any error in steps 3-4 must be swallowed with `console.warn`. The MCP response to the caller is unaffected.

### FR-3 — Construct ValidationResult shape from finding_data
**DDD layer:** interface (adapter)

`finding_data` from `post_agent_signal` is untyped. Map available fields to `ValidationResult`:
- `confidence_score`: `finding_data.confidence ?? 0` × 100 (agents use 0.0–1.0 scale)
- `confidence_score_final`: same as `confidence_score` (no penalty available at this layer)
- `confidence_penalty`: 1.0
- `source_fallback`: `finding_data.source_fallback ?? false`
- `fallback_source`: `finding_data.fallback_source ?? undefined`
- `staleness_warning`: `false`
- `valid`: `finding_data.confidence !== undefined && (finding_data.confidence as number) > 0`
- `validated_at`: `new Date().toISOString()`

### FR-4 — SignalAuditContext construction
**DDD layer:** interface (adapter)

Map from `post_agent_signal` args:
- `signal_id`: `String(id)` — the returned id from `postSignal()`
- `signal_type`: `"price"` for `price_confirmation`, `"news"` for `urgent_news`
- `fallback_tier`: `finding_data.fallback_tier ?? undefined`
- `vps_breaker_state`: `finding_data.vps_breaker_state ?? undefined`
- `coverage_gap`: `finding_data.coverage_gap ?? undefined`
- `price`: `finding_data.price ?? undefined`

### NFR-1 — Volume guard
The audit is gated to `price_confirmation` and `urgent_news` signal types only. This keeps daily volume to ~dozens, not hundreds. The `monthlySignalQualityAuditJob` acceptance criterion ("finds rows to summarize") is satisfied by ≥1 audit row per day.

### NFR-2 — DDD purity preserved
`prepareSignalAuditRecord()` remains in the domain layer. It is called from the interface layer (tools handler) — this is the correct DDD path. The store is in infrastructure/db. No domain import of infrastructure.

---

## Acceptance Criteria

- AC-1: After an agent posts a `price_confirmation` signal with `finding_data.confidence=0.8`, `SELECT COUNT(*) FROM signal_quality_audit` returns ≥1.
- AC-2: After an `urgent_news` signal with confidence, a row exists with `signal_type='news'` in `signal_quality_audit`.
- AC-3: Non-qualifying signal types (`chain_catalyst`, `cross_validate`, `suppress`, `verified_chain`, `fundamental_validation`) do NOT write to `signal_quality_audit`.
- AC-4: `INSERT OR IGNORE` deduplication — posting the same `signal_id` twice results in exactly 1 row.
- AC-5: Write failure (mock DB throwing) does NOT cause `post_agent_signal` to return `isError: true`.
- AC-6: `monthlySignalQualityAuditJob` called with a DB seeded with ≥1 `signal_quality_audit` rows runs without error.

---

## Edge Cases

- `finding_data` is `undefined` or `{}`: no audit write occurs (confidence check fails).
- `signal_id` from `postSignal()` returns 0 (duplicate signal ignored by `agent_signals`): still attempt audit write with `signal_id="0"` — UNIQUE constraint will deduplicate.
- VN locale: all timestamps are UTC ISO 8601.

---

## Files Changed (expected)

- `apps/mcp-server/src/infrastructure/db/signalQualityAuditStore.ts` — NEW
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` — add conditional audit write after `postSignal()`
- `apps/mcp-server/src/__tests__/` — new test file covering AC-1 through AC-6

---

## Blockers

None. No PO questions. No architect brief required.

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-1 | Integration | signal_quality_audit row inserted for price_confirmation |
| AC-2 | Integration | signal_quality_audit row inserted for urgent_news |
| AC-3 | Unit | Non-qualifying signal types produce 0 audit rows |
| AC-4 | Integration | Duplicate signal_id: COUNT=1 |
| AC-5 | Unit | DB mock throws → MCP response has isError=false |
| AC-6 | Integration | monthlySignalQualityAuditJob runs clean with seeded rows |
