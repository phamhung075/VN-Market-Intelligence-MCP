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

---

## [PM] Planning Context

**Zone:** `apps/mcp-server/`

**Developer assigned:** dev-mcp-server

**Acceptance Criteria (from BA spec, to verify in implementation):**
- AC-1: After an agent posts a `price_confirmation` signal with `finding_data.confidence=0.8`, `SELECT COUNT(*) FROM signal_quality_audit` returns ≥1.
- AC-2: After an `urgent_news` signal with confidence, a row exists with `signal_type='news'` in `signal_quality_audit`.
- AC-3: Non-qualifying signal types (`chain_catalyst`, `cross_validate`, `suppress`, `verified_chain`, `fundamental_validation`) do NOT write to `signal_quality_audit`.
- AC-4: `INSERT OR IGNORE` deduplication — posting the same `signal_id` twice results in exactly 1 row.
- AC-5: Write failure (mock DB throwing) does NOT cause `post_agent_signal` to return `isError: true`.
- AC-6: `monthlySignalQualityAuditJob` called with a DB seeded with ≥1 `signal_quality_audit` rows runs without error.

**Files to read first:**
- `apps/mcp-server/src/domain/services/signalValidator.ts:183` — `prepareSignalAuditRecord` function
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` — `post_agent_signal` handler
- `apps/mcp-server/src/infrastructure/db/schema-system.ts:324` — `signal_quality_audit` table definition

**Files to create:**
- `apps/mcp-server/src/infrastructure/db/signalQualityAuditStore.ts` — NEW store with `insertSignalQualityAudit(db, record)` function

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` — add conditional audit write after `postSignal()`
- `apps/mcp-server/src/__tests__/` — new test file covering AC-1 through AC-6

**Dependencies:** None (independent work, no blocking tasks)

**Knowledge needed:**
- DDD layer separation (domain vs infrastructure vs interface)
- Fire-and-forget error handling pattern
- ValidationResult shape from signalValidator.ts
- Signal type conditional logic (gate on `price_confirmation` or `urgent_news`)

**Risk flags:**
- R-1920f-1: finding_data is untyped — ensure mapping handles undefined/null gracefully
- R-1920f-2: confidence scale conversion (agent 0.0–1.0 → audit 0–100) must be consistent
- R-1920f-3: INSERT OR IGNORE dedup relies on UNIQUE(signal_id) constraint — verify schema
- R-1920f-4: Fire-and-forget pattern must not suppress logging entirely (use console.warn on catch)

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

---

## [QA] Review Record — Round 1

**Date:** 2026-05-16
**Commit reviewed:** bdd63efb
**Verdict:** CHANGES_REQUESTED

### Pipeline

- Targeted tests (1920f — 15 tests): 15 pass / 0 fail
- Full suite: 9421 pass / 36 fail (36 pre-existing baseline, 0 regressions)
- tsc: **2 errors (BLOCKING)**
- DDD: PASS
- Security: PASS (no `process.env`, no hardcoded secrets, parameterized SQL)

### AC Verification

- AC-1 PASS: `insertSignalQualityAudit` inserts row with `signal_type='price'` — verified directly.
- AC-2 PASS: Row inserted with `signal_type='news'` — verified directly.
- AC-3 PASS: Guard logic verified — non-qualifying types return `shouldWrite=false`.
- AC-4 PASS: Duplicate `signal_id` → COUNT=1, confidence unchanged (80 not 999).
- AC-5 PASS: Dropped table → `insertSignalQualityAudit` does not throw (try/catch confirmed).
- AC-6 PASS: `runMonthlySignalQualityJob` resolves with seeded rows, `sendFn` called once.

### Blocking Issues

1. `agentSignalTools.ts:331` — `auditContext: SignalAuditContext` object literal assigns `fallback_tier: number | undefined`, `vps_breaker_state: string | undefined`, `coverage_gap: string | undefined`, `price: number | undefined` to interface fields typed as `fallback_tier?: number`, etc. With `exactOptionalPropertyTypes: true`, explicit `undefined` is not assignable to an optional field. Fix: use spread pattern to conditionally include these keys only when the value is not `undefined`.
   - TS error: `TS2375 — Type ... is not assignable to type 'SignalAuditContext' with 'exactOptionalPropertyTypes: true'`

2. `agentSignalTools.ts:348` — `validationResult` literal assigns `fallback_source: string | undefined` but `ValidationResult.fallback_source?: string` requires the key be absent (not present with `undefined`) when there is no fallback source. Fix: conditionally include `fallback_source` only when it is a string.
   - TS error: `TS2379 — Argument of type ... is not assignable to parameter of type 'ValidationResult' with 'exactOptionalPropertyTypes: true'`

### Non-Blocking Notes

- AC-3 tests the guard logic by asserting the `Set.has()` check — this is a unit-level proxy. The guard is correctly wired in the handler at line 308-311.
- `signalQualityAuditStore.ts` is clean: 100% coverage, parameterized SQL, correct try/catch.
- DDD layer: domain called from interface (`prepareSignalAuditRecord` in handler), infra store in `infrastructure/db/` — both correct.
- `ticker` field in `prepareSignalAuditRecord` always returns `undefined` (line 200 in `signalValidator.ts`) — not a blocker for this task, pre-existing limitation.

---

## [QA] Review Record — Round 2

**Date:** 2026-05-16
**Commit reviewed:** 099eeb91
**Verdict:** APPROVED

### Pipeline

- Targeted tests (1920f — 15 tests): 15 pass / 0 fail
- tsc: 0 errors (2 exactOptionalPropertyTypes blockers resolved)
- DDD: SKIPPED (Smart-Skip — single-file change to object literal shape only, no import changes)
- Security: SKIPPED (Smart-Skip — no new queries, no env reads, no secrets)

### Fix Verification

- `agentSignalTools.ts:323-325` — `fallback_source` now uses `typeof === "string"` conditional spread. TS2379 resolved.
- `agentSignalTools.ts:334-345` — `fallback_tier`, `vps_breaker_state`, `coverage_gap`, `price` now use typed conditional spreads. TS2375 resolved.
- No production logic changed — only object literal shape (omit-key-when-undefined vs explicit undefined).
- `bun tsc --noEmit` output: empty (0 errors).

### Notes

- All 6 ACs verified in Round 1 remain valid — no production code path changed.
- 1920g push pre-push hook (`bun tsc --noEmit`) now unblocked globally.
- SQLiteError in test output is expected: AC-5 fire-and-forget path exercised via `console.warn`.
