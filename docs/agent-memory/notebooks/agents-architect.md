# agents-architect — Notebook

## 2026-05-20T08:54:19Z

**Brief:** `docs/architecture-briefs/2026-05-20-task-lock-system.md`

Multi-session collision risk: two Claude Code sessions can fire the same cowork-slot, drain the same dashboard row, or claim the same sprint task concurrently. Designed a new `coordination.db` (7th SQLite DB, isolated from market data) with a single `task_locks` table covering three discriminated lock kinds (cowork-slot / sprint-task / dashboard-row). Race-free atomic claim via INSERT OR IGNORE + stale-steal UPDATE with WHERE expires_at < now. Four MCP tools (task_claim, task_heartbeat, task_release, task_list_held). 3-phase rollout: Phase 1 (DB + tools only) routes to agent-father for immediate implementation; Phases 2+3 (flow integration) via pm sprint tasks.

**Signal dropped:** `docs/signals/task-lock-system-20260520.json` → agent-father

---

## 2026-05-19T17:16:00Z

**Brief:** `docs/architecture-briefs/2026-05-19-system-auditor-scope-expansion.md`

Current system-auditor is blind to the 9-service Docker stack, 27 data sources, and DB write distributions — six silent failure classes from the 1953 BCTC fire exposed the gap. Designed 3 new audit dimensions (A: microservice runtime, B: data fetch integrity, C: DB write integrity), 60 concrete checks with check_ids, 3-tier cadence (30min/4h/daily 02:00 UTC), 4 typed signal shapes, and a 7-file implementation checklist for agent-father (sequence: 7d→7c→7a→7b→7e→7f).

**Signal dropped:** `docs/signals/agents-architect-system-auditor-scope-expansion.json` → agent-father

---

## 2026-05-19T15:11:38Z

**Brief:** `docs/architecture-briefs/2026-05-19-data-fusion-gap.md`

Chef dishes are ingredient-lists, not cooked narratives. Root cause: (1) only price_anomaly signals are file-materialized — news/BCTC signals travel via MCP DB only, so chef CLUSTER step is effectively single-source; (2) no canonical cross-source event model exists; (3) Step 7 WRITE DISH lacks a causal-chain synthesis requirement. Fix A (insert SYNTHESIZE step) + Fix D (per-claim citation requirement) are low-effort agent-father actions in chef.md. Fix B (file materialization) + Fix C (signal-fusion-rules.md standard) are sprint tasks for po.

**Signal dropped:** `docs/signals/agents-architect-1951e-data-fusion-brief.json` → agent-father

---

## 2026-05-19T04:50:00Z

**Brief append:** `docs/architecture-briefs/2026-05-19-cowork-tool-packages.md` §12 — Notebook Write Capability

8 of 9 cowork agents missing `Write`+`Edit` in frontmatter `tools:` field. `notebook-write` skill confirmed: agents write their own notebooks directly via `Write` (full overwrite) — no router intermediary. Additional sub-finding: `market-watcher/cycle.md` Step 5 says "APPEND ONLY" but canonical skill mandates overwrite — flow-level drift. Signal updated with 8 new agent-father actions.

**Signal updated:** `docs/signals/agents-architect-1951b-tool-packages-brief.json` → agent-father (§12 actions appended)

---

## 2026-05-19T04:25:29Z

**Brief:** `docs/architecture-briefs/2026-05-19-cowork-tool-packages.md`

Cowork tool package audit (Sprint 1951b): 10/11 agents have valid `.claude/tools/package/<agent>.md` files with correct `server="vn-market"` gateway grammar; market-analyst package is severely incomplete (7 tools used in its flow are missing from its package); anti-discovery enforcement clause is absent from the anti-hallucination skill and the tran-ngoc-bau package. Agent-father to fix 4 files; qa to validate 100% tool coverage in Phase 3.

**Signal dropped:** `docs/signals/agents-architect-1951b-tool-packages-brief.json` → agent-father

---

## 2026-05-18T21:22:22Z

**Brief:** `docs/architecture-briefs/2026-05-18-spike-1951f-fire-drift-fix.md`

Root cause of cowork-team master cron fire-drift: matcher window anchored on actual fire minute rather than nominal tick, so 7+ min CronCreate jitter slides the ±2 window past all slot targets. Option B chosen — 2-line nominal-tick rounding fix (`M = Math.floor(actualM/15)*15`) tolerates up to 14 min drift with zero adjacent-tick collision risk; unblocks 1951g (implementation) and 1951d (cutover).

**Signal dropped:** `docs/signals/agents-architect-spike-1951f-fix.json` → agent-father

---

## 2026-05-18T20:25:54Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-team-command.md` §11 (BLOCK-1 resolution)

QA-caught dead-zone bug: chef-morning (:23), chef-eod (:37), chef-evening (:37) fall outside ±2min of any :00/:15/:30/:45 boundary; approved Decision A — realign to `15 5`, `45 8`, `45 19` — minimal touch, no window change, QA-verified dependency margins both widen (24 min → 32 min on eod/evening).

**Signal dropped:** `docs/signals/agents-architect-1951-block1-decision.json` → fixer

---

## 2026-05-18T20:11:09Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-team-command.md`

RemoteTrigger-per-slot model hit two walls (API_MIN_INTERVAL blocks 4 sub-hourly slots; Claude Desktop cannot spawn subagents); designed a dev-team-pattern master cron — single `*/15 CronCreate` in Claude Code CLI running `.claude/commands/cowork-team.md`, which reads `docs/data/cowork-schedule.json`, matches `currentUTC ±2min`, and parallel-spawns all due agents — deleting 12 RemoteTriggers after 24h parallel-run with idempotency guard.

**Signal dropped:** `docs/signals/agents-architect-1951-cowork-team-brief.json` → agent-father

---

## 2026-05-18T17:15:20Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` (v2 revision)

User constraint invalidated the cowork-scheduler dispatcher design: Claude Desktop cannot spawn subagents via Agent tool (Claude Code SDK only). Refactored architecture to 17 independent RemoteTriggers (one per slot) each running the target agent's flow directly, with `docs/data/cowork-schedule.json` (written) as the SSOT time-table; cowork-scheduler agent eliminated; 3 open questions (OQ-1/2/3) on RemoteTrigger cron syntax flagged for agent-father to resolve before Sprint 1951 T1.

**Signal dropped:** `docs/signals/agents-architect-2026-05-18T171520Z-cowork-schedule-remotetrigger.json` → po

---

## 2026-05-21T17:19:22Z

**Brief:** `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md`

Three divergence seams identified between TASKS.md (plan layer), signals/DASHBOARD.md (chain-of-custody), and coordination.db task_locks (runtime atomic guard): status lag (lock state never back-propagates to TASKS.md), owner field disagreement (task_locks.owner_agent vs TASKS.md Owner column unenfored), and non-atomic edits (concurrent agents commit to same file on main with no serialization). Option B (edit-guard) ruled out — coupling coordination.db health to TASKS.md writability inverts failure priorities. Recommend Option A (janitor cron via system-auditor, zero code changes) now, Option C (task_status_echo table + echo cron, auto-fixes all 3 seams) deferred post-1959-watchdog-4 soak.

**Signal dropped:** `docs/signals/agents-architect-tasks-md-hardening-done.json` → agent-father

---

## 2026-05-21T19:09:09Z

**Brief:** `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md`

9 optimization levers across 3 phases targeting per-cycle token waste and excess MCP calls. Key findings: 3 concurrent market-hours agents (news-scout/market-watcher/alert-commander) each independently call get_cycle_bootstrap + get_macro_snapshot per 15-min tick (~168 redundant calls/trading-day); 4 agents use `trigger: startup` lazy-loads that violate the waterfall-lazy-load ban; qa notebook is 1149L (5.7× over cap); news-scout calls get_agent_signals 3× per cycle with overlapping windows. Phase 1 (agent-father only): startup-trigger fixes, notebook trim, signal payload pointers, ULTRA caveman on status pings — est. 25–35% context reduction. Phase 3 (dev-team): tick-snapshot dedup for bootstrap triplicate.

**Signal dropped:** `docs/signals/token-toolcall-economy-20260521T190909Z.json` → po

---

## 2026-05-21T19:08:39Z

**Brief:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`

Sprint 1967a read-only orchestration audit: 13 findings across 6 surfaces. 5 HIGH (alertSource enum missing `legal_risk` in write_alert_verdict, verified_decision not in post_agent_signal schema, DASHBOARD stale-race on sprint close, market-watcher identity recurrence post-fix, weekly cron jobs have no retry on crash), 7 MED (cowork lock release timing, DASHBOARD unbounded growth, coverage claim drift, fire-drift guard missing, dead API_MIN_INTERVAL slots, alert-commander mcp-tools.md lazy, recurring-bug freeze no timeout). Gate: post-1965c-soak dispatch except ITEM-01/09/04 priority batch.

**Signal dropped:** `docs/signals/agents-architect-1967a-brief-done.json` → po (1967c sign-off) → pm (1967b TASK conversion)

---

## Carry-over

- market-watcher/cycle.md Step 5 append/overwrite drift: confirm agent-father applies fix in same pass as frontmatter edit (§12c market-watcher row).
- OQ-1 through OQ-4 from §10 of 1951b brief remain open for agent-father to resolve before Phase 3 QA.
- L-1 alert-commander: verify whether 1963-MW-IDENTITY fix (agent-father 2026-05-21) already promoted mcp-tools.md to always_load — if yes, L-1 for alert-commander is a no-op.
