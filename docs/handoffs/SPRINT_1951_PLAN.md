# Sprint 1951 Phase 1 Planning — Task Decomposition

**Date:** 2026-05-18 | **PM:** Agent | **Status:** READY FOR DISPATCH | **WIP:** 1/2 active

---

## Overview

Sprint 1951 Phase 1 decomposes into **3 atomic sequential tasks**:

1. **1951a (M, agent-father):** Create 17 RemoteTriggers via MCP tool from SSOT file
2. **1951b (S, ops OBSERVE):** 24h smoke-test validation (≥3 ticks verified, idempotency)
3. **1951c (XS, agent-father):** Session-close persistence gate + Phase 1 closure

All tasks tied to SPIKE-1951a gate outcomes (OQ-1/OQ-2/OQ-3 CLEARED 2026-05-18).

---

## Task Sequence & Dependencies

```
1951a [CREATE 17 RemoteTriggers]
      ↓ (blocks until DONE)
1951b [24h SMOKE-TEST OBSERVE]
      ↓ (blocks until DONE)
1951c [PERSISTENCE GATE + DOCS]
      ↓ (blocks until DONE)
Phase 1 COMPLETE — unblocks Phases 2-5 (Sprints 1952-1955)
```

**Critical path:** ~48h real time (24h smoke window + agent-father create + ops observe + gate check).

---

## Task 1951a — Create 17 RemoteTriggers

| Field | Value |
|-------|-------|
| **ID** | 1951a |
| **Title** | Sprint 1951 Phase 1 — Create 17 RemoteTriggers |
| **Size** | M (estimate: 2-3h agent-father work) |
| **Zone** | `.claude/` + `docs/data/` |
| **Owner** | agent-father |
| **Handoff** | `docs/handoffs/TASK_1951a.md` |
| **Blocks** | 1951b, 1951c |
| **Depends on** | none |

**What:** Call `RemoteTrigger` MCP tool 17 times, once per cowork schedule slot. Each call uses `cron_expression` + `trigger_prompt` from `docs/data/cowork-schedule.json` exactly. Capture returned trigger IDs and write back to SSOT file.

**Why:** Migrate cowork pipeline from session-scoped CronCreate blocks (F1 session-evaporation risk) to persistent RemoteTriggers (survive Claude Desktop restart).

**Key ACs:**
- AC-1: All 17 slots have RemoteTrigger in claude.ai (verified via `RemoteTrigger action=list` ≥20 triggers)
- AC-2: Cron expressions match SSOT exactly (zero drift)
- AC-3: Trigger prompts match SSOT exactly (spot-check 3)
- AC-4: Trigger IDs written to `docs/data/cowork-schedule.json`
- AC-5: No creation failures during run

**Files:**
- Read: `docs/SPRINT_GOAL.md`, `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` (§2.3 API shape), `docs/data/cowork-schedule.json`
- Modify: `docs/data/cowork-schedule.json` (add `trigger_id` field per slot)

---

## Task 1951b — 24h Smoke-Test Validation

| Field | Value |
|-------|-------|
| **ID** | 1951b |
| **Title** | Sprint 1951 Phase 1 — 24h Smoke-Test Validation Window |
| **Size** | S (estimate: 24h real time passive + 1h ops verification work) |
| **Zone** | `ops` (OBSERVE, no code changes) |
| **Owner** | ops |
| **Handoff** | `docs/handoffs/TASK_1951b.md` |
| **Blocks** | 1951c |
| **Depends on** | 1951a (completion) |

**What:** Run 24h parallel-run window with BOTH old CronCreate + new RemoteTrigger schedules active simultaneously. Verify ≥3 cowork slots (chef-morning, chef-eod, tnb-audit) fire correctly with correct agent sessions launched. Check for idempotency: no MARKET duplicate dishes from double-fire.

**Why:** Smoke-test RemoteTrigger reliability before removing old schedule blocks. Validate that new triggers fire consistently + don't corrupt content via double-fire.

**Key ACs:**
- AC-1: 24h window runs 2026-05-19 00:00 UTC → 2026-05-20 00:00 UTC
- AC-2: ≥3 RemoteTrigger ticks verified (chef-morning, chef-eod, tnb-audit)
- AC-3: No MARKET duplicate dishes (idempotency PASS)
- AC-4: WORK Telegram documents each smoke tick (timestamp, agent session, output summary)

**Files:**
- Read: `docs/SPRINT_GOAL.md` (AC-4, AC-6), brief §6 Phase 1, `docs/data/cowork-schedule.json` (times), `docs/protocols/chef-pipeline-runbook.md`
- Modify: none (observational only)

---

## Task 1951c — Persistence Gate + Phase 1 Closure

| Field | Value |
|-------|-------|
| **ID** | 1951c |
| **Title** | Sprint 1951 Phase 1 — Persistence Gate + Phase 1 Closure |
| **Size** | XS (estimate: 30 min — test + docs update) |
| **Zone** | `.claude/` + `docs/` |
| **Owner** | agent-father |
| **Handoff** | `docs/handoffs/TASK_1951c.md` |
| **Blocks** | none (phase gates completed) |
| **Depends on** | 1951b (completion) |

**What:** Verify all 17 RemoteTriggers survive Claude Desktop session close + reopen (the whole point of the migration). Call `RemoteTrigger action=list` POST-REOPEN to confirm all 17 persisted. Update `docs/standards/cron-jobs.md` Cowork Schedule section with RemoteTrigger reference table.

**Why:** Confirm session-persistence property of RemoteTriggers. Close Phase 1 by updating docs to reflect new architecture.

**Key ACs:**
- AC-1: All 17 RemoteTriggers persisted through session close+reopen
- AC-2: Post-reopen trigger fire confirmed (≥1 trigger fires after session reopen)
- AC-3: `docs/standards/cron-jobs.md` updated with RemoteTrigger section + 17-slot table
- AC-4: All Phase 1 AC gates (AC-1 through AC-6 in SPRINT_GOAL) are PASS

**Files:**
- Read: `docs/SPRINT_GOAL.md` (AC-5), brief §Phase 1, `docs/data/cowork-schedule.json`, `docs/standards/cron-jobs.md`
- Modify: `docs/standards/cron-jobs.md` (add RemoteTrigger Cowork Schedule section)

---

## Key Invariants

| Constraint | Status | Notes |
|-----------|--------|-------|
| **WIP ≤ 2** | 1/2 active initially | 1951a dispatched; 1951b+1951c blocked on prior tiers |
| **Handoff files mandatory** | ✓ | TASK_1951a/b/c.md created with full AC + dependencies |
| **Atomic tasks** | ✓ | Each task: single focus (create / validate / gate), ~2h work, explicit deps |
| **Zone per task** | ✓ | 1951a+c: `.claude/`+`docs/`; 1951b: `ops` (OBSERVE) |
| **SPIKE-1951a gates CLEARED** | ✓ | OQ-1 SUPPORTED, OQ-2 UNKNOWN (non-blocking), OQ-3 ANSWERED |
| **Phase 1 scope only** | ✓ | Phases 2-5 deferred to sprints 1952-1955 |
| **TASKS.md ≤ 80L** | ✓ | Rows 1-80 (with new 1951a/b/c, still under 80L) |

---

## Dispatch

**Ready for pickup:**
- **1951a (agent-father):** `run .claude/flows/agent-father/main.md` with task ID `1951a` and handoff `docs/handoffs/TASK_1951a.md`
  - Expected completion: 2026-05-19 ~06:00 UTC (3h creation + validation)
- **1951b (ops):** Start parallel with 1951a if desired (passive observation, no blocking). Runs 2026-05-19 00:00 UTC → 2026-05-20 00:00 UTC.
- **1951c (agent-father):** After 1951b completes (2026-05-20 00:30 UTC est.), complete session-close test + docs update. ~30 min.

**Total Phase 1 critical path:** ~48h real time (24h observation + 3h creation + 30 min gate + margins).

**Phase 1 completion target:** 2026-05-20 12:00 UTC (end of business day).

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| RemoteTrigger creation fails (4xx error) | LOW | Agent-father stops on first failure, reports partial count + error. PO escalates. |
| Trigger count limit hit at 17 | LOW | OQ-2 unknown but non-blocking. If hit, report and queue follow-up spike. |
| Smoke window misses one of 3 slots | LOW | Chef idempotent; if one slot misses, other 2 confirm system + TNB-audit independent trigger. |
| Session-close does NOT persist RemoteTrigger | MEDIUM | This is the discovery gate — if triggers evaporate, architect brief invalidated; Phase 1 FAIL, PO + architect rethink. |
| Idempotency regression (double-fire corrupts) | LOW | Chef already idempotent per Sprint 1949. AC-6 gates this. |

---

## Success Definition

**Phase 1 is COMPLETE when:**
1. All 17 RemoteTriggers created in claude.ai (1951a DONE).
2. ≥3 smoke-test ticks verified in 24h window, no duplicates (1951b DONE).
3. All 17 RemoteTriggers survive session close+reopen (1951c DONE).
4. Docs updated (`docs/standards/cron-jobs.md`).
5. All AC-1 through AC-6 in SPRINT_GOAL.md are PASS.

**Next:** Unblocks Phase 2 (Sprint 1952) — remove `schedule:` blocks from 7 agent .md files.

---

## Notes

- **Deferral:** Phase 2-5 (agent .md schedule removal, watchdog wiring, last_fired observability, docs cascade) deferred to Sprints 1952-1955 per brief §Scope.
- **Parallel work:** MAINT-1950b/c/d (agent-father low-priority maintenance) can run alongside 1951a/b/c since ops OBSERVE doesn't consume agent-father WIP.
- **SPIKE-1951a:** All three gates resolved 2026-05-18. No new OQs surfaced. Brief and SSOT file ready.
