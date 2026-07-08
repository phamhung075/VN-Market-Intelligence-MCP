# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · po

**Sprint goal:** SYSTEMIC-REMAKE-P1 (churn-not-product remake; 8 root causes)
**Agent:** po
**Started:** 2026-07-08T01:22:39Z

---

### STEP po-S1 · po · 2026-07-08T01:22:39Z
**task-id:** CI-RED-0d28104a-FIX
**what-done:** Verified dev-team's ci_red diagnosis (re-ran DSI-S3-sector-fin.test.ts local: 16 pass/1 fail, AC-SEC-2a timeout 5001ms; real fetchReservoirLevels network fetch, no mock), minted BACKLOG FIX (zone apps/mcp-server/), marked signal processed.
**what-considered:**
- skip as flaky false-alarm (docs-only HEAD 0d28104a did not cause it)
- mint FIX for genuine test-hygiene bug + flag as recurring class (3rd file)
**why-decision:** Same root-cause class already fixed in 1410/262 (mock.module, 1efb6f918 CI-green) but DSI-S3 was dismissed as CI-flaky at backlog-detail.json:5724 without the mock — recurring per feedback_recurring_bug_escalation; proven fix pattern exists, so mint FIX + sweep 257/258 to close the class.
**why-change:** no change — followed triage-signals ci_red routing row.
