## Task Report FIX-ALERT-ORPHAN-CORRELATION
date: 2026-06-13
outcome: APPROVED

changed:
- apps/mcp-server/src/infrastructure/db/alertStore.ts (storeAlerts + storeAlertsFromCommander co-write)
- apps/mcp-server/src/infrastructure/db/schema-news.ts (idempotent ALTER TABLE + index)
- apps/mcp-server/src/__tests__/FIX-ALERT-ORPHAN-CORRELATION.test.ts (new, 9 tests)

tests: 9 pass / 0 fail (targeted) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0

### Gate Evidence

**G1 — Tests + tsc:**
- bun test FIX-ALERT-ORPHAN-CORRELATION.test.ts in-container: 9 pass / 0 fail
- bun tsc --noEmit host: 0 errors

**G2 — Schema migration live:**
- PRAGMA table_info(agent_signals): alert_id TEXT at cid:28, 29 total columns, no corruption
- schema-news.ts:121: idempotent ALTER TABLE (try/catch guard)

**G3 — Co-write live probe:**
- Test alert id=qa-gate3-probe-1781337593868 stored via storeAlerts() into /app/data/market.db
- alerts row: YES
- agent_signals row: YES — from_agent=alert-engine, to_agent=all, signal_type=verified_decision, alert_id=probe-id
- Dedup: second call → signal count=1 (dedup guard confirmed)

**G4 — Handoff:**
- docs/handoffs/TASK_FIX-ALERT-ORPHAN-CORRELATION.md present
- Root cause documented: alerts.id TEXT vs agent_signals.id INTEGER JOIN mismatch
- Drop point documented: storeAlerts/storeAlertsFromCommander never wrote agent_signals rows
- 2 known gaps documented: scheduler direct-INSERT paths + system-auditor flow C-08 query

### Documented Residual (non-blocking)
- Scheduler jobs taAlertScanJob/bbAlertScanJob/foreignFlowAlertJob bypass storeAlerts — queued to PO as follow-up task
- system-auditor flow C-08 query (ON a.id = s.id) needs separate task in system-auditor zone
- Orphan 24h delta ~0 long-watch gate: open (multi-hour, non-blocking per task spec)

### Merge Status
No separate task branch — fix committed directly to main (7cbca67a) as per NO-BRANCHES policy.
Board: REVIEW → DONE
