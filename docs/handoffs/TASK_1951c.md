---
sprint: 1951
branch: task/1951c-remote-triggers-persistence-gate
size: XS
zone: .claude/ + docs/data/
depends_on: [1951b]
blocks: []
---

## TLDR

Verify all 17 RemoteTriggers survive a Claude Desktop session close + reopen cycle (the entire point of the migration). One human-loop step: close desktop session, wait 30s, reopen workspace. Call `RemoteTrigger action=list` to confirm all 17 still registered. Update `docs/standards/cron-jobs.md` reference to RemoteTrigger model. Close Phase 1.

## [PM] Planning Context

### Zone
- `.claude/` (agent infrastructure)
- `docs/data/` + `docs/standards/` (SSOT + reference docs)

### Acceptance Criteria
- [ ] **AC-1 (session-close survival):** All 17 RemoteTriggers survive Claude Desktop session close. Verified by: close all workspace windows, wait 30s, reopen workspace, call `RemoteTrigger action=list` and confirm all 17 triggers still appear in the list (≥20 total triggers, all with names matching slot_id).
- [ ] **AC-2 (re-fire after close):** After session close+reopen, the next scheduled RemoteTrigger tick fires normally (within expected time window, no session-scoped evaporation). Spot-check by capturing one trigger firing post-reopen in WORK.
- [ ] **AC-3 (docs updated):** `docs/standards/cron-jobs.md` Cowork Schedule section is updated to reference RemoteTrigger model (replace any stale CronCreate references). Include cron schedule table with all 17 slots + trigger names.
- [ ] **AC-4 (Phase 1 gate cleared):** All AC-1 through AC-6 from SPRINT_GOAL.md are PASS. Handoff note documents final status.

### Files to read first
- `docs/SPRINT_GOAL.md` §Success Metric — AC-5 (session-persistence gate — the whole point)
- `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` §Phase 1 implementation notes
- `docs/data/cowork-schedule.json` (17-slot inventory reference)
- `docs/standards/cron-jobs.md` (current Cowork Schedule section — update with RemoteTrigger info)

### Files to modify
- `docs/standards/cron-jobs.md` — update Cowork Schedule section (or create new section) to document RemoteTrigger model + 17-slot table with slot_id, cron, agent, trigger_id

### Dependencies
1951b must complete successfully (24h smoke-test window PASS, idempotency verified).

### Knowledge needed
- RemoteTrigger API: `action=list` returns all registered triggers with metadata
- Claude Desktop session lifecycle: closing workspace windows + reopening
- Documentation standards for cron-jobs.md (see existing Bun scheduler + agent CronCreate sections for style/format)

### Implementation notes
1. **Session-close test:**
   - Close Claude Desktop or all workspace windows (choose one consistent method).
   - Wait 30s (give network time to sync any state).
   - Reopen workspace.
2. **Verify survival:**
   - Call RemoteTrigger action=`list`.
   - Parse response: confirm ≥20 triggers returned, all 17 with names matching cowork-schedule.json slot_ids (chef-morning, chef-eod, ..., alert-commander-market).
   - Log result: `[pm/1951c] RemoteTrigger list POST-REOPEN: 20 total, 17 cowork ← ALL PERSISTED ✓`
3. **Post-reopen fire confirmation:**
   - If a scheduled trigger fires within 5 min of session reopen, capture that in WORK as evidence of re-fire (e.g., a gather trigger every 15 min during market hours).
   - If no trigger fires in window, note: "No scheduled triggers in reopen window; no fire to confirm, but list confirms persistence."
4. **Docs update:**
   - Open `docs/standards/cron-jobs.md`.
   - Navigate to "Cowork Schedule" section (or similar).
   - Add or replace with RemoteTrigger reference:
     ```markdown
     ## Cowork Schedule — RemoteTrigger Model (Sprint 1951 Phase 1)
     
     All cowork slots are registered as independent RemoteTriggers in claude.ai workspace. SSOT: `docs/data/cowork-schedule.json`.
     
     | slot_id | cron | agent | trigger_id |
     |---|---|---|---|
     | chef-morning | 23 5 * * 1-5 | unified-agent | <from cowork-schedule.json> |
     | ... (all 17 rows) |
     ```
   - Verify JSON syntax of cowork-schedule.json file reference is correct.
5. **Commit:** `chore(1951c): RemoteTrigger persistence verified + cron-jobs.md updated`

### Expected output in handoff notes
- Session-close test result: PASS (all 17 triggers survived + re-appear in list).
- Post-reopen fire confirmation: captured trigger name + timestamp (or "no triggers in window").
- Cron-jobs.md reference updated with RemoteTrigger table.
- Phase 1 AC summary: AC-1 through AC-6 all PASS.

---

## AC Summary
- Session-close survival test: 17/17 persisted ✓
- Post-reopen fire: confirmed or noted ✓
- Docs updated (cron-jobs.md RemoteTrigger section) ✓
- Phase 1 COMPLETE: all AC gates PASS ✓
