<!-- size-justification: 280L — dual-zone multi-phase sprint with 7 deliverables, 4 resolved design decisions, 8-task PM breakdown, DV test matrix, ops runbook pointer -->

# DWF-ARCH — Architect Handoff

**Sprint:** DYN-WF-FOUNDATION
**Task:** DWF-ARCH
**Author:** architect · 2026-05-30T21:02 UTC
**Brief:** `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md`

---

## [Architect] Brownfield Findings

- **Zone:** multi
  - `apps/mcp-server/` — dev-mcp-server (new `is_trading_day` tool; fence test for routing-policy)
  - `cross-service` (docs/data/, docs/agents/cowork-team/flow/main.md) — developer

  PM must split into two per-zone subtask tracks: **DWF-DEV-MCP** and **DWF-DEV-CROSS**.

- **Verified paths:**
  - `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` — INSERT OR IGNORE + stale-steal fully implemented; kinds: `cowork-slot|sprint-task|dashboard-row|commit-mutex`; `_injectCoordinationDb()` available for tests
  - `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` — `SERVER_SESSION_ID = pid-<pid>-ts-<startupMs>`; process-level, single Docker mcp-server is the cross-session truth point
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — toolRegistry flat array; add one import + one push (no server.ts edit needed)
  - `apps/mcp-server/src/domain/services/financial-reports/earningsCalendar.ts` — canonical pattern for static-data domain services; `vnTradingCalendar.ts` follows same shape
  - `docs/agents/cowork-team/flow/main.md` — Step 4.6 currently uses tick-suffixed keys (`"cowork-slot:" + slot.agent + ":" + nominal_tick`) — this IS the R3 violation; must be rewritten to suffix-free `"cowork-slot:" + slot.slot_id` with `ttl_seconds=180`
  - `scripts/agents-flow/cowork-match-slots.js` — zero changes required (slot-matcher is pure cron matching, unaffected by lock design)

- **Reuse patterns:**
  - `task_claim / task_heartbeat / task_release` — all operational, no new kind, no schema migration
  - `_injectCoordinationDb(new Database(':memory:'))` + `_resetCoordinationDbState()` — use for all Phase 2 tests
  - `earningsCalendar.ts` static-data pattern for `vnTradingCalendar.ts`
  - McpServer `server.tool(...)` pattern from `coordinationTools.ts` for `isTradingDayTool.ts`

- **Design decisions resolved:**
  - **ARCH-DECIDE-A** (is_trading_day data source): embedded VN calendar JSON — no network, no geo-block risk. Files: `vnHolidayData.ts` (constants) + `vnTradingCalendar.ts` (pure fn). Yearly update: dev-mcp-server task each October.
  - **ARCH-DECIDE-B** (leader lock renewal): explicit `task_heartbeat(task_id="cowork-leader")` on each tick win, after dispatch body. TTL = 1800s (2 × heartbeat). NOT reclaim pattern (race risk).
  - **ARCH-DECIDE-C** (`published:<work-id>` storage): reuse `task_claim(kind="cowork-slot", key="published:<slot_id>:<YYYY-MM-DD>", ...)` — no new table, no new enum. Check + claim lives in the publishing agent flow step, not in mcp-server code.
  - **ARCH-DECIDE-D** (published marker TTL): 100800s (28h) for daily slots; 691200s (8 days) for weekly slots (digest-sunday, tnb-audit).

- **Blocking constraints (hard, non-negotiable):**
  - **R3:** per-work-item key = `cowork-slot:<slot_id>` — no tick suffix, no agent-name prefix. Using `slot.slot_id` (not `slot.agent`).
  - **R1:** every per-work-item `task_claim` must pass `ttl_seconds: 180` explicitly. Default 3600 is forbidden for per-work-item claims.
  - **Leader TTL:** `ttl_seconds: 1800` must be explicit on leader claim.

- **Implementation sequence (mandatory order):**
  1. DWF-DEV-MCP-1 — `is_trading_day` tool (required by pressure-state emitter in step 5)
  2. DWF-DEV-MCP-2 — routing-policy fence test (run RED first)
  3. DWF-DEV-CROSS-1 — cowork-schedule.json prune (Phase 0, zero behavior change)
  4. DWF-DEV-CROSS-2 — routing-policy.json creation (fence test turns GREEN)
  5. DWF-DEV-CROSS-3 — pressure-state.json emitter (depends on is_trading_day deployed)
  6. DWF-DEV-CROSS-4 — Phase 2 leader lock + per-work-item token (cowork flow rewrite + DV tests)
  7. DWF-DEV-CROSS-5 — published marker documentation + ops runbook
  8. DWF-QA — all ACs + 12-slot dispatch verification

- **Test files to CREATE:**
  - `apps/mcp-server/src/__tests__/DWF-is-trading-day.test.ts` — AC-P0-3-1..7 including DV holiday-stub
  - `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts` — DV-P2-1..7 (in-memory DB)
  - `apps/mcp-server/src/__tests__/DWF-routing-policy-fence.test.ts` — AC-P0-2-5 fence + catch-all

- **New source files to CREATE:**
  - `apps/mcp-server/src/domain/services/vnHolidayData.ts`
  - `apps/mcp-server/src/domain/services/vnTradingCalendar.ts`
  - `apps/mcp-server/src/interface/mcp/tools/system/isTradingDayTool.ts`
  - `docs/data/routing-policy.json`
  - `docs/protocols/dwf-ops-runbook.md`

- **Files to MODIFY:**
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — add `registerIsTradingDayTool`
  - `docs/data/cowork-schedule.json` — prune 13 dead slots; 12 enabled remain
  - `docs/agents/cowork-team/flow/main.md` — add Step 0b (leader lock), rewrite Step 4.6 (R3+R1 fix), add Step 4.6b (heartbeat), add Step 4.8 (pressure-state emitter), update size-justification

- **Scan clean:** true ✓

- **BUILD-STANDARD: lean**
- **BUILD-STANDARD-REF:** `docs/standards/microservice-build-standard.md`

---

## RETURN

```
DONE: Technical design complete, brownfield findings written to docs/handoffs/DWF-ARCH.md
ZONE: multi — apps/mcp-server/ + cross-service
NEXT: pm | break design into 8 atomic tasks per implementation sequence; create DWF-DEV-MCP and DWF-DEV-CROSS handoffs
HANDOFF: docs/handoffs/DWF-ARCH.md
PIPELINE: continue
```
