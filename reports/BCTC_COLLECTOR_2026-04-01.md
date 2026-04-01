# BCTC Collector Report — 2026-04-01 (20:00 Vietnam / 13:00 UTC)

Generated: 2026-04-01T13:05 UTC

---

## Watchlist (5 stocks)

| Ticker | Exchange | Sector | Last Price |
|--------|----------|--------|-----------|
| VEA | UPCOM | Ô tô & Cơ khí (VEAM) | 33,500 VND (+0.30%) |
| VCB | HOSE | Ngân hàng (Vietcombank) | 59,000 VND (+1.55%) |
| VNM | HOSE | Bán lẻ (Vinamilk) | 61,300 VND (+1.32%) |
| HPG | HOSE | Thép (Hòa Phát Group) | 27,150 VND (+0.93%) |
| FPT | HOSE | Công nghệ (FPT Corp) | 75,300 VND (+0.80%) |

---

## PDF Storage — 2 files on disk

| Downloaded | Size | Filename | Likely Stock | Period |
|-----------|------|----------|-------------|--------|
| 2026-03-29 | 16.8 MB | `000000015802468_Bao_cao_tai_chinh_Rieng_nam_2025.pdf` | Unknown (SSC doc ID) | Annual 2025 (separate/riêng) |
| 2026-03-29 | 4.0 MB | `BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf` | **VNM** | Annual 2025 (consolidated) |

**Note:** Both PDFs were downloaded on 2026-03-29 by the server's scheduled SSC job. Neither has been parsed into the database yet (all `get_financial_summary` calls returned "No financial data found"). This is a pipeline gap — PDFs are on disk but the parse→store step has not executed.

---

## Financial Data Status (Database)

| Ticker | DB Records | Most Recent Period | Status |
|--------|-----------|-------------------|--------|
| VEA | ❌ None | — | Missing — PDF may exist (SSC doc 000000015802468?) |
| VCB | ❌ None | — | Missing — No PDF downloaded |
| VNM | ❌ None | — | Missing — PDF on disk but NOT parsed |
| HPG | ❌ None | — | Missing — No PDF downloaded |
| FPT | ❌ None | — | Missing — No PDF downloaded |

### Expected vs Available (Q4/2025 annual reports)
- Q4/2025 annual reports (Năm 2025) should all be available by now (published Jan–Mar 2026).
- Q1/2026 reports not expected until April–May 2026.
- **Current gap: 0 of 5 watchlist stocks have any parsed financial data in DB.**

---

## Telegram Notifications Sent

Two notifications dispatched for newly identified PDFs (both confirmed success):

1. `📄 New BCTC available: BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf`
2. `📄 New BCTC available: 000000015802468_Bao_cao_tai_chinh_Rieng_nam_2025.pdf`

---

## System Health Summary

| Component | Status |
|-----------|--------|
| Server uptime | 36 min (recently restarted) |
| All circuit breakers | ✅ OK (0 open) |
| DB size | 2.75 MB |
| σ thresholds — commodities | ✅ READY (274 pts) |
| σ thresholds — stocks (HPG, VCB, FPT…) | ⏳ Insufficient (1–2/30 pts) |
| Telegram last sent | Previously "never" — now sent (this cycle) |
| Unnotified alerts (24h) | 1 HIGH/CRITICAL |

---

## Critical Issues Found (Action Required)

### 🔴 CRITICAL — Missing DB Tables
The following tables do not exist in `market.db`:
- `alerts` → Step E (sendAlerts) fails on every intelligence cycle
- `commodity_prices_history` → macroStats σ computation broken
- `sbv_rates_history` → SBV rate σ computation broken

**Root cause:** DB schema initialization (`schema.ts`) likely did not run on the current server instance (uptime only 36 min, may have started fresh with empty DB). This is the root cause of most cycle failures.

**Suggested fix:** Ensure `src/infrastructure/db/schema.ts` runs at startup and creates all tables. Check if DB file is being correctly resolved from `mcp.config.json` path `./data/market.db`.

### 🔴 CRITICAL — Intelligence Cycle All Steps Failing
Errors observed at 14:42, 15:29, and 16:31 UTC:
- Step A (pollNews): RSS timeout / network failure
- Step B (SSC check): SSC portal down
- Step C (fetchPrices): VnDirect API down / HOSE all 3 sources failed
- Step D (runImpactChain): cascade error
- Step E (sendAlerts): `no such table: alerts`
- Cycle lock: "previous cycle still running — skipped" + "cycle exceeded 12 minutes"

These are likely related to the missing DB tables and network timeouts during the earlier downtime window.

### 🟡 WARNING — PDFs Downloaded but Not Parsed
Two PDFs have been on disk since 2026-03-29 with no corresponding DB records. The `fetchParseAndStoreBctc` pipeline needs to be triggered to process them. The server's nightly SSC job should handle this, but DB table absence would cause it to fail silently.

### 🟡 WARNING — Telegram Config Intermittent
Earlier log errors showed `TELEGRAM_BOT_TOKEN is not set`. Telegram calls in this cycle succeeded, suggesting env vars may have been set after the server restart. Monitor for recurrence.

### 🟡 INFO — Stocks Flagged for Manual Investigation
The following 3 stocks have no PDF on disk AND no DB records — they need the SSC nightly job to locate and download their annual 2025 reports:
- **VCB** (Vietcombank) — Major bank, should have published annual report by now
- **HPG** (Hòa Phát) — Steel sector leader, Q4/2025 annual report overdue
- **FPT** (FPT Corp) — Tech sector, annual report should be available

---

## Cycle Outcome

| Task | Result |
|------|--------|
| Watchlist retrieved | ✅ 5 stocks |
| PDFs listed | ✅ 2 files |
| Financial summaries checked | ✅ All 5 queried (all empty) |
| Missing reports identified | ✅ All 5 stocks missing DB data |
| Telegram notifications | ✅ 2 sent (both successful) |
| Error summary checked | ✅ 3 critical issue categories found |
| System health checked | ✅ Reviewed |
