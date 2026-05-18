---
sprint: 1951
branch: task/1951b-remote-triggers-smoke-test
size: S
zone: ops (OBSERVE)
depends_on: [1951a]
blocks: [1951c]
---

## TLDR

Run 24h parallel-run validation window (with existing agent .md `schedule:` blocks still active). Verify ≥3 RemoteTrigger ticks fire at expected times with correct agent sessions launched. Smoke-check targets: chef-morning 05:23 UTC, chef-eod 08:37 UTC, tnb-audit 20:13 UTC. Document smoke results in WORK channel.

## [PM] Planning Context

### Zone
- `ops` (observational — no code changes, only monitoring + reporting)

### Acceptance Criteria
- [ ] **AC-1 (24h window):** Validation window runs 2026-05-19 00:00 UTC to 2026-05-20 00:00 UTC (or 48h if needed). Existing agent `.md` `schedule:` blocks remain active during window (Phase 2 has NOT run).
- [ ] **AC-2 (≥3 smoke-test ticks):** At least 3 RemoteTrigger ticks fire correctly during window with correct agent session launched and notebook + WORK trace evidencing the firing:
  - chef-morning RemoteTrigger fires at 2026-05-19 05:23 UTC → unified-agent session launches → morning_dish published to MARKET
  - chef-eod RemoteTrigger fires at 2026-05-19 08:37 UTC → unified-agent session launches → eod_dish published to MARKET
  - tnb-audit RemoteTrigger fires at 2026-05-19 20:13 UTC → tran-ngoc-bau session launches → daily_audit published to WORK
- [ ] **AC-3 (no regression — AC-6 gate):** No MARKET duplicate dish is published in the 24h window (chef idempotency check — double-fire from CronCreate + RemoteTrigger must not corrupt content). If any duplicate detected, stop validation, report to PM, and Phase 1 rolls back (delete 17 new triggers).
- [ ] **AC-4 (documentation):** WORK Telegram captures timestamp + agent session + output summary for each of the 3 smoke-test ticks. Example: `[ops/1951b-smoke] chef-morning fired 2026-05-19T05:23:42Z → unified-agent session abc123 → MARKET morning_dish published (lines 5000–5042)`.

### Files to read first
- `docs/SPRINT_GOAL.md` §Success Metric — AC-4 (smoke success) + AC-6 (no parallel-run regression)
- `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` §6 Phase 1 (T2 validation window description), §8 AC-4, AC-6, Risk R2
- `docs/data/cowork-schedule.json` (cron times for chef-morning, chef-eod, tnb-audit)
- `docs/protocols/chef-pipeline-runbook.md` (chef telemetry, WORK line interpretation)

### Files to modify
None — observational only. All changes recorded in WORK Telegram + OBSERVATION notebook.

### Dependencies
1951a must complete successfully (all 17 RemoteTriggers created).

### Knowledge needed
- Chef telemetry format (docs/protocols/chef-pipeline-runbook.md) — understand `[chef] START`, `[chef] SENT`, `[chef] SILENT` lines
- MARKET channel verification — how to spot a published dish (grep MARKET, verify dish_type in message)
- TNB audit trace (docs/standards/cron-jobs.md) — what constitutes a successful daily_audit output
- Idempotency rule: chef.md per slot/cycle args produces deterministic output; double-fire with identical args should produce identical content (safe to dedup)

### Implementation notes
1. **Window setup:** Ops (or agent-father observing) starts passive monitoring at 2026-05-19 00:00 UTC. Both CronCreate (old) and RemoteTrigger (new) are active.
2. **Smoke-test tracking:**
   - Watch WORK channel for `[chef] START chef-morning` entry at ~05:23 UTC on 2026-05-19.
   - Grep MARKET for `morning_dish` message timestamp ≤ 10 min after START.
   - Repeat for chef-eod (08:37 UTC) and tnb-audit (20:13 UTC).
3. **Idempotency check (AC-6):**
   - For each day in window, grep MARKET for duplicate `morning_dish` / `eod_dish` / `evening_preview` entries (same date, identical content).
   - If duplicate detected → immediately stop validation, report partial results, escalate to PM.
4. **Documentation:** After each smoke-test tick fires:
   - WORK Telegram: `[ops/1951b-smoke] <slot_id> fired <timestamp> → <agent> session <session_id> → <output_summary>`
   - Capture screenshot or message ID for audit trail.
5. **End-of-window report:** After 24h (or if 3 ticks collected sooner), issue WORK summary:
   - Total smoke-test ticks verified: ≥3 ✓
   - Idempotency check: PASS (no duplicates) ✓
   - Readiness assessment: READY for Phase 1 AC-5 (persistence test)

### Expected output in handoff notes
- WORK Telegram log of all 3 smoke-test ticks (with timestamps, session IDs, output summaries).
- Idempotency check result: PASS or FAIL (if FAIL, include duplicate message IDs).
- Readiness to proceed to AC-5 persistence test.

---

## AC Summary
- 24h observation window active ✓
- ≥3 smoke-test ticks verified (chef-morning, chef-eod, tnb-audit) ✓
- No MARKET duplicate dishes detected (idempotency) ✓
- All 3 ticks traced in WORK Telegram ✓

---

## Observation Log — Smoke-Test Tick Tracker

| # | Slot | Expected Time (UTC) | Status | Evidence |
|---|------|---------------------|--------|----------|
| 1 | tnb-audit | 2026-05-18T20:13Z | **CONFIRMED** 2026-05-18T19:38Z PO c199 | tnb-audit RemoteTrigger fired at 20:13Z UTC; signal written to dashboard at 20:30Z (`tnb-20260518T203000`); audit handoff `docs/handoffs/tnb-audit-latest.md` populated. Session ID not captured in this validation pass (file-evidence only); cowork sandbox confirmed alive via TNB c72 self-report. |
| 2 | chef-morning | 2026-05-19T05:23Z | PENDING | Watch unified-agent session + MARKET morning_dish ≤10 min post-START. |
| 3 | chef-eod | 2026-05-19T08:37Z | PENDING | Watch unified-agent session + MARKET eod_dish ≤10 min post-START. |

**1951b status: IN PROGRESS — DO NOT CLOSE.** Tick 1 of 3 verified. Idempotency check ongoing (no MARKET duplicate detected this cycle).

**Acceptance path:** all 3 ticks must confirm + no MARKET duplicate dish in 24h window. Next PO assessment at chef-morning slot (2026-05-19T05:23Z).
