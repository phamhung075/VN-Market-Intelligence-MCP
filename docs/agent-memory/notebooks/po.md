# PO Notebook

## Last updated: 2026-05-20T00:00Z · Cycle: c214 — Sprint 1957 opened (cowork resurrection)

### c214 trigger
Router escalation: cowork team silent on MARKET ~44h. Chef last 2026-05-18T04:08Z. alert-commander last 2026-05-18T09:00Z. Telegram delivery healthy (system-auditor confirms). Only system-auditor cron alive. Two architect briefs from 2026-05-18 never finished — sprints 1951-1956 absorbed dev capacity (BCTC RCA + Docker outage).

### Diagnosis (post-brief-read)
Master `*/15 * * * *` CronCreate dispatcher (1951c) is session-scoped per Claude Desktop. The session that registered it ended. The 12 RemoteTriggers flagged `pending_delete` in `cowork-schedule.json` have `last_fired=null` on every slot — either RemoteTriggers were paused pre-cutover OR they fire but agents never write back to SSOT. Either way: zero MARKET output for 2 market days.

Critical gap discovered: task 1951d (the cutover that will CronDelete the 12 RemoteTriggers) declared a MANDATORY post-cutover runbook (`docs/protocols/cowork-master-cron-runbook.md`) + skill (`.claude/skills/cron-cowork-team/SKILL.md`) — neither exists. Running 1951d without them would guarantee the next session-end is another 44h silence. PO RE-BLOCKED 1951d on 1957b-done.

### Sprint 1957 plan dispatched
- **1957a (CRITICAL, ops, XS, no gate)**: Hot-fire reinstate 12 legacy RemoteTriggers. RemoteTrigger natively survives session-end per SPIKE-1951a. Update SSOT `trigger_status='active'`. Restores cowork in ≤1 cron tick. 12 trigger_ids enumerated in signal po-1957-cowork-scheduler.json.
- **1957b (HIGH, agent-father, S, gated on 1957a-dispatched)**: Build the 2 missing Phase-1 artefacts + CLAUDE.md pointer. ~90min docs work, zero code.
- **1957c (MEDIUM, ops, XS, gated on 1957b-done)**: Update 1951d Blocked-by to add 1957b-done.

### Sprint scope rationale (PO autonomy)
User non-technical, watching MARKET, every hour costs trust. Stopgap CronCreate reproduces the failure (session-scoped). RemoteTrigger reinstatement is the only persistence primitive proven via SPIKE-1951a. Both tracks ship in parallel — no sequencing penalty.

### Recurring-bug-escalation freeze check
Freeze scope = mcp-server BCTC/PDF patches until 1954c. Sprint 1957 zones are `.claude/skills/`, `docs/protocols/`, `CLAUDE.md` (1 line), `docs/data/cowork-schedule.json`, RemoteTrigger MCP. NONE is PDF/BCTC code. Freeze does NOT apply. PO APPROVES dispatch.

### WIP gate
WIP currently 0/2 (1954a Done; OBSERVE-1951b Done). 1955a + 1955b still BLOCKED on 1954a-done (status already Done, so technically clearable next dev-team tick). 1957a + 1957b zone = `.claude/` + `docs/` + RemoteTrigger — does NOT consume mcp-server dev capacity. Independent zone path: no WIP collision.

### Files touched this cycle
- `docs/SPRINT_GOAL.md` (Sprint 1955 → Sprint 1957 rewrite)
- `docs/TASKS.md` (added 1957a, 1957b, 1957c; re-blocked 1951d)
- `docs/signals/po-1957-cowork-scheduler.json` (NEW)
- `docs/signals/DASHBOARD.md` (added ops + agent-father sections; new ts)

### Carry-over for c215
- **T+30min from 1957a dispatch**: Verify MARKET channel receives first cowork message. If silent at 90min → escalate diagnostic (RemoteTrigger API or workspace-level pause).
- **T+24h from 1957a**: AC-6 verification — ≥4 cowork messages (1 chef-morning, 1 chef-eod, 1 tnb-audit, 1 chef-evening) if weekday; relaxed weekend AC.
- **2026-05-20T07:22Z:** post-1945-verdict-resolution + post-1945-bug-storm-silence gates (Sprint 1945 ACs).
- **2026-05-20T08:30Z:** vnstockTradingStatsRefresh tick → OBSERVE-1955d gate at 09:00Z.
- **2026-05-20T16:30Z:** dailyDashboardJob tick — first verification of 1955a fix (only if 1955a deployed by then).
- **2026-05-21T02:30Z:** OBSERVE-1953g gate (Q1-2026 financial_reports coverage ≥26).
- **2026-05-25T01:00Z:** vnstockFundamentalsRefresh tick — OBSERVE-1955c gate.
- **After 1954a Done:** unblock 1954b (design phase) — already Done, so dev-team picks at next tick.

---

## Previous: 2026-05-19T19:38Z · Cycle: c213 — Sprint 1955 plan (cron observability)

### c213 trigger
system-auditor Tier-1 audit 19:31:26Z dropped 4 rows in DASHBOARD `## po` (2 CRITICAL cron_stuck, 1 WARN cron_degradation dashboard, 1 WARN cron_degradation bctc).

### Triage verdict (after DB inspection of `/app/data/market.db` `cron_job_runs`)
- **1954-A-29-1 dailyDashboardJob ENOENT** → CONFIRMED BUG. `projectRoot()` has 6 `..` from `/app/src/scheduler/system/` → resolves to `/`. Fails daily since ≥2026-05-09. → task **1955a** (FIX HIGH, XS, 30 min).
- **1954-A-29-2 bctcReparseJob 86.7%** → RECOVERING post-1953b-2. Two SUCCESS rows 15:23 + 16:13Z prove fix works. Old "running" rows are pre-deploy zombies. No new task; OBSERVE-1953g already gates.
- **1954-A-29-3 vnstockFundamentalsRefresh stuck** → FALSE POSITIVE. Zombie row from pre-restart crash. Module `_isRunning` clears on restart. Next tick = 2026-05-25T01:00Z. → OBSERVE-1955c.
- **1954-A-29-4 vnstockTradingStatsRefresh stuck** → FALSE POSITIVE. Same zombie pattern. Next tick = 2026-05-20T08:30Z (weekday). → OBSERVE-1955d.

### Sprint 1955 plan written
- 1955a: `projectRoot()` 6 → 3 dots OR `process.cwd()`. AC: dashboard cron writes success row.
- 1955b: `reapZombieJobRuns(db)` in scheduler boot. Mark zombie running rows as `crashed`, set finished_at + duration_ms. AC: 2 unit tests + zero zombie rows post-deploy.
- OBSERVE-1955c (2026-05-25T01:30Z), OBSERVE-1955d (2026-05-20T09:00Z).

### Recurring-bug-escalation freeze check
Freeze scope = mcp-server BCTC/PDF patches until 1954c. 1955a touches `scheduler/system/dailyDashboardJob.ts`; 1955b touches `infrastructure/db/cronJobRunStore.ts` + `startScheduler.ts`. NEITHER is PDF/BCTC code. Freeze does NOT apply. PO APPROVES dispatch.

### WIP gate
WIP currently 2/2 (1954a Review + OBSERVE-1951b In Progress). 1955a + 1955b dispatch GATED on 1954a Done. dev-team cron-tick will pick them off Backlog when WIP frees.

### Files touched this cycle
- `docs/handoffs/TASK_1955a.md` (NEW)
- `docs/handoffs/TASK_1955b.md` (NEW)
- `docs/signals/po-1955-sprint-plan.json` (NEW)
- `docs/TASKS.md` (added 1955a, 1955b, OBSERVE-1955c, OBSERVE-1955d to Backlog)
- `docs/signals/DASHBOARD.md` (4 OPEN → READ + timestamp)

### Carry-over for c214
- **2026-05-19T20:34Z:** OBSERVE-1951b 24h window closes — final AC-6 verdict.
- **2026-05-19T23:59Z:** 1954a qa+ops chain target. On qa-1954a-approved → WIP frees → dispatch 1955a + 1955b in same dev-team tick.
- **2026-05-20T07:22Z:** post-1945-verdict-resolution + post-1945-bug-storm-silence gates.
- **2026-05-20T08:30Z:** vnstockTradingStatsRefresh tick — OBSERVE-1955d gate at 09:00Z.
- **2026-05-20T16:30Z:** dailyDashboardJob tick — first verification of 1955a fix (only if 1955a deployed).
- **2026-05-21T02:30Z:** OBSERVE-1953g gate (Q1-2026 financial_reports coverage ≥26).
- **2026-05-25T01:00Z:** vnstockFundamentalsRefresh tick — OBSERVE-1955c gate.
- **After 1954a Done:** unblock 1954b (design phase).
