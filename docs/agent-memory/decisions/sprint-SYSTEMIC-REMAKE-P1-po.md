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

### STEP po-S2 · po · 2026-07-08T07:16:30Z
**task-id:** FACTORY-MACRO-delete-dead-ts-tree
**what-done:** Independently re-verified the BLOCKED state (9 real+resolvable __tests__ scraper importers; CI `bun test` globs ONLY apps/mcp-server/src/__tests__ per ci-per-file-isolation.sh L11; Dockerfile pure-Go; 33 Go _test.go = real coverage), chose FOLD-IN expanded to the ENTIRE __tests__/ tree + node_modules, expanded backlog-detail file-list, moved row review→in_progress, handed off to dev-macro-indicators.
**what-considered:**
- (b) split: leave task at src/_deprecated only, mint follow-up for __tests__ cleanup
- (a-narrow) fold in only __tests__/**/scrapers* (the 9 blockers)
- (a-wide) fold in the WHOLE __tests__/ tree + node_modules + reconcile dead testing.md
**why-decision:** The 9 scraper tests import the exact files this task deletes (inseparable co-residue) + 5 other __tests__ files already import nonexistent src/application|src/domain (dead TS→Go migration residue) + 0 live coverage lost (Go keeps 33 _test.go) + none run in CI → one atomic deletion converges; splitting fragments an indivisible deletion = churn (systemic-review).
**why-change:** widened original 2-subtree scope to the whole __tests__/ tree because deleting the scrapers while leaving their tests would strand broken importers, violating DoD "tests green / no dangling importer".
