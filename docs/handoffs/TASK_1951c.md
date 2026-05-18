---
sprint: 1951
branch: task/1951c-remote-triggers-persistence-gate
size: XS
zone: .claude/ + docs/data/
depends_on: [1951b]
blocks: []
---

## TLDR

**SUPERSEDED BY ARCH PIVOT 2026-05-18.** Original AC ("17 RemoteTriggers survive session close+reopen") no longer applicable — agents-architect replaced per-slot RemoteTrigger model with a single master CronCreate `*/15 * * * *` dispatcher (`cdb556bd`, `2519d8a9`). New AC:
1. Verify master CronCreate `2da3291e` fires correctly and `.claude/flows/cowork-team/main.md` dispatches the right agent set per `docs/data/cowork-schedule.json` UTC ±2min match.
2. Update `docs/standards/cron-jobs.md` Cowork Schedule section to document the master-dispatcher model (remove stale 17-RemoteTrigger references).
3. **Open SPIKE** on `durable=true` non-persistence — known 1950-T5 finding: CronCreate is session-only despite the flag, master cron disappears across Claude Desktop restart. Architecture question requires architect investigation.

Blocked on 1951b passing AC-6 (zero double-publish).

## [PM] Planning Context

### Zone
- `.claude/` (agent infrastructure)
- `docs/data/` + `docs/standards/` (SSOT + reference docs)

### Acceptance Criteria (POST-PIVOT)
- [ ] **AC-1 (dispatcher correctness):** Master CronCreate `2da3291e` (`*/15 * * * *`) fires on schedule AND `.claude/flows/cowork-team/main.md` correctly resolves the active slot set by matching `docs/data/cowork-schedule.json` `cron` fields against current UTC ±2min. Verified by at least 2 observed `*/15` ticks during work hours where the dispatched agent set matches the schedule for that minute.
- [ ] **AC-2 (docs updated):** `docs/standards/cron-jobs.md` Cowork Schedule section rewritten to document the master-dispatcher model — single CronCreate row, pointer to `docs/data/cowork-schedule.json` SSOT, removal of any "17 RemoteTriggers" or per-slot CronCreate references. Mention legacy-RemoteTrigger 24h cutover note (1951d will delete them).
- [ ] **AC-3 (SPIKE filed):** New SPIKE task entered in Backlog — `SPIKE-1951f-durable-true-noncompliance` (or similar) — questioning why CronCreate `durable=true` does not persist the cron across Claude Desktop session close (1950-T5 finding). Architect-owned, 3h time-box, output = brief on whether RemoteTrigger-of-the-master-cron, or different durability mechanism, is required.
- [ ] **AC-4 (Phase 1 gate cleared):** 1951b AC-6 (zero double-publish) PASS; 1951c AC-1+AC-2+AC-3 PASS. Handoff note documents final status. 1951d gate is independent and tracked separately.

### Files to read first
- `docs/architecture-briefs/2026-05-18-cowork-team-command.md` — master-dispatcher design + 12 legacy RemoteTrigger IDs (§8)
- `.claude/commands/cowork-team.md` + `.claude/flows/cowork-team/main.md` — dispatcher logic
- `.claude/commands/crons/cron-cowork-team.md` — master CronCreate registration prompt
- `docs/data/cowork-schedule.json` — slot SSOT (cron fields drive the ±2min match)
- `docs/standards/cron-jobs.md` — current Cowork Schedule section to rewrite

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
