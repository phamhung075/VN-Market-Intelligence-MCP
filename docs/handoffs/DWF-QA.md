---
sprint: DYN-WF-FOUNDATION
task: DWF-QA
branch: task/dwf-qa-final
size: L
zone: qa
depends_on: [DWF-DEV-CROSS-5]
blocks: []
---

# DWF-QA — Final Acceptance + Deliberate-Violation Verification

## TLDR

Verify all Phase 0 + Phase 2 acceptance criteria and deliberate-violation tests (RED→GREEN proof). Confirm all 12 enabled slots still dispatch correctly after schedule prune. Validate R2 ops runbook accuracy. Gate for Phase 2 cutover stability.

## [PM] Planning Context

**Zone:** `qa`

**Acceptance Criteria — Phase 0 Verification:**

- [ ] **AC-P0-1:** Cowork-schedule.json pruned correctly (12 enabled slots, 0 disabled). Verify: `jq '[.slots[] | select(.enabled)] | length' docs/data/cowork-schedule.json` = 12.
- [ ] **AC-P0-2:** Routing-policy.json valid JSON with catch-all. Verify: `jq . docs/data/routing-policy.json` exits 0; last rule is catch-all routing to `po`.
- [ ] **AC-P0-3:** is_trading_day tool deployed and reachable via gateway. Verify: call tool for known holiday (2025-01-27) returns `is_trading_day: false, session_status: "holiday"`.
- [ ] **AC-P0-4:** pressure-state.json emitted after cowork tick with valid schema and calendar_status populated via is_trading_day tool.
- [ ] **AC-P0-1-3 (DV):** Deliberate-violation cherry-pick test: verify `chef-morning` is present after prune (was marked for deletion but shouldn't be).

**Acceptance Criteria — Phase 2 Verification:**

- [ ] **AC-P2-5:** Leader lock single-winner proof. Verify: DV-P2-1 test in DWF-coordination-phase2.test.ts passes (RED→GREEN).
- [ ] **AC-P2-6:** Per-work-item idempotent token suffix-free + explicit TTL. Verify: DV-P2-2..4, DV-P2-5..6 all pass (RED→GREEN proof).
- [ ] **AC-P2-7:** Published marker blocks duplicate sends. Verify: DV-P2-7 test passes.
- [ ] **DV Matrix Red-to-Green:** All 7 DV tests in DWF-coordination-phase2.test.ts land in same commit as production code. Each test goes RED on the deliberate-violation case and GREEN with the fix in place.

**Acceptance Criteria — Integration & Ops:**

- [ ] **AC-Dispatch-12:** All 12 enabled slots still dispatch correctly after Phase 0 (confirm via cowork cron simulation or manual trigger).
- [ ] **AC-Runbook-Accuracy:** R2 ops runbook (dwf-ops-runbook.md) is present, correct, and cites the right TTL values (1800s leader, 180s per-work-item, 100800s published marker).
- [ ] **AC-Fence-Proof:** DWF-routing-policy-fence.test.ts and DWF-coordination-phase2.test.ts are in mcp-server test suite and run GREEN post-Phase-2 (fence proofs not false-greens).

**Files to read first:**

- `docs/handoffs/DWF-DEV-MCP-1.md` (is_trading_day AC)
- `docs/handoffs/DWF-DEV-CROSS-1.md` (schedule prune AC)
- `docs/handoffs/DWF-DEV-CROSS-4.md` (Phase 2 AC, DV tests)
- `docs/handoffs/DWF-DEV-CROSS-5.md` (ops runbook)
- `docs/REQ_DYN-WF-FOUNDATION.md` § Deliberate-Violation Test Matrix (DV proof structure)

**Test execution plan:**

1. **Phase 0 smoke tests (bash):**
   ```bash
   # AC-P0-1: Schedule prune
   jq '[.slots[] | select(.enabled)] | length' docs/data/cowork-schedule.json
   # Expected: 12
   
   jq '[.slots[] | select(.enabled == false)] | length' docs/data/cowork-schedule.json
   # Expected: 0
   
   # AC-P0-1-3 (DV): Spot-check chef-morning
   jq '.slots[] | select(.slot_id == "chef-morning")' docs/data/cowork-schedule.json
   # Expected: non-empty slot object
   
   # AC-P0-2: Routing-policy JSON valid
   jq . docs/data/routing-policy.json > /dev/null
   # Expected: exit 0
   
   # AC-P0-2-3: Catch-all present
   jq '.routing_policy[-1] | select(.type == "*" and .severity == "*" and .target_agents[] == "po")' docs/data/routing-policy.json
   # Expected: non-empty (last rule is catch-all)
   
   # AC-P0-3: is_trading_day tool reachable
   mcp__claude_ai_gateway__call_tool(server="vn-market", tool="is_trading_day", arguments={date:"2025-01-27"})
   # Expected: { is_trading_day: false, session_status: "holiday", ... }
   
   # AC-P0-4: pressure-state.json valid schema
   jq . docs/data/pressure-state.json > /dev/null
   # Expected: exit 0; fields: emitted_at, calendar_status, signal_backlog, dev_queue_depth, host_headroom_mb
   ```

2. **Phase 2 test suite verification (bun test):**
   ```bash
   cd apps/mcp-server
   bun test src/__tests__/DWF-coordination-phase2.test.ts
   # Expected: all 7 DV tests pass (RED→GREEN proven in same commit)
   
   bun test src/__tests__/DWF-routing-policy-fence.test.ts
   # Expected: all tests pass (GREEN after CROSS-2 creates routing-policy.json)
   ```

3. **Dispatch verification (manual or simulation):**
   - Trigger cowork cron manually or wait for next */15 tick
   - Verify all 12 enabled slots attempt dispatch (check logs)
   - Confirm no stale disabled slots are dispatched

4. **Ops runbook verification:**
   - File `docs/protocols/dwf-ops-runbook.md` exists
   - Contains sections: Overview, Dark Window, Steps, Do NOT, Monitoring
   - Cites correct TTL values
   - Includes recovery checklist

**Dependencies:**

- Depends on DWF-DEV-CROSS-5 (all implementation + documentation must be complete)
- No further tasks block on QA completion (this is the final gate)

**Knowledge needed:**

- `docs/policies/dev-standards.md` — QA acceptance procedures
- `docs/REQ_DYN-WF-FOUNDATION.md` § Deliberate-Violation Test Matrix (RED→GREEN proof structure)
- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` (technical design details for spot-checking)

**Implementation notes:**

1. **RED→GREEN proof structure:**
   - Each DV test in DWF-coordination-phase2.test.ts has two assertions:
     - Case A (RED before fix): assert missing protection exists → test fails
     - Case B (GREEN after fix): assert protection works → test passes
   - Both cases in same commit → proves not a false-green
   - No "exit 0" without deliberate-violation tests run

2. **Fence test proof:**
   - DWF-routing-policy-fence.test.ts starts RED (file doesn't exist) → GREEN (file created by CROSS-2)
   - DWF-coordination-phase2.test.ts DV-P2-1..7 all RED→GREEN in same commit as implementation
   - This proves fences are live, not false-greens (per feedback_fence_false_green)

3. **Dispatch smoke test:**
   - Cowork team flow may dispatch all 12 slots in one tick, or stagger them
   - QA should verify: (a) all 12 slots have dispatch attempts logged (no missing), (b) no disabled slots are dispatched, (c) per-work-item token claim succeeds for first slot, dedupes any retries
   - Manual spot-check: pick one slot (e.g., chef-morning), verify it dispatches at its scheduled time, verify pressure-state.json is emitted with correct fields

4. **Verification checklist:**
   - [ ] Phase 0 ACs: prune, routing-policy, is_trading_day, pressure-state all correct
   - [ ] Phase 2 ACs: leader lock, per-work-item token, published marker all correct
   - [ ] DV tests: all RED→GREEN proofs in same commit
   - [ ] Dispatch: all 12 slots dispatch correctly (no stale dead slots)
   - [ ] Runbook: accurate, complete, included in commit

5. **Sign-off:**
   - QA verdict: APPROVED / BLOCKED
   - If APPROVED: Phase 2 cutover is stable; Phase 1 (DWF-PHASE1) unblocks as follow-up
   - If BLOCKED: PM escalates to architect for root-cause rethink before any retry

---

## RETURN

Upon completion, QA will commit with final verdict:

```
test(dyn-wf-foundation): Phase 0+2 acceptance verification APPROVED

All Phase 0 ACs verified: schedule prune (12 enabled, 0 disabled), routing-policy.json
(valid JSON, catch-all present), is_trading_day tool reachable, pressure-state.json
emitted with correct fields. All Phase 2 ACs verified: DV-P2-1..7 all RED→GREEN
(single-winner leader lock, suffix-free per-work-item token, published marker).
All 12 enabled slots dispatch correctly post-prune. ops runbook accurate (TTL values,
recovery checklist, dark-window behavior). Fence proofs are live, not false-greens.

Phase 2 cutover stable. DWF-PHASE1 unblocks as follow-up.

Task: DWF-QA
AC: AC-P0-1, AC-P0-2, AC-P0-3, AC-P0-4, AC-P2-5, AC-P2-6, AC-P2-7, AC-Dispatch-12, AC-Runbook-Accuracy, AC-Fence-Proof
```

This is the final gate. If APPROVED, the sprint is DONE. If BLOCKED, PM escalates to architect and developer for root-cause rethink.
