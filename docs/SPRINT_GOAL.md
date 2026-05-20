# Sprint 1957 Goal — COWORK RESURRECTION (Hot-Fire + Phase-1 Completion)

**Status:** OPEN | **Opened:** 2026-05-20T00:00Z | **Theme:** Restore MARKET channel cowork output (~44h silent: unified-agent chef last fired 2026-05-18T04:08Z; alert-commander last 2026-05-18T09:00Z). Root cause: master `*/15 * * * *` CronCreate dispatcher (registered in 1951c) is session-scoped per Claude Desktop. The session that registered it ended; cowork went dark. The 12 legacy RemoteTriggers (flagged `pending_delete` awaiting 1951d cutover) were the only persistence backstop and clearly are not firing either — `last_fired=null` on every slot in `cowork-schedule.json` confirms either (a) RemoteTriggers fired but agents never write back, OR (b) RemoteTriggers were already paused in anticipation of cutover. Either way: zero output for two market days. User trust burning every additional hour. Architect briefs from 2026-05-18 (`cowork-master-scheduler.md` + `cowork-reorder-and-cook-schedule.md`) were never finished — sprints 1951b-1956 absorbed dev capacity (BCTC RCA + Docker outage firefight). 1951d cutover task exists in Backlog but is gated on a missing skill + runbook that the original brief declared MANDATORY but were never built.

# Goal

## Vision
MARKET channel resumes within the next 1-hour cron tick. Cowork persistence becomes truly session-evaporation-immune by combining the RemoteTrigger persistence guarantee (SPIKE-1951a confirmed: survives session-end natively) with the dispatcher's spawn-fanout (CronCreate `*/15`). Operator gains a documented session-start hook + a documented silence-detection runbook so the next session-evaporation event self-recovers in <30 min instead of going dark for days.

## Scope

**IN — three parallel tracks:**

- **T1957a HOT-FIRE (Size=XS, ops zone, NOW):** Reinstate the 12 legacy RemoteTriggers (`trig_019nwLpkYELqFdE1DZaRhPUk` chef-morning, `trig_015M6yJMwShWmVcm6XNpVQ3U` chef-intraday, `trig_011HNsRMNiQwa3vNwN1b9Anh` chef-eod, `trig_01CLotVE4XinDFxM2jErUCir` chef-evening, `trig_014GzK19w1ZNpwnRjA91ce3P` digest-sunday, `trig_01LpUxJ98v2aK22FqLSBtL1G` tnb-audit, `trig_01Du7kZ59vzagGh5GvkTY3Gi` financial-analyst-morning, `trig_011JSNKJEMs5fQwGCmLUkuWT` financial-analyst-midday, `trig_01Mooo3zi5MFysRAWsHwaztd` news-scout-offhours, `trig_016gauuJbAhdbzNcA3LYCFSh` news-scout-sentiment, `trig_01W62B3yS7AERMwsGrap4e7U` market-watcher-offhours, `trig_01PUAqNa8gMWRjc6DWqcV7xh` market-watcher-eod). Verify each via `RemoteTrigger action=get`; if any disabled, re-enable via `action=update enabled=true`; if any deleted, recreate from SSOT (cron + trigger_prompt from `cowork-schedule.json`). Update `cowork-schedule.json` slot rows: set `trigger_status="active"` (drop `pending_delete`). Confirm a non-null `last_fired` (or live trigger run record) within 2 hours. **Restores guaranteed dishes within 1 cron tick.**

- **T1957b PHASE-1 COMPLETION (Size=S, agent-father zone, 24h):** Build the two MANDATORY artefacts that the original brief required but were never created:
  1. `.claude/skills/cron-cowork-team/SKILL.md` — session-start hook content. Reads `docs/data/cowork-schedule.json`, calls `CronCreate` to register `*/15 * * * *` master dispatcher pointing at `.claude/flows/cowork-team/main.md`. Idempotent: detects existing master cron and skips if found.
  2. `docs/protocols/cowork-master-cron-runbook.md` — re-register procedure + silence-detection rules (no cowork-fire signals >20 min during market hours 02:00–08:30 UTC → re-register). Includes session-evaporation diagnostic flow.
  3. CLAUDE.md hook pointer (1 line): `- Cowork master cron: invoke .claude/skills/cron-cowork-team/SKILL.md at session start`.
  AC: artefacts exist, runbook tested by simulated session-restart, master CronCreate idempotency verified by running skill twice and confirming no duplicate cron.

- **T1957c CUTOVER UNBLOCK (Size=XS, ops zone, after T1957b):** Update task 1951d in `docs/TASKS.md` to add `T1957b-done` as additional pre-req. Cutover (delete the 12 legacy RemoteTriggers) cannot proceed until master CronCreate re-registration is documented + a skill exists to recreate it, OTHERWISE cutover guarantees the next session-end is another 44h silence event.

**OUT — explicitly deferred to later sprints:**
- Phase 2 from master-scheduler brief (remove `schedule:` blocks from 7 agent .md files) — separate sprint after T1957b holds 24h.
- Phase 3 (dev-team Step 0 watchdog) + Phase 4 (`last_fired` write-back from chef/tnb/digest-predict flows) — already queued in older sprint backlog.
- Cowork-reorder brief (`2026-05-18-cowork-reorder-and-cook-schedule.md`) was substantially shipped in Sprint 1951e (chef.md synthesize step) and Sprint 1949 cron alignment; only AC verification + audit-target update remain — separate sprint.

## Success Metric (Phase 1 — current sprint)

- **AC-1 (silence break):** Within 90 min of T1957a dispatch, MARKET channel receives ≥1 cowork-published message (any agent: chef morning/intraday, alert-commander event, market-watcher EOD if VN-mkt-close window). Verified by `get_market_message_digest(limit=5)` showing fresh timestamp newer than 2026-05-20T00:00Z.

- **AC-2 (trigger inventory):** `RemoteTrigger action=list` shows ≥15 active triggers (3 pre-existing + 12 reinstated). Each of the 12 legacy slot_ids has a live trigger. `cowork-schedule.json` reflects `trigger_status="active"` for all 12 reinstated slots.

- **AC-3 (skill exists):** `.claude/skills/cron-cowork-team/SKILL.md` exists. Manual invocation registers `*/15 * * * *` master CronCreate without duplicate; second invocation is a no-op (idempotency).

- **AC-4 (runbook exists):** `docs/protocols/cowork-master-cron-runbook.md` exists with sections: Session-start procedure, Silence-detection rules, Recovery flow, Sanity tests. CLAUDE.md has 1-line pointer.

- **AC-5 (cutover blocker updated):** Task 1951d in `docs/TASKS.md` Backlog row has updated Blocked-by listing `T1957b-done` AND its descriptions makes clear that deleting the 12 legacy RemoteTriggers without skill + runbook in place is a regression.

- **AC-6 (24h continuous):** From T1957a dispatch + 24h, MARKET receives ≥4 cowork messages (at least: 1 chef-morning if Mon-Fri, 1 chef-eod if Mon-Fri, 1 tnb-audit, 1 chef-evening). Acceptable if T1957a dispatches on a weekend — relax to "≥1 weekend digest OR ≥1 alert-commander event OR ≥1 financial-analyst run".

## Constraints

- T1957a is HOTFIX path: ops re-enables RemoteTriggers via existing MCP tool. No code change. No new triggers. No PR review. Just restore the persistence layer that already exists.
- T1957b is a documentation + skill sprint, not code. Zone = `.claude/skills/` + `docs/protocols/` + `CLAUDE.md` (1 line). No production code change.
- T1957c is `docs/TASKS.md` row edit only.
- The recurring-bug-escalation freeze (Sprint 1954 mcp-server PDF/BCTC patches) does NOT apply — zones are `.claude/`, `docs/`, `RemoteTrigger MCP`.
- WIP cap (max 2 In Progress) still applies — T1957a + T1957b can both run since they're independent zones.

## References

- `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` — original brief (v2 RemoteTrigger model + SPIKE-1951a findings)
- `docs/architecture-briefs/2026-05-18-cowork-reorder-and-cook-schedule.md` — chef/gatherer redesign (partially shipped 1951e)
- `docs/data/cowork-schedule.json` — SSOT, 17 slots (12 with legacy trigger_id, 4 supplementary slots OQ-1 hourly per SPIKE-1951d, 1 disabled `digest-monday-predict`)
- `.claude/flows/cowork-team/main.md` — dispatcher flow (fires when master CronCreate is alive)
- `docs/TASKS.md` task 1951d — cutover that must be re-blocked

## Carry-over from Sprint 1955

- 1955a + 1955b dispatch still gated on 1954a Done (current WIP=2). Sprint 1957 does not touch mcp-server zone — non-blocking. WIP cap shared across all sprints (max 2 In Progress).
- OBSERVE gates 2026-05-20T07:22Z + 2026-05-20T09:00Z + 2026-05-25 (multiple). Sprint 1957 ops dispatch (T1957a) does not consume mcp-server zone capacity.
