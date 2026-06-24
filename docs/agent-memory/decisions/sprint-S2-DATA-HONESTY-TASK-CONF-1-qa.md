# Decision Journal — QA Gate · TASK-CONF-1 · S2-DATA-HONESTY

**Date:** 2026-06-23T18:20Z
**Sprint:** S2-DATA-HONESTY
**Task ID:** TASK-CONF-1
**Agent:** qa
**Verdict:** REVIEW — VERIFY-PENDING-ORGANIC-DATA (done_verified WITHHELD)

---

## Entry

**task-id:** TASK-CONF-1

**what-considered:**

All 5 code changes verified structurally (read source files):
1. `alertStore.ts` — `severityToConfidence()` module-private helper present (critical=90, high=75, warning/medium=60, low=40, default=60). Both `storeAlerts` and `storeAlertsFromCommander` INSERT into `agent_signals` with explicit `confidence_score` column derived from `alert.confidence_score ?? severityToConfidence(alert.severity)`. NFR-C: function not exported, no domain/interface imports added by this task. Pre-existing `import type { Alert } from "../../domain/services/alertGenerator.js"` is a type-only import predating this commit.
2. `schema-news.ts:106` — `ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER` (DEFAULT 50 removed).
3. `agentSignalStore.ts:134,341` — `PostSignalInput.confidence_score` widened to `number | null | undefined`; `_postSignalInner` default changed to `= null`.
4. `agentSignalTools.ts:305-307` — `derivedConfidenceScore: number | null = null` when `finding_data.confidence` absent. Always spread as `confidence_score: derivedConfidenceScore`.
5. `stockSignalsHandler.ts:224` — `?? null` (was `?? 50`).

**Test suite:**
- New test file `FIX-SIGNAL-CONFIDENCE-DEFAULT-50-verified-decision.test.ts`: 10 pass / 0 fail (21 expect() calls).
- 5 updated makeDb() helpers (5 test files): 73 pass / 0 fail.
- `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts`: 22 pass / 0 fail.
- tsc: EXIT 0.
- DDD scan: no new domain→infra violations; pre-existing `Alert` type import is pre-existing from b3ea96fa.
- Security: no `process.env`, no secrets, no hardcoded credentials.
- mock-guard: EXIT 0 (PASS).
- Full suite baseline: 13351 pass / 42 skip / 105 fail (pre-existing, confirmed disjoint; all 105 failing files are unrelated to the 6 changed files — none of alertStore, schema-news, agentSignalStore, stockSignalsHandler, agentSignalTools, FIX-SIGNAL-CONFIDENCE-DEFAULT-50 appear in the failure list).

**Live DB probe results:**
- Container `vn-market-intelligence-mcp-mcp-server-1` healthy, started 2026-06-23T18:09:05Z.
- Image created 2026-06-23T17:55:03Z (3 minutes AFTER commit e3386bdf at 17:52:33 UTC). Code confirmed in image.
- Named volume `vn-market-intelligence-mcp_market_data` at `/app/data/market.db`.
- AC-1: Most recent `verified_decision` row at 2026-06-23T16:32:31Z — predates container rebuild (18:09Z). No post-rebuild verified_decision rows exist yet (0 rows with `created_at > '2026-06-23T18:09:05'`). The `strftime('%s',...)` epoch-compare was used to avoid ISO-8601 strcompare bypass. All 122 rows in last-24h window show confidence_score=50 (all pre-fix). Organic data not yet produced since rebuild.
- AC-2: `get_stock_signals` HTTP endpoint (`/api/signals/stock/VIC`) shows `chain_catalyst` signals with varied confidence (80, 75, 86). `verified_decision` rows are excluded by the `is_correlation_stub=1` column guard in `stockSignalsHandler` — this is correct behavior by design (alert co-write rows are stubs for C-08 correlation, not surfaced in dashboard). Non-verified_decision signals show non-constant confidence: urgent_news=90/70, chain_catalyst=80/75/86.
- AC-3: One NULL confidence_score row exists (id=7185, `fundamental_validation`, `created_at=2026-06-23 18:04:50` — written before rebuild by bctc-analyst). The stockSignalsHandler correctly returns `confidence_score ?? null`. The read-path code is verified at line 224.
- AC-4: JOIN query run: pre-fix rows show critical/high/medium/low all = 50 (pre-fix values). No post-rebuild rows to verify the mapping live. Mapping is verified structurally in code: `alertStore.ts` lines 184-196 (storeAlerts) and lines 275-287 (storeAlertsFromCommander) both branch on `alert.confidence_score in [0,100]` vs `severityToConfidence(alert.severity)`.
- AC-5: Non-verified_decision signal types unaffected: urgent_news=90/70 (varied, non-constant), chain_catalyst=80/75/86 (varied). No regression.

**why-change:** Verdict is REVIEW (not DONE) because AC-1 and AC-4 require live organic data with post-rebuild alert writes to confirm the severity mapping on actual rows. The code is structurally correct (DEFAULT 50 removed, both producers wire severity-derived confidence). This is classified VERIFY-PENDING-ORGANIC-DATA per task instructions — not a code bug, not a test failure. done_verified is WITHHELD until the next organic alert fire creates a verified_decision row post-18:09Z and the JOIN confirms CRITICAL=90 / WARNING=60.

**Risk flags checked:**
- RISK-1 (DDD import): PASS — severityToConfidence() is module-private, no new domain/interface imports.
- RISK-2 (test schema drift): PASS — all 5 makeDb() helpers updated, 73/73 pass with new schema.
- RISK-3 (zero confidence): PASS — alert.confidence_score=0 is wired as-is (>= 0 check includes 0).
- RISK-4 (out-of-range): PASS — Math.min(100, Math.max(0, ...)) clamp present.
- RISK-5 (sentinel discriminator): PASS — pre-fix rows unaffected (DEFAULT removal only affects fresh DBs; live ALTER TABLE ADD COLUMN already executed on existing column → no-op).

**Next action:** Await organic alert fire post-rebuild. Ops or system-auditor should re-trigger QA once a verified_decision row appears with created_at > 2026-06-23T18:09:05Z.

---

## Entry — Re-Verify 2026-06-24T00:00Z

**task-id:** TASK-CONF-1

**what-considered:**

VN market is open. Re-ran both pending AC probes directly against named-volume `vn-market-intelligence-mcp_market_data` via `docker run --rm -v ... keinos/sqlite3`.

AC-1 result: `SELECT confidence_score, COUNT(*) FROM agent_signals WHERE signal_type='verified_decision' AND strftime('%s',created_at) >= strftime('%s','2026-06-23T18:09:05') GROUP BY confidence_score;`
→ 40|2, 60|17, 75|1 — 3 distinct values, ALL non-50.

AC-4 result: JOIN `agent_signals` + `alerts` on `alert_id` same window:
→ low=40, medium=60, warning=60, high=75 across 20 rows. All match `severityToConfidence()` spec.

**why-change:** Both VERIFY-PENDING-ORGANIC-DATA probes now have live data and PASS. The constant-50 mask is definitively removed. Code path is not merely structurally correct but live-confirmed via organic alert writes post-rebuild. Setting done_verified=YES.

**Actions taken:**
1. Wrote [QA] Re-Verify Record to `docs/handoffs/TASK-CONF-1.md`
2. Updated TASK-CONF-2 status BACKLOG→ready in `docs/data/orch/orch-state.json` task_board.backlog (unblocked_by=qa, unblocked_at=2026-06-24T00:00:00Z)
3. Note: TASK-CONF-1 `done_verified` field in orch-state task_board.done_verified was already set by dev-team-cron-router at 2026-06-24T02:16:28Z (router observed the same evidence); QA re-verify is independent confirmation from named-vol raw SQL.

**Verdict:** DONE / done_verified=YES
