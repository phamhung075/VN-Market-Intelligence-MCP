# Sprint Goal

## Current Sprint

status: ACTIVE
sprint_id: 052
started: 2026-04-07
updated: 2026-04-07
theme: Single Source of Truth — reconcile contradictory data tools

scope:
  - 916: Sector rotation vs comparison agree on the same 1d %
  - 921: Brent crude — yahooFinance is sole upstream, news mining removed
  - Stale-state sweep: SPRINT_GOAL + TASKS REVIEW columns
  - Test flake: 157-data-audit lancedb timeout bumped to 60s

next_candidates: 914 (HPG / steel watchlist gap, @po), 915 (analyst credibility discount, @architect),
  stranded BCTC PDF auto-reparse (slice-able sprint)

## Sprint 036 — Historical (kept below for context)

---

### Theme

**"Less Surface, Clearer Signal — MCP Audit + Communication Hardening (Sprint 036)"**

---

### Goal

Sprint 035b delivered the full autonomous loop: two teams sharing a database, a Report Channel
for problem surfacing, and MCP tools to read and process those reports. The loop is now live.

Sprint 036 makes the loop more reliable and the agent surface smaller. It does two things:

1. **Tier 1 — Zero-Risk Removals**: Remove 8 tools from MCP registration that are dead,
   deprecated, forbidden, or strictly internal. No agent references them. No business logic
   changes. The tools remain as internal functions where needed — they simply stop appearing
   in the 64-tool surface that every agent loads.

2. **Tier 2 — Communication Fixes + Merges**: Close three structural communication gaps that
   cause double-processing, missed bugs, and noise, then consolidate six tools into three to
   shrink the agent surface further.

After this sprint: 64 tools → 53 tools. Gaps G2, G3, G5 closed. System health query drops
from 4 calls to 1. Telegram send drops from 3 tools to 1. Alert mute drops from 2 tools to 1.

---

### Investment Goal

The investor's analysis agents are currently loading 64 tools on every cycle. Eight of those
tools are dead weight (no agent uses them) or dangerous (Puppeteer blocks the server). Six
more are duplicative (three system health tools, two Telegram send tools, two mute tools) that
agents must choose between on every cycle. Meanwhile, when a bug is fixed by the Dev Team,
the Analysis Team agents have no way to know — so they keep filing the same report. And if
both Unified Agent and Dev Team attempt to claim the same report at the same time, one of
them silently processes work the other already handled.

This sprint eliminates all of the above. The result is a cleaner agent surface (fewer wrong
choices), a closed feedback loop (agents know when fixes land), and an ownership lock
(no double-processing of reports).

---

### Scope

**IN — Tier 1: Zero-Risk Removals (8 tools removed from MCP)**

| Task | Tool Removed | Reason |
|------|-------------|--------|
| 230 | `get_feedback` (#32) | Deprecated — returns nothing useful. Zero agent usage. |
| 230 | `get_global_log` (#27) | Developer-only. No agent references it. |
| 230 | `get_tool_log` (#28) | `get_error_summary` covers the signal. Weekly-only usage not worth the surface. |
| 230 | `run_daily_briefing` (#12) | Cron calls the function directly. No agent should trigger this. |
| 230 | `search_stocks` (#41) | Zero agent references. `get_watchlist` provides all codes. |
| 230 | `fetch_ssc_reports` (#5) | Explicitly FORBIDDEN in all agent prompts. Puppeteer blocks the server. |
| 230 | `trigger_alert_check` (#34) | Intelligence cycle runs this every 15 min. Redundant from agents. |
| 230 | `export_portfolio_snapshot` (#46) | Weekly file dump — dev/user action, not analysis. |

All 8 removals are confined to `src/interface/mcp/server.ts` (unregister) and
`src/interface/mcp/tools/index.ts` (unexport). Underlying functions are untouched.

**Result**: 64 → 56 tools.

---

**IN — Tier 2a: Fix G5 — Report Ownership Lock**

| Task | 231 |
|------|-----|
| **Gap** | Both Unified Agent and Dev Team call `read_telegram_reports` then `process_telegram_report`. Race condition: both process the same report with conflicting triage decisions. |
| **Fix** | Add `claimed_by TEXT` and `claimed_at INTEGER` columns to `telegram_reports`. New `claim_telegram_report(id, claimedBy)` MCP tool performs atomic `UPDATE WHERE claimed_by IS NULL`. First caller wins; second gets `"Report {id} already claimed by {claimed_by}"` and skips. |
| **Schema change** | `ALTER TABLE telegram_reports ADD COLUMN claimed_by TEXT` + `ADD COLUMN claimed_at INTEGER` |
| **New tool** | `claim_telegram_report` (+1 tool) |
| **Files** | `src/infrastructure/db/schema.ts`, `src/infrastructure/db/telegramReportStore.ts`, `src/interface/mcp/tools/telegramReportTools.ts`, `src/interface/mcp/server.ts`, `cowork-analysis-vnmarket-team/unified-agent.md`, `cowork-analysis-vnmarket-team/dev-team-cron.md` |

**Result**: 56 → 57 tools.

---

**IN — Tier 2b: Fix G3 — User → Dev Team Direct Path**

| Task | 232 |
|------|-----|
| **Gap** | No `/report` or `/fix` Telegram command exists. User-noticed bugs take the longest path to reach Dev Team (user → Cowork agent → submit_feedback → Report Channel — 3 hops, 5 minutes). |
| **Fix** | Add `/report <description>` and `/fix <description>` commands to `telegramCommands.ts`. Both write directly to `agent_feedback` table with `agent='user-telegram'` and forward the message to the Report Channel via `sendTelegramReport`. `/fix` sets `priority='high'`. Dev Team cron treats `from_agent='user-telegram'` as highest triage priority. |
| **New table** | None (uses existing `agent_feedback` table) |
| **New MCP tools** | None (command routing only) |
| **Files** | `src/infrastructure/notifiers/telegramCommands.ts`, `cowork-analysis-vnmarket-team/dev-team-cron.md` |

**Result**: 57 tools (no change).

---

**IN — Tier 2c: Fix G2 — System Changelog (Dev Team → Analysis Team)**

| Task | 233 |
|------|-----|
| **Gap** | After Dev Team fixes a bug, Analysis Team agents have no way to know. Same bug gets re-reported on the next cycle, creating a report loop. |
| **Fix** | New `system_changelog` SQLite table. Two new MCP tools: `log_fix(title, detail, files, commitHash, relatedFeedbackId?)` for Dev Team to write entries after every fix, and `get_recent_fixes(limit?)` for Analysis Team agents to read before filing a new report (check: "was this already fixed?"). |
| **New table** | `system_changelog (id, fix_type, title, detail, files, commit_hash, fixed_at, related_feedback_id)` |
| **New tools** | `log_fix` + `get_recent_fixes` (+2 tools) |
| **Files** | `src/infrastructure/db/schema.ts`, new `src/infrastructure/db/changelogStore.ts`, new `src/interface/mcp/tools/changelogTools.ts`, `src/interface/mcp/server.ts`, `cowork-analysis-vnmarket-team/dev-team-cron.md`, all 6 analysis agent `.md` files |

**Result**: 57 → 59 tools.

---

**IN — Tier 2d: Merge M1 — System Health 4 → 1**

| Task | 234 |
|------|-----|
| **Tools merged** | `get_system_health` (#26) + `get_source_health` (#53) + `get_data_freshness` (#42) + `get_error_summary` (#29) |
| **New tool** | `get_system_status` — single call returning four sections: `[DB]`, `[SOURCES]`, `[FRESHNESS]`, `[ERRORS]` |
| **Tools removed** | `get_source_health`, `get_data_freshness`, `get_error_summary` (-3 tools) |
| **Backward compat** | `get_system_health` is renamed to `get_system_status` internally; no separate migration. Agent prompts updated. |
| **Files** | `src/interface/mcp/tools/systemTools.ts`, `src/interface/mcp/tools/sourceHealthTools.ts`, `src/interface/mcp/tools/dataFreshnessTools.ts`, `src/interface/mcp/server.ts`, all agent `.md` files |

**Result**: 59 → 56 tools.

---

**IN — Tier 2e: Merge M2 — Telegram Send 3 → 1**

| Task | 235 |
|------|-----|
| **Tools merged** | `send_test_telegram` (#20) + `send_telegram_report` (#21) + absorb `delete_telegram_report` (#22) into `process_telegram_report` |
| **New tool** | `send_telegram(channel: "chat" \| "report", message)` — single tool for all outbound Telegram sends |
| **Tools removed** | `send_test_telegram`, `send_telegram_report`, `delete_telegram_report` (-3 tools) |
| **Note** | `delete_telegram_report` is already absorbed into `process_telegram_report` workflow; this merge makes it official. Agent prompts updated. |
| **Files** | `src/interface/mcp/tools/telegramTools.ts`, `src/interface/mcp/server.ts`, all agent `.md` files |

**Result**: 56 → 53 tools.

---

**IN — Tier 2f: Merge M3 — Alert Mute 2 → 1**

| Task | 236 |
|------|-----|
| **Tools merged** | `mute_stock_alerts` (#58) + `unmute_stock_alerts` (#59) |
| **New tool** | `manage_alert_mute(code, action: "mute" \| "unmute", hours?, reason?)` |
| **Tools removed** | `mute_stock_alerts`, `unmute_stock_alerts` (-2 tools, +1 new = net -1) |
| **Files** | `src/interface/mcp/tools/alertMuteTools.ts`, `src/interface/mcp/server.ts`, `cowork-analysis-vnmarket-team/04-market-watcher.md`, `cowork-analysis-vnmarket-team/05-alert-commander.md` |

**Result**: 53 → 53 tools (net: -2 old + 1 new = -1, but merged into the running total above).

---

**OUT**

- Fix G1: `/ask` + `/why` AI-powered Telegram commands — requires intelligence cycle Step F and
  `user_requests` table. Deferred to Sprint 037 (Tier 3).
- Fix G4: Agent signal bus (`agent_signals` table, `post_agent_signal`, `get_agent_signals`) —
  complex inter-agent coordination. Deferred to Sprint 038+ (Tier 4).
- Merge M4: `get_alerts` absorbing `get_price_alerts` — deferred to Sprint 037 with compound tools.
- Compound tools C1 (`get_market_context`) and C2 (`get_bctc_full`) — Sprint 037.
- New analysis features, new data sources, new cascade rules.
- Agent-scoped tool visibility (server filters tools per agent) — Sprint 038+.
- CLAUDE.md sync update — included as final task of this sprint after all code is merged.

---

### Task Board (Sprint 036)

| # | Title | Tier | Priority | Agent | Status | Depends on |
|---|-------|------|----------|-------|--------|------------|
| 230 | Remove 8 dead/forbidden/internal tools from MCP | 1 | P0 | Developer | Backlog | — |
| 231 | Fix G5: `claim_telegram_report` + ownership columns | 2a | P0 | Developer | Backlog | — |
| 232 | Fix G3: `/report` + `/fix` Telegram commands | 2b | P1 | Developer | Backlog | — |
| 233 | Fix G2: `system_changelog` + `log_fix` + `get_recent_fixes` | 2c | P1 | Developer | Backlog | — |
| 234 | Merge M1: system health 4 → 1 (`get_system_status`) | 2d | P1 | Developer | Backlog | 230 |
| 235 | Merge M2: Telegram send 3 → 1 (`send_telegram`) | 2e | P1 | Developer | Backlog | 230 |
| 236 | Merge M3: alert mute 2 → 1 (`manage_alert_mute`) | 2f | P2 | Developer | Backlog | 230 |
| 237 | CLAUDE.md sync + update all agent `.md` files for 53 tools | — | P2 | Developer | Backlog | 230–236 |

---

### Dependency Chain

```
230 (remove 8 tools — unregisters dead surface; must be first so merges work on clean base)
  ├─→ 234 (M1: system health merge — builds on top of cleaned registration)
  ├─→ 235 (M2: telegram send merge — builds on top of cleaned registration)
  └─→ 236 (M3: mute merge — builds on top of cleaned registration)

231 (G5: claim lock — standalone DB + tool change; no dependency on 230)
232 (G3: /report /fix commands — standalone telegramCommands.ts change)
233 (G2: changelog — standalone new table + 2 tools)

237 (CLAUDE.md + agent .md sync — must be last; documents final 53-tool state)
```

230 is gating for 234/235/236. 231, 232, 233 are parallel and independent.
237 waits for all others to be in Review.

---

### Success Metrics

1. `bun tsc --noEmit` — 0 errors after every task merge.

2. `bun test` full suite — existing 1934+ tests pass. New tests added for tasks 231, 233,
   236 (all schema or logic changes). 0 failures.

3. **Tool count**: 64 (Sprint 035b) → 53 (Sprint 036 final).
   - Task 230: -8 (64 → 56)
   - Task 231: +1 (`claim_telegram_report`) (56 → 57)
   - Task 233: +2 (`log_fix`, `get_recent_fixes`) (57 → 59)
   - Task 234: -3 (merge M1: remove 3 old, `get_system_status` replaces `get_system_health`) (59 → 56)
   - Task 235: -3 (merge M2: remove 3 old, `send_telegram` is new) (56 → 53)
   - Task 236: -1 (merge M3: remove 2 old, `manage_alert_mute` is 1 new) (53 → 53)

4. **G5 closed**: calling `claim_telegram_report(id, "dev-team")` when the row has no
   `claimed_by` succeeds. A second call returns `"Report {id} already claimed by dev-team"`.
   Unified Agent and Dev Team prompts updated to call `claim_telegram_report` before
   `process_telegram_report`.

5. **G3 closed**: `/report Bug: commodity section missing from briefing` from Telegram chat
   writes a row to `agent_feedback` with `agent='user-telegram'` and sends the text to the
   Report Channel. Dev Team cron sees it in `read_telegram_reports`.

6. **G2 closed**: after a fix, Dev Team calls `log_fix(...)` and the row appears in
   `system_changelog`. Analysis agents call `get_recent_fixes()` and see the entry. Agent
   `.md` files instruct agents to check `get_recent_fixes` before filing a duplicate report.

7. **M1 verified**: `get_system_status` returns a single response with four labeled sections
   (`[DB]`, `[SOURCES]`, `[FRESHNESS]`, `[ERRORS]`). Old tools (`get_system_health`,
   `get_source_health`, `get_data_freshness`, `get_error_summary`) are not registered.

8. **M2 verified**: `send_telegram(channel="chat", message="test")` sends to TELEGRAM_CHAT_ID.
   `send_telegram(channel="report", message="problem")` sends to TELEGRAM_REPORT_ID. Old tools
   (`send_test_telegram`, `send_telegram_report`, `delete_telegram_report`) are not registered.

9. **M3 verified**: `manage_alert_mute(code="VNM", action="mute", hours=4)` mutes VNM alerts.
   `manage_alert_mute(code="VNM", action="unmute")` lifts the mute. Old tools
   (`mute_stock_alerts`, `unmute_stock_alerts`) are not registered.

10. **Agent docs updated**: all agent `.md` files in `cowork-analysis-vnmarket-team/` reference
    53 tools. `unified-agent.md` and `dev-team-cron.md` include the `claim_telegram_report`
    step before `process_telegram_report`. All 6 analysis agent files include a pre-report
    `get_recent_fixes` check step. `CLAUDE.md` documents Sprint 036 completion.

---

### Key Technical Decisions (Locked at PO Level)

**T1. Removals are server.ts-only**: Tasks 230 is purely a registration change. Functions in
`feedbackTools.ts`, `systemTools.ts`, `reports.ts`, `marketTools.ts`, `analysis.ts`, and
`alertCheckTools.ts` are not deleted — only their `server.tool(...)` calls are removed. This
preserves internal callers (cron jobs, use cases) and allows future re-exposure via Telegram
commands without re-implementing business logic.

**T2. `claim_telegram_report` uses SQLite atomic UPDATE**: the ownership check must be a
single `UPDATE telegram_reports SET claimed_by=?, claimed_at=? WHERE id=? AND claimed_by IS NULL`
with `changes()` check. This is atomic under SQLite's serialized write model — no lock table
or transaction wrapping needed.

**T3. `send_telegram` replaces all three outbound tools**: the channel parameter (`"chat"` |
`"report"`) maps directly to `TELEGRAM_CHAT_ID` vs `TELEGRAM_REPORT_ID`. The implementation
is a thin wrapper over the existing `sendTelegramMessage` and `sendTelegramReport` internal
functions. `delete_telegram_report` is explicitly removed from MCP because deletion is only
valid inside the `process_telegram_report` workflow.

**T4. `get_system_status` is a rename + union, not a rewrite**: the four underlying functions
(`getSystemHealth`, `getSourceHealth`, `getDataFreshness`, `getErrorSummary`) are called
sequentially and their outputs assembled into one string. No logic changes. The old tool names
are removed from `server.ts` but the functions remain in their respective files.

**T5. `manage_alert_mute` delegates to existing store**: the implementation calls the same
`alertMuteStore.ts` functions that `mute_stock_alerts` and `unmute_stock_alerts` currently
call. The merge is a routing change, not a logic change.

**T6. `system_changelog` is append-only**: `log_fix` only inserts — never updates or deletes.
`get_recent_fixes` reads the most recent N rows ordered by `fixed_at DESC`. No foreign key
constraint on `related_feedback_id` (the feedback row may have been deleted after processing).

**T7. Agent `.md` updates are mandatory for G2**: the `get_recent_fixes` step must be
explicitly in each agent's protocol, or agents will not use it. The instruction is: "Before
calling `submit_feedback` for a system issue, call `get_recent_fixes(10)` and check if the
issue title appears in the recent fix log. If yes, skip the feedback."

**T8. Tool count target is 53**: this is a hard target. Any deviation (net +1 or -1) must
be justified in the task report. The per-task breakdown in the Success Metrics section above
is the reference.

---

### Why Not Tier 3 Now

Fix G1 (`/ask` + `/why`) requires adding a Step F to the intelligence cycle job, a new
`user_requests` SQLite table, and a full 15-minute async response path. This is a new feature,
not a refactor, and carries integration risk with the already-running cron. It belongs in a
separate sprint once Sprint 036 has proven the cleaned surface is stable.

Fix G4 (agent signal bus) is the highest-complexity change in the entire roadmap — inter-agent
coordination requires careful protocol design to avoid new race conditions. Sprint 038+ after
the Tier 3 compound tools have reduced per-cycle call volume.

---

## Previous Sprint

status: COMPLETE
sprint_id: 035b
started: 2026-04-02
updated: 2026-04-02
completed: 2026-04-02

---

### Theme

**"Two-Team Autonomy — Report Channel Persistence (Sprint 035b)"**

---

### Goal

Sprint 035a delivered the docs and config that define how the Dev Team loop works. Sprint 035b
delivers the four code changes that make it actually run: a SQLite persistence layer for
Report Channel messages, an extended webhook that captures inbound messages from that channel,
and two new MCP tools so the Dev Team cron can read and process reports programmatically.

After this sprint the full autonomous loop is operational:
- Analysis Team agent sends a problem report via `submit_feedback` or `send_test_telegram`
  → message stored in `telegram_reports` SQLite + posted to Report Channel
- Dev Team cron calls `read_telegram_reports` → sees the unprocessed row
- Dev Team fixes the issue, calls `process_telegram_report(id)` → row marked processed +
  Telegram message deleted from Report Channel
- Report Channel stays clean; SQLite has full audit trail

---

### Success Metrics (all met)

1. `telegram_reports` table exists in SQLite with correct schema.
2. After `sendTelegramReport("test")`, one row appears in `telegram_reports` with `status="new"`.
3. POST to `/telegram-webhook` with TELEGRAM_REPORT_ID chat stores row with `from_agent="human"`.
4. `read_telegram_reports` returns the row; empty result returns Vietnamese exit message.
5. `process_telegram_report(id)` marks the row processed and calls `deleteTelegramReport`.
6. `bun test` full suite passes: 1934+ tests, 0 failures.
7. `bun tsc --noEmit` → 0 errors.
8. Tool count after Sprint 035b: 64.

---

### Task board (Sprint 035b)

| # | Title | Priority | Agent | Status |
|---|-------|----------|-------|--------|
| 226 | `telegram_reports` SQLite table + store + wire sendTelegramReport | P0 | BA | Done |
| 227 | Webhook for Report Channel | P0 | BA | Done |
| 228 | `read_telegram_reports` MCP tool | P1 | BA | Done |
| 229 | `process_telegram_report` MCP tool | P1 | BA | Done |

---

## Previous Sprint (035a)

status: COMPLETE
sprint_id: 035a
started: 2026-04-02
updated: 2026-04-02
completed: 2026-04-02

### Theme

**"Two-Team Autonomy — Docs + Config"**

### Goal

Establish the documentation and configuration foundation for the two-team autonomous loop.
Delivered: `dev-team-cron.md`, updated `unified-agent.md`, all agent `.md` files refreshed
for 62 tools and correct channel rules, `start.sh` updated to `bun --hot`, `AI_TEAM_DESIGN.md`
updated, `feedbackTools.ts` fixed to not cross-post to user channel. All committed to main.

---

## Completed Sprints

| Sprint | Theme | Completed | Tasks |
|--------|-------|-----------|-------|
| 000 | Foundation | 2026-03-24 | 000 |
| 001 | BCTC Pipeline Wave 1 | 2026-03-25 | 001, 002, 003, 011, 012, 041, 042, 014 |
| 002 | BCTC Pipeline Wave 2 | 2026-03-26 | 043, 044, 013, 045, 046, 047, 029, 030, 048, 085 |
| 003 | News + Alerts | 2026-03-27 | 021, 082, 063, 064, 086 |
| 004 | MCP Wiring + Analysis | 2026-03-27 | 087, 022, 023, 061, 062, 083 |
| 005 | Market Data + Scheduler | 2026-03-28 | 088, 026, 102, 104, 103, 101 |
| 006 | Analytical Depth | 2026-03-28 | 065, 066, 027, 084, 105, 123 |
| 007 | Doc + Tests | 2026-03-28 | DOC-001, 081, 122, 124, 125 |
| 008 | Macro Intelligence | 2026-03-29 | FIX-081, 025, 028, 126, 089 |
| 009 | SSC Automation + Telegram | 2026-03-29 | 031, 034, 106 |
| 010 | Security + Alert Quality | 2026-04-01 | SQL-fix, 131, 132 |
| 011 | Adaptive Signals + Sentiment | 2026-04-01 | 133, 134, 135, 137 |
| 012 | Periodic Summaries | 2026-04-01 | 130 |
| 013 | Fetcher Reliability + Sector Context | 2026-04-01 | 035, 024, 035-TE, sectorPeers, macroThresholds, priceNewsValidator, commodityTracker |
| 014 | Trade Relationships | 2026-04-01 | tradeRelationships, tradeStore |
| 015 | Circuit Breaker | 2026-04-01 | 136 |
| 016 | Conviction Scorer + Portfolio Tools | 2026-04-01 | convictionScorer, portfolioTools, feedbackTools |
| 017 | Production Hardening | 2026-04-01 | 152, 153, 154, 155, 156 |
| 018 | Data Integrity First | 2026-04-01 | 157, 158, 159 |
| 019 | Stock Aliases + Market Broadcast | 2026-04-01 | 160, 161, 162 |
| 020 | Prediction Market Intelligence | 2026-04-01 | 163, 164, 165, 166 (stub), 167, 168, 169 |
| 021 | Close the Loop — Prediction Signals Live | 2026-04-01 | 170, 171, 172, 173 |
| 022 | House in Order | 2026-04-01 | 174, 175, 176, 177 |
| 023 | Close the Investor Loop | 2026-04-01 | 178, 179, 180, 181 |
| 024 | Reliability Hardening and Investor UX Polish | 2026-04-01 | 182, 183, 184, 185 |
| 025 | Daily Investor Intelligence | 2026-04-01 | 186, 187, 188 |
| 026 | Signal Quality and Portfolio Correlation | 2026-04-02 | 189, 190, 191 |
| 027 | Stability First | 2026-04-02 | 194, 195, hotfixes 198-205 |
| 028 | Structural Integrity and Investor Safety Net | 2026-04-02 | 192, 193, 206, 207 |
| 029 | Always-On Investor | 2026-04-02 | 208, 209, 210 |
| 030 | Quality Before Quantity | 2026-04-02 | 211, 212, 213 |
| 031 | Telegram Command Interface | 2026-04-02 | 214, 215, 216 |
| 032 | See More, Decide Faster | 2026-04-02 | 217, 218, 219 |
| 033 | Investor UX Hardening | 2026-04-02 | 220, 222, 223 |
| 034 | Depth Over Breadth | 2026-04-02 | 224, 225 |
| 035a | Two-Team Autonomy — Docs + Config | 2026-04-02 | dev-team-cron.md, unified-agent.md, agent files, start.sh, feedbackTools fix |
| 035b | Two-Team Autonomy — Report Channel Persistence | 2026-04-02 | 226, 227, 228, 229 |
