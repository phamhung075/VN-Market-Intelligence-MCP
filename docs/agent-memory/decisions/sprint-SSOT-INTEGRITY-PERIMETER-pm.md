# Decision Journal — Sprint SSOT-INTEGRITY-PERIMETER · pm

**Sprint goal:** Close SSOT integrity perimeter — Zod schema + dual-point enforcement + auto-fix errors
**Agent:** pm
**Started:** 2026-06-27T10:35:00Z

---

### STEP pm-S1 · pm · 2026-06-27T10:35:00Z
**task-id:** SSOT-W1-ZOD-VALIDATOR-CLI (head-resume cycle)
**what-done:** 
- Flipped SSOT-W1-ZOD-VALIDATOR-CLI status TODO → DONE (commit 8d37f164 + AC suite 29/29 green, all gates passed)
- Advanced BOTH sprint head (.task_board.active_sprints[3].head) AND canonical top-level head (.head) from SSOT-W1-ZOD-VALIDATOR-CLI → SSOT-W1-SERVER-ENFORCE (rank-3)
- Set SSOT-W1-SERVER-ENFORCE status TODO → IN_PROGRESS (ready for dev-mcp-server dispatch)
- Updated next_action: "Wire OrchStateSchema.parse(next) into apps/mcp-server/src/infrastructure/orchStateStore.ts write path (throw on fail)"
- Validated atomically: G-1..G-6 all pass (orch-state-validate.sh exit 0)

**what-considered:**
- Whether to fix dangling refs NOW or DEFER: decided DEFER (refs are in signal_queue, not core task_board structure); fixing must land BEFORE Stage-1c enforcement activates (ranks SSOT-W1-HOOK-ENFORCE, SSOT-W1-BASH-SHIM)
- Task split: defer fixup to SSOT-W1-FIX-DANGLING-PAYLOAD-REFS backlog task (blocks ranks ≥SSOT-W1-HOOK-ENFORCE, not SSOT-W1-SERVER-ENFORCE which uses schema-only .parse)

**why-decision:** Dev-mcp-server's decision journal (task-id SSOT-W1-ZOD-VALIDATOR-CLI) documented 7 genuine dangling refs (rows 17,18,19,25,26,27 + malformed row 33). Schema-only .parse (not Stage-1c ref check) is safe to enforce at rank-3. Full ref-integrity enforcement at rank-5+ requires clean data first.

**why-change:** Head was stale at rank-2 (after rank-2 DONE); this cycle advances to rank-3 per SSOT-zod-validation-directive-2026-06-27.md Step 3. Synchronized both heads (sprint + canonical) to prevent re-dispatch bug (last tick showed head desync → rank-1 re-dispatch).

---

### STEP pm-S2 · pm · 2026-06-27T10:54:40Z
**task-id:** SSOT-W1-SERVER-ENFORCE
**what-done:**
- Flipped SSOT-W1-SERVER-ENFORCE status IN_PROGRESS → DONE (router-RAW-verified: commits 754df2aa + 5321b4f5)
- Updated tasks[2].note with router verification: "Router-RAW-verified GREEN (commits 754df2aa + 5321b4f5): typecheck pass + live schema-only parse PASSED on real orch-state.json"
- Added ranked_scope[2].status = DONE + done_by/done_at metadata
- Advanced BOTH heads (sprint + canonical, byte-identical) from SSOT-W1-SERVER-ENFORCE → SSOT-W1-FIX-DANGLING-PAYLOAD-REFS (backlog prerequisite, not rank-4 HOOK-ENFORCE)
- Set next_agent = dev-mcp-server, status = ready, next_action = clear 7 dangling payload_refs
- Validated atomically: G-1..G-6 all pass (orch-state-validate.sh exit 0)

**what-considered:**
- Whether rank-3 DONE blocks rank-4 (HOOK-ENFORCE): YES, it DEPENDS ON rank-1 (ZOD-SCHEMA) + rank-2 (CLI); rank-4 itself is BLOCKED by backlog task SSOT-W1-FIX-DANGLING-PAYLOAD-REFS
- Head routing choice: SKIP rank-4, route to BLOCKER prerequisite (SSOT-W1-FIX-DANGLING-PAYLOAD-REFS); unblocking it clears 7 dangling signal_queue refs, then rank-4 ref-check enforcement can activate

**why-decision:** Rank-3 completion blocks rank-4 via dependency graph (rank-4 declares blocks=["SSOT-W1-HOOK-ENFORCE","SSOT-W1-BASH-SHIM"]). Router-verified DONE with green typecheck + live parse. Backlog prerequisite is NOW ready-to-work; routing head there accelerates unblocking rather than queuing on rank-4's dependency.

**why-change:** Router delivered rank-3 GREEN; head auto-advances per SSOT-zod-validation-directive Step 3. Dependency-aware routing (not sequential rank-4) unblocks the full Stage-1c ref-check tier.
