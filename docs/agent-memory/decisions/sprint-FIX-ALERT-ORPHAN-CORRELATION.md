# Decision Journal — FIX-ALERT-ORPHAN-CORRELATION

**Date:** 2026-06-13  
**Agent:** dev-mcp-server  
**Task:** FIX-ALERT-ORPHAN-CORRELATION (P1-HIGH)  

---

## D-1: Root Cause Identification — TEXT vs INTEGER JOIN mismatch

**Decision:** The C-08 orphan count (103 on 2026-06-13, up from 3 on 2026-06-08) is caused by a structural type mismatch in the JOIN, not by a regression in write paths.

**Rationale:** `alerts.id` = TEXT (UUIDs + deterministic strings). `agent_signals.id` = INTEGER AUTOINCREMENT. SQLite never coerces TEXT = INTEGER as truthy; the LEFT JOIN always yields NULL. The "regression" is alert volume growth (~34×), not a new code bug.

**Alternative rejected:** Backfill-only approach — explicitly forbidden by task spec. Would fix symptom without fixing write path.

---

## D-2: Write Path Fix — Atomic Co-Write Inside Transaction

**Decision:** Modify both `storeAlerts()` and `storeAlertsFromCommander()` to co-write one `agent_signals` row per alert **inside the existing transaction** using `alert_id = alert.id`.

**Rationale:** The transaction already wraps the per-alert loop. Adding the `agent_signals` INSERT inside the same transaction ensures atomicity — if either write fails, both roll back. No risk of partial writes.

**Signal type used:** `verified_decision` — established in Task 1967-02 as the canonical type for rule-engine decisions. Chosen over generic `urgent_news` to make the correlation semantically distinct.

---

## D-3: Dedup Guard — SELECT 1 + skip vs INSERT OR IGNORE

**Decision:** Use an explicit `SELECT 1 FROM agent_signals WHERE alert_id = ? LIMIT 1` guard before each `agent_signals` INSERT (instead of relying on `INSERT OR IGNORE` alone).

**Rationale:** `agent_signals` has no UNIQUE constraint on `alert_id` (adding one would be a schema-breaking migration on existing DBs). The explicit check achieves idempotency without schema changes and is backward-compatible with all DB lineages.

---

## D-4: Legacy Compatibility — Table/Column Existence Probes

**Decision:** Probe for `agent_signals` table existence and `alert_id` column existence before preparing the INSERT statements. Skip gracefully if absent.

**Rationale:** Startup edge case documented in AC-7: mcp-server may start before schema migrations complete. The probes prevent crashes; the alert write succeeds; only the signal co-write is skipped.

---

## D-5: C-08 Query Fix Scope

**Decision:** Document the required C-08 query fix (`ON a.id = s.alert_id`) in the handoff but NOT commit it — the system-auditor flow doc is outside the dev-mcp-server zone.

**Rationale:** Zone enforcement rule: never commit outside `apps/mcp-server/`. The handoff is the correct escalation channel for cross-zone documentation changes.

---

## D-6: Scheduler Direct-INSERT Paths — Known Gap

**Decision:** Do NOT fix `taAlertScanJob`, `bbAlertScanJob`, `foreignFlowAlertJob` in this PR. Document as known gap requiring follow-up task.

**Rationale:** These jobs bypass `storeAlerts()`. Migrating them is a separate, well-scoped task. Fixing them here would expand scope beyond the S-sized task estimate and risk regressions in unrelated scheduler logic.
