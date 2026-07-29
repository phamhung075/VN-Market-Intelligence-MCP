# Decision Journal — Sprint FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS · dev-mcp-server

**Sprint goal:** Reset reconcile_attempts+attempts when a bctc_vps_queue row recycles via Arm-2 grace-period retry (QA follow-up from D3C DONE_VERIFIED review, sprint-SYSTEMIC-REMAKE-P1-qa.md point 2).
**Agent:** dev-mcp-server
**Started:** 2026-07-29T10:55:34Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-29T10:55:34Z
**task-id:** FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS
**what-done:** Added `attempts = 0` to bctcQueueEnricherJob.ts's Arm-2 recycle UPDATE and `reconcile_attempts = 0` to bctcPdfPullJob.ts's pek_triggered UPDATE; added 2 regression tests; fixed a 3rd-file fixture-schema gap the change surfaced via full-suite run.
**what-considered:**
- Unconditional column reset on both UPDATEs (chosen) vs a schema-guard try/catch pattern (like bctcQueueEnricherJob.ts's `lastAttemptColumnAvailable`) — rejected as unnecessary weight since production `bctc_vps_queue` always carries `reconcile_attempts` (auto-migrated, `schema-financial-reports.ts`).
- For the surfaced regression (1352a-async-extraction-race.test.ts's hand-rolled fixture lacked `reconcile_attempts`, 4 tests SQLiteError'd): patch the one stale test fixture (chosen, 1-line) vs add a production schema-guard (rejected — bigger surface, deviates from the surgical unconditional design; no other of the ~20 other hand-rolled `bctc_vps_queue` fixtures in the suite actually exercises the `pek_triggered` write path, confirmed via full-suite log grep).
**why-decision:** Matches the task's own framing ("unconditional... no-op for first-time rows... correct and safe") and keeps the diff surgical; the regression was a stale test fixture drifting from prod schema, not a design flaw in the fix.
**why-change:** Scope grew by 1 file (test fixture) beyond the originally-scoped 4 — necessary to avoid landing a real regression; full-suite run (not just the 6 targeted files) is what caught it.
