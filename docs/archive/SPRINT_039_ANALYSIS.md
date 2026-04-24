# Sprint 039 — Post-S038 Communication & Intelligence Improvements

**Date**: 2026-04-03
**Baseline**: Sprint 038 complete — 53 tools, 2153 tests, all 5 gaps fixed, agent signal bus live
**Theme**: "Measure, Time, and Trust — Making the Autonomous Loop Self-Aware"

---

## Table of Contents

1. [Post-S038 Gap Analysis](#1-post-s038-gap-analysis)
2. [Sprint 039 Scope](#2-sprint-039-scope)
3. [Task Specifications](#3-task-specifications)
4. [Implementation Details](#4-implementation-details)
5. [Dependency Graph](#5-dependency-graph)
6. [Success Metrics](#6-success-metrics)

---

## 1. Post-S038 Gap Analysis

### Current State

Sprint 036-038 delivered:
- 5/5 communication gaps closed (signal bus, ownership lock, changelog, /report, /ask)
- 64 → 53 tools (8 removed, 7 merged into 3, 7 new added)
- Compound tools reduce per-cycle calls by ~50%
- Agent signal bus enables inter-agent communication

### Remaining Weaknesses

| # | Problem | Category | Impact |
|---|---------|----------|--------|
| W1 | France timezone mismatch — briefing fires at 02:00 CET, user reads at 07:00 | UX | High |
| W2 | Signal bus is fire-and-forget — no outcome tracking, agents can't self-calibrate | Intelligence | High |
| W3 | Dev Team loop has no heartbeat — silent failure is invisible | Reliability | Medium |
| W4 | `/ask` promises 15 min but off-hours cycle is 60 min | UX | Medium |
| W5 | Cascade rule hit rate unknown — 50+ SECTOR_RULES, no instrumentation | Observability | High |
| W6 | Prediction market signals have no outcome validation | Observability | Medium |

---

## 2. Sprint 039 Scope

### IN Scope (6 tasks)

| Task | Title | Addresses | Priority |
|------|-------|-----------|----------|
| 243 | France wake-up summary (07:00 CET cron) | W1 | P0 |
| 244 | Signal outcome tracking — `outcome` column on `agent_signals` | W2 | P0 |
| 245 | Dev Team weekly heartbeat to Chat Channel | W3 | P1 |
| 246 | `/ask` off-hours fast-track — check `user_requests` every 15 min always | W4 | P1 |
| 247 | Cascade rule hit rate instrumentation | W5 | P1 |
| 248 | Prediction market outcome validation | W6 | P2 |

### OUT of Scope
- BCTC expectation gap (needs external consensus data source — future)
- Strategic mute from false positive patterns (needs more signal outcome data first — depends on task 244)
- Agent-scoped tool visibility (architectural — future)
- Coordinator conditional portfolio step (prompt-only fix, not worth a task)
- Market context caching sentinel (server optimization — future)

---

## 3. Task Specifications

### Task 243: France Wake-Up Summary (07:00 CET)

**Problem**: Morning briefing fires at 08:00 VN = 02:00 CET. User in France reads Telegram at 07:00-09:00 CET. By then, Vietnam market is 4 hours into the session and the briefing is stale.

**Solution**: New cron job at `0 6 * * 1-5` UTC (= 07:00 CET winter, 08:00 CEST summer) that generates a mid-session catch-up summary.

**Implementation**:

1. New file `src/scheduler/franceSummaryJob.ts`:
   - Calls `assembleBriefing()` or builds a custom mid-session summary
   - Content: "4h vào phiên — tóm tắt cho nhà đầu tư"
   - Sections: VN-Index change since open, watchlist movers (top 3 gainers/losers), alerts fired in last 4h, any HIGH/CRITICAL events, macro changes
   - Sends to Chat Channel via `sendTelegramMessage`
   - Format: Vietnamese, plain text, under 4000 chars

2. Register in `src/scheduler/jobs.ts`:
   ```typescript
   cron.schedule("0 6 * * 1-5", () => runFranceSummary(), { timezone: "UTC" });
   ```

3. Tests in `src/__tests__/243-france-summary.test.ts`:
   - Test: generates summary with market data
   - Test: includes top movers section
   - Test: includes alerts section
   - Test: handles empty data gracefully

**Files**: new `franceSummaryJob.ts`, modify `jobs.ts`
**Effort**: Low (~60 lines)
**Dependencies**: None

---

### Task 244: Signal Outcome Tracking

**Problem**: Agent signal bus is fire-and-forget. When News Scout sends `urgent_news` to Market Watcher, there's no feedback on whether that signal led to a good alert or a false positive. Agents can't self-calibrate.

**Solution**: Add `outcome` column to `agent_signals` table + new `record_signal_outcome` MCP tool + `get_signal_effectiveness` MCP tool.

**Implementation**:

1. Schema migration in `src/infrastructure/db/schema.ts`:
   ```sql
   ALTER TABLE agent_signals ADD COLUMN outcome TEXT;
   -- values: 'fired' | 'suppressed' | 'confirmed' | 'false_positive' | null (pending)
   ALTER TABLE agent_signals ADD COLUMN outcome_at TEXT;
   ALTER TABLE agent_signals ADD COLUMN outcome_detail TEXT;
   ```

2. Store functions in `src/infrastructure/db/agentSignalStore.ts`:
   - `recordOutcome(db, signalId: number, outcome: string, detail?: string): void`
   - `getSignalEffectiveness(db, opts?: { fromAgent?: string, signalType?: string, days?: number }): { total: number, fired: number, confirmed: number, falsePositive: number, precision: number }[]`

3. MCP tool `record_signal_outcome` in `src/interface/mcp/tools/agentSignalTools.ts`:
   - Params: `signal_id` (number), `outcome` (enum), `detail` (string, optional)
   - Called by Alert Commander after deciding to fire or suppress based on a signal

4. MCP tool `get_signal_effectiveness` in same file:
   - Params: `from_agent` (optional), `signal_type` (optional), `days` (default 7)
   - Returns precision/recall per signal type per agent
   - Used by Unified Agent in weekly review

5. Tests in `src/__tests__/244-signal-outcome.test.ts`:
   - Test: recordOutcome updates the row
   - Test: getSignalEffectiveness computes precision correctly
   - Test: filtering by agent and signal_type works
   - Test: null outcomes are excluded from precision calc

**Files**: modify `schema.ts`, `agentSignalStore.ts`, `agentSignalTools.ts`, `server.ts`
**New tools**: +2 (`record_signal_outcome`, `get_signal_effectiveness`)
**Effort**: Medium (~80 lines)
**Dependencies**: None

---

### Task 245: Dev Team Weekly Heartbeat

**Problem**: If the Dev Team hourly cron silently fails (Telegram API down, SQLite lock), reports pile up unprocessed with zero visibility. User has no way to know the autonomous loop is stalled.

**Solution**: Weekly heartbeat message to Chat Channel summarizing Dev Team activity.

**Implementation**:

1. New file `src/scheduler/devTeamHeartbeatJob.ts`:
   - Queries `telegram_reports` for last 7 days: count by status (new, processed, claimed)
   - Queries `system_changelog` for last 7 days: count fixes
   - Computes: oldest unprocessed report age in hours
   - Sends to Chat Channel:
     ```
     🤖 Dev Team — Tuần này:
     Báo cáo xử lý: N/M (N processed / M total)
     Fix áp dụng: K (từ system_changelog)
     Báo cáo chưa xử lý: X (cũ nhất: Y giờ trước)
     Trạng thái: HOẠT ĐỘNG / CẢNH BÁO / NGỪNG
     ```
   - Status logic: HOẠT ĐỘNG if processed > 0 or no reports. CẢNH BÁO if unprocessed > 24h. NGỪNG if unprocessed > 72h.

2. Register in `src/scheduler/jobs.ts`:
   ```typescript
   cron.schedule("0 7 * * 0", () => runDevTeamHeartbeat(), { timezone: "UTC" });
   // Sunday 07:00 UTC = 08:00 CET = 14:00 VN
   ```

3. Tests in `src/__tests__/245-dev-heartbeat.test.ts`:
   - Test: generates correct counts from DB
   - Test: HOẠT ĐỘNG when all reports processed
   - Test: CẢNH BÁO when report > 24h old
   - Test: NGỪNG when report > 72h old

**Files**: new `devTeamHeartbeatJob.ts`, modify `jobs.ts`
**Effort**: Low (~50 lines)
**Dependencies**: None

---

### Task 246: `/ask` Off-Hours Fast-Track

**Problem**: `/ask` promises response within 15 min but off-hours intelligence cycle runs every 60 min. User sends `/ask` at 14:00 CET (20:00 VN, market closed) → could wait 60 minutes.

**Solution**: Make Step F (user request processing) run on EVERY intelligence cycle tick, not just market hours. Additionally, if the cycle interval is >15 min, schedule a one-shot check 15 min after a request is inserted.

**Implementation**:

1. Modify `src/scheduler/intelligenceCycleJob.ts`:
   - Step F already runs "always" (not gated on market hours) per Sprint 037 implementation
   - VERIFY this is actually the case by reading the file
   - If Step F is already ungated: the issue is the 60-min off-hours interval
   - Fix: Add a lightweight "user request check" that runs every 15 min regardless:
     ```typescript
     cron.schedule("*/15 * * * *", () => checkPendingUserRequests());
     ```
   - `checkPendingUserRequests()`: only queries `user_requests` for pending, processes them, returns. Does NOT run the full intelligence cycle.

2. Update the `/ask` response message in `telegramCommands.ts`:
   - Change from "trong vong 15 phut" to "trong vong 15 phut" (keep as-is, now accurate)

3. New file `src/scheduler/userRequestCheckJob.ts`:
   - Lightweight: only reads `user_requests` WHERE status='pending'
   - If found: runs RAG search + sends answer to Chat Channel
   - Same logic as Step F but isolated from intelligence cycle

4. Register in `src/scheduler/jobs.ts`

5. Tests in `src/__tests__/246-ask-fast-track.test.ts`:
   - Test: pending requests are processed within 15 min
   - Test: already-answered requests are skipped
   - Test: handles RAG errors gracefully

**Files**: new `userRequestCheckJob.ts`, modify `jobs.ts`
**Effort**: Low (~40 lines — extracts Step F logic into standalone function)
**Dependencies**: None

---

### Task 247: Cascade Rule Hit Rate Instrumentation

**Problem**: `cascadeEngine.ts` has 50+ SECTOR_RULES but no instrumentation. Unknown which rules fire frequently vs. never. Dead rules add noise to analysis without contributing signal.

**Solution**: Add a `cascade_rule_hits` table that logs every rule match, plus a `get_cascade_metrics` MCP tool for Unified Agent's weekly review.

**Implementation**:

1. Schema in `src/infrastructure/db/schema.ts`:
   ```sql
   CREATE TABLE IF NOT EXISTS cascade_rule_hits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     rule_key TEXT NOT NULL,
     matched_text TEXT NOT NULL,
     affected_sector TEXT,
     affected_stocks TEXT,
     hit_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_cascade_hits_rule ON cascade_rule_hits(rule_key);
   CREATE INDEX IF NOT EXISTS idx_cascade_hits_at ON cascade_rule_hits(hit_at);
   ```

2. Store in `src/infrastructure/db/cascadeHitStore.ts`:
   - `recordHit(db, ruleKey, matchedText, sector?, stocks?): void`
   - `getHitMetrics(db, days?: number): { ruleKey: string, hitCount: number, lastHit: string, sectors: string[] }[]`
   - `getDeadRules(db, days?: number): string[]` — rules with 0 hits in period

3. Instrument `src/domain/services/cascadeEngine.ts`:
   - At each rule match point, call `recordHit()` (lazy import to avoid domain→infra dependency — pass as callback)
   - Alternatively: return rule match metadata from `buildCausalChain()` and let the caller (`runImpactChain.ts`) record hits

4. MCP tool `get_cascade_metrics` in new `src/interface/mcp/tools/cascadeMetricsTools.ts`:
   - Params: `days` (default 30)
   - Returns: table of rule hit counts, sorted by hits DESC
   - Highlights dead rules (0 hits)

5. Tests in `src/__tests__/247-cascade-metrics.test.ts`:
   - Test: recordHit creates row
   - Test: getHitMetrics returns correct counts
   - Test: getDeadRules returns rules with 0 hits
   - Test: days filter works

**Files**: modify `schema.ts`, new `cascadeHitStore.ts`, new `cascadeMetricsTools.ts`, modify `cascadeEngine.ts` or `runImpactChain.ts`
**New tool**: +1 (`get_cascade_metrics`)
**Effort**: Medium (~100 lines)
**Dependencies**: None

---

### Task 248: Prediction Market Outcome Validation

**Problem**: Polymarket signals are fetched every 30 min and shown in morning briefing as "top 3 prediction signals." But there's no tracking of whether those signals preceded actual VN stock movements. Most expensive data source with least accountability.

**Solution**: A weekly job that joins `prediction_signals` with `market_prices_history` to compute prediction-to-outcome correlation, plus a `get_prediction_accuracy` MCP tool.

**Implementation**:

1. New file `src/scheduler/predictionOutcomeJob.ts`:
   - Weekly (Sunday): for each prediction signal from the past 7 days:
     - Look up the mapped VN sector/stocks (from `predictionCascadeMapper`)
     - Check price movement in `market_prices_history` within 48h of signal
     - Score: did price move in the predicted direction?
   - Store results in `prediction_signals.outcome` column (add via migration)
   - Compute weekly precision: signals where outcome matched / total signals

2. Schema migration in `src/infrastructure/db/schema.ts`:
   ```sql
   ALTER TABLE prediction_signals ADD COLUMN outcome TEXT;
   ALTER TABLE prediction_signals ADD COLUMN outcome_price_change REAL;
   ```

3. MCP tool `get_prediction_accuracy` in `src/interface/mcp/tools/predictionTools.ts`:
   - Params: `days` (default 30)
   - Returns: precision per signal_type (volume_spike, probability_shift), per mapped sector
   - Used by Unified Agent and Digest Writer

4. Tests in `src/__tests__/248-prediction-outcome.test.ts`:
   - Test: outcome is recorded correctly
   - Test: precision calculation handles edge cases
   - Test: unmapped signals are excluded

**Files**: new `predictionOutcomeJob.ts`, modify `schema.ts`, modify `predictionTools.ts` or new file, modify `jobs.ts`
**New tool**: +1 (`get_prediction_accuracy`)
**Effort**: Medium (~80 lines)
**Dependencies**: None

---

## 4. Implementation Details

### New Files (6)

| File | Task | Purpose |
|------|------|---------|
| `src/scheduler/franceSummaryJob.ts` | 243 | 07:00 CET mid-session summary |
| `src/scheduler/devTeamHeartbeatJob.ts` | 245 | Weekly Dev Team health status |
| `src/scheduler/userRequestCheckJob.ts` | 246 | 15-min `/ask` response guarantee |
| `src/infrastructure/db/cascadeHitStore.ts` | 247 | Cascade rule hit tracking |
| `src/interface/mcp/tools/cascadeMetricsTools.ts` | 247 | `get_cascade_metrics` tool |
| `src/scheduler/predictionOutcomeJob.ts` | 248 | Weekly prediction validation |

### Modified Files

| File | Tasks | Changes |
|------|-------|---------|
| `src/infrastructure/db/schema.ts` | 244, 247, 248 | 3 migrations: signal outcome cols, cascade_rule_hits table, prediction outcome cols |
| `src/infrastructure/db/agentSignalStore.ts` | 244 | `recordOutcome()`, `getSignalEffectiveness()` |
| `src/interface/mcp/tools/agentSignalTools.ts` | 244 | 2 new tools: `record_signal_outcome`, `get_signal_effectiveness` |
| `src/interface/mcp/server.ts` | 244, 247, 248 | Register 4 new tools |
| `src/scheduler/jobs.ts` | 243, 245, 246, 248 | 4 new cron registrations |
| `src/domain/services/cascadeEngine.ts` or `src/application/usecases/runImpactChain.ts` | 247 | Hit recording callback |
| `src/interface/mcp/tools/predictionTools.ts` | 248 | `get_prediction_accuracy` tool |

### New SQLite Tables / Columns

| Table/Column | Task | Purpose |
|-------------|------|---------|
| `agent_signals.outcome` | 244 | Signal effectiveness tracking |
| `agent_signals.outcome_at` | 244 | When outcome was recorded |
| `agent_signals.outcome_detail` | 244 | Optional explanation |
| `cascade_rule_hits` (new table) | 247 | Rule match instrumentation |
| `prediction_signals.outcome` | 248 | Prediction validation |
| `prediction_signals.outcome_price_change` | 248 | Actual price change after signal |

### New MCP Tools (+4)

| Tool | Task | Used by |
|------|------|---------|
| `record_signal_outcome` | 244 | Alert Commander (after acting on signal) |
| `get_signal_effectiveness` | 244 | Unified Agent (weekly review) |
| `get_cascade_metrics` | 247 | Unified Agent (weekly review) |
| `get_prediction_accuracy` | 248 | Unified Agent, Digest Writer |

### New Cron Jobs (+4)

| Time | Job | Task |
|------|-----|------|
| `0 6 * * 1-5` UTC | France wake-up summary | 243 |
| `0 7 * * 0` UTC | Dev Team heartbeat | 245 |
| `*/15 * * * *` | User request check | 246 |
| `0 8 * * 0` UTC | Prediction outcome validation | 248 |

### Tool Count After Sprint 039

53 (current) + 4 new = **57 tools**

---

## 5. Dependency Graph

```
All 6 tasks are INDEPENDENT — no dependencies between them.

243 (France summary)     ← standalone cron
244 (Signal outcomes)    ← standalone schema + tools
245 (Dev heartbeat)      ← standalone cron
246 (/ask fast-track)    ← standalone cron
247 (Cascade metrics)    ← standalone schema + instrumentation + tool
248 (Prediction outcome) ← standalone schema + cron + tool

All can run in parallel.
```

---

## 6. Success Metrics

1. **Task 243**: At 07:00 CET on a weekday, a mid-session summary appears in Chat Channel with VN-Index, top movers, and alerts from the last 4 hours.

2. **Task 244**: After Alert Commander fires an alert based on a signal, `record_signal_outcome(signal_id, "fired")` updates the row. `get_signal_effectiveness(days=7)` returns precision per signal type.

3. **Task 245**: Every Sunday at 08:00 CET, a heartbeat message appears in Chat Channel showing report processing stats and a status (HOẠT ĐỘNG/CẢNH BÁO/NGỪNG).

4. **Task 246**: User sends `/ask` at any time → response arrives within 15 minutes regardless of market hours.

5. **Task 247**: After 1 week of operation, `get_cascade_metrics(days=7)` returns hit counts for each rule. Dead rules (0 hits) are identifiable.

6. **Task 248**: After 1 week of operation, `get_prediction_accuracy(days=7)` returns precision per prediction signal type.

7. **Tool count**: 53 → 57. All existing 2153 tests pass. New tests added for all 6 tasks.

8. **Agent docs updated**: All agent `.md` files reflect new tools and patterns (task 249).

---

## Appendix: Agent Doc Updates Needed (Task 249, after all tasks)

| Agent | Changes |
|-------|---------|
| `unified-agent.md` | Add `get_signal_effectiveness` + `get_cascade_metrics` + `get_prediction_accuracy` to weekly review |
| `05-alert-commander.md` | Add `record_signal_outcome` after every signal-based decision |
| `06-digest-writer.md` | Add `get_prediction_accuracy` to monthly digest |
| `dev-team-cron.md` | Note heartbeat job exists, 57 tools |
| `README.md` | 57 tools, new cron jobs table, new tools |
| All agents | Tool count 53 → 57 |
