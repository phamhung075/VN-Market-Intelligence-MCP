# TASK 1951d — Sprint 1951 Phase 1 parallel-run cutover

**Owner:** ops  
**Priority:** MEDIUM  
**Zone:** `.claude/` + `docs/data/` (cowork-schedule.json)  
**Estimate:** 0.5–1 h (config update + MCP deletions + verification)  
**Size:** XS

---

## Problem

**Context:** Sprint 1951 Phase 1 (parallel-run validation) was completed with the master `*/15 * * * *` CronCreate dispatcher (session-scoped) and legacy RemoteTriggers (claude.ai-native, persistent). The cutover plan to retire legacy RemoteTriggers requires two prerequisites to be in place:

1. **cron-cowork-team skill:** Allows session-start re-registration of master `*/15 CronCreate` (Task 1957b — DONE 2026-05-20).
2. **cowork-master-cron-runbook:** Operational runbook for Layer A (RemoteTriggers) ↔ Layer B (CronCreate) management (Task 1957b — DONE 2026-05-20).

Both prerequisites are now in place. This task executes the cutover: delete 12 legacy RemoteTriggers and update their SSOT entries to `trigger_status='deleted'`.

**Blockers cleared:** Gate "1957b-done" was previously blocking this task. CLEARED on 2026-05-20 when 1957b shipped.

---

## Work

### Phase 1: Pre-deletion verification (10 min)

1. **Check cowork-schedule.json structure:**
   - Confirm 12 slots have `trigger_status` field (should be present from prior audit)
   - Identify which 12 slots have `trigger_status ≠ 'deleted'` (these are the legacy RemoteTriggers to delete)
   - Note their `trigger_id` values (required for CronDelete)

2. **Verify skill is accessible:**
   - `.claude/skills/cron-cowork-team/SKILL.md` exists and is readable
   - Confirm CLAUDE.md includes `/cron-cowork-team` reference under Skills (slash commands) section

### Phase 2: Deletion sequence (15–20 min)

1. **For each of the 12 legacy RemoteTriggers:**
   - Extract `trigger_id` from cowork-schedule.json
   - Call MCP tool: `RemoteTriggerDelete(trigger_id=<id>)` via vn-market server
   - Log: "Deleted RemoteTrigger {id} for slot {slot_name}"
   - On failure: escalate via WORK Telegram to ops (unexpected state; may need manual cleanup)

2. **Update SSOT (cowork-schedule.json):**
   - For each deleted trigger, set:
     - `trigger_id: null`
     - `trigger_status: 'deleted'`
     - `last_deleted_at: <ISO_timestamp>`
   - Commit: `"chore(ops/1951d): delete 12 legacy RemoteTriggers post-cutover; SSOT updated"`

### Phase 3: Verification (10–15 min)

1. **Immediate verification:**
   - Run `CronList` — confirm master `*/15 * * * *` dispatcher is present (should be active from session start or previous 1957b automation)
   - Run `RemoteTriggerList` — confirm returned list has zero entries for the 12 deleted triggers
   - Spot-check: `SELECT COUNT(*) FROM cowork_schedule WHERE trigger_status='deleted'` ≥ 12

2. **24–48h observation gate (follow-up by ops):**
   - Monitor cowork cycle in next ≥2h market hours (next chef morning ~ 2026-05-20 20:00Z + overnight → 2026-05-21 06:00Z)
   - AC-3: cowork cycle fires ≥1 time post-merge; no "trigger not found" errors
   - Document in OBSERVE-1951d-verify signal (to be emitted after 24h)

3. **Post-cutover runbook activation:**
   - Confirm CLAUDE.md has the `/cron-cowork-team` skill reference
   - On next session start (or before next long idle window >20 min during market hours), ops or user can invoke `/cron-cowork-team` to re-register master CronCreate if needed

---

## Acceptance Criteria

1. **AC-1 — SSOT updated:** All 12 legacy RemoteTriggers have `trigger_status='deleted'` + `trigger_id=null` in cowork-schedule.json

2. **AC-2 — 12 legacy RemoteTriggers deleted:** RemoteTriggerDelete called for each; MCP returns success for all 12

3. **AC-3 — cowork cycle fires post-merge:** Within 2h of task merge, at least one cowork cycle executes successfully (chef/tnb/news-scout log an entry). Zero "trigger not found" errors in logs.

4. **AC-4 — signal confirms cutover:** Emit `docs/signals/ops-1951d-cutover-complete.json` with summary

---

## Files to Edit

- **`docs/data/cowork-schedule.json`** — Update 12 rows: set `trigger_status='deleted'`, `trigger_id=null`, `last_deleted_at=<timestamp>`

## Files to Read (context only)

- **`.claude/skills/cron-cowork-team/SKILL.md`** — Understand re-registration protocol
- **`docs/protocols/cowork-master-cron-runbook.md`** — Follow operational procedures if any issues arise

---

## Out of Scope

- Do NOT delete cowork-schedule.json rows (keep them for audit trail)
- Do NOT modify RemoteTrigger definitions beyond setting `trigger_status='deleted'`
- Do NOT edit flow files or CLAUDE.md (already done by 1957b)

---

## Handoff Notes

**Pre-condition:** 1957b (cron-cowork-team skill + runbook) DONE and shipped. Gate cleared.

**Related tasks:**
- 1957b (DONE): Skill + runbook creation
- 1951c (DONE): Master dispatcher initial implementation
- 1951a–1951b (DONE): Parallel-run validation

**Dependencies:** None. Ready to dispatch immediately.

---

## Commit Convention

```
chore(ops/1951d): delete 12 legacy RemoteTriggers post-cutover; SSOT updated
```

Signal back: `docs/signals/ops-1951d-cutover-complete.json`

---

## [Ops] Implementation Notes

Post-implementation: This task completes Sprint 1951 Phase 1. The parallel-run (two-layer) architecture is now consolidated into single master CronCreate per session + session-start skill re-registration. Legacy RemoteTriggers are retired but remain in SSOT for audit trail (trigger_status='deleted').

**Next:** OBSERVE-1951d-verify (24h observation, auto-close on success).
