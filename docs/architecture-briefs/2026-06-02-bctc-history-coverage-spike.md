# SPIKE: FU-BCTC-HISTORY-COVERAGE — BCTC Cash-Flow Corpus Depth

**Sprint:** BCTC-ANALYTICS-LAYER
**Task:** FU-BCTC-HISTORY-COVERAGE
**Date:** 2026-06-02
**Author:** dev-mcp-server (SPIKE mode — read-only probes, no production code changes)

---

## 1. Census: Per-Ticker Coverage in `financial_reports`

All 8 probed tickers. Columns: `total_rows` = distinct (period_year, period_quarter) rows in `financial_reports`; `rows_with_ocf/icf/fcf` = rows where CF scalars are non-null; `refine_status` = CSV of all status values.

| Ticker | Total Rows | Oldest Period | Newest Period | rows_with_OCF | rows_with_ICF | rows_with_FCF | Refine Status |
|--------|-----------|--------------|--------------|--------------|--------------|--------------|---------------|
| ACB    | 1         | 2026-Q1      | 2026-Q1      | 1            | 1            | 1            | DONE          |
| DHG    | 1         | 2026-Q1      | 2026-Q1      | 1            | 1            | 1            | DONE          |
| EIB    | 1         | 2026-Q1      | 2026-Q1      | 1            | 1            | 1            | DONE          |
| FPT    | 2         | 2025-Q4      | 2026-Q1      | 2            | 2            | 2            | DONE, DONE    |
| HPG    | 1         | 2025-Q4      | 2025-Q4      | 1            | 1            | 1            | DONE          |
| MWG    | 0         | —            | —            | —            | —            | —            | (not in DB)   |
| VCB    | 2         | 2025-Q1      | 2025-Q4      | 2*           | 2*           | 2*           | PENDING, PENDING |
| VNM    | 1         | 2025-Q4      | 2025-Q4      | 1            | 1            | 1            | DONE          |

\* VCB CF scalars are non-null but corrupted (Q4: operating_cf = 1,227,360,422,140,131 — 15-digit garbage from OCR mis-parse; Q1: operating_cf = 0). Both rows are refine_status=PENDING (unrefined). The non-null value does not represent usable data.

**Fleet-wide depth stats (all tickers in `financial_reports`):**
- Total distinct tickers in DB: 13
- Max depth across all tickers: 2 quarters
- Average depth: 1.15 quarters
- Distribution: 11 tickers have 1 quarter; 2 tickers (FPT, VCB) have 2 quarters

### `bctc_table_rows` section completeness (raw OCR rows per report)

Every ingested report that has a `financial_reports` row also has all three sections extracted in `bctc_table_rows`:

| Ticker | Period | CF rows | BS rows | IS rows |
|--------|--------|---------|---------|---------|
| ACB    | 2026-Q1 | 11     | 95 (general) | 0   |
| DHG    | 2026-Q1 | 14     | 34      | 18      |
| EIB    | 2026-Q1 | 7      | 18      | 12      |
| FPT    | 2025-Q4 | 33     | 72      | 22      |
| FPT    | 2026-Q1 | 34     | 88 (general) | 23 |
| HPG    | 2025-Q4 | 10     | 53      | 9       |
| VNM    | 2025-Q4 | 26     | 46      | 22      |

**Finding:** CF sections are present and extracted for every report that was ingested and refined. The section-completeness problem (BEQ-5/6/7) is NOT the blocker for depth. The coverage gap is entirely about which quarters were ever fetched.

---

## 2. Root-Cause Analysis

### Candidate A — Ingest depth shallow (queue only seeds current quarter)

**CONFIRMED PRIMARY. Evidence:**

The `bctc_vps_queue` table (the fetch inbox) contains **at most 2 distinct period years** across its entire lifetime:

| Period | Status | Ticker count |
|--------|--------|-------------|
| 2025-Q1 | done | 1 (VCB only — exceptional backfill) |
| 2025-Q4 | done | 7 tickers |
| 2025-Q4 | pending | 8 tickers |
| 2025-Q4 | url_not_found | 28 tickers |
| 2026-Q1 | done | 7 tickers |
| 2026-Q1 | pending | 51 tickers |

The queue has **never contained any row for 2025-Q2, 2025-Q3, 2024-Q4, 2024-Q3, or any earlier period**. Quarterly periods Q1–Q3 2025 and all of 2024 were never seeded.

**Why the queue is shallow — the seeding pipeline:**

1. `/api/bctc-fetch-queue` (server.ts L728–800): the VPS cron calls this endpoint which seeds `bctc_vps_queue`. The `detectTargetQuarter()` logic always inserts **only one period at a time** — the current reporting season's target quarter. For a system deployed in late 2025/early 2026, it only ever seeded Q4-2025 and Q1-2026.

2. `backfillBctcQ4()` and `backfillBctcQ1_2026()` in `seedWatchlist.ts`: one-shot startup backfills, also limited to single quarters (Q4-2025 and Q1-2026 respectively).

3. No historical backfill seeder exists for Q1–Q3 2025 or any 2024 quarter. There is no `backfillHistoricalN()` function in the codebase.

**The VPS fetch script (`fetch-bctc.sh`) only processes items already in the queue** — it does not proactively discover older periods. The discovery happens on-demand per queue item, not for a historical range.

### Candidate B — Reports ingested but not refined (PENDING)

**PARTIAL — affects VCB only, not the depth problem.**

VCB has 2 rows that are `refine_status=PENDING`, meaning they were ingested (PDF pulled + OCR extracted) but the agentic refinement step was never triggered. Their CF scalars are present but corrupted (raw OCR garbage). However this only accounts for 1 additional-quarter case (VCB Q1-2025) and does not explain the 6-quarter gap for FPT or the absence of 2024 data.

### Candidate C — CF section not extracted (section incompleteness)

**NOT a factor.** Every report row in `financial_reports` that has `refine_status=DONE` has a complete `cash_flow` section in `bctc_table_rows` (7–34 rows depending on ticker). The BEQ-5/6/7 section-incompleteness guards now catch balance-sheet-only cases, but none of the currently ingested reports triggered that guard. CF extraction is working correctly for all ingested reports.

### Candidate D — Source doesn't have old data

**DEFINITIVELY REFUTED.** Live probe of the hsx.vn mediafiles API for FPT (HOSE) returned **50+ PDFs going back to Q1 2022** (at least 17 quarterly/annual reports). The API supports a `year` filter parameter but appears to return the full catalog regardless of year value — meaning the source has multi-year historical depth available immediately. The source is not the blocker.

For HNX/UPCOM tickers (VCB, EIB, VNH, etc.) the hsx.vn strategy returns `[]` (by design), so discovery falls through to the VPS Playwright strategy. The VPS Playwright calls `discover-bctc-urls-browser.py` on-demand for any period requested — the script queries HNX/HOSE/SSC portals dynamically. Older PDFs for these tickers are available on the source portals but have never been requested.

---

## 3. Root-Cause Verdict

**Primary: (A) Ingest depth is shallow by design** — the queue seeding logic only ever targets one quarter at a time (current reporting season). No historical backfill seeder exists for Q2/Q3 2025 or 2024 quarters. The pipeline is forward-only.

**Secondary: (B) PENDING refinement** — VCB's 2 rows are unrefined; their CF scalars are OCR garbage. This is a 1-ticker, 1-quarter issue.

**Not factors: (C) CF section extraction** and **(D) source availability** are both clear. The OCR extractor correctly produces cash_flow section rows for every successfully ingested report. The hsx.vn source has at least 17 quarterly reports for FPT going back to 2022.

---

## 4. Remediation Proposal

### Task 1 — Historical queue seeder (NEW, owner: dev-mcp-server, size: S)

Create `backfillBctcHistorical(db, tickers, periodsBack=8)` in `seedWatchlist.ts`. Computes the last N quarters before the current queue frontier and inserts rows into `bctc_vps_queue` for any period/ticker pair not already present. Idempotent (INSERT OR IGNORE). Triggered once at startup or via a new MCP tool `backfill_bctc_history`. No VPS rebuild required — it only writes to `bctc_vps_queue`. Estimated 40–60 lines.

Periods to seed per 8-quarter target: Q3-2025, Q2-2025, Q1-2025, Q4-2024, Q3-2024, Q2-2024, Q1-2024, Q4-2023 (8 quarters back from Q4-2025 baseline).

Source dependency: hsx.vn mediafiles API (HOSE tickers) — confirmed capable of returning PDFs back to 2022. HNX/UPCOM tickers depend on VPS Playwright endpoint — VPS can discover older periods on-demand.

### Task 2 — VPS fetch-bctc.sh: process all pending items regardless of period (VPS side, owner: ops, size: XS)

Current `fetch-bctc.sh` processes queue rows in FIFO order without filtering by period. It already handles any period in the queue. No VPS script change needed IF queue rows are seeded (Task 1 is sufficient). Confirm: ops should verify VPS `bctcFetchQueue` endpoint returns older queued rows without the `skip_enrichment` guard filtering them out.

### Task 3 — Re-refine VCB PENDING rows (owner: dev-mcp-server via ops, size: XS)

Trigger agentic refine on VCB 2025-Q1 (report id from DB) and VCB 2025-Q4. The OCR text is already stored; refinement just needs to be rerun to produce clean CF scalars.

### Task 4 — Analyst ESC-3 enablement gate (owner: analyst/cowork, size: XS)

After Task 1+2 complete and 8 quarters of FPT data are refined, the ESC-3 accrual/OCF-NI decomposition becomes executable. The `get_cash_flow(ticker=FPT, quarters=8)` tool now honors the param (FU-BCTC-TOOL-PARAMS, c350). No tool changes needed.

### Priority order

1. Task 1 (historical seeder) — unblocks everything; pure DB write, no prod-code risk.
2. Task 3 (VCB re-refine) — quick win, 2 known PENDING rows.
3. Task 2 (VPS confirmation) — verify existing VPS loop picks up older queued rows.
4. Task 4 (analyst gate) — depends on 1+2+3.

### Timeline estimate

With Task 1 merged and deployed: the VPS fetch loop runs every 6 hours. With 8 quarters × 30 HOSE tickers = 240 new queue rows, at batch size 10 per run and 6-hour cadence: ~6 days to fetch and ingest all history. Refine pipeline (agentic) adds further time per batch. Realistically 8-quarter FPT CF history available in 1–2 weeks after Task 1 is live.

### Source dependency summary

| Ticker Exchange | Discovery Source | Historical Depth Available | Notes |
|----------------|-----------------|--------------------------|-------|
| HOSE (FPT, VNM, HPG, MWG, ...) | hsx.vn mediafiles API | Back to 2022 (confirmed live) | No VPS needed; accessible from France |
| HNX (EIB, VCB, ACB, SHB, ...) | VPS Playwright (discover-bctc-urls-browser.py) | Unknown; HNX portal queried on demand | VPS socat must be alive (VPS-SOCAT-PERSIST still open) |
| UPCOM (ACV, ...) | VPS Playwright | Unknown | Same VPS dependency |

---

## 5. Files Consulted (read-only)

- `/app/data/market.db` — `financial_reports`, `bctc_vps_queue`, `bctc_table_rows` tables (live container queries)
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — `backfillBctcQ4`, `backfillBctcQ1_2026`, `WATCHLIST_SEED`
- `apps/mcp-server/src/interface/mcp/server.ts` L728–800 — `/api/bctc-fetch-queue` handler with `detectTargetQuarter()`
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` — VPS pull pipeline
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — URL enrichment
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — Strategy 0 (hsx.vn) + Strategy 1 (VPS Playwright)
- `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts` — hsx.vn API; `year` param + `pageSize=100`
- `vps-scripts/fetch-bctc.sh` — VPS cron loop (6h cadence, processes pending queue rows)
- Live hsx.vn API probe: FPT numeric ID 2129; `pageSize=100&year=2025` returned 50 PDFs back to Q1-2022
