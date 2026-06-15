# Decision Journal — Sprint KINHDICH-HOVER-DETAIL · dev-mcp-server

**Sprint goal:** CI-RED fix — 8 failing tests across 4 files
**Agent:** dev-mcp-server
**Started:** 2026-06-15T02:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-15T02:25:00Z
**task-id:** CI-RED-d20468c0-FIX
**what-done:** Fixed 8 failing tests in 4 files; all stale expectations updated to match current production behavior
**what-considered:**
- Option A: update test expectations to match actual enricher behavior (orphan arm cycles)
- Option B: roll back orphan arm in production to match old TC-4 contract
- Option C: update scheduler regex tests to match scheduleCron wrapper (introduced post-test write)
**why-decision:** Production code (orphan arm, scheduleCron wrapper) represents intentional improvements; tests were written before those changes shipped; updating tests is the correct fix — no production rollback warranted
**why-change:** no change from plan; root cause confirmed by reading enricher code execution order
