<!-- size-justification: 35L — single-task QA verdict journal, CI-RED CLUSTER-A data-drift fix (DJ-GATE-1). -->
# Decision Journal — QA — CI-RED-RECONCILE (CLUSTER-A)

## Entry qa-S1 · 2026-06-10 · task-id: CI-RED-CLUSTER-A

**verdict:** DATA DRIFT FIXED — sprint_goal schema drift resolved; 1338 test GREEN

**what-considered:**
- Ran `bun test src/__tests__/1338-sprint-goal-retrospective.test.ts` isolated: 2 pass / 1 fail BEFORE fix.
- Exact failure: `entries.length` = 0 because `orch-state.json .sprint_goal` was a plain string, not `{entries:[]}`.
- Production code `orchestrationHandler.ts projectSprintGoal()` L212-229 expects `raw["entries"]` as an Array.
- Test (`1338-sprint-goal-retrospective.test.ts`) expects `orchState.sprint_goal?.entries[]` with `sprint_id`.
- BOTH code and test agree on the canonical shape → drift is in the DATA.
- Verified git history: sprint_goal was last a proper entries[] object at commit 81e7723f (shape confirmed).
- Decision: fix DATA (`docs/data/orch/orch-state.json .sprint_goal`) — NOT the test, NOT the production code.
- Preserved current sprint context: CI-RED-RECONCILE (OPEN) + BCTC-PROSE-EXTRACT (CLOSED, from string).
- Atomic write via temp-then-rename; verified non-empty + valid JSON before mv.
- Re-ran test after fix: 3 pass / 0 fail / 1 skip — ALL GREEN.
- Confirmed full failed-set: only 1338 file drives all 4 CRIT checks (CI-TEST-02, MCP-TEST-01, SYS-TEST-01, CI-TEST-04) — architecture brief confirms "Same CI run as CI-TEST-02" for all 4.

**why-change:** Canonical contract is `entries[]` object (producer code + test both agree). The string was a drift artifact from an agent writing free-form prose directly to the key.
