# Archive — Sprints 064–080 (Knowledge Sync → Domain Bug Batch)

---

## Sprint 064 — Knowledge Sync: Align Agent Tool Maps with 91-Tool Reality (Done 2026-04-13)

4 tasks. Documentation-only sprint — no code changes. Updated mcp-tools.md agent tool tables: +9 tools to correct agent rows + Agent 08 row. Commit 882d507.

| ID | Title | Status |
|----|-------|--------|
| REQ-064 | BA: REQ_064.md — tool additions per agent, change matrix | Done |
| TECH-064 | Architect: confirm no code changes needed | Done |
| 1148 | Update mcp-tools.md agent tool tables | Done |
| 1149 | Verify 08-prediction-synthesizer.md matches updated mcp-tools.md | Done |

---

## Sprint 065 — Prediction Claim Resolution Loop (Done 2026-04-12)

7 tasks. ALTER TABLE migration for creation_price, PredictionClaimInput/Row/ClaimDbRow interfaces, fix evaluateOutcome(), direction + expected_move_pct in create_prediction_claim tool. 29 tests pass.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| REQ-065 | BA: REQ_065.md | — | Done |
| TECH-065 | Architect: TECH_065.md | — | Done |
| 1150 | ALTER TABLE migration for creation_price in schema.ts | infrastructure | Done |
| 1151 | PredictionClaimInput/Row/ClaimDbRow interfaces + INSERT update | infrastructure | Done |
| 1152 | Fix evaluateOutcome() + pass creation_price | scheduler | Done |
| 1153 | Add direction + expected_move_pct + price lookup to create_prediction_claim | interface | Done |
| 1154 | Tests: AC-1 through AC-7 | tests | Done |

---

## Sprint 066 — Code Hygiene: process.env Purge + Test Encoding Fix (Done 2026-04-12)

4 tasks. Replaced all process.env with Bun.env in server.ts, systemTools.ts, telegram.ts, index.ts, logger.ts. Fixed 3 failing /ask tests (accented Vietnamese output).

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1155 | Replace process.env with Bun.env in server.ts + systemTools.ts + telegram.ts | interface/infrastructure | Done |
| 1156 | Replace process.env with Bun.env in index.ts + logger.ts | infrastructure | Done |
| 1157 | Fix 3 failing /ask tests — accented Vietnamese output | tests | Done |
| 1158 | Advance project-stats.json currentSprint 65 → 66 | docs/data | Done |

---

## Sprint 067 — Morning Briefing Intelligence Enrichment (Done 2026-04-13)

6 tasks. Extended DailyBriefing with insiderRecent, foreignFlowSummary, evidenceTopScores. Steps 14-16 in assembleBriefing(). 3 new Telegram sections in morningBriefingJob.ts. 31/31 tests pass.

| ID | Title | Commit |
|----|-------|--------|
| REQ-067 | BA: REQ_067.md | — |
| TECH-067 | Architect: TECH_067.md | — |
| 1159 | TDD red phase — 30 failing tests for 3 new briefing sections | a466dcb |
| 1160 | Green phase — extend DailyBriefing + 3 query helpers + Steps 14-16 | e78b30e |
| 1161 | Render 3 new Telegram sections in morningBriefingJob.ts | e78b30e |
| 1162 | Advance project-stats.json currentSprint 66 → 67 | — |

---

## Sprint 068 — MARKET Message Quality Review System (Done 2026-04-13)

7 tasks. market_messages SQLite table, marketMessageStore.ts (insert, getUnreviewed, review), sendTelegramMarket() persist option + 10 call sites, 2 MCP tools (get_unreviewed_market_messages, review_market_message). Tool count 91 → 93. 36/36 tests pass.

| ID | Title | Commit |
|----|-------|--------|
| REQ-068 | BA: REQ_068.md | — |
| TECH-068 | Architect: TECH_068.md | — |
| PM-068 | PM: tasks 1163-1167 | — |
| 1163 | TDD red phase — 36 failing tests | fc53049 |
| 1164 | market_messages DDL + marketMessageStore.ts | 43a6075 |
| 1165 | sendTelegramMarket() persist option + 10 call sites | 1a10b7a |
| 1166 | marketMessageTools.ts + 2 tools registered | a52de4a |
| 1167 | Sprint close | — |

---

## Sprint 069 — Market Message Review UX + Task 1139 Close (Done 2026-04-13)

8 tasks. getMarketMessageDigest + batchReviewMarketMessages helpers. 2 MCP tools (get_market_message_digest, batch_review_market_messages). Task 1139 admin close. Tool count 93 → 95. 22/22 new tests pass.

| ID | Title | Status |
|----|-------|--------|
| REQ-069 | BA: REQ_069.md | Done |
| TECH-069 | Architect: TECH_069.md | Done |
| PM-069 | PM: tasks 1168–1172 | Done |
| 1168 | TDD red phase — 22 failing tests | Done |
| 1169 | getMarketMessageDigest + batchReviewMarketMessages in marketMessageStore.ts | Done |
| 1170 | 2 MCP tool handlers registered in marketMessageTools.ts | Done |
| 1171 | Task 1139 admin close | Done |
| 1172 | Sprint close: toolCount 93 → 95 | Done |

---

## Sprint 070 — Calibration Label Integration (Done 2026-04-13)

8 tasks. LabelAccuracyRow interface + getLabelAccuracyReport in marketMessageStore.ts. get_label_accuracy_report MCP tool in calibrationTools.ts. CalibrationJobResult.label_accuracy + Step 3.5 in runCalibrationReport. Tool count 95 → 96. 18/18 new tests pass.

| ID | Title | Status |
|----|-------|--------|
| REQ-070 | BA: REQ_070.md | Done |
| TECH-070 | Architect: TECH_070.md | Done |
| PM-070 | PM: tasks 1173–1177 | Done |
| 1173 | TDD red phase — 9 failing tests | Done |
| 1174 | LabelAccuracyRow + getLabelAccuracyReport in marketMessageStore.ts | Done |
| 1175 | get_label_accuracy_report tool in calibrationTools.ts | Done |
| 1176 | CalibrationJobResult.label_accuracy + Step 3.5 + sendCalibrationDigest WORK block | Done |
| 1177 | Sprint close: toolCount 95 → 96 | Done |

---

## Sprint 071 — Per-Ticker Intelligence Summary (Done 2026-04-13)

7 tasks. `tickerIntelligenceTools.ts` with `get_ticker_intelligence` tool: 8 data sections (price, alerts, positions, Kinh Dich, predictions, evidence, insider, cascade) assembled into a Vietnamese-formatted per-ticker intelligence report. Registered in `registry.ts`. Tool count stays at 96 (actual verified count). 8/8 acceptance criteria passing.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| REQ-071 | BA: REQ_071.md | — | Done |
| TECH-071 | Architect: TECH_071.md | — | Done |
| PM-071 | PM: sprint planning | — | Done |
| 1178 | TDD red phase — failing tests AC-1 to AC-8 | tests | Done |
| 1179 | Implement tickerIntelligenceTools.ts (FR-1–FR-8) | interface | Done |
| 1180 | Register in registry.ts + update toolCount | interface | Done |
| 1181 | Sprint close: project-stats.json + TASKS.md + IMPLEMENTATION_STATUS.md | docs/data | Done |

---

## Sprint 072 — BCTC Pipeline Fix + test hygiene (Done 2026-04-14)

5 tasks. Fixed silent swallowing of storeReport errors in parseBctcReport.ts — errors now propagate as `"storeReport failed: <msg>"`. Added WAL checkpoint (`PRAGMA wal_checkpoint(PASSIVE)`) after successful store, guarded against `:memory:` DB. Fixed 308-tool-registry.test.ts tool count 57 → 59 (registering marketMessageTools + tickerIntelligenceTools). Tool count remains at 96. 4190/4244 tests pass (34 pre-existing failures from earlier sprints, 0 new regressions).

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| REQ-072 | BA: REQ_072.md — BCTC financial_reports empty bug | docs | Done |
| 1181 | TDD red: failing test for financial_reports persistence | test | Done |
| 1182 | Fix storeReport error propagation + WAL checkpoint | application | Done |
| 1183 | Fix 308-tool-registry.test.ts count 57 → 59 | test | Done |
| 1184 | Sprint close: project-stats.json sprint 72 → 73, smoke test | docs/data | Done |

---

## Sprint 073 — Evening Intelligence Pipeline Fix (Done 2026-04-13)

2 tasks done (1 carried to sprint 074). Rescheduled `eveningSummaryJob` from 22:00 to 22:30 VN to eliminate timing race with `intelligenceCycleJob` (~2 min run). Deleted dead `newsPollerJob.ts` (never registered in jobs.ts). Stubbed geo-blocked VN RSS fetchers (CafeF/VnExpress/VnEconomy) in `defaultPollNews()` — VN news arrives exclusively via POST /api/push-news from Vinahost VPS. totalTasksDone 253 → 255.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1186 | Fix evening summary timing race — reschedule to 22:30 VN | scheduler | Done |
| 1187 | Fix pollNewsJob dead code path — remove newsPollerJob + stub VN fetchers | infrastructure | Done |

---

## Sprint 074 — RSS Atom Support + baodautu.vn Fix (Done 2026-04-14)

2 tasks done. Extended `parseRssFeed()` in `src/infrastructure/fetchers/rss.ts` to union-select `$("item, entry")` covering both RSS 2.0 and Atom 1.0 feeds. Added Atom-specific extraction for `url` (prefer `<link rel="alternate" href>` then `<link href>` then `<id>`), `publishedAt` (prefer `<published>` then `<updated>`), and `content` (prefer `<summary>` then `<content>`). Google News RSS and baodautu.vn both return Atom 1.0 — fix resolves 0-item parse results on every intelligence cycle. Task 1185 auto-resolved as side-effect of 1188. totalTasksDone 255 → 257.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1188 | Fix rss.ts parser: add Atom `<entry>` support (Google News + baodautu.vn) | infrastructure | Done |
| 1185 | Investigate baodautu.vn RSS parsing (HTTP 200, 0 items) | infrastructure | Done (auto-resolved by 1188) |

---

## Sprint 075 — Pipeline Health MCP Tool (Done 2026-04-14)

1 task done. New `get_pipeline_health` MCP tool exposing RAG pipeline observability: rows ingested today vs yesterday (GMT+7 boundary), per-source breakdown sorted by count DESC, VPS push log count last 24h, evening report last run timestamp. Use case `getPipelineHealth()` in `src/application/usecases/getPipelineHealth.ts`. Registered in `systemTools.ts`. Tool count 96 → 97. 7/7 acceptance criteria passing. totalTasksDone 257 → 258.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1189 | get_pipeline_health MCP tool | application + interface | Done |

---

## Sprint 076 — Pipeline Watchdog Job (Done 2026-04-14)

1 task done. New `pipelineWatchdogJob.ts` scheduler (`*/30 * * * *`) that reads `getPipelineHealth()` and fires a Telegram work-channel alert when `staleMins > 90`, with a 3-hour cooldown to prevent alert spam. schedulerFileCount 27 → 28. totalTasksDone 258 → 259.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1190 | Pipeline Watchdog — stale-pipeline Telegram alert | scheduler | Done |

---

## Sprint 077 — TE RSS Fallback Chain (Done 2026-04-14)

1 task done. Rewrote `tradingEconomicsStream.ts` to replace the broken session-gated `stream.ashx` endpoint with a sequential RSS fallback chain: MarketWatch Economy RSS → Google News "global economy" → Google News "financial markets" → `[]`. All items tagged `source = "tradingeconomics"`. Rate-limiter host key isolated to `"tradingeconomics-rss"`. Injectable `httpClient` for test isolation. Level 1/2 macro news restored. totalTasksDone 259 → 260.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1191 | Replace TE stream.ashx with public RSS feeds | infrastructure | Done |

---

## Sprint 078 — Evening Summary Empty-Content Fallback (Done 2026-04-14)

1 task done. Modified `eveningSummaryJob.ts` to send a Vietnamese fallback Telegram market-channel message when `hasContent === false`, making a complete data-collection failure distinguishable from normal operation. Added injectable `sendFn` parameter to `runEveningSummary` for test isolation. totalTasksDone 260 → 261.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1192 | Evening summary empty-content fallback Telegram message | interface/scheduler | Done |

## Sprint 079 — Price Persistence Observability + BCTC Banking Backfill (Done 2026-04-14)

5 tasks done. VPS push-prices persistence fixed (market_prices table write path), BCTC quarter-detection corrected, banking BCTC backfill for 6 tickers (BID, EIB, SHB, VCB, FPT, HPG), BCTC extraction banking fallback added, VCB corrupted zero-value row cleaned up. totalTasksDone 261 → 266.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1193 | VPS push-prices not persisting to market_prices table | infrastructure | Done |
| 1201 | Banking Q4-2025 BCTC missing: BID, EIB, SHB, VCB (deadline 14/04) | infrastructure | Done |
| 1202 | FPT/HPG Q4-2025 BCTC missing — VPS BCTC fetcher gap (14 days overdue) | infrastructure | Done |
| 1196 | BCTC extraction: VNM/VEA PDFs on disk but financial_reports empty | application | Done |
| 1204 | VCB Q1-2025 BCTC all values = 0 (bad record from failed extraction) | application | Done |
---

## Sprint 080 — Domain Bug Batch: Agent 08 Tools + Sentiment + VND Guard + Keywords (Done 2026-04-14)

6 tasks closing domain-layer correctness gaps discovered by the system auditor and cowork analysis team.

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1215 | Bug report dedup: suppress duplicate category within 4h in send_telegram | infrastructure | Done |
| 1194 | Missing MCP tools for Agent 08 Prediction Synthesizer | interface | Done |
| 1197 | Cascade seed sentiment inversion: bullish headline classified BEARISH | domain | Done |
| 1198 | VND currency/ticker false positive in detectStocksInText | domain | Done |
| 1206 | Cascade keyword fix: "đất vàng"→real_estate, "cầu" in "toàn cầu"→no construction | domain | Done |
| 1212 | Interest rate cooling seed sentiment should be BULLISH not NEUTRAL | domain | Done |

---

## Sprint 081 — Domain Bug Batch: Cascade/Classification Gaps from Unified-Agent Reports (Active 2026-04-14)

13 tasks targeting domain-layer bugs: NER gaps, macro keyword disambiguation, relevance pre-filter, DB lock, policy classification.
Remaining Backlog: 1218 (VPS BCTC source_hints — needs SSH), 1248 (BDI VPS route — needs SSH).

| ID | Title | Layer | Status |
|----|-------|-------|--------|
| 1199 | Trading Economics impact scores all 10.0 regardless of VN relevance | domain | Done |
| 1210 | Policy classifier misclassifies criminal prosecution as monetary_policy | domain | Done |
| 1213 | Unicode corruption in Vietnamese analysis text (combining diacritics) | infrastructure | Done |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs | infrastructure | Backlog (needs VPS SSH) |
| 1219 | Prediction market sector mapper: exclude sports/entertainment markets | domain | Done |
| 1221 | weeklyPortfolioReportJob: DB-backed lock to prevent concurrent runs on restart | interface | Done |
| 1228 | pollNews() scheduled path fails on startup | infrastructure | Done |
| 1247 | US personal finance/sports articles ingested as VN market signals | domain | Done |
| 1248 | BDI data staleness — needs geo-unblocked VPS route | infrastructure | Backlog (needs VPS SSH) |
| 1251 | VNDiamond exclusion NER: specific ticker not extracted | domain | Done |
| 1253 | VCB stale price in get_market_context — [STALE] warning | interface | Done |
| 1254 | Duplicate morning briefing insert (from_agent=unknown) | infrastructure | Done |
| 1255 | Retail net-buy cascade rule missing for securities sector | domain | Done |
