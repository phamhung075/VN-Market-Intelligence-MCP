---
sprint: S2-DATA-HONESTY
parent_task: FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION
task_id: TASK-CONF-1
branch: task/TASK-CONF-1-backend-confidence-wire
size: M
zone: apps/mcp-server/
depends_on: []
blocks: ["TASK-CONF-2"]
---

## TLDR

Wire verified_decision signals' real conviction scores into the agent_signals.confidence_score column (currently ALL rows = literal 50). Implement severity-to-confidence fallback mapping. Remove column DEFAULT 50 to make genuine-absence rows explicit NULL (not masked). Update test schemas to prevent self-confirming test failures.

---

## [PM] Planning Context

**Task ID:** TASK-CONF-1  
**Epic:** S2-DATA-HONESTY  
**Type:** BUG-FIX (verified_decision producer never threaded real confidence)  
**Owner:** dev-mcp-server  
**Size:** M (~2h)  
**Rebuild:** REQUIRED (schema + code changes)  
**done_verified:** WITHHELD until AC-1..AC-4 live probe (NOT green build)

---

## Root Cause (from BA spec)

Three distinct write paths create `agent_signals` rows with `signal_type='verified_decision'`. None supply real confidence:

1. **Path A (dominant, 86%):** `alertStore.ts` `storeAlerts` + `storeAlertsFromCommander` — co-writes agent_signals row but omits `confidence_score` column → falls to `DEFAULT 50` (schema-news.ts:104).
2. **Path B:** `agentSignalTools.ts` MCP tool `post_agent_signal` — omits confidence when `finding_data.confidence` absent → `undefined` → `DEFAULT 50`.
3. **Path C:** DDL DEFAULT itself enables the bug (schema-news.ts:104).

**Impact:** Dashboard SIGNALS-LAST-10 shows 86% of verified_decision rows at literal constant 50, masking the absence-of-real-data. This violates `/goal#1` (no_fake_data_real_fetch) and contradicts the computed conviction scores already available in Alert objects.

---

## Requirements (from Architect Brownfield Findings)

### FR-1 — Wire Alert confidence into Path-A co-write

**File:** `apps/mcp-server/src/infrastructure/db/alertStore.ts` (both `storeAlerts` and `storeAlertsFromCommander`)

Implement module-private helper function:
```typescript
function severityToConfidence(severity: string): number {
  switch (severity) {
    case "critical": return 90;
    case "high":     return 75;
    case "warning":  // fall-through
    case "medium":   return 60;
    case "low":      return 40;
    default:         return 60; // defensive: treat unknown as medium
  }
}
```

At the `INSERT INTO agent_signals` call site (both functions), derive confidence:
```typescript
const confidenceScore =
  typeof alert.confidence_score === "number" &&
  alert.confidence_score >= 0 &&
  alert.confidence_score <= 100
    ? Math.min(100, Math.max(0, Math.round(alert.confidence_score)))
    : severityToConfidence(alert.severity);
```

Add `confidence_score` as explicit column in the INSERT statement, supply the derived value.

**Constraint:** NFR-C — no imports from `domain/` or `interface/` layers. The `severityToConfidence()` helper is a pure lookup, module-private in `alertStore.ts`.

### FR-2 — Remove column DEFAULT 50 from schema

**File:** `apps/mcp-server/src/infrastructure/db/schema-news.ts` line 104

Change:
```typescript
ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER DEFAULT 50
```

To:
```typescript
ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER
```

**Impact on live DB:** The column already exists on the named-volume DB (3316 rows with value 50 already stored). Removing the DEFAULT only affects fresh DB initializations (e.g., test `:memory:` schemas). No migration of existing rows needed.

### FR-3 — Path-B MCP tool null-for-absent

**Files:** 
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`
- `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`

In `agentSignalTools.ts` lines 297–327, when `finding_data.confidence` is absent:
```typescript
// WRONG (old):
const derivedConfidenceScore = rawConfidence !== undefined
  ? Math.min(100, Math.max(0, Math.round(rawConfidence * 100)))
  : undefined;  // falls to DEFAULT 50

// CORRECT (new):
const derivedConfidenceScore = rawConfidence !== undefined
  ? Math.min(100, Math.max(0, Math.round(rawConfidence * 100)))
  : null;  // explicit NULL
```

In `agentSignalStore.ts` line 134 (interface type) and line 341 (destructure default):
```typescript
// WRONG (old):
confidence_score?: number;  // line 134
// ...
confidence_score = 50,      // line 341

// CORRECT (new):
confidence_score?: number | null;  // line 134
// ...
confidence_score = null,            // line 341
```

Update the misleading comment at `agentSignalTools.ts:300` ("honest: no fake value substituted") — it is incorrect. A constant 50 is fabricated.

### FR-4 — Read-path dead-code hardening

**File:** `apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts` line 224

Change:
```typescript
confidence_score: row.confidence_score ?? 50,
```

To:
```typescript
confidence_score: row.confidence_score ?? null,
```

This is currently dead code (DB writes DEFAULT 50, not NULL). After FR-2 removes the default, this line will serve NULL correctly for genuine-absence rows.

### FR-5 — Test schema updates (CRITICAL)

**Files to update (5 existing test makeDb() helpers):**
1. `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts` — line 35
2. `1786-earnings-conflict-detection.test.ts` — line 49
3. `1862g-signal-dedup.test.ts` — line 47
4. `1920g-prediction-claims.test.ts` — line 121
5. `1804-price-validation-override.test.ts` — line 31

In each `makeDb()` helper, find the schema line:
```typescript
// WRONG (old):
ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER DEFAULT 50

// CORRECT (new):
ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER
```

**RISK:** Tests that define their own `makeDb()` with the old DEFAULT will not catch the real bug if not updated. This is the self-confirming-test failure mode (see MEMORY.md SQLite ADD COLUMN UNIQUE lesson).

---

## Acceptance Criteria

**AC-1 (PRIMARY, live DB):** After rebuild, query the named-volume DB:
```sql
SELECT confidence_score, COUNT(*) FROM agent_signals
WHERE signal_type = 'verified_decision'
  AND created_at >= datetime('now', '-1 day')
GROUP BY confidence_score;
```

Result must show **at least 2 distinct non-50 values** among new rows created post-fix. No new row may show `confidence_score = 50` unless legitimately mapped (e.g., a `"warning"`-severity alert at 60, a `"medium"` at 60). The legacy 3316 rows at 50 are pre-fix; the filter `created_at >= datetime('now', '-1 day')` excludes them.

**AC-2 (live dashboard):** `get_stock_signals` API response includes `verified_decision` rows with non-constant, plausible confidence values. Each row's confidence varies across different alerts (different tickers, different severities).

**AC-3 (null-honest):** Any `verified_decision` row where genuine confidence is unknown stores `NULL` in `confidence_score`. The API response returns `confidence_score: null` (not 0, not omitted). The frontend must render this as "—" or explicit unknown marker (that's TASK-CONF-2).

**AC-4 (severity mapping correct):** 
- A `"critical"`-severity alert co-writes `confidence_score = 90`
- A `"warning"`-severity alert co-writes `confidence_score = 60`
These are verifiable via `SELECT alerts.severity, agent_signals.confidence_score FROM agent_signals JOIN alerts ON agent_signals.alert_id = alerts.id WHERE agent_signals.signal_type='verified_decision'`.

**AC-5 (no regression):** Rows with `signal_type != 'verified_decision'` continue to carry their existing confidence values (urgent_news, price_anomaly, etc.). Live `get_stock_signals` for non-verified_decision types unchanged.

---

## Files to Modify

**Core logic changes:**
1. `apps/mcp-server/src/infrastructure/db/alertStore.ts` (lines 107–177, 194–258) — add severityToConfidence() helper + wire confidence into both INSERT statements
2. `apps/mcp-server/src/infrastructure/db/schema-news.ts` (line 104) — remove `DEFAULT 50`
3. `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` (lines 134, 341) — type widening + default change
4. `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` (lines 297–327, 300 comment) — pass null not undefined + update comment
5. `apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts` (line 224) — ?? null

**Test schema fixes:**
6. `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:35` — remove DEFAULT 50 from makeDb()
7. `1786-earnings-conflict-detection.test.ts:49` — remove DEFAULT 50 from makeDb()
8. `1862g-signal-dedup.test.ts:47` — remove DEFAULT 50 from makeDb()
9. `1920g-prediction-claims.test.ts:121` — remove DEFAULT 50 from makeDb()
10. `1804-price-validation-override.test.ts:31` — remove DEFAULT 50 from makeDb()

**New test file:**
- `apps/mcp-server/src/infrastructure/db/__tests__/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-verified-decision.test.ts` — Unit tests T-1..T-4

---

## Unit Tests Required (new file)

Create `apps/mcp-server/src/infrastructure/db/__tests__/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-verified-decision.test.ts`:

**T-1:** `storeAlerts([alert with confidence_score=82])` → `agent_signals` row has `confidence_score = 82`

**T-2:** `storeAlerts([alert with severity="critical", no confidence_score])` → `agent_signals` row has `confidence_score = 90`

**T-3:** `storeAlerts([alert with severity="warning", no confidence_score])` → `agent_signals` row has `confidence_score = 60`

**T-4:** `stockSignalsHandler` response with DB row having `NULL` in `confidence_score` returns `confidence_score: null` (not 0, not 50)

All tests must use the updated `:memory:` schema (no DEFAULT 50) to verify the fix on a fresh schema.

---

## Knowledge Needed

- `docs/policies/dev-standards.md` — code-zone, test isolation
- `docs/standards/task-schema.md` — task structure
- BA spec: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md` § Brownfield Findings (ARCH-RATIFY-CONF-1..4, Risk Flags RISK-2)
- SQLite ADD COLUMN gotcha: MEMORY.md lesson on self-confirming tests + DBs

---

## Risk Flags & Edge Cases

**RISK-1 (DDD import):** `severityToConfidence()` must NOT import from `domain/` or `interface/` layers. Keep it module-private in `alertStore.ts`.

**RISK-2 (Test schema drift):** Self-confirming test failure mode. Tests that define their own `makeDb()` with old DEFAULT will pass but not catch the bug on real schemas. Must update all 5 makeDb() helpers.

**RISK-3 (Edge case: zero confidence):** `alert.confidence_score = 0` (all signals weak) is a legitimate real value. Wire as-is; do not confuse 0 with NULL.

**RISK-4 (Edge case: out-of-range confidence):** If `alert.confidence_score` is outside [0,100], clamp: `Math.min(100, Math.max(0, Math.round(score)))`.

**RISK-5 (Sentinel-discriminator bootstrap boundary):** The DEFAULT removal only affects fresh DBs. Post-fix, new rows will have real values. The `created_at >= datetime('now', '-1 day')` filter in AC-1 correctly excludes the 3316 legacy rows. Do not tighten this filter post-verification.

---

## Verification (Live Probe, not Green Build)

After rebuild + code deploy:

1. **AC-1 query:** Run on named-volume DB (keinos/sqlite3 sidecar) — confirm ≥2 distinct non-50 values in recent verified_decision rows.
2. **AC-2 live API:** Call `get_stock_signals` → verify SIGNALS-LAST-10 panel has non-constant confidence across rows.
3. **AC-3 null-honest:** Find a row where alert has no confidence_score and severity maps to fallback — verify API returns `confidence_score: null`, not 0 or 50.
4. **AC-4 severity mapping:** Query named-vol DB, JOIN alerts + agent_signals on alert_id — spot-check a CRITICAL alert has 90, a WARNING has 60.

**done_verified decision:** WITHHELD until all 4 live probes pass. Green build alone is not sufficient (this was the self-confirming-test failure mode that masked the original bug).

---

## Following Task

**TASK-CONF-2** (dev-frontend): Blocked until this task done_verified. Frontend must render null-confidence rows as "—" (not "50%" or "0%").

---

## Commit Convention

Commit message (per `docs/policies/commit-convention.md`):
```
fix(mcp-server/signals): wire verified_decision conviction → confidence_score, remove DEFAULT 50

- alertStore: add severityToConfidence() helper, wire alert.confidence_score ?? severity fallback into agent_signals co-write INSERT (both storeAlerts + storeAlertsFromCommander)
- schema-news: remove DEFAULT 50 from ALTER TABLE (fresh DBs → honest NULL for absent confidence)
- agentSignalStore: widen PostSignalInput.confidence_score to number|null|undefined, default null
- agentSignalTools: pass null not undefined when finding_data.confidence absent; fix misleading "honest" comment
- stockSignalsHandler: ?? null (hardened for future genuine-NULL rows)
- tests: 5 makeDb() helpers + new unit tests T-1..T-4

AC-1: live verified_decision rows show ≥2 distinct non-50 values
AC-2: dashboard SIGNALS-LAST-10 non-constant confidence
AC-3: null-confidence rows serve explicit NULL, frontend renders "—"
AC-4: severity mapping verifiable (CRITICAL=90, WARNING=60)

Task: TASK-CONF-1
```

---

## Decision Journal

Task created by PM 2026-06-23T17:28Z. Architect atomization ratified per docs/handoffs/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md § Task Atomization. No design changes; build to architect spec. NEXT: dev-mcp-server picks up and implements.
