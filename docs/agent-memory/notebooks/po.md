# PO Notebook

## Last updated: 2026-05-18T19:20Z · Cycle: c198 — SPIKE-1951d decided (Option C, hourly cadence)

### c198 session summary

**Spawn:** Architect/PM dispatched SPIKE-1951d decision request after 1951a partial completion (12/16 RemoteTriggers created; 4 sub-hourly slots rejected by API min-interval=1h).

**Decision:** **Option C — accept hourly cadence.**

Rationale (recorded for next-cycle audit):
1. **Pipeline integrity preserved.** 12 working triggers already cover every `guaranteed: true` slot (chef-morning/eod/evening, tnb-audit, digest-sunday) + financial-analyst x2 + 5 non-guaranteed off-hours. The 4 failing slots are supplemental market-hours gatherers (`guaranteed: false`) — no MARKET dish depends on them.
2. **Option A self-defeating.** CronCreate fallback is session-scoped → re-introduces F1 (the failure Sprint 1951 was built to eliminate). Rejected.
3. **Option B unproven.** Self-requeue/watchdog pattern is undocumented; building it inside the 1945 stabilisation window (gate 2026-05-20T07:22Z) doubles risk surface. Rejected.
4. **Frequency cost acceptable.** Hourly vs 15-min during market hours means 7 hits/day vs 28 for news-scout supplements. News urgency is already covered by `news-scout-sentiment 0 5` (pre-market batch) + `news-scout-offhours 0 */4` (every 4h). Alert-commander market-hours hourly aligns with hourly gatherer cadence — no informational gap.
5. **Architecture cleanliness.** One trigger model (RemoteTrigger only), no hybrid CronCreate+RemoteTrigger architecture, no second SPOF.

**Files updated this cycle:**
- `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` — added §2.4 "SPIKE-1951d Finding: Sub-hourly API Constraint" with decision + rationale.
- `docs/TASKS.md` — moved SPIKE-1951d from Backlog to Done (79L, under 80L cap). Added task 1951e (agent-father, XS) to Backlog.
- `docs/agent-memory/notebooks/po.md` — this cycle entry.

**WORK Telegram:** SENT (message_id 8043) — one-liner decision + 1951e filing notice.

### Carry-over for next cycle

- **WATCH 2026-05-19T05:23Z** — first chef-morning RemoteTrigger fire (Sprint 1951 AC-4 smoke #1). Independent of 1951e.
- **WATCH 1951e execution** — agent-father picks up 1951e. Expected output: 4 new `trigger_id` values in `cowork-schedule.json`, `trigger_error` field removed for all 4. Validate cron strings exactly: `0 2-8 * * 1-5` (news-scout-market, market-watcher-market, alert-commander-market) + `0 * * * 1-5` (market-watcher-prepost — note: hourly all hours Mon-Fri, NOT `0 */2`; brief says hourly is acceptable per Option C wording; if agent-father proposes `0 */2` for prepost defer to their judgement — PM/architect can confirm). If agent-father misreads as `0 */2 * * 1-5` (every 2h), that is also acceptable per Option C scope — no rejection.
- **GATE 2026-05-20T07:22Z** — 1948a/b/c unblock window. Unchanged.
- **Brief §2.4 review:** the §2.4 paragraph adds clarification that OQ-1 finding "syntax accepted" was misleading; runtime min-interval=1h is the binding constraint. Architects spawning future RemoteTrigger work must read §2.4, not just §2.3.
- **WIP discipline:** Current WIP = 1951b (OBSERVE), 1951c (TASK). 1951e enters Backlog — not promoted. If agent-father has capacity after 1951c handoff, promote 1951e to In Progress (XS task, single-session work). WIP cap respected.
- **Recurring-bug counter:** No new patches this cycle. Sprint 1951 architecture decision, not a bug fix. Counter unchanged.

### Historical (preserved from c197)

c197 confirmed Sprint 1951 (no override), prioritised 1951 over 1948 gate-watch, assessed `durable: true` finding (no separate brief — rides 1951→1955 chain), filed pre-1955 stopgap note for `cron-jobs.md` (already in 1951c handoff). All carry-over items from c197 remain active unless contradicted above.

### c197 session summary

**Spawn:** Main-terminal routed re-entry post-PM 1950-T5 closure signal. Context delivered: Sprint 1950 FULLY CLOSED (8 tasks DONE, commits f4688989/ad68cf5c/2c01f9a3/0e3c96c9/3c560cab/d5c78d45 + fixer 1d425787 + maint 946af32a); Sprint 1951 already opened cycle c196 with 1951a dispatched; 1948 gate-watch carries; new `durable: true` architectural finding flagged by PM for assessment.

**Step 0 audit (file-based — no MCP read_telegram in this spawn):**
- Signal dashboard `## po`: 3 rows, all READ at c196 (pm-T5, tnb-200000, arch-171520). No NEW.
- Inbox (`docs/signals/`): 3 unprocessed PM closures → pm-1950-T3-closed, pm-1950-T5-closed, pm-1950-MAINT-closed. All confirm sprint state already reflected in TASKS.md + project-stats.json. No new bug/regression/wrong-cowork action signals.
- Net: zero new failure signals. Pipeline state matches user CONTEXT verbatim.

**Decisions filed:**

1. **CONFIRM Sprint 1951 (no override).** Sprint 1951 Phase 1 was opened by me at c196 (not "self-init by pm" as user CONTEXT phrasing implied — PM only decomposed into 1951a/b/c per my SPRINT-1951-PLAN row). 1951a is correctly In Progress with agent-father. SPRINT_GOAL.md is canonical. No change.

2. **Sprint 1951 priority OVER 1948 gate-watch.** Reasoning: 1948 is HARD-BLOCKED until 2026-05-20T07:22Z (≥37h away); waiting idle wastes 2 cycles. 1951 Phase 1 is the persistence migration that *prevents* the entire cowork pipeline from losing schedule when Claude Desktop session evaporates — direct user-impact reduction. Both sprints in different zones (1951=`.claude/`+`docs/data/`, 1948=`apps/mcp-server/`), no contention.

3. **`durable: true` ARCHITECTURE.md finding — NO BRIEF NEEDED, sprint already covers it.** Assessment:
   - Truth of finding: CONFIRMED. CronCreate `durable: true` flag is unrecognized by Claude Code runtime; all CronCreate-registered jobs are session-scoped and auto-expire on session close. Validated by T5 architect's empirical test.
   - PM's claim "consistent with ARCHITECTURE.md OQ-2": INCORRECT. `docs/ARCHITECTURE.md` (385L SSOT) has NO "Open Questions" section and NO OQ-2 token (verified via grep). OQ-2 lives only in `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` (the brief). PM hallucinated SSOT placement — non-blocking error, but flagged in notebook for self-correction.
   - Why no separate brief: Sprint 1951's entire reason for existence IS this finding. The brief `2026-05-18-cowork-master-scheduler.md` documents the limitation in §2.3 and the migration to RemoteTrigger IS the fix. Spinning a second architect brief on the same root-cause would duplicate work and violate single-issue tracking.
   - ARCHITECTURE.md update: DEFERRED to Sprint 1955 (Phase 5 — docs cascade) which already plans to update ARCHITECTURE.md alongside cron-jobs.md/cron-registry.json/system-map.json/agent-roster.md. Premature update before Phase 1 holds 24h risks documenting a still-mutating state.
   - DECISION: NO immediate ARCHITECTURE.md edit. NO new brief. Finding rides Sprint 1951→1955 chain.

4. **Pre-1955 stopgap inline-note (cheap insurance).** When Sprint 1951 Phase 1 closes (AC-5 session-persistence verified), append a one-liner to `docs/standards/cron-jobs.md` clarifying that `durable: true` in `.claude/commands/crons/*.md` is decorative-only and persistence comes from RemoteTrigger, not CronCreate. This is a Sprint 1951c sub-AC scope, not a new task. (Already in 1951c handoff per TASKS.md L41: "Update `docs/standards/cron-jobs.md` Cowork Schedule section with RemoteTrigger reference.")

5. **No FIX/SPRINT batch emitted.** WIP currently = 1 (1951a in progress) + 2 OBSERVE gates passive (1951b/1951c queued). New work would violate cap. Maintenance items MAINT-1950b/c/d already DONE+QA-APPROVED commit d5c78d45 — table needs follow-up move to Done section but PM auto-drain typically handles; not PO's zone.

**Files updated this cycle:**
- `docs/agent-memory/notebooks/po.md` — this notebook (overwrite per skill).

**Files NOT touched (intentional):**
- `docs/SPRINT_GOAL.md` — already Sprint 1951 (c196). No revision needed.
- `docs/TASKS.md` — PM owns drain. PO does not edit.
- `docs/ARCHITECTURE.md` — see decision #3.
- No new architect brief commissioned.

**WORK Telegram:** NOT SENT this cycle. Per agent permissions `work: sprint_status_only` rule, no new sprint event to announce. Sprint 1951 kickoff message already sent c196.

### Carry-over for next cycle

- **WATCH 2026-05-19T05:23Z (Sprint 1951 AC-4 smoke #1)** — first chef-morning RemoteTrigger fire. Look for: `[chef] START` + `[chef] SENT|SILENT` WORK lines from RemoteTrigger path, NO duplicate MARKET dish (AC-6 idempotency gate).
- **WATCH 2026-05-19T08:37Z** — chef-eod RemoteTrigger smoke #2. Same criteria.
- **WATCH 2026-05-19T20:13Z** — tnb-audit RemoteTrigger smoke #3. TNB row should reference parallel-run (both old + new firing).
- **GATE 2026-05-20T07:22Z** — post-1945-verdict-resolution-scored-pct gate unblocks Sprint 1948 (scored_pct ≥60% AND unknowns_30d drop ≥100). Independent of 1951. On clear: 1948a→1948b→1948c dispatch chain to dev-mcp-server.
- **CARRY: AC-6 rollback procedure** — if any chef double-publishes MARKET dish during 24h validation → delete 17 new triggers + open SPIKE-1951b idempotency-guard + hold Phase 2 until guard ships. (Risk LOW; chef.md is per-slot idempotent from Sprint 1949 design.)
- **CARRY: durable-flag clarification** — confirm 1951c handoff has the `cron-jobs.md` note in its ACs. If missing on QA review, send back with one-line addition.
- **CARRY: OQ-2 SSOT placement** — when Sprint 1955 docs-cascade opens, ensure ARCHITECTURE.md gets a "Cron Persistence Model" subsection citing RemoteTrigger as authoritative + `durable:` flag as deprecated-decorative. Single source of truth, no duplication into agent-briefs.
- **USER-ACTION blockers unchanged:** 1907a (Claude Desktop restart for vn-market MCP), 1897b (Docker VirtioFS .git/ exclusion).
- **Signal inbox status:** 3 PM closure signals in `docs/signals/` root pending PM-auto-drain to `processed/`. Not PO's job to move.
- **Recurring-bug counter:** No new patches this cycle. Counter remains: chef pipeline = Sprint 1950 closed clean. No escalation triggered.
- **WIP discipline:** Strictly 1 active (1951a). Do not promote 1951b/1951c until 1951a DONE+QA-APPROVED.
