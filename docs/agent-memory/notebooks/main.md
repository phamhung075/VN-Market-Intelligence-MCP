# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-11 03:45 UTC (Cycle 14 close) | **ctx at checkpoint:** post-cycle-13-compact

## Cycle 14 shipped (2026-05-11)

| Task | Type | Route | Result |
|------|------|-------|--------|
| sched-audit-sa-stale | UNBLOCK | tran-ngoc-bau | TNB diagnosed: `0 16 * * *` cron def exists in `.claude/commands/crons/cron-system-auditor.md` but lost to session-scope CronCreate during 2026-05-10 sprint activity. Re-registered in current main session (cron id `64cfb03a`). Manual invoke recommended. Architectural fix (persistent scheduler) deferred — out of dev-team scope. |

## Cycle 14 key insights

**Session-scope cron fragility is now a known structural weakness.** Same root cause flagged at `feedback_system_context.md` ("CronList is session-scoped, not global"). This is the 1st observed casualty (system-auditor missed ~2 daily fires). Other crons probably affected too — `CronList` in current session shows only dev-team (`c9583554`) registered, meaning market-watcher, news-scout, code-janitor, claude-manager-helper, tran-ngoc-bau, agent-father, unified-agent crons are ALL session-orphaned. They survive only because their host sessions are still alive elsewhere. If those sessions /compact or terminate, same gap will hit them.

**PO returned BATCH + UNBLOCK in same response** — flow says "EXACTLY ONE". Per priority (UNBLOCK > FIX), took UNBLOCK route → EXIT. Sprint 1869 dev work (1869a/b/b-seed) defers to cycle 15. Acceptable trade-off: UNBLOCK is 3rd-observation escalation that's been pending 2 cycles; dev work is fresh from cycle 13 brief.

**Single cron re-register doesn't fix the architectural gap.** The cron lives in *this* session now. If this session /compacts and registers a new daemon for cron `64cfb03a`, fine. If it dies, system-auditor is stale again. Real fix = a persistent OS-level cron (crontab) that invokes Claude Code with these prompts — or a long-running daemon. Out of dev-team scope.

## Current baseline

- **8804 pass / 1 fail** (unchanged)
- toolCount=132, totalTasksDone=556 (unchanged — no code shipped this cycle)
- currentSprint=1869 (no increment)
- pipeline-state: idle
- Todo: 7 items (1869a/b/b-seed + 1862c-D/E/F/G)
- Session crons registered: dev-team `c9583554`, system-auditor `64cfb03a` (this session only)

## Carry-over to Cycle 15

### Ready to ship (dev-team scope) — UNCHANGED FROM CYCLE 13
- **1869a** (FIX, 45m, mcp-server) — DEFAULT_DROP_PCT -5→-7 in signalDetector.ts. Independent. Ship first.
- **1869b** (SPRINT-S, 1.5h, mcp-server) — wire watchlistThresholds at scanMarket.ts:283. After 1869a.
- **1869b-seed** (FIX, 1h, mcp-server) — DB migration. Depends on 1869b.

### Ops-gated (unchanged)
- **1862c-D + 1862c-E** — Cloudflare config edits
- **Reuters/TE 5-curl probe** — ops to run from container + host per cycle 12 brief
- **1862c-F + 1862c-G** — rebuild + observation gated

### Patterns to watch
- **2845** (news freshness >2h, 4th cycle now) — leave monitoring; downstream of pending Reuters/TE fix
- **system-auditor stale** — should clear at next 16:00 UTC fire (now re-registered). If still stale at cycle 15+, escalate further (manual invoke from main terminal, or persistent-scheduler architecture brief).

### New structural concern (logged, not actioned)
- **Session-scope CronCreate fragility** — all 8 agent crons orphaned to their original sessions. Persistent scheduler is an architectural gap. Defer to architect/PO when prioritization allows; not blocking.

## Architecture state (unchanged)

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP, 132 tools, alertVerdictStore + verdictResolutionJob cron `7 * * * *` live
- All 16 circuit breakers OK in DB
- Crons (session-scoped): dev-team `7 * * * *` + system-auditor `0 16 * * *` (re-registered this cycle)

## Cycle 14 process notes

- Single UNBLOCK cycle — no parallel agent spawns.
- PO returned mixed BATCH + UNBLOCK; took UNBLOCK per priority. Dev work deferred — intentional.
- TNB c14 was scope-limited (schedule check only, no full sweep). Good token economy.
- Cron re-register is a session-only patch — not a permanent fix.

## Next-cycle intent (Cycle 15)

1. Drain new signals + reports
2. If 1869a/b/b-seed still READY → spawn `dev-mcp-server` for 1869a (Tier 1, independent)
3. After 1869a Done → spawn dev for 1869b (Tier 2)
4. After 1869b Done → spawn dev for 1869b-seed (Tier 3)
5. Check system-auditor notebook — should have a fresh entry from the 16:00 UTC fire (if this session held the cron through that time). If still stale, escalate further.
6. Reuters/TE atomic task — pending ops probe verdict (Option A vs B)
7. Check if `expire_monitoring_reports` flips 2845 at 72h TTL → archive
