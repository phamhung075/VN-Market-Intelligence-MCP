# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 079 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1193 | VPS push-prices not persisting to market_prices table | Dev | infrastructure | — | — | Todo |
| 1194 | Missing MCP tools for Agent 08 Prediction Synthesizer | Dev | interface | — | — | Todo |
| 1195 | Cascade keyword "hạ nhiệt" disambiguation: interest-rate vs geopolitical | Dev | domain | — | — | Backlog |
| 1196 | BCTC extraction: VNM/VEA PDFs on disk but financial_reports empty | Dev | application | — | — | Backlog |
| 1197 | Cascade seed sentiment inversion: bullish headline classified BEARISH | Dev | domain | — | — | Backlog |
| 1198 | VND currency/ticker false positive in detectStocksInText | Dev | domain | — | — | Backlog |
| 1199 | Trading Economics impact scores all 10.0 regardless of VN relevance | Dev | domain | — | — | Backlog |
| 1200 | Cascade "đầu tư công" missing sentiment polarity check | Dev | domain | — | — | Backlog |
| 1201 | Banking Q4-2025 BCTC missing: BID, EIB, SHB, VCB (deadline 14/04) | Dev | infrastructure | 1193 ✓ | task/1201-bctc-quarter-fix | Review |
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

**WIP:** 0 In Progress. 1 Review.

---

## Task Details (active tasks only — Done tasks archived)

### Task 1215 — Bug report dedup: suppress duplicate category within 4h

**Why:** Analysis agents run every ~15 min and re-report the same bug each cycle until dev team cleans the channel. "hạ nhiệt" bug alone produced 16 identical reports in one evening. BUG channel becomes unreadable noise.

**What:**
- `extractCategoryFromText(text)` — parse `📋 <category>` line from report text (`telegramReportStore.ts`)
- `isDuplicateReport(db, text, cooldownSeconds=4h)` — query for open (status=new) report with same category within cooldown (`telegramReportStore.ts`)
- `sendTelegramBug()` calls dedup check before sending; returns -1 if suppressed (`telegram.ts`)
- `send_telegram` tool returns descriptive message for -1 (suppressed) vs 0 (failed) (`telegramTools.ts`)
- 7 unit tests in `src/__tests__/1215-bug-report-dedup.test.ts`

**Done when:** All 7 tests pass, `bun tsc --noEmit` clean, server restarted.
