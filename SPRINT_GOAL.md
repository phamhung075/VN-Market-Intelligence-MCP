# Sprint Goal

## Current Sprint

status: COMPLETE
sprint_id: 025
started: 2026-04-01
updated: 2026-04-01
completed: 2026-04-01

---

### Theme

**"Daily Investor Intelligence — Sector Rotation, Earnings Calendar, and Alert Digest"**

---

### Goal

The system alerts the investor on individual stocks but gives no macro-level view of
where capital is flowing across sectors, no visibility into when the next financial
report is expected for watchlist stocks, and no daily digest to catch any alerts that
were missed in real-time.

This sprint closes three operational gaps that a real investor hits every single day:

1. Sector rotation detection tells the investor which sectors are gaining and losing
   relative strength so they can position ahead of institutional flows — not just react
   to individual stock moves.
2. Earnings calendar eliminates the risk of being caught off-guard by an upcoming BCTC
   release. VN BCTC seasons follow predictable quarterly windows; a rule-based calendar
   requires no external data.
3. Alert digest delivers a daily Telegram summary of all alerts fired in the past 24
   hours so the investor never misses a signal, even when not watching the live feed.

---

### Scope

**IN**

1. **Task 186 — Sector rotation detector: `get_sector_rotation` MCP tool (P0)**

   New MCP tool `get_sector_rotation` that reads `market_prices` + `market_prices_history`
   to compute per-sector price momentum and flag sectors gaining or losing relative
   strength over the past 5 trading days. No new schema, no external data.

   Computation logic (rule-based, deterministic):
   - Group all stocks in `market_prices` by their `exchange` + sector mapping from
     `sectorPeers.ts` (already shipped in Sprint 013).
   - For each sector with >= 2 stocks, compute:
     - **Sector 5d return**: average of individual stock returns over the last 5 rows
       in `market_prices_history` per stock.
     - **Sector 1d return**: average of current `change_pct` across all stocks in the
       sector from `market_prices`.
     - **Rotation signal**: if 5d return > +2% AND 1d return > +0.5% → INFLOW
       (money flowing in). If 5d return < -2% AND 1d return < -0.5% → OUTFLOW. Else
       NEUTRAL.
   - Rank sectors by 5d return descending.

   Output (Vietnamese, plain text):
   ```
   DONG TIEN NGANH (2026-04-01)
   ─────────────────────────────
   #1  banking       +3.2% (5d) | +0.8% (1d) | DONG TIEN VAO  [VCB +2.1%, BID +1.8%, CTG +0.9%]
   #2  real_estate   +1.8% (5d) | +0.3% (1d) | TRUNG TINH     [VIC +1.2%, VHM +0.9%]
   #3  technology    -0.5% (5d) | -0.2% (1d) | TRUNG TINH     [FPT -0.5%]
   #4  steel         -2.8% (5d) | -0.7% (1d) | DONG TIEN RA   [HPG -2.8%]
   ...
   CANH BAO: Nhieu dong tien ra khoi steel (HPG) — kiem tra vi the.
   ```

   Warning line is appended only when OUTFLOW sector contains a watchlist stock.
   Reads active watchlist from `watchlist` table to determine warning eligibility.

   Graceful degradation:
   - Sectors with < 2 tracked stocks are shown with "(du lieu han che)" and no signal.
   - If `market_prices` table is empty, returns "Chua co du lieu gia thi truong".
   - If `market_prices_history` has < 2 rows per stock, 5d return falls back to 1d
     `change_pct` only and appends "(chi co du lieu 1 ngay)".

   Files:
   - CREATE: `src/domain/services/sectorRotationDetector.ts`
   - CREATE: `src/interface/mcp/tools/sectorRotationTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerSectorRotationTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/186-sector-rotation.test.ts`

   Acceptance criteria:
   - A sector where all stocks have 5d return > +2% and 1d return > +0.5% is labelled
     "DONG TIEN VAO".
   - A sector where all stocks have 5d return < -2% and 1d return < -0.5% is labelled
     "DONG TIEN RA".
   - Sectors are ranked by 5d return descending in output.
   - When an OUTFLOW sector contains a watchlist stock, the warning line appears.
   - When `market_prices` is empty, output contains "Chua co du lieu gia thi truong".
   - When only 1d data is available, output contains "(chi co du lieu 1 ngay)".
   - >= 16 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 40 to 41.

2. **Task 187 — Earnings calendar: `get_earnings_calendar` MCP tool (P0)**

   New MCP tool `get_earnings_calendar` that returns expected BCTC release dates for
   all watchlist stocks based on VN statutory reporting deadlines. No new schema, no
   external data. Actual filed dates are pulled from `financial_reports` table where
   available; upcoming deadlines are estimated from rule-based season windows.

   VN BCTC statutory deadlines (rule-based constants, not DB-driven):
   - **Q1** (period ending 31 March): deadline 30 April (listed) / 45 days for unlisted
   - **Q2** (period ending 30 June): deadline 31 July
   - **Q3** (period ending 30 September): deadline 31 October
   - **Q4** / Annual (period ending 31 December): deadline 31 January (preliminary) +
     90 days for audited (31 March)
   - **Midyear audited** (H1): deadline 31 August

   Logic:
   - For each stock in `watchlist`, check `financial_reports` for the most recent
     actual filing. Compute which quarterly period comes next.
   - Determine the statutory deadline for that period.
   - If today is within 14 days before the deadline: status = SẮP ĐẾN (UPCOMING).
   - If today is past the deadline and no filing found: status = QUÁ HẠN (OVERDUE).
   - If filing already recorded: status = ĐÃ NỘP (FILED) with actual date.
   - If next deadline > 14 days away: status = CHỜ (WAITING) with days until deadline.

   Output:
   ```
   LICH BCTC — DANH SACH THEO DOI (2026-04-01)
   ─────────────────────────────────────────────
   VNM   Q1/2026  Han nop: 30/04/2026  Con 29 ngay   CHO
   FPT   Q1/2026  Han nop: 30/04/2026  Con 29 ngay   CHO
   VCB   Q1/2026  Han nop: 30/04/2026  Con 29 ngay   CHO
   VEA   Q4/2025  Han nop: 31/03/2026  QUA HAN        [!] Chua thay bao cao
   ─────────────────────────────────────────────
   Sap den (< 14 ngay): 0  |  Qua han: 1  |  Cho: 3
   ```

   Graceful degradation:
   - If `watchlist` table is empty, returns "Danh sach theo doi trong. Them co phieu
     truoc khi xem lich BCTC."
   - Stocks not yet in `financial_reports` are still shown with estimated deadlines
     labelled "(uoc tinh)".

   Files:
   - CREATE: `src/domain/services/earningsCalendar.ts`
   - CREATE: `src/interface/mcp/tools/earningsCalendarTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerEarningsCalendarTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/187-earnings-calendar.test.ts`

   Acceptance criteria:
   - For a watchlist stock with no filing in `financial_reports`, the next Q1 deadline
     (30 April) is shown as estimated "(uoc tinh)".
   - A stock whose filing deadline passed yesterday with no entry in `financial_reports`
     shows status "QUÁ HẠN".
   - A stock whose filing is within 14 days shows status "SẮP ĐẾN".
   - A stock with an actual filing in `financial_reports` shows status "ĐÃ NỘP" with
     the actual date.
   - When `watchlist` is empty, output contains "Danh sach theo doi trong".
   - >= 14 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 41 to 42.

3. **Task 188 — Daily alert digest: `send_alert_digest` MCP tool + scheduler job (P1)**

   New MCP tool `send_alert_digest` that compiles all alerts from the past 24 hours
   into a single grouped Telegram message and sends it. Also registers a cron job to
   auto-send the digest at 21:00 GMT+7 on market days (after close, before evening
   summary). No new schema — reads from `alerts` table, sends via existing
   `telegram.ts` notifier.

   Digest grouping logic:
   - Pull all alerts from `alerts` WHERE `created_at >= now - 24h`, ordered by severity
     DESC then created_at DESC.
   - Group by affected stock (one block per stock).
   - Within each stock block, list up to 3 alerts (most recent, highest severity first).
   - If a stock has > 3 alerts in 24h, append "(va N canh bao khac)".
   - Prepend a summary header: total alert count, count by severity (CRITICAL/HIGH/MEDIUM).

   Output (Telegram plain text, Vietnamese):
   ```
   TOM TAT CANH BAO — 24H QUA (2026-04-01 21:00)
   ──────────────────────────────────────────────
   Tong: 7 canh bao | NGHIEM TRONG: 1 | QUAN TRONG: 4 | LUU Y: 2

   [VNM] — 3 canh bao
   • NGHIEM TRONG: Gia giam 5.2% trong 1 phien (15:30)
   • QUAN TRONG: Khoi luong dot bien +180% so trung binh (14:00)
   • LUU Y: Tin tuc tieu cuc — BCTC Q4 duoi ky vong (09:30)

   [FPT] — 2 canh bao
   • QUAN TRONG: Gia tang 3.1% - co the co thong tin noi bo (11:00)
   • LUU Y: VN-Index giam 1.2%, FPT chiu anh huong (09:00)

   [HPG] — 2 canh bao
   • QUAN TRONG: Gia thep the gioi giam, HPG co the bi anh huong (10:30)
   • LUU Y: Khoi ngoai ban rong (09:45)
   ```

   If no alerts in 24h: sends "Khong co canh bao nao trong 24 gio qua."

   Scheduler integration:
   - Add a new cron job `alertDigestJob` at `0 21 * * 1-5` (21:00 GMT+7, weekdays).
   - Register in `src/scheduler/jobs.ts` alongside existing jobs.
   - The MCP tool `send_alert_digest` can also be called manually (e.g., after a
     volatile session).

   Graceful degradation:
   - If Telegram is not configured (no token/chat ID), the tool returns the digest text
     without sending and appends "(Telegram chua duoc cau hinh)".
   - If `alerts` table is empty or has no recent alerts, returns the "no alerts" message
     without error.

   Files:
   - CREATE: `src/application/usecases/assembleAlertDigest.ts`
   - CREATE: `src/scheduler/alertDigestJob.ts`
   - CREATE: `src/interface/mcp/tools/alertDigestTools.ts`
   - MODIFY: `src/scheduler/jobs.ts` — add alertDigest cron entry
   - MODIFY: `src/interface/mcp/server.ts` — register `registerAlertDigestTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/188-alert-digest.test.ts`

   Acceptance criteria:
   - With 7 alerts in the DB spanning 3 stocks, digest contains 3 stock blocks with
     correct alert counts.
   - Alerts older than 24 hours are excluded from the digest.
   - A stock with > 3 alerts in 24h shows the top 3 plus "(va N canh bao khac)".
   - Severity counts in the header match the actual alert severities in the DB.
   - When `alerts` is empty, output contains "Khong co canh bao".
   - When Telegram is not configured, output contains "(Telegram chua duoc cau hinh)".
   - The `alertDigestJob` cron expression is `0 21 * * 1-5`.
   - >= 16 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 42 to 43.

**OUT**

- Correlation analysis / diversification scoring (deferred to Sprint 026 — needs
  richer price history to be meaningful)
- Export / backup to JSON (low daily-use value vs features selected)
- Performance attribution (requires completed positions volume not yet present)
- LLM-based analysis or recommendations
- New external data sources
- Backtesting / simulation engine
- Real-time WebSocket price streaming

---

### Success Metrics

1. `get_sector_rotation()` identifies at least one INFLOW and one OUTFLOW sector when
   the mock price data includes clear sector divergence. The investor sees capital flow
   direction in one MCP call.

2. `get_earnings_calendar()` correctly labels VEA as QUÁ HẠN when Q4 deadline has
   passed with no filing on record, and labels VNM/FPT/VCB as CHỜ with accurate
   day-count. The investor is never surprised by an upcoming BCTC.

3. `send_alert_digest()` compiles and formats a 24-hour digest correctly: grouped by
   stock, sorted by severity, with correct header counts. The investor can review the
   full day in one Telegram message.

4. `bun tsc --noEmit` → 0 errors. All existing tests continue to pass (1556+).

5. Tool count: 40 → 43 (get_sector_rotation, get_earnings_calendar, send_alert_digest).

---

### Task board (Sprint 025)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 186 | Sector rotation detector: `get_sector_rotation` MCP tool | P0 | Backlog | — |
| 187 | Earnings calendar: `get_earnings_calendar` MCP tool | P0 | Backlog | — |
| 188 | Daily alert digest: `send_alert_digest` MCP tool + scheduler job | P1 | Backlog | — |

---

### Dependency chain

```
186 (sector rotation)   — P0, independent, uses market_prices + sectorPeers (both done)
187 (earnings calendar) — P0, independent, uses watchlist + financial_reports (both done)
188 (alert digest)      — P1, independent, uses alerts + telegram.ts (both done)

186 + 187 can run in parallel (no shared files).
188 can start in parallel with 186 + 187.
All three tasks touch different tool files — no merge conflicts.
```

---

### Key technical decisions (locked at PO level)

- **Task 186 uses `sectorPeers.ts` for sector grouping**: the sector-to-stock mapping
  already exists in the domain layer (Sprint 013). The rotation detector imports it
  directly — no new mapping table needed. This keeps the domain layer as the single
  source of truth for sector definitions.

- **Task 186 rotation signal thresholds (+/-2% for 5d, +/-0.5% for 1d) are constants
  in `sectorRotationDetector.ts`**: tied to display logic, not independently tunable.
  Co-located to avoid config sprawl.

- **Task 187 deadline rules are static constants in `earningsCalendar.ts`**: VN statutory
  BCTC deadlines change only by regulatory amendment (rare). A static TypeScript object
  mapping quarter → deadline offset is simpler and fully testable without DB.

- **Task 188 digest is send-on-demand + scheduled**: the MCP tool and the cron job share
  the same `assembleAlertDigest` use case. The scheduler calls the same function the MCP
  tool exposes — no code duplication.

- **Task 188 cron at 21:00 GMT+7**: positioned after market close scan (15:30) and before
  evening summary (22:00), so the digest captures the full trading day including any
  close-of-day alerts.

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
