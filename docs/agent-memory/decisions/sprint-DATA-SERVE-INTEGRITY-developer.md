# Decision Journal — Sprint DATA-SERVE-INTEGRITY · developer

**Sprint goal:** (ambient — task picked up via BOUNDED-1 idle-capacity auto-pickup; journal path designated by the task's own `sprint` field, distinct from the fleet's globally-active `sprint_goal.entries[]`)
**Agent:** developer
**Started:** 2026-07-31T00:54:08Z

---

### STEP developer-S1 · developer · 2026-07-31T00:54:08Z
**task-id:** FU-MACRO-SNAPSHOT-TIER-WORSTOF
**what-done:** Zone-detected `macroTools.ts` `get_macro_snapshot` handler as dev-mcp-server-owned (`apps/mcp-server/`); declined to implement, routed the board row forward instead of self-closing to REVIEW.
**what-considered:**
- Implement directly (XS/low-risk, router's dispatch prompt phrased for self-closeout) — REJECTED: `developer/init.md` Step 0 zone_dispatch + `dev-mcp-server/init.md` `zone_restricted`/`not_my_job` both hard-forbid; AUD-CP-1 precedence (dispatcher instruction cannot override a documented agent-spec invariant), same principle dev-macro-indicators applied 2026-07-30 on `FU-SBV-EFFECTIVE-DATE-COLUMN`.
- Route forward in-place (`dispatched_to` field, row stays `in_progress[]`, `.head.next_agent=dev-mcp-server`) vs decline-to-`backlog[]` (2026-07-30 SBV precedent, a leaf specialist with no forward-dispatch role) — chose forward-route per 2026-07-11 `WATCHLIST-DB-SYSMAP-DRIFT-FIX` precedent: zone label here is already correct, only executor needed correcting, and `developer` (unlike a leaf specialist) has an explicit dispatch responsibility.
**why-decision:** Precedent + hard zone boundary; pre-read `macroTools.ts:480-481` + `1881a-source-tier.test.ts` fixture to hand dev-mcp-server a load-bearing gotcha (shared carry=2/yield=4 fixture already exercises the under-report bug but asserts the OLD value).
**why-change:** Router's dispatch prompt assumed self-implementation + REVIEW flip; zone-detect (explicitly requested by the same prompt) overrode that per developer's own spec.
