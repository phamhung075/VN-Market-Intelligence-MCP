# Sprint Goal

## Current Sprint

status: ACTIVE
sprint_id: 026
started: 2026-04-01
updated: 2026-04-01

---

### Theme

**"Signal Quality and Portfolio Correlation — Know What Moves Together"**

---

### Goal

The system generates many signals and tracks multiple positions, but has no way to tell
the investor whether those positions are truly diversified or are concentrated bets on the
same underlying factor. Two stocks in different sectors can still be highly correlated if
they share export exposure, interest rate sensitivity, or institutional ownership patterns.

This sprint adds three capabilities that close the gap between raw alerts and actionable
portfolio intelligence:

1. **Correlation analysis** computes pairwise price correlation across watchlist stocks
   using existing `market_prices_history` data. The investor immediately sees which holdings
   move together and can measure true diversification — not just sector labels.

2. **Export / backup** gives the investor a single MCP call to dump all positions,
   analysis entries, and alerts to a portable JSON file. This is the most-requested
   operational safety net: a way to snapshot the system state before changes, or share it
   for external analysis.

3. **Performance attribution** closes the feedback loop on signals: for each completed
   position, it attributes P&L contribution to the signal type (news_mention, price_drop,
   report, cascade) that triggered the entry alert. This answers "which signal type
   actually makes money" — the core question for tuning the system over time.

---

### Scope

**IN**

1. **Task 189 — Correlation analysis: `get_correlation_matrix` MCP tool (P0)**

   New MCP tool `get_correlation_matrix` that reads `market_prices_history` and computes
   Pearson correlation coefficients for all pairs of watchlist stocks. Uses only data
   already stored — no new fetches. Returns a ranked list of highly correlated pairs
   (|r| >= 0.7) and a portfolio diversification score.

   Computation logic (rule-based, deterministic, no LLM):
   - For each pair of watchlist stocks, extract their aligned price series from
     `market_prices_history` (last 30 rows maximum, ordered by stored_at DESC).
   - Align by position index (assume prices are stored at the same cadence for all stocks).
   - Compute Pearson r using the standard formula: r = cov(X,Y) / (stdDev(X) * stdDev(Y)).
   - If either series has fewer than 5 data points, report "(du lieu khong du)" for that
     pair and exclude from the diversification score.
   - Classify each pair:
     - |r| >= 0.85: TUONG QUAN CAO (highly correlated)
     - |r| >= 0.70: TUONG QUAN VUA (moderately correlated)
     - |r| < 0.70: IT TUONG QUAN (low correlation)
   - Diversification score: percentage of pairs with |r| < 0.70. Score 0-100.
   - Rank pairs by |r| descending in output.

   Output (plain text, Vietnamese):
   ```
   MA TRAN TUONG QUAN — DANH SACH THEO DOI (2026-04-01)
   ──────────────────────────────────────────────────────
   Diem da dang hoa: 60/100 (3/5 cap it tuong quan)

   Cap co phieu        |r|    Phan loai
   VCB — VNM          0.91   TUONG QUAN CAO   ⚠ Kiem tra vi the
   FPT — VCB          0.74   TUONG QUAN VUA
   FPT — VNM          0.71   TUONG QUAN VUA
   VEA — HPG          0.43   IT TUONG QUAN
   FPT — VEA          0.31   IT TUONG QUAN
   ──────────────────────────────────────────────────────
   CANH BAO: VCB va VNM co tuong quan cao (0.91). Co the tap trung rui ro.
   ```

   Warning line appears only when a pair with |r| >= 0.85 contains two watchlist stocks
   that both have open positions (cross-reference `positions` table WHERE closed_at IS NULL).

   Graceful degradation:
   - If fewer than 2 watchlist stocks exist: returns "Can it nhat 2 co phieu trong danh
     sach theo doi de tinh tuong quan."
   - If `market_prices_history` has no rows: returns "Chua co du lieu lich su gia."
   - If a pair has < 5 aligned data points: shown as "(du lieu khong du)" with no r value.

   Files:
   - CREATE: `src/domain/services/correlationCalculator.ts`
   - CREATE: `src/interface/mcp/tools/correlationTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerCorrelationTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/189-correlation-matrix.test.ts`

   Acceptance criteria:
   - Two stocks with identical price series produce r = 1.0, classified TUONG QUAN CAO.
   - Two stocks with anti-correlated series produce r close to -1.0.
   - Pairs with < 5 data points are shown as "(du lieu khong du)".
   - Diversification score = 100 when all pairs have |r| < 0.70.
   - Diversification score = 0 when all pairs have |r| >= 0.85.
   - Warning line appears only for highly correlated pairs where both stocks have open
     positions.
   - When < 2 watchlist stocks exist, output contains "Can it nhat 2 co phieu".
   - >= 16 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 43 to 44.

2. **Task 190 — Data export: `export_portfolio_snapshot` MCP tool (P0)**

   New MCP tool `export_portfolio_snapshot` that dumps all investor data to a timestamped
   JSON file in the `data/exports/` directory and returns the file path plus a summary of
   what was exported. No new schema. Reads from existing tables only.

   Export contents (single JSON object):
   ```json
   {
     "exported_at": "2026-04-01T14:00:00+07:00",
     "schema_version": "1.0",
     "watchlist": [...],
     "positions": [...],
     "alerts": [...],
     "analysis_entries": [...],
     "financial_reports": [...],
     "market_prices": [...],
     "summary": {
       "watchlist_count": 4,
       "open_positions": 2,
       "total_alerts": 87,
       "analysis_entries": 312,
       "financial_reports": 5,
       "price_snapshots": 48
     }
   }
   ```

   Logic:
   - Read each table in full using parameterised `SELECT *` queries.
   - `analysis_entries` uses `rag_analyses` table; include all columns.
   - Write to `data/exports/snapshot_<YYYYMMDD_HHmmss>.json` using `Bun.write`.
   - Return a plain-text summary: file path + record counts per table.
   - `data/exports/` directory is created if it does not exist.

   Output (plain text):
   ```
   XUAT DU LIEU — HOAN THANH (2026-04-01 14:00:07)
   ──────────────────────────────────────────────────
   File: data/exports/snapshot_20260401_140007.json
   Kich thuoc: 2.3 MB

   Danh sach theo doi: 4 co phieu
   Vi the:             2 mo / 3 dong
   Canh bao:           87 ban ghi
   Phan tich RAG:      312 ban ghi
   Bao cao BCTC:       5 ban ghi
   Gia thi truong:     48 ban ghi
   ```

   Graceful degradation:
   - If `data/exports/` cannot be created (permission error), returns the JSON as a string
     in the tool response instead of writing to disk, with a note "(khong the ghi file)".
   - If a table has 0 rows, it is exported as an empty array — not omitted.
   - Export never throws; all DB errors are caught and reported in the summary.

   Files:
   - CREATE: `src/application/usecases/exportPortfolioSnapshot.ts`
   - CREATE: `src/interface/mcp/tools/exportTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerExportTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/190-export-snapshot.test.ts`

   Acceptance criteria:
   - Exported JSON contains all 7 top-level keys including `summary`.
   - `summary.watchlist_count` matches the actual number of rows in `watchlist` table.
   - `summary.open_positions` counts only rows in `positions` WHERE closed_at IS NULL.
   - File is written to `data/exports/snapshot_<timestamp>.json`.
   - File size reported in MB is correct to 1 decimal place.
   - When the export directory cannot be written, output contains "(khong the ghi file)".
   - All tables export as empty arrays when they have 0 rows.
   - >= 14 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 44 to 45.

3. **Task 191 — Performance attribution: `get_performance_attribution` MCP tool (P1)**

   New MCP tool `get_performance_attribution` that analyses closed positions and attributes
   P&L to the signal type that triggered the entry alert. No new schema — reads `positions`,
   `alerts` tables only. Produces a ranked breakdown of which signal types generated the
   best and worst returns.

   Attribution logic (rule-based, no LLM):
   - For each closed position (closed_at IS NOT NULL), look up the `entry_alert_id` column
     in `positions`. If the column does not exist or is NULL, group that position under
     "signal_unknown".
   - If `entry_alert_id` is set, join to `alerts` to read the `signal_types` JSON column
     and extract the primary signal type (first element of the array).
   - Group closed positions by primary signal type.
   - For each group, compute:
     - Count of positions.
     - Win rate: percentage of positions where `realized_pnl > 0`.
     - Average P&L (VND): AVG(realized_pnl) across the group.
     - Total P&L (VND): SUM(realized_pnl) across the group.
   - Rank groups by total P&L descending.
   - Signal type labels (Vietnamese):
     - `price_drop` → "Gia giam dot bien"
     - `price_surge` → "Gia tang dot bien"
     - `volume_spike` → "Khoi luong dot bien"
     - `news_mention` → "Tin tuc"
     - `report` → "BCTC"
     - `cascade` → "Phan tich vi mo"
     - `signal_unknown` → "Khong ro nguon tin hieu"

   Output (plain text, Vietnamese):
   ```
   PHAN BO HIEU SUAT THEO TIN HIEU (2026-04-01)
   ──────────────────────────────────────────────
   Tong vi the dong: 5  |  Tong P&L: +2,450,000 VND

   #1  Tin tuc (news_mention)       — 2 vi the — Win 100% — TB: +850,000 VND — Tong: +1,700,000 VND
   #2  Gia giam dot bien (price_drop) — 2 vi the — Win 50%  — TB: +375,000 VND — Tong: +750,000 VND
   #3  BCTC (report)                — 1 vi the — Win 0%   — TB: 0 VND        — Tong: 0 VND
   ──────────────────────────────────────────────
   Tin hieu hieu qua nhat: Tin tuc (news_mention) voi tong +1,700,000 VND
   Tin hieu kem hieu qua:  BCTC (report) voi win rate 0%
   ```

   Graceful degradation:
   - If no closed positions exist: returns "Chua co vi the nao duoc dong. Du lieu hieu
     suat se co sau khi dong vi the dau tien."
   - If `entry_alert_id` column does not exist in `positions`, all positions are grouped
     under "Khong ro nguon tin hieu" and a note is appended: "(Cap nhat co so du lieu de
     theo doi nguon tin hieu)."
   - Positions with NULL `realized_pnl` are excluded from averages and win rate but
     counted in total positions.

   Files:
   - CREATE: `src/domain/services/performanceAttributor.ts`
   - CREATE: `src/interface/mcp/tools/performanceTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerPerformanceTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/191-performance-attribution.test.ts`

   Acceptance criteria:
   - Two closed positions both with signal type `news_mention` and positive P&L produce
     win rate 100% and correct total P&L sum for that group.
   - A position with NULL `entry_alert_id` is grouped under "Khong ro nguon tin hieu".
   - Groups are ranked by total P&L descending.
   - "Tin hieu hieu qua nhat" names the group with the highest total P&L.
   - "Tin hieu kem hieu qua" names the group with the lowest win rate (excluding groups
     with 0 positions).
   - When no closed positions exist, output contains "Chua co vi the nao duoc dong".
   - >= 14 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 45 to 46.

**OUT**

- Technical debt / worktree cleanup (necessary but not investor-facing; schedule as
  separate maintenance sprint)
- Integration / end-to-end tests for the full intelligence cycle (task 125, blocked on
  completing the E2E test harness design)
- API documentation for all 43 MCP tools (low urgency; CLAUDE.md serves as the
  authoritative reference for the dev team)
- LLM-based analysis or recommendations
- New external data sources
- Backtesting / simulation engine
- Real-time WebSocket price streaming

---

### Success Metrics

1. `get_correlation_matrix()` correctly identifies VCB and VNM as highly correlated when
   their mock price history is identical, and reports a diversification score that reflects
   the proportion of low-correlation pairs. The investor knows in one call whether the
   portfolio is concentrated.

2. `export_portfolio_snapshot()` writes a valid JSON file containing all 7 required keys.
   The `summary` counts match the actual DB row counts. The investor can restore or share
   a full snapshot at any time.

3. `get_performance_attribution()` correctly groups closed positions by signal type and
   ranks by total P&L. A portfolio with only `news_mention` wins shows 100% win rate for
   that group. The investor can see which signals to trust.

4. `bun tsc --noEmit` → 0 errors. All existing tests continue to pass (1617+).

5. Tool count: 43 → 46 (get_correlation_matrix, export_portfolio_snapshot,
   get_performance_attribution).

---

### Task board (Sprint 026)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 189 | Correlation analysis: `get_correlation_matrix` MCP tool | P0 | Backlog | — |
| 190 | Data export: `export_portfolio_snapshot` MCP tool | P0 | Backlog | — |
| 191 | Performance attribution: `get_performance_attribution` MCP tool | P1 | Backlog | — |

---

### Dependency chain

```
189 (correlation)         — P0, independent, uses market_prices_history + watchlist + positions
190 (export snapshot)     — P0, independent, reads all tables, writes to data/exports/
191 (performance attr.)   — P1, independent, uses positions + alerts

189 + 190 can run in parallel (no shared files, no shared tables written).
191 can start in parallel — touches different tool files, no merge conflicts.
```

---

### Key technical decisions (locked at PO level)

- **Task 189 uses `market_prices_history` as the sole price source**: the table is already
  populated by the intelligence cycle and market scan jobs. No new fetches at query time —
  the correlation tool is read-only and offline-capable.

- **Task 189 Pearson r is computed in-process (pure TypeScript)**: no external statistics
  library. The formula is five lines of math. This keeps the domain layer dependency-free
  and fully unit-testable with synthetic data.

- **Task 189 warning requires open positions for both stocks**: correlation alone is not
  actionable. The warning fires only when the investor has money in both correlated stocks
  simultaneously. This prevents alert fatigue from theoretical pairs with no exposure.

- **Task 190 exports to `data/exports/` as plain JSON**: no compression, no encryption.
  The file is for the investor's own use. If they need encryption, they apply it outside
  the tool. Keeping it plain JSON makes it directly importable into Excel, Python, or any
  external tool.

- **Task 190 uses `Bun.write` directly**: consistent with how other file writes are done
  in this codebase (briefing files, report files). No new I/O abstraction needed.

- **Task 191 reads `entry_alert_id` from `positions`**: this column was introduced in
  Sprint 023 (task 178 — position tracking). If it does not exist (older DB), all
  positions fall into "Khong ro nguon tin hieu" with a migration hint. No ALTER TABLE at
  tool call time — attribution degrades gracefully.

- **Task 191 primary signal type = first element of `signal_types` JSON array**: the
  array is ordered by severity in the alert generator (highest severity first). Taking the
  first element picks the most important signal without additional ranking logic.

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
