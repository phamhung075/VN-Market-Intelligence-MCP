<!-- decision-journal: task FIX-ALERT-ORPHAN-CORRELATION QA gate -->
# Decision Journal — FIX-ALERT-ORPHAN-CORRELATION QA

**task-id:** FIX-ALERT-ORPHAN-CORRELATION
**agent:** qa
**date:** 2026-06-13
**verdict:** APPROVED

## Entry qa-S1

**what-considered:**
- G1a TARGETED: bun test FIX-ALERT-ORPHAN-CORRELATION.test.ts in-container → 9 pass / 0 fail (AC-1 through AC-7 + 2 extras). All 18 expect() calls green.
- G1b TSC: bun tsc --noEmit on host → 0 errors (in-container tsc SIGKILL = pre-existing memory pressure, not a new failure; host run is authoritative per precedent).
- G2 SCHEMA: PRAGMA table_info(agent_signals) live DB → alert_id TEXT at cid:28 (col 29 of 29). Column count sane, no corruption. idempotent migration confirmed in schema-news.ts:121 (try/catch ALTER TABLE).
- G3 LIVE CO-WRITE: injected test alert id=qa-gate3-probe-{ts} directly via bun into /app/data/market.db (named volume). Verified: alerts row written YES, agent_signals row written YES (from_agent=alert-engine, to_agent=all, signal_type=verified_decision, alert_id=probe-id). Dedup: second storeAlerts call → signal count=1 (dedup guard working).
- G4 HANDOFF: docs/handoffs/TASK_FIX-ALERT-ORPHAN-CORRELATION.md present. Documents: TEXT/INT join mismatch, secondary missing co-write, 2 known gaps (scheduler direct-INSERT paths + system-auditor flow query). All required elements present.
- DDD: alertStore.ts and schema-news.ts are both infrastructure layer. No forbidden domain→infra imports. PASS.
- Security: grep process.env → 0 hits. No hardcoded secrets/tokens. All SQL parameterized. PASS.
- Mock-guard: EXIT 0. No fabricated-data patterns.
- BCTC eval: not applicable (no BCTC report touch).
- Known gaps (DOCUMENTED, not blocking): (1) taAlertScanJob/bbAlertScanJob/foreignFlowAlertJob bypass storeAlerts — queued to PO. (2) system-auditor flow C-08 query still ON a.id=s.id — separate task, outside dev-mcp-server zone.
- Long-watch (DOCUMENTED, not blocking): orphan 24h delta ~0 across two consecutive Tier-3 audits — watch window open, multi-hour gate.

**why-change:** "no change from plan — all 4 blocking gates green, root cause definitively fixed, co-write live-verified, known gaps documented and queued"

**decision:** APPROVED — merge to main
