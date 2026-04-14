# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 078 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1192 | Evening summary empty-content fallback Telegram message | Dev | interface/scheduler | — | task/1192-evening-fallback | Review |
| 1193 | VPS push-prices not persisting to market_prices table | Dev | infrastructure | — | — | Todo |
| 1194 | Missing MCP tools for Agent 08 Prediction Synthesizer | Dev | interface | — | — | Todo |
| 1195 | Cascade keyword "hạ nhiệt" disambiguation: interest-rate vs geopolitical | Dev | domain | — | — | Backlog |
| 1196 | BCTC extraction: VNM/VEA PDFs on disk but financial_reports empty | Dev | application | — | — | Backlog |
| 1197 | Cascade seed sentiment inversion: bullish headline classified BEARISH | Dev | domain | — | — | Backlog |
| 1198 | VND currency/ticker false positive in detectStocksInText | Dev | domain | — | — | Backlog |
| 1199 | Trading Economics impact scores all 10.0 regardless of VN relevance | Dev | domain | — | — | Backlog |
| 1200 | Cascade "đầu tư công" missing sentiment polarity check | Dev | domain | — | — | Backlog |
| 1201 | Banking Q4-2025 BCTC missing: BID, EIB, SHB, VCB (deadline 14/04) | Dev | infrastructure | — | — | Backlog |
| 1202 | FPT/HPG Q4-2025 BCTC missing — VPS BCTC fetcher gap (14 days overdue) | Dev | infrastructure | — | — | Backlog |
| 1203 | Dow Jones +59% spike: add outlier validation for macro indicators | Dev | domain | — | — | Backlog |
| 1204 | VCB Q1-2025 BCTC all values = 0 (bad record from failed extraction) | Dev | application | — | — | Backlog |
| 1205 | get_legal_risk_signals misses "truy tố" prosecution articles | Dev | domain | — | — | Backlog |
| 1206 | Cascade keyword fix: "đất vàng"→real_estate, "cầu" in "toàn cầu"→no construction | Dev | domain | — | — | Backlog |
| 1207 | Market-wide cascade confidence cap for non-watchlist company events | Dev | domain | — | — | Backlog |
| 1208 | Stock price freshness reads direct-API timestamp, not VPS-push timestamp | Dev | infrastructure | — | — | Backlog |
| 1209 | Polymarket test markets not refreshing (fetchedAt 12 days stale) | Dev | infrastructure | — | — | Backlog |
| 1210 | Policy classifier misclassifies criminal prosecution as monetary_policy | Dev | domain | — | — | Backlog |
| 1211 | BSR missing from "công ty lọc dầu" / "Bình Sơn" stock aliases | Dev | domain | — | — | Backlog |
| 1212 | Interest rate cooling seed sentiment should be BULLISH not NEUTRAL | Dev | domain | — | — | Backlog |
| 1213 | Unicode corruption in Vietnamese analysis text (combining diacritics) | Dev | infrastructure | — | — | Backlog |
| 1214 | VNM Middle East dairy exposure missing from Hormuz cascade rules | Dev | domain | — | — | Backlog |
| 1215 | Bug report dedup: suppress duplicate category within 4h in send_telegram | Dev | infrastructure | — | task/1215-bug-report-dedup | Review |

**WIP:** 0 In Progress.

---

## Task Details (active tasks only — Done tasks archived)

### Task 1192 — Evening summary empty-content fallback Telegram message

**Why:** The 2026-04-13 evening report was entirely empty. `eveningSummaryJob` silently
skipped the Telegram send. The user received zero market-channel feedback, making a
complete data-collection failure indistinguishable from normal operation.

**What:**
- Modify `src/scheduler/eveningSummaryJob.ts`: in the `hasContent === false` else branch,
  send a fallback market-channel message (Vietnamese, mentions `get_pipeline_health`).
- Add injectable `sendFn` parameter to `runEveningSummary` for test isolation.
- Tests in `src/__tests__/1192-evening-summary-empty-fallback.test.ts` (4 cases).

**Done when:** All tests pass, `bun tsc --noEmit` clean, empty evening always sends Telegram.

---

### Task 1193 — VPS push-prices not persisting to market_prices table [CRITICAL]

**Why:** VPS pushes 75 prices every 60s (200+ pushes/day, all 200 OK) but `get_market_context` returns N/A for 30/31 watchlist stocks, freshness shows 17 days stale. After server restart prices vanish. `market_prices_history` also empty → correlation matrix, VaR, portfolio risk all return zeros. `get_portfolio_risk` returns 0 VND total value despite active FPT position. (Reports: 1138, 1159, 1160, 1161, 1167)

**What:**
- Investigate `POST /api/push-prices` handler — verify it writes to `market_prices` table with correct column names/types after server restart
- Check if `market_prices_history` accumulation pipeline (daily OHLCV job) is enabled and writing rows
- Verify freshness query reads VPS-pushed rows, not only direct-fetch rows
- Fix root cause; add test asserting push-prices endpoint persists to DB

**Done when:** `get_market_context` shows live prices for all 31 watchlist stocks within 2 min of VPS push; `market_prices_history` accumulates OHLCV rows; `get_portfolio_risk` returns non-zero VaR.

---

### Task 1194 — Missing MCP tools for Agent 08 Prediction Synthesizer [CRITICAL]

**Why:** Agent 08 Monday 07:30 cycle completely failed — `get_evidence_summary`, `create_prediction_claim`, `record_evidence_fragment` listed in `docs/data/tool-registry.json` but not exposed by live MCP server. ToolSearch returns no match for all three. (Report: 1142)

**What:**
- Verify the three tools exist in `src/interface/tools/` (or equivalent)
- If missing: implement and register them in the MCP tool registry
- If present but not exported: fix the tool registration/export
- Ensure `docs/data/tool-registry.json` toolCount is accurate after fix

**Done when:** All three tools appear in live MCP session; Agent 08 can complete its prediction synthesis cycle.

---

### Task 1195 — Cascade keyword "hạ nhiệt" disambiguation [HIGH — 16 duplicate reports]

**Why:** "hạ nhiệt" is ambiguous — means geopolitical de-escalation AND interest rate cooling. "Mặt bằng lãi suất hạ nhiệt" articles trigger geopolitical cascade: oil_gas bearish (99% conf), gold bearish (98%), aviation up — all wrong. Most-reported bug: 16 near-identical reports in one evening. (Reports: 1123, 1125, 1128, 1131, 1132, 1137, 1139, 1141, 1144–1146, 1149, 1151, 1154, 1157, 1158)

**What:**
- In cascade engine keyword rules, add context-aware disambiguation for "hạ nhiệt":
  - Co-occurs with "lãi suất"/"tín dụng"/"lạm phát" → monetary policy rules (banking up, RE up, securities up)
  - Co-occurs with "địa chính trị"/"Iran"/"chiến tranh"/"Hormuz" → geopolitical de-escalation rules
- Similar fix for "đầu tư công" (1200): negative disbursement context must NOT fire "đầu tư công tăng" rule
- Unit tests covering both context types

**Done when:** "lãi suất hạ nhiệt" → banking/RE/securities bullish only; "địa chính trị hạ nhiệt" → correct geopolitical signals.

---

### Task 1215 — Bug report dedup: suppress duplicate category within 4h

**Why:** Analysis agents run every ~15 min and re-report the same bug each cycle until dev team cleans the channel. "hạ nhiệt" bug alone produced 16 identical reports in one evening. BUG channel becomes unreadable noise.

**What:**
- `extractCategoryFromText(text)` — parse `📋 <category>` line from report text (`telegramReportStore.ts`)
- `isDuplicateReport(db, text, cooldownSeconds=4h)` — query for open (status=new) report with same category within cooldown (`telegramReportStore.ts`)
- `sendTelegramBug()` calls dedup check before sending; returns -1 if suppressed (`telegram.ts`)
- `send_telegram` tool returns descriptive message for -1 (suppressed) vs 0 (failed) (`telegramTools.ts`)
- 7 unit tests in `src/__tests__/1215-bug-report-dedup.test.ts`

**Done when:** All 7 tests pass, `bun tsc --noEmit` clean, server restarted.
