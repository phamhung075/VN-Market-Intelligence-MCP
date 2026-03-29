# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 009

### Goal

Deliver three production-ready capabilities that close the real-time intelligence loop: (1) replace the broken plain-HTTP SSC scraper with a Puppeteer-driven browser automation layer so all official filings for the four surveillance stocks are fetched reliably; (2) add a Telegram Bot notifier so high-severity alerts reach the user instantly without polling Claude; and (3) upgrade the scheduler from event-driven cron slots to a unified 15-minute intelligence cycle that polls news, checks SSC, fetches prices, and runs the impact chain automatically.

### Scope

**IN**

SSC Puppeteer scraper (tasks 031, 032, 033, 127):
- Replace `src/infrastructure/fetchers/ssc.ts` plain-HTTP implementation with a Puppeteer driver
- Launch Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, navigate to `/faces/NewsSearch`
- Search form: input `pt9:it8112` for stock code, button `pt9:b1` to submit
- Results table: `tr[_afrRK]` rows, 8 cells (STT, Exchange, Code, Title, Company, Description, Date, Download URL)
- Fan-out across all four disclosure categories: BCTC, Dinh ky khac, Bat thuong 24h, Chao ban / phat hanh
- Dedup by URL; persist each discovered URL in `financial_reports.source_url`
- Wire updated fetcher into the existing `runSscCheck()` scheduler job
- Mock-browser tests: min 20 test cases covering form interaction, table parsing, dedup, graceful degradation

Telegram Bot alerts (tasks 034, 128):
- `src/infrastructure/notifiers/telegram.ts` — thin wrapper over Telegram Bot API `sendMessage`
- Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from env (`.env` / config.ts)
- Sends alert when: alert severity = HIGH or CRITICAL, new BCTC document discovered on SSC, impact chain detects strong causal event (confidence >= 0.7)
- Message format: markdown, includes stock code, signal type, severity, one-line summary, timestamp
- Does NOT throw if Telegram is unreachable — logs warning, returns gracefully
- New MCP tool `send_test_telegram` lets the user verify connectivity from Claude Desktop
- Unit tests: min 15 cases (mock Telegram API)

Enhanced scheduler / 15-min intelligence cycle (tasks 106, 129):
- New `src/scheduler/intelligenceCycleJob.ts` that runs every 15 minutes during market hours (09:00–15:30 GMT+7 weekdays)
- Each cycle in sequence: poll news → check SSC (lightweight: only list, skip full parse if no new docs) → fetch market prices → run impact chain on new entries → send Telegram alerts for HIGH/CRITICAL signals
- Concurrency guard: if previous cycle is still running, skip with log warning
- Cycle duration tracked and logged; warn if > 12 minutes
- Outside market hours: reduced 60-min cycle for news-only polling (no SSC, no price fetch)
- `bun test src/__tests__/106-*.test.ts` min 15 cases with mocked sub-jobs

**OUT**
- Changes to the BCTC PDF parser, ratio computer, or alert generator domain logic
- Any UI or MCP tool changes to existing reports/watchlist/market tools
- Headless browser automation for portals other than SSC
- Pagination beyond the first results page on SSC
- Telegram group chats or multi-user routing (single chat ID only)
- Full AI auto-scheduling / LLM-driven task creation (deferred to Sprint 010)

### Success Metric

1. `listSscDocuments('VCB', 'quarterly', 2025)` returns at least one `SscDocument` with a non-empty `url` pointing to a real PDF on `congbothongtin.ssc.gov.vn` — verified by running the live browser driver.
2. All four disclosure categories are queried per stock in a single `listAllSscDocuments` call; at least the BCTC category returns a download link.
3. A HIGH-severity alert (simulated by unit test or real watchlist trigger) results in a Telegram message sent to `TELEGRAM_CHAT_ID` containing the stock code and severity level.
4. The 15-minute intelligence cycle completes one full pass (news + SSC list + prices + impact chain) within 12 minutes without crashing; the concurrency guard prevents overlapping cycles.
5. `bun test` full suite passes with 0 failures; `bun tsc --noEmit` reports 0 errors.
6. Puppeteer `browser.close()` is called in ALL code paths — no zombie Chrome processes.

### Dependency chain

```
127  (TDD Red — mock Puppeteer tests, write first)
  └─ 031 (Puppeteer SSC fetcher — passes 127 tests)
       └─ 032 (multi-category fan-out + dedup)
            └─ 033 (wire into sscCheckerJob)

128  (TDD Red — mock Telegram API tests, write first, independent of SSC chain)
  └─ 034 (Telegram notifier + alert hook + send_test_telegram MCP tool)

129  (TDD Red — mock cycle tests, can write in parallel)
  └─ 106 (15-min intelligence cycle job — depends on 033 + 034)
```

### Sprint task order (recommended)

1. 127 (TDD Red — failing Puppeteer mock tests)
2. 128 (TDD Red — failing Telegram mock tests, parallel with 127)
3. 031 (TDD Green — Puppeteer SSC fetcher)
4. 034 (TDD Green — Telegram notifier)
5. 032 (multi-category fan-out, depends on 031)
6. 033 (scheduler wiring, depends on 032)
7. 129 (TDD Red — failing cycle tests, can start after 033 + 034 are clear)
8. 106 (15-min intelligence cycle, depends on 033 + 034 + 129)

### Key technical decisions (locked at PO level)

- **Browser binary**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; `puppeteer-core@24.40.0` already installed
- **Puppeteer launch flags**: `headless: 'new'`, `--no-sandbox`, `--disable-dev-shm-usage`
- **SSC search input selector**: `input[id$="it8112::content"]` (CSS attribute suffix); button text "Tìm kiếm"
- **Results table selector**: `tr[_afrRK]`, 8 cells per row
- **Wait strategy**: `waitForSelector` on table row after button click; 10 s timeout, up to 3 retries
- **Existing interface preserved**: `SscDocument` (title, url, publishedAt, reportType) and `listSscDocuments` signature unchanged; `listAllSscDocuments` is a new additive export
- **Telegram transport**: `https://api.telegram.org/bot<TOKEN>/sendMessage` — plain HTTPS POST, no third-party SDK
- **Alert hook location**: `alertGenerator.ts` calls `notifyTelegram(alert)` only when severity is HIGH or CRITICAL; notifier is injected as optional dependency to keep domain pure
- **Cycle frequency**: 15 min during 09:00–15:30 GMT+7 weekdays; 60 min outside market hours (news only)

---

## Completed Sprints

| Sprint | Goal | Status |
|--------|------|--------|
| 000 | Project setup, DB schema, env config, embeddings, vectorstore, watchlist, BCTC balance sheet + income stmt | Done |
| 001 | BCTC RAG pipeline: cash flow, ratio, delta, orchestrator, RAG retriever | Done |
| 002 | SSC portal scraper, PDF extractor, full BCTC pipeline, Bun MCP server, SSC report MCP tools | Done |
| 003 | News intelligence + watchlist/alert system (021, 082, 063, 064, 086) | Done |
| 004 | Cascade engine, analysis MCP tools, legacy cleanup (087, 022, 023, 061, 062, 083, 088) | Done |
| 005 | Market data, scheduler jobs — morning briefing, news poll, market scan, SSC nightly (088, 026, 102, 104, 103, 101) | Done |
| 006 | Analytical depth — pattern matcher, AI summary, HNX fetcher, market MCP tools, integration tests (065, 066, 027, 084, 105, 123) | Done |
| 007 | BCTC edge-case tests, domain coverage, SSC pipeline mock tests, E2E briefing (121, 122, 124, 125, DOC-001, 024) | Done |
| 008 | Macro intelligence layer — Yahoo Finance commodities, SBV rates, macro cascade, get_macro_snapshot MCP tool (FIX-081, 025, 028, 126, 089) | Done |
