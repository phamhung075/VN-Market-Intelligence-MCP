# Sprint Goal

## Current Sprint

status: COMPLETE
sprint_id: 031
started: 2026-04-01
updated: 2026-04-02
completed: 2026-04-02

---

### Theme

**"Investor in France, System in Vietnam — Telegram Command Interface"**

---

### Goal

The investor lives in France (GMT+2) and monitors the Vietnamese market (GMT+7). Today the
only query path is Claude Desktop via MCP — unavailable from a mobile phone or when the
laptop is closed. Sprint 031 builds a Telegram command interface so the investor can query
the system's live state — watchlist, prices, alerts, briefing, P&L — by sending a `/command`
message to the existing Telegram bot, with no Claude Desktop required.

---

### Scope

**IN**

1. **Task 214 — Webhook endpoint + command router (P0)**

   Add a `/webhook` POST route to the Bun HTTP server that receives Telegram Update objects.
   Parse the `message.text` field to extract a command and optional argument. Dispatch to the
   appropriate internal use case. Format the result as plain Vietnamese text and reply via the
   Telegram Bot `sendMessage` API (same bot used for alerts). Supported commands at launch:

   | Command | Argument | Action |
   |---------|----------|--------|
   | `/watchlist` | — | List all watched stocks with last known price |
   | `/price` | `VCB` | Fetch current price for one stock |
   | `/alerts` | — | Last 5 unread alerts (severity + headline) |
   | `/briefing` | — | Trigger morning briefing assembly and return summary |
   | `/health` | — | System health: job status, DB size, last cycle time |
   | `/pnl` | — | Portfolio P&L summary (uses existing getPortfolioPnl use case) |

   Unknown commands return: "Lệnh không hỗ trợ. Gõ /help để xem danh sách."
   `/help` lists all supported commands in Vietnamese.

   Files:
   - ADD: `src/infrastructure/notifiers/telegramCommands.ts` — command parser + dispatcher
   - MODIFY: `src/index.ts` — register `/webhook` POST route
   - ADD: `src/__tests__/214-telegram-commands.test.ts` — unit tests for command parser

2. **Task 215 — Telegram webhook registration + security (P1)**

   The webhook URL must be registered with the Telegram Bot API via `setWebhook`. The
   endpoint must reject requests not signed by Telegram (secret token header validation).
   The bot must not echo commands to the alerts channel — replies go only to the sender.

   Files:
   - ADD: `src/infrastructure/notifiers/telegramWebhookSetup.ts` — `registerWebhook()` helper
   - MODIFY: `src/index.ts` — call `registerWebhook()` on server startup (only if
     `TELEGRAM_WEBHOOK_URL` env var is set; no-op if absent so dev mode is unaffected)
   - MODIFY: `src/infrastructure/notifiers/telegramCommands.ts` — validate
     `X-Telegram-Bot-Api-Secret-Token` header before processing
   - ADD: `src/__tests__/215-telegram-webhook.test.ts` — unit tests for security validation

3. **Task 216 — Command integration tests + CLAUDE.md update (P2)**

   Integration tests covering the full webhook → command → response roundtrip using a mock
   Telegram server (no real HTTP calls). Update CLAUDE.md to document Sprint 031 files and
   the webhook route. Update the scheduled jobs table to note the webhook is passive (no cron
   — event-driven).

   Files:
   - ADD: `src/__tests__/216-telegram-webhook-integration.test.ts` — roundtrip tests
   - MODIFY: `CLAUDE.md` — add Sprint 031 files to architecture section

**OUT**

- Long-poll fallback (polling mode) — webhook is the only delivery mechanism this sprint
- Inline keyboards / button UX — plain text commands only
- Multi-turn conversation state — every command is stateless
- New MCP tools (no additions to the 53-tool set)
- LLM-based response generation
- New data sources or fetchers
- Push notifications triggered by commands (alerts already push autonomously)

---

### Success Metrics

1. Sending `/price VCB` to the Telegram bot returns the current VCB price within 3 seconds
   (measured from message send to reply receipt on a mobile device in France).

2. Sending `/alerts` returns the last 5 unread alerts formatted in Vietnamese, same style as
   the autonomous alert messages already live.

3. Sending an unknown command returns the Vietnamese help hint — no crash, no silent failure.

4. `X-Telegram-Bot-Api-Secret-Token` header validation rejects unsigned requests with HTTP
   401 before any dispatch logic runs.

5. `bun test` full suite passes: existing 1771 tests + new tests for tasks 214-216, 0
   failures.

6. `bun tsc --noEmit` → 0 errors.

7. Tool count: 53 (unchanged — no new MCP tools this sprint).

---

### Task board (Sprint 031)

| # | Title | Priority | Agent | Status | Depends on |
|---|-------|----------|-------|--------|------------|
| 214 | Webhook endpoint + command router | P0 | BA → Architect → Dev | Backlog | — |
| 215 | Webhook registration + security | P1 | BA → Architect → Dev | Backlog | 214 |
| 216 | Integration tests + CLAUDE.md update | P2 | Dev → QA | Backlog | 214, 215 |

---

### Dependency chain

```
214 (webhook + router)
  └─→ 215 (registration + security hardening)
        └─→ 216 (integration tests + docs)
```

214 can start immediately. 215 starts after the webhook route exists. 216 closes the sprint.

---

### Key technical decisions (locked at PO level)

- **Webhook-only**: no long-poll mode this sprint. The server already runs on a fixed URL;
  webhook is the correct production pattern. Long-poll is a fallback for dev environments
  without a public URL — defer to Sprint 032 if needed.

- **Stateless commands**: each `/command` is fully self-contained. The handler reads from
  SQLite/LanceDB, formats a response, sends it, and returns. No session state is stored
  between commands. This keeps the implementation minimal and testable.

- **Same bot, different reply path**: the existing Telegram bot token is reused. Autonomous
  alerts use `sendMessage` to the configured `TELEGRAM_CHAT_ID`. Command replies use
  `sendMessage` to `update.message.chat.id` (the sender). These are the same chat in the
  investor's single-user setup, but the code path is separate — alerts are never suppressed
  by command traffic and vice versa.

- **Secret token header is mandatory in production**: if `TELEGRAM_WEBHOOK_SECRET` env var
  is absent, the webhook endpoint logs a warning and operates in dev mode (no validation).
  In production the variable must be set; the CI gate should reject a deploy without it.

- **No new MCP tools**: command dispatch calls existing use cases directly (assembleBriefing,
  getPortfolioPnl, scanMarket, etc.) — not through the MCP tool layer. This avoids coupling
  the Telegram interface to MCP protocol semantics.

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
| 027 | Stability First | 2026-04-02 | 194 (CLAUDE.md sync), 195 (rebalancing, in Review), hotfixes 198-205 |
| 028 | Structural Integrity and Investor Safety Net | 2026-04-02 | 192, 193, 206, 207 |
| 029 | Always-On Investor | 2026-04-02 | 208 (Telegram commands), 209 (P&L snapshot), 210 (source health) |
| 030 | Quality Before Quantity | 2026-04-02 | 211 (CLAUDE.md sync), 212 (worktree cleanup), 213 (test isolation) |
