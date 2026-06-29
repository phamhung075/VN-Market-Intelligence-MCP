# dev-mcp-server -- Notebook

## 2026-06-28 — P1.5-MCP sub-chain (TASK_1983/1984/1985)

**Sprint:** CROSS-SESSION-MULTI-TEAM-ORCH phase P1.5
**Session:** 14f8039a-51ce-44f8-a7d9-0ddbe73b994e

### TASK_1983 → REVIEW (commit 4db33600)
- Extended `gcExpiredLocks` with pre-GC orphan-signal emission.
- ALLOW-LIST (DoD-P15-4): sprint-task, cowork-slot, dashboard-row.
- Single SQLite transaction (atomic emit + DELETE).
- redispatch_count carry-forward in payload (DoD-P15-3).
- 41 tests pass (11 new AC-11 suite).

### TASK_1984 → REVIEW (commit 1b751a5f)
- Added `_reaperTick(dbOverride?)` + `startPeriodicReaper()` exports.
- server.ts: timer armed at startup, cleared in close().
- DoD-P15-5: try/catch in interval callback; error logs, timer continues.
- 8 tests pass (new task-lock-reaper-timer.test.ts).

### TASK_1985 → REVIEW (commit 1b751a5f)
- owner_agent filter already in store+tool (pre-existing, verified).
- Added created_at alias in tool output normalization.
- redispatch_count already in LockRow/SELECT/...lock spread (pre-existing).
- 18 tests pass (9 new AC-1985 suite in coordination-tools.test.ts).

**ops REBUILD required before live-verify. qa/TASK_1988 owns live regression.**

## 2026-06-28 · TASK_1994 stale-test fix (DV-P2-4) — REVIEW

Sprint CROSS-SESSION-MULTI-TEAM-ORCH P3. QA found DV-P2-4 in DWF-coordination-phase2.test.ts still asserting P2 contract (ttl_seconds:1800, "cowork-leader") after TASK_1994 changed leader-lock.md to P3 fire-time election (TTL=600s, "cron:cowork:"). ONE file changed: test name updated to "Step 0b.2 / AC-P3-FIRE-ELECTION"; regex updated /ttl_seconds:\s+1800/ → /ttl_seconds:\s+600/; step0bMatch lookahead extended with |$ to handle P3 single-section doc; "cowork-leader" → "cron:cowork:". tsc 0. DWF-phase2 file: 32 pass / 0 fail (was 31p/1f). Coordination suite 7 files: 172 pass / 0 fail. new-fail count = 0 vs 53 baseline.
Zone health: tsc 0, 32/0 DWF-phase2, 172/0 coordination suite | HEALTHY

## 2026-06-29 · TASK-FEAT-NEWS-DR-HOP1 — Decision résumé backend (REVIEW)

Sprint FEAT-NEWS-DECISION-RESUME Hop 1. FR-1+FR-2+FR-3.
FR-1 (domain): newsNormalizer.ts — DOMAIN_VN_LABEL (17 domains), truncateAt120(), buildDecisionResume() pure helper; AnalysisEntry.decision_resume? optional field; normalizeNews() computes + returns it.
FR-2 (infra): schema-news.ts ADD COLUMN decision_resume TEXT (idempotent try/catch after body_text block); analysis.ts INSERT 19→20 params (decision_resume as 20th positional param via entry.decision_resume ?? null).
FR-3 (interface): newsSentimentHandler.ts — RagAnalysisRow + NewsSentimentItem + SELECT + mapper; header comment fix (positive/negative → bullish/bearish).
Tests: FEAT-NEWS-DR-builder.test.ts 11 cases GREEN; TASK-17 extended AC-NEW-1+2 (30 pass / 0 fail). tsc: clean. PRAGMA: decision_resume column exists (verified via in-memory SQLite probe).
Rebuild: YES — ops rebuild required for ADD COLUMN migration to execute on live named-volume DB.
Commit: 3fb056de.
Zone health: bun test 30/0, tsc clean, 166 tools unchanged, scheduler unchanged | HEALTHY

## 2026-06-29 · DEFERRED-TASK-SCHEDULER-MVP — all 8 STs DONE (REVIEW)

Sprint DEFERRED-TASK-SCHEDULER-MVP. Chain: ba→po(APPROVED)→pm→dev-mcp-server(this)→qa.
PO directives D1/D2/D3 binding. Commit 588b1031.

**ST-1+ST-3 (coordinationStore.ts):** Migration 4 — `scheduled_tasks` table. fire_at/deadline_at/created_at/fired_at = INTEGER epoch-seconds (AC-1). dedup_key UNIQUE in CREATE TABLE (AC-2 scar respected). 7-state CHECK enum. Atomic `claimDueScheduledTasks` helper + completeScheduledTask/expireScheduledTask/failScheduledTask/insertScheduledTask helpers.

**ST-6 (agentTeamMap.ts):** Static AGENT_TEAM_MAP derived from agent-roster.md. `resolveAgentTeam()` returns null for unknown agents (fail-loud, AC-8). Declarative map — no switch statement.

**ST-2 (scheduledTaskTools.ts):** 3 public tools (schedule_task, cancel_scheduled_task, list_scheduled_tasks) + 4 privileged gateway-only tools (claim_due, complete, expire, fail). D2 mechanism: helpers registered in server but absent from SKILL_MANIFEST packages. AC-9 honest Phase-2 caveat embedded in schedule_task description. AC-12: no orch-state.json write at insert.

**ST-4 (registry.ts + agentBootstrap.ts):** 7 tools in registry; 3 public in dev_team + unified_coordinator packages only.

**ST-5 (cowork-team/flow/main.md):** Step 0b.3 inserted after leader-lock WIN. JUMP-TO row added. Deadline gate, COWORK PRE-CLAIM (AC-5), DEV orch-apply.sh with --argjson (AC-6, AC-7). D3: always writes companion file docs/signals/one-shot-<id>.json. AC-4: recurring step, never a scheduled_task itself.

**ST-7 (scheduledTasks.test.ts):** 23 tests, 0 failures. AC-1/AC-2/AC-3/AC-11 gates all pass. dedup idempotency, atomicity (two claims → only first wins), AC-8 resolveAgentTeam.

**ST-8 (system.md):** Table schema, lifecycle, public/privileged surface, AGENT_TEAM_MAP, routing model, D2/D3/AC-9 documented.

Zone health: bun tsc clean, 125 pass / 0 fail (core suite), toolCount=173 (168+7 new), scheduler=2 unchanged | HEALTHY

## 2026-06-29 · OHLCV-BACKFILL-P0 — VPS trigger architecture (REVIEW)

Sprint MARKET-INDICATOR-DEPTH-P0 task OHLCV-BACKFILL-P0.

**Key discovery:** Both TCBS (`apipubaws.tcbs.com.vn`) and VnDirect (`api-finfo.vndirect.com.vn`) are geo-blocked from Docker/France. TCBS returns HTTP 404; VnDirect returns all-market snapshot ignoring `?code` filter.

**Architecture decision:** `ohlcvHistoryBackfillJob.ts` uses VPS-mediated data path:
1. Cron (01:40 UTC) checks bar depth per ticker in `daily_ohlcv`
2. If any ticker < 500 bars: inserts `done=0` in `ohlcv_backfill_queue`
3. VPS polls → runs `fetch-ohlcv-backfill.sh` DAYS=730 → pushes via `/api/push-ohlcv-history`

**Test path:** `fetchFn` injection tests the `writeOhlcvBatch` pipeline (unit guard, normalizer, idempotent upsert). 10/10 pass, 22 expect() calls.

**Files changed:**
- NEW: `ohlcvHistoryBackfillJob.ts` — monitor + trigger job
- NEW: `__tests__/OHLCV-BACKFILL-P0.test.ts` — 10 tests
- MOD: `cronConfig.ts` — `ohlcvHistoryBackfill: '40 1 * * *'`
- MOD: `startScheduler.ts` — +1 scheduleCron (total 80)
- MOD: `vps-scripts/fetch-ohlcv-backfill.sh` — DAYS default 60 → 730

**Current state:** 37/42 tickers have 47-48 bars (2026-04-23 → 2026-06-29). VPS queue trigger id=451 inserted. Expected ~500 bars/ticker after VPS 730-day run.

Zone health: tsc clean, 48/0 OHLCV cluster, toolCount=166 unchanged, schedulerCount=80 | HEALTHY
