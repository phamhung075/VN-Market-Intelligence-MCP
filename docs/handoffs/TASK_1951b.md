---
sprint: 1951
branch: task/1951b-remote-triggers-smoke-test
size: S
zone: ops (OBSERVE)
depends_on: [1951a]
blocks: [1951c]
---

## TLDR

Run 24h parallel-run validation window. **Window:** 2026-05-18T20:34Z → 2026-05-19T20:34Z. Both lanes active: 12 legacy RemoteTriggers (status=`pending_delete`) + master CronCreate `2da3291e` (`*/15 * * * *` cowork-team dispatcher). Verify ≥3 ticks fire at the realigned 15-min grid (chef-morning **05:15Z**, chef-eod **08:45Z**, tnb-audit 20:13Z — tick 1/3 already CONFIRMED 2026-05-18T20:30Z c199). **AC-6 gate:** zero MARKET double-published dishes across the 24h window. On PASS → unblocks 1951c (dispatcher verify + docs + durable=true SPIKE) AND 1951d (delete 12 legacy RemoteTriggers).

## [PM] Planning Context

### Zone
- `ops` (observational — no code changes, only monitoring + reporting)

### Acceptance Criteria
- [ ] **AC-1 (24h window):** Parallel-run window 2026-05-18T20:34Z → 2026-05-19T20:34Z. Both lanes remain active throughout: (a) 12 legacy RemoteTriggers (status `pending_delete`), (b) master CronCreate `2da3291e` (`*/15 * * * *`) dispatching via `.claude/flows/cowork-team/main.md`.
- [ ] **AC-2 (≥3 ticks verified at realigned grid):** At least 3 dispatch ticks fire correctly with correct agent session launched + WORK trace:
  - tnb-audit at 2026-05-18T20:13Z → tran-ngoc-bau session → WORK daily_audit. **CONFIRMED 2026-05-18T20:30Z c199.**
  - chef-morning at 2026-05-19T**05:15Z** (was 05:23Z; BLOCK-1 realignment) → unified-agent session → MARKET morning_dish ≤10min post-START.
  - chef-eod at 2026-05-19T**08:45Z** (was 08:37Z; BLOCK-1 realignment) → unified-agent session → MARKET eod_dish ≤10min post-START.
- [ ] **AC-3 / AC-6 (zero double-publish):** Zero MARKET duplicate dishes across the 24h window. Both lanes firing the same slot must NOT produce a second dish (chef idempotency must hold). Any duplicate → STOP validation, freeze 1951d, escalate to PM, Phase 1 rolls back (delete the master CronCreate, keep 12 legacy RemoteTriggers).
- [ ] **AC-4 (documentation):** WORK Telegram captures timestamp + agent session + output summary for each tick. Example: `[ops/1951b] chef-morning fired 2026-05-19T05:15:42Z (master-dispatch) → unified-agent session abc123 → MARKET morning_dish (msg id N)`.

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
| 1 | tnb-audit | 2026-05-18T20:13Z | **CONFIRMED** 2026-05-18T20:30Z PO c199 | tnb-audit fired 20:13Z; signal written to dashboard at 20:30Z (`tnb-20260518T203000`); audit handoff `docs/handoffs/tnb-audit-latest.md` populated. File-evidence only; cowork sandbox confirmed alive via TNB c72 self-report. |
| 2 | chef-morning | 2026-05-19T**05:15Z** (BLOCK-1 realigned from 05:23Z) | PENDING | Watch unified-agent session + MARKET morning_dish ≤10 min post-START. |
| 3 | chef-eod | 2026-05-19T**08:45Z** (BLOCK-1 realigned from 08:37Z) | PENDING | Watch unified-agent session + MARKET eod_dish ≤10 min post-START. |

**Idempotency / AC-6 — Zero double-publish tracker (24h window 2026-05-18T20:34Z → 2026-05-19T20:34Z):**

| Slot | Lane A (legacy RemoteTrigger) | Lane B (master CronCreate dispatch) | Duplicate? |
|------|------------------------------|-------------------------------------|------------|
| tnb-audit | tick 20:13Z observed | dispatch at next */15 tick after 20:13Z | TBD — no duplicate noted in first observation; continue watching across window |
| chef-morning | pending 05:15Z | pending 05:15Z (matched ±2min by dispatcher) | PENDING |
| chef-eod | pending 08:45Z | pending 08:45Z (matched ±2min by dispatcher) | PENDING |

**1951b status: IN PROGRESS — DO NOT CLOSE.** Tick 1 of 3 verified. AC-6 zero-double-publish gate not yet evaluable (no chef tick yet in window).

**Acceptance path:** all 3 ticks confirmed + zero MARKET duplicate dish across 24h window. Next PO assessment at chef-morning slot 2026-05-19T05:15Z; AC-6 closes 2026-05-19T20:34Z. On PASS → 1951c unblocked.

---

## AC-7 — CUTOVER BLOCKER (added 2026-05-18T21:15Z by PO c202)

**Source signal:** `docs/signals/processed/cowork-team-1951-fire-drift-detected.json` (cowork-team 2026-05-18T21:07Z).

**Finding:** Master cron `2da3291e` (`*/15 * * * *`) is firing ~7min after each nominal tick instead of within the ±2min jitter spec (CronCreate docs: max 10% / ~1.5min for `*/15`). Two consecutive fires confirmed:

| Nominal tick | Actual fire | Drift |
|--------------|-------------|-------|
| 2026-05-18T20:45:00Z | 2026-05-18T20:52:10Z | 7.2 min |
| 2026-05-18T21:00:00Z | 2026-05-18T21:07:08Z | 7.1 min |

Root-cause hypothesis: CronCreate jobs only fire while REPL is idle. If Claude is mid-query at nominal tick, the fire is deferred until idle — observed deferral ~7min.

**Impact:** `.claude/scripts/cowork-match-slots.js` matches `now ±2min` against cron expressions. When fire happens at :07, the window is `[05–09]`, which never includes `:00` (the nominal `*/15` slot). Every fire silent-exits without spawning any agent. AC-6 idempotency observation is uncorrupted (lane B never publishes), but **no master-dispatched chef tick will ever reach MARKET** under current matcher logic.

**Cutover decision:** 1951d (delete 12 legacy RemoteTriggers) is held until SPIKE-1951f architect decision lands and 1951g fix merges. AC-6 PASS alone is INSUFFICIENT — it only proves "lane B publishes nothing", not "lane B publishes correctly".

**Next steps:**
1. SPIKE-1951f → architects-architect (HIGH) — pick option A/B/C/D; recommendation in signal is Option B (nominal-tick rounding in matcher).
2. 1951g → dev-mcp-server (HIGH, blocked on SPIKE-1951f) — implement chosen option + regression test reproducing the :07 drift case.
3. After 1951g merges → ops re-runs ≥1 chef-master tick at realigned grid in the residual window (if any). If window already closed, open a follow-up 24h re-validation sprint.
