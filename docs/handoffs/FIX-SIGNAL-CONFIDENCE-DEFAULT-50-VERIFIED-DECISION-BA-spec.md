# BA Spec — FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION

**Sprint:** S2-DATA-HONESTY
**Task ID:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION
**BA author:** ba
**Date:** 2026-06-23
**NEXT:** architect

---

## 1. Root Cause (confirmed, do not re-litigate)

There are **three distinct write paths** that create `agent_signals` rows with `signal_type = 'verified_decision'`. None of them supply a real confidence value.

### Path A — `storeAlerts` / `storeAlertsFromCommander` (dominant, 86% of rows)

`apps/mcp-server/src/infrastructure/db/alertStore.ts` lines 131–139, 214–223.

Both `storeAlerts` (server/scheduler producer) and `storeAlertsFromCommander` (alert-commander cowork producer) co-write an `agent_signals` row per alert inside a transaction. The INSERT statement enumerates only 9 columns explicitly:

```
(from_agent, to_agent, signal_type, stock_code, payload, status,
 created_at, expires_at, alert_id, is_correlation_stub)
```

`confidence_score` is **not in the column list**. SQLite falls through to `DEFAULT 50` (schema-news.ts:104). The `Alert` object that is available at call-site carries:

- `alert.confidence_score` (optional `number | undefined`) — set by `alertGenerator.ts:296` only when the contributing `Signal` objects carry `confidence_score`. The Alert's `confidence_score` is already present and correct in the `alerts` table (line 156) but is **never wired** into the co-write `agent_signals` INSERT.
- `alert.severity` (always present: `"low" | "medium" | "warning" | "high" | "critical"`) — a deterministic proxy usable when `confidence_score` is absent.

### Path B — `agentSignalTools.ts` `post_signal` MCP tool (minority writer)

`apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` lines 297–327.

A caller posting `signal_type="verified_decision"` via the MCP tool without including `finding_data.confidence` receives `confidence_score = undefined`, which triggers the column DEFAULT 50. The code comment at line 300 ("honest: no fake value substituted") is **incorrect**: literal 50 reads on the dashboard as a plausible confidence number, which is fabricated.

### Path C — Any future direct-insert caller

Any caller that constructs a raw INSERT without the `confidence_score` column also falls to DEFAULT 50. This class is currently zero, but the default itself is the structural enabler across all paths.

### The mask on the read path is a secondary concern

`stockSignalsHandler.ts:224` `?? 50` is currently dead (DB writes `DEFAULT 50`, not NULL), but it must be hardened so a future genuine-NULL (absence-of-data case) is served as an explicit unknown, not the same literal 50.

---

## 2. Requirements

### FR-1 — Wire Alert confidence into Path-A agent_signals co-write

**DDD layer:** Infrastructure (alertStore.ts is a persistence adapter; the confidence derivation logic belongs at the write site, not the domain)

The `storeAlerts` and `storeAlertsFromCommander` INSERT for the co-write `agent_signals` row **must** include `confidence_score` in the column list and supply a real value derived from the Alert object. Derivation rule (in priority order):

1. If `alert.confidence_score` is present and in range [0, 100] → use it directly (it was already computed by `alertGenerator` from real signals).
2. Else map `alert.severity` to a sentinel integer that is distinguishable and plausible:
   - `"critical"` → 90
   - `"high"` → 75
   - `"warning"` or `"medium"` → 60
   - `"low"` → 40
   (These are **fallback** values only when no real score exists; they must be semantically honest approximations, not a flat constant.)

Architect must decide whether the severity-to-int map lives inline at the call site or is promoted to a shared helper (e.g. `alertUtils.ts`). BA has no preference; the requirement is that the derivation is applied on **both** `storeAlerts` and `storeAlertsFromCommander` (same logic, same file) to avoid drift.

### FR-2 — Remove column DEFAULT 50 from schema-news.ts

**DDD layer:** Infrastructure (schema migration DDL)

`schema-news.ts:104`:
```
ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER DEFAULT 50
```

Change to:
```
ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER
```

Rationale: the DEFAULT is the structural enabler of the bug. With DEFAULT removed, any INSERT that omits `confidence_score` will produce NULL, which is honest (absence-of-data). The read fallback must then handle NULL explicitly (FR-4). The ALTER TABLE is inside a `try/catch {}` and only fires on first-time column creation; existing rows already have their values stored and are unaffected.

### FR-3 — Harden Path-B MCP tool comment + post absent-confidence as NULL

**DDD layer:** Interface (agentSignalTools.ts)

Replace the misleading comment at lines 298–301 with accurate documentation. When `finding_data.confidence` is absent, pass `confidence_score: null` (explicit, not `undefined`) into `PostSignalInput` so the DB stores NULL, not DEFAULT. This makes genuine-absence honest.

`PostSignalInput` in `agentSignalStore.ts:341` destructure must accept `null` for `confidence_score` (currently defaults to `50`; change to `null`).

### FR-4 — Fix read-path dead-code in stockSignalsHandler.ts

**DDD layer:** Interface (HTTP/MCP route handler)

`stockSignalsHandler.ts:224`:
```ts
confidence_score: row.confidence_score ?? 50,
```

Change to:
```ts
confidence_score: row.confidence_score ?? null,
```

The caller (dashboard) must receive `null` for genuine-absence rows, not `50`. The dashboard display layer must render `null` confidence as an explicit "—" or "n/a" marker, not as "50%". This is a UI honesty requirement: the frontend must not map null to a displayed number.

Note: this is currently dead code because Path A writes DEFAULT 50 instead of NULL. After FR-2 removes the default, this line will become load-bearing.

### FR-5 — Existing 50-rows: leave as-is (no backfill)

**DDD layer:** N/A (decision, no code change)

The 3316 historical rows at `confidence_score = 50` must **not** be back-filled. Reasons:
- They cannot be recomputed: the Alert objects that produced them are gone; severity-based derivation on old rows would be speculative.
- Recompute-on-read would require a JOIN to `alerts` table at read time — complex and not justified for historical signals that are not surfaced to the dashboard (signals surface only recent rows).
- Honest honesty posture: old rows carry an ambiguous legacy value; new rows post-fix carry real values; the improvement is observable in the data over time.

A DB-level comment documenting the pre-fix batch as "legacy-50" is out of scope (no operational value without tooling to distinguish them from legitimate 50s).

---

## 3. Non-Functional Requirements

### NFR-A — No constant served value

Post-fix, no new `verified_decision` row may store `confidence_score = 50` unless that 50 was derived from a real signal (e.g. a `"warning"` severity alert was legitimately mapped to 60, not 50 — no ambiguity with the old default). The severity map in FR-1 explicitly excludes 50 for this reason.

### NFR-B — Both storeAlerts callpaths identical

`storeAlerts` and `storeAlertsFromCommander` must share the same derivation logic. No drift between them. Architect may choose shared helper or inline-duplicate — but both must change atomically.

### NFR-C — No new domain imports in alertStore.ts

`alertStore.ts` is Infrastructure. The severity-to-int mapping is a pure lookup (no domain logic import needed). Do not import from `domain/` layer to satisfy this FR.

### NFR-D — TypeScript strict-mode clean

`PostSignalInput.confidence_score` type change (from `number = 50` to `number | null = null`) must not break existing callers that pass explicit numbers (they are unaffected by widening the type to include null).

---

## 4. Acceptance Criteria (LIVE VARIED data — not a green build)

**AC-1 (PRIMARY, live DB):** After rebuild, query the named-volume DB:
```sql
SELECT confidence_score, COUNT(*) FROM agent_signals
WHERE signal_type = 'verified_decision'
  AND created_at >= datetime('now', '-1 day')
GROUP BY confidence_score;
```
Result must show **at least 2 distinct non-50 values** among new rows. No new row may show `confidence_score = 50`.

**AC-2 (live dashboard):** `get_stock_signals` / dashboard SIGNALS-LAST-10 panel shows `verified_decision` rows with non-constant, plausible confidence values. Each row's confidence must vary across different alerts (different tickers, different severity alerts).

**AC-3 (null-honest):** Any `verified_decision` row where genuine confidence is unknown (no `alert.confidence_score`, no severity proxy) stores `NULL` in `confidence_score`. The API response for that row returns `confidence_score: null`. The dashboard renders it as "—" or "n/a", not "50".

**AC-4 (severity mapping correct):** A CRITICAL-severity alert co-writes `confidence_score = 90`. A WARNING-severity alert co-writes `confidence_score = 60`. These are verifiable via the `alerts.severity` + joined `agent_signals.confidence_score` on the same `alert_id`.

**AC-5 (no regression — other producers):** Rows with `signal_type != 'verified_decision'` continue to carry their existing confidence values. The `urgent_news` / `price_anomaly` rows that currently have 86/88/90 values must not change.

**AC-6 (test):** At least 2 new unit tests:
- T-1: `storeAlerts([alert with confidence_score=82], db)` → `agent_signals` row has `confidence_score = 82`.
- T-2: `storeAlerts([alert with severity="critical", no confidence_score], db)` → `agent_signals` row has `confidence_score = 90`.
- T-3: `storeAlerts([alert with severity="warning", no confidence_score], db)` → `agent_signals` row has `confidence_score = 60`.
- T-4: `stockSignalsHandler` returns `confidence_score: null` when DB row has `NULL` in `confidence_score`.

done_verified is WITHHELD until AC-1 through AC-4 pass via live named-vol probe, not just green build.

---

## 5. DDD Layer Summary

| Requirement | Layer | File(s) |
|---|---|---|
| FR-1: Wire alert.confidence_score into co-write INSERT | Infrastructure | `alertStore.ts` |
| FR-2: Remove column DEFAULT 50 | Infrastructure | `schema-news.ts` |
| FR-3: MCP tool null-for-absent | Interface | `agentSignalTools.ts`, `agentSignalStore.ts` |
| FR-4: Read-path ?? null | Interface (route) | `stockSignalsHandler.ts` |
| FR-5: No backfill | N/A | — |

---

## 6. Blockers / Open Questions for Architect

**ARCH-RATIFY-CONF-1 (decision, not a blocker):** Severity-to-int map inline vs shared helper. BA recommends inline in `alertStore.ts` (both functions in the same file, single SSOT). If architect sees a future caller that also needs this map, extract to `alertUtils.ts`. No architectural risk either way.

**ARCH-RATIFY-CONF-2 (verify):** Confirm `PostSignalInput.confidence_score` type is `number | undefined` (defaulting to `50`) not a union with null. If it is, the change to `number | null | undefined = null` is a one-liner that will need a type audit of all existing callers to ensure none pass `undefined` expecting the old default 50.

**ARCH-RATIFY-CONF-3 (scope question):** The task description mentions `assembleBriefing.ts` in the files list. BA code-read found that `assembleBriefing.ts` calls `computeConviction` for the `topConviction` field (a DailyBriefing struct member) but does NOT post a `verified_decision` signal — the topConviction result is returned in the briefing response, not written to `agent_signals`. Architect must confirm whether there is a SEPARATE call path (e.g. a cowork agent using the briefing's topConviction score to then post a `verified_decision` signal via `post_signal` MCP tool) that should thread the `result.score` into `finding_data.confidence`. If confirmed, that path becomes FR-6 (out of BA scope; escalate to next sprint if complex).

**ARCH-RATIFY-CONF-4 (frontend):** FR-4 requires the dashboard to render `null` confidence as "—" or "n/a". This is a frontend change (apps/frontend). Confirm whether it falls inside the same dev-mcp-server task or requires a separate dev-frontend sub-task. BA recommends same task if the render change is a one-liner in the existing confidence display cell.

---

## 7. Edge Cases

| Case | Handling |
|---|---|
| Alert.confidence_score = 0 (valid: all signals weak) | Wire as-is (0 is a legitimate real value, distinguishable from NULL) |
| Alert.confidence_score outside [0,100] | Clamp: `Math.min(100, Math.max(0, Math.round(score)))` |
| Alert with no severity (type-impossible per Alert interface) | TypeScript compile-time guarantee; no runtime guard needed |
| Both paths (storeAlerts + storeAlertsFromCommander) fire for the same alert_id | Existing `checkSignal` dedup guard prevents the second INSERT; no double-write risk |
| Existing test suite inserts verified_decision rows without confidence_score | Tests that used to rely on DEFAULT 50 will now get NULL — tests must be updated to assert on the explicit value or accept NULL |

---

## 8. Scope Boundaries

**In scope:**
- `alertStore.ts` (both `storeAlerts` and `storeAlertsFromCommander`) — Infrastructure layer
- `schema-news.ts` — Infrastructure (DDL migration)
- `agentSignalStore.ts` — Infrastructure (PostSignalInput type)
- `agentSignalTools.ts` — Interface (comment + null pass-through)
- `stockSignalsHandler.ts` — Interface (read-path hardening)

**Out of scope:**
- `convictionScorer.ts` — no change needed (already computes correct values)
- `assembleBriefing.ts` — no `agent_signals` write here (see ARCH-RATIFY-CONF-3)
- `alertGenerator.ts` — already correctly propagates confidence from signals to Alert objects (no change)
- `signalValidator.ts` — already correctly computes confidence; not called on verified_decision path
- Historical 3316 rows at confidence_score=50 — leave as-is (FR-5)
- Backfill script — out of scope
- `convictionScorer` neutral-fallback 0.5 values — explicitly out of scope (PO scope_out)

---

## [Architect] Brownfield Findings

**Date:** 2026-06-23
**NEXT:** pm

### Zone
`apps/mcp-server/` (single zone — all 5 in-scope files reside here)

- Infrastructure: `alertStore.ts`, `schema-news.ts`, `agentSignalStore.ts`
- Interface: `agentSignalTools.ts`, `stockSignalsHandler.ts`
- Frontend (sub-task): `apps/frontend/app/lib/api/client.ts` + `apps/frontend/app/domain/market.ts`

→ BUILD-STANDARD: not-applicable (bug-fix / in-zone, no new primitives)

---

### ARCH-RATIFY-CONF-1 — Severity-to-int map: INLINE in alertStore.ts (RESOLVED)

**Decision: inline, not a shared helper.**

Rationale:

1. The only existing "severity" map in the codebase is `severityLabels.ts` (`SEVERITY_VI: Record<string, string>`) — a Vietnamese display-label map for the sector MCP tools. It maps severity strings to Vietnamese text. It is structurally incompatible with a numeric confidence proxy, and importing it into `alertStore.ts` (Infrastructure) from `interface/mcp/tools/sector/` would be an upward import violation (interface → infrastructure, forbidden by DDD golden rule).

2. Both callers (`storeAlerts` and `storeAlertsFromCommander`) are in the SAME file (`alertStore.ts`). A shared helper buys no dedup benefit — a module-private function `severityToConfidence(severity: string): number` declared once at the top of the file serves both call-sites without DDD violation, without a new import, and without an API surface that could drift. NFR-B (both paths identical) is trivially satisfied.

3. There is no evidence of a third future caller in the codebase that would need this mapping (only `alertStore.ts` co-writes `verified_decision` rows from the server/commander paths). If one appears later, extraction to `alertUtils.ts` is a one-commit refactor.

**Implementation pattern:**
```typescript
// alertStore.ts — module-private, no imports
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

The derivation at the INSERT site (both `storeAlerts` and `storeAlertsFromCommander`):
```typescript
const confidenceScore =
  typeof alert.confidence_score === "number" &&
  alert.confidence_score >= 0 &&
  alert.confidence_score <= 100
    ? Math.min(100, Math.max(0, Math.round(alert.confidence_score)))
    : severityToConfidence(alert.severity);
```

Note on the clamp: `alertGenerator.ts` already sets `confidence_score` only when the contributing Signal objects carry values (FR-1 says "present and in range [0, 100]"). The Math.round/clamp guard here is a defensive belt-and-suspenders per BA edge-case table.

---

### ARCH-RATIFY-CONF-2 — PostSignalInput.confidence_score current type: VERIFIED (RESOLVED)

**Finding:** `agentSignalStore.ts` line 134:
```typescript
confidence_score?: number;
```
The field is typed as `number | undefined` (the `?` makes it optional). The destructure at line 341 applies the JavaScript default:
```typescript
confidence_score = 50, // Task 230: default 50
```

This is `number | undefined = 50` — NOT `number | null | undefined`. The field has never accepted `null` in its type contract.

**Required change:** Widen to `number | null | undefined` and change the destructure default:
```typescript
confidence_score?: number | null;   // interface field (line 134)
// ...
confidence_score = null,             // destructure default in _postSignalInner (line 341)
```

**Caller impact audit:** The only callers that pass `confidence_score` explicitly are:
- `intelligenceCycleJob.ts:1305` — passes `Math.min(100, Math.max(0, Math.round(chain.conviction * 100)))` (type `number`) — unaffected by widening
- `agentSignalTools.ts:325–327` — conditionally spreads `{ confidence_score: derivedConfidenceScore }` (type `number`) — unaffected
- All other callers omit the field entirely — they now get `null` instead of `50`, which is the correct behavior post-fix

**TypeScript strict-mode clean:** Widening `number | undefined` → `number | null | undefined` is additive. Callers passing explicit numbers are unaffected. NFR-D confirmed satisfied.

**The `agentSignalStore.ts` INSERT SQL must also change** to handle null correctly. Currently `_postSignalInner` passes `confidence_score` directly to the SQLite parameterized INSERT. Bun:sqlite passes `null` as SQL NULL (correct). No SQL change needed — the column will receive NULL when the caller omits confidence.

---

### ARCH-RATIFY-CONF-3 — Alert-commander cowork path via post_signal: CONFIRMED NO FR-6 NEEDED (RESOLVED)

**Finding after raw grep of all `verified_decision` write paths:**

The alert-commander cowork agent is documented as "produces: verified_decision" (init.md line 95) and the flow spec (cycle.md, stage-dispatch-log.md) does not contain an explicit `post_agent_signal` call with `signal_type=verified_decision`. The cowork agent fires `suppress` and `verified_decision` signals via `post_agent_signal` MCP tool in its prompt-driven execution.

**Key distinction:** When alert-commander posts `verified_decision` via `post_agent_signal`, the MCP tool handler at `agentSignalTools.ts:302–307` ALREADY wires `finding_data.confidence` → `confidence_score`. The code block reads:
```typescript
const rawConfidence = typeof findingDataRecord["confidence"] === "number"
  ? (findingDataRecord["confidence"] as number)
  : undefined;
const derivedConfidenceScore = rawConfidence !== undefined
  ? Math.min(100, Math.max(0, Math.round(rawConfidence * 100)))
  : undefined;
```

If `finding_data.confidence` is absent → `derivedConfidenceScore = undefined` → currently falls to column DEFAULT 50 (the structural bug). After FR-2 removes the DEFAULT and FR-3 passes `null` explicitly when derivedConfidenceScore is undefined, these cowork-path rows will correctly store NULL.

**Does alert-commander thread topConviction.score through post_signal?** No. The `assembleBriefing.topConviction` field is a `DailyBriefing` response struct member, NOT a signal write. Alert-commander does not call `assembleBriefing`. Alert-commander consumes `verified_chain` signals (which carry `confidence_score` already set by `intelligenceCycleJob:1305`) and `urgent_news` / `chain_catalyst` signals from the signal bus. When it fires a `verified_decision` ACK back, it is a dedup-acknowledgement signal with its own conviction score from the cycle, which the agent sets in `finding_data.confidence`.

**Conclusion:** No FR-6 required. The Path B fix (FR-3: pass null instead of undefined when `finding_data.confidence` absent) already covers the cowork path. The prior fix FAILED not because of the cowork path but because it left the column DEFAULT at 50 (FR-2 was not executed) AND the dominant Path A (alertStore.ts) was never touched.

**Complete verified_decision producer enumeration (proof grep):**

| Path | File | Line | Producer identity | Confidence source | Fix |
|---|---|---|---|---|---|
| A1 | `alertStore.ts` | 131–139 | `storeAlerts` | alert.confidence_score ?? severity map | FR-1 (add to INSERT + severityToConfidence) |
| A2 | `alertStore.ts` | 214–223 | `storeAlertsFromCommander` | same as A1 | FR-1 (identical fix, same function) |
| B | `agentSignalTools.ts` | 297–327 | MCP `post_agent_signal` (any caller incl. alert-commander cowork) | finding_data.confidence | FR-3 (pass null not undefined) |
| C | `schema-news.ts` | 104 | DDL DEFAULT | structural enabler | FR-2 (remove DEFAULT 50) |

No other `INSERT INTO agent_signals` with `signal_type='verified_decision'` exists in `apps/mcp-server/src` (raw grep confirmed — the only hits are comments, type definitions, and the two call-sites in alertStore.ts). The `agentSignalStore.ts` `_postSignalInner` function handles all Path B INSERTs for any `signal_type`.

---

### ARCH-RATIFY-CONF-4 — Frontend null-render: SEPARATE dev-frontend sub-task required (RESOLVED)

**Finding:** This is NOT a one-liner. There are two distinct breakage points in the frontend:

**Breakage point 1 — `apps/frontend/app/lib/api/client.ts:350`:**
```typescript
const rawScore = typeof obj["confidence_score"] === "number" ? obj["confidence_score"] : 0;
const confidence = rawScore / 100;
```
When `confidence_score` is `null` (DB NULL → API response `null`), `typeof null !== "number"` so `rawScore = 0` → `confidence = 0.0`. The domain object carries `0.0`, which the renderer displays as `"0%"`, not `"—"`.

**Breakage point 2 — `apps/frontend/app/domain/market.ts:217`:**
```typescript
confidence: number;  // normalised 0.0–1.0
```
The type is `number` (non-nullable). The signal display code in `dashboard.alerts.tsx:301–316` checks `typeof signal?.confidence === "number"` — always true even for 0 — so the `"—"` path is never reached for null-from-DB rows.

**Required change:**
1. `client.ts:350`: `const rawScore = typeof obj["confidence_score"] === "number" ? obj["confidence_score"] : null;` + `const confidence = rawScore !== null ? rawScore / 100 : null;`
2. `domain/market.ts:217`: `confidence: number | null;`
3. `dashboard.alerts.tsx:301`: Update hasConfidence guard to `signal?.confidence !== null && typeof signal?.confidence === "number" && !Number.isNaN(signal.confidence)`

The BA noted "same task if the render change is a one-liner." It is not — it requires a type change in the domain model, a null-propagation change in the client mapper, and a render guard update. These changes are confined to `apps/frontend/` (different zone from `apps/mcp-server/`). This warrants a separate sub-task: **TASK-CONF-FRONTEND** run sequentially after the backend task is deployed (so null rows actually exist in DB to test against).

---

### SQLite ADD COLUMN gotcha — live column status (RESOLVED)

Per the known SQLite ADD COLUMN lesson: `ALTER TABLE ... ADD COLUMN ... DEFAULT 50` inside `try/catch {}` (schema-news.ts:104) fires on first-time column creation only. The column ALREADY EXISTS on the live named-volume DB (confirmed by the 3316 rows with `confidence_score = 50`).

**Therefore:**
- Changing line 104 from `DEFAULT 50` → no DEFAULT only affects FRESH DB initializations (e.g. `:memory:` test DBs, brand-new deployments). The live named-volume DB is unaffected — the column already exists and will not be re-added.
- The live column does not need migration — the DEFAULT only governs future INSERTs, and after FR-1 (Path A fix) both INSERT statements will always supply an explicit value.
- The `confidence_score` column on the live named-volume DB currently accepts integers; removing the default from DDL does not alter the column's type or constraint. No `ALTER TABLE ... ALTER COLUMN` is possible in SQLite; none is needed.
- Existing tests that create `:memory:` schemas and relied on `confidence_score INTEGER DEFAULT 50` in the CREATE will need updating (test file `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:35` has `DEFAULT 50` in its own `makeDb()` helper — the developer must update that helper to match the new schema, otherwise tests pass on old schema and miss the bug on new one).

---

### Verified paths (5 in-scope files)

| File | Lines read | Verified state |
|---|---|---|
| `alertStore.ts` | 107–177 (storeAlerts), 194–258 (storeAlertsFromCommander) | INSERT for agent_signals co-write: 9 columns, NO confidence_score. FR-1 adds it as the 10th. |
| `schema-news.ts` | 104 | `ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER DEFAULT 50` — the target for FR-2. |
| `agentSignalStore.ts` | 134 (type), 341 (default) | `confidence_score?: number` / `= 50` — type widening + default change. |
| `agentSignalTools.ts` | 297–328 | Comment "honest: no fake value" is wrong (DEFAULT 50 is the fake); derivedConfidenceScore left as `undefined` not `null`. |
| `stockSignalsHandler.ts` | 224 | `confidence_score: row.confidence_score ?? 50` — change to `?? null`. |

---

### Risk flags

**RISK-1 (DDD): alertStore.ts severity-to-int map must be module-private.** No imports from `domain/` or `interface/` allowed. The inline `severityToConfidence()` helper in the same file satisfies NFR-C.

**RISK-2 (Test schema drift): Tests that define their own `makeDb()` with `confidence_score INTEGER DEFAULT 50`** will not catch the real bug if they are not updated. Files to update: `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:35`, `1786-earnings-conflict-detection.test.ts:49`, `1862g-signal-dedup.test.ts:47`, `1920g-prediction-claims.test.ts:121`, `1804-price-validation-override.test.ts:31`. The developer must change `DEFAULT 50` → no default in all `makeDb()` helpers in these tests, or the tests will pass on the wrong schema. This is the exact self-confirming-test failure mode from the SQLite ADD COLUMN UNIQUE lesson.

**RISK-3 (Frontend false-positive gate): The existing `dashboard.alerts.tsx:454` already renders `"—"** when `item.confidenceScore === null`** — but this is for the `alerts` table `confidenceScore` (which is `number | null`), not the signal `confidence` field. Do not conflate the two: the SIGNALS-LAST-10 panel uses `AgentSignal.confidence: number` which is the field that needs widening. The developer must identify the correct render site.

**RISK-4 (Sentinel-discriminator bootstrap boundary): The DEFAULT removal only affects fresh DBs.** Post-fix, new rows will have real values. The `SELECT confidence_score=50` query in AC-1 will still show the 3316 legacy rows — the AC-1 filter `created_at >= datetime('now', '-1 day')` correctly excludes them. Do not tighten this filter post-verification: old 50s and new 50s (if any legitimate `warning`-severity alert fires) are now distinguishable by `created_at`, not by value.

---

### Task atomization

This is a BUG-FIX with two independent zones. Sequential dispatch (mcp-server first, then frontend after deploy).

**TASK-CONF-1 (dev-mcp-server) — backend fix, ~2h**
Files: `alertStore.ts`, `schema-news.ts`, `agentSignalStore.ts`, `agentSignalTools.ts`, `stockSignalsHandler.ts`
All 5 in-scope mcp-server files. Includes new test file for T-1/T-2/T-3/T-4. Updates existing test `makeDb()` helpers in 5 test files to remove `DEFAULT 50`. REBUILD REQUIRED (schema + code change). Done_verified = live named-vol AC-1..AC-4 (not just green build).

**TASK-CONF-2 (dev-frontend) — frontend null-render, ~1h**
Files: `apps/frontend/app/lib/api/client.ts`, `apps/frontend/app/domain/market.ts`, `apps/frontend/app/routes/dashboard.alerts.tsx` (or wherever the SIGNALS panel renders `confidence`)
Depends on TASK-CONF-1 deployed (null rows must exist in DB for AC-3 to be verifiable live). Done_verified = dashboard SIGNALS-LAST-10 shows "—" for null-confidence verified_decision rows.

Sequential: TASK-CONF-1 → rebuild → QA AC-1..AC-4 → TASK-CONF-2 → rebuild frontend → QA AC-3 display.

---

### Design decisions summary

| Decision | Choice | Justification |
|---|---|---|
| Severity-to-int location | Inline `severityToConfidence()` in `alertStore.ts` | No future callers, DDD import-safe, NFR-B trivially satisfied |
| `PostSignalInput.confidence_score` type | Widen to `number \| null \| undefined`, default `null` | Honest absence; callers with explicit numbers unaffected |
| Cowork alert-commander path (CONF-3) | No FR-6 | Path B fix (null for absent confidence) covers it; no assembleBriefing write path confirmed |
| Frontend change (CONF-4) | Separate TASK-CONF-2 | Domain type change + client mapper + render guard = 3-file change in different zone |
| Live DB migration | None needed | Column already exists; DEFAULT removal only governs future fresh DBs |
| Test schema update | Required in 5 existing test files | Self-confirming test failure mode must be prevented |
