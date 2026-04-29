# Weekly Review Session — 2026-04-30 Sunday 13:00 UTC

**Mode**: WEEKLY_REVIEW | **Duration**: Apr 23-30, 2026 (Week 17)

---

## Pattern Analysis — Telegram Reports

**Total Reports**: 50 processed
**Most Frequent Category**: `data_extraction_error` (15+ reports)
**Most-Reporting Agent**: `analysis-agent` (infrastructure detection)

### Systemic Issues Ranked by Severity

1. **Foreign Flow Circuit Breaker Stuck OPEN** (CRITICAL)
   - Recurring incident (3rd time this week: TASK 1384, 1403, 1407)
   - Reports: 5 total
   - Status: CLOSED→OPEN cycling every ~5 minutes
   - Impact: Foreign investor sentiment unavailable since Apr 28 08:59 UTC
   - Root cause: No market-hours gating; half-open probe retries every 60s
   - Required fix: Gate CB to 02:00-09:00 UTC Mon-Fri window

2. **BCTC Pipeline Broken — 44/47 Queue Rows Missing URLs** (CRITICAL)
   - Reports: 3 (Apr 27-29)
   - Status: Queue stuck with placeholder URLs ('https://test.example.com/test.pdf')
   - Affected tickers: 30+ (ACB, ACV, BDI, CTG, DHG, GAS, HSG, VIC, VRE, etc.)
   - Impact: Financial reports cannot be discovered; BCTC analysis blocked
   - Data age: Last push Apr 28 16:58 UTC (13h staleness, SLA=120min)
   - Required fix: Delete placeholder URLs; VPS must discover and push real PDFs

3. **post_agent_signal Schema Validation Blocking** (CRITICAL)
   - Reports: 2 recent (Apr 29 04:34, 04:36 UTC)
   - Status: All chain_catalyst & urgent_news signals rejected with "root: Required"
   - Impact: News Scout unable to post high-impact signals (HPG +880% earnings, VIC 17x)
   - Recent successful posts suggest schema regression
   - Required fix: Clarify 'root' field requirement in post_agent_signal spec

4. **News Fetch Unavailable — pollNews Returning 0 Items** (CRITICAL)
   - Reports: 10+ (Apr 27-29)
   - Status: All RSS sources returning empty (cafef, vnexpress, reuters, vneconomy, tradingeconomics, newsapi)
   - Impact: Market intelligence pipeline broken; no news signals ingested
   - Root cause: VPS-side (vn-news-fetch service unreachable or misconfigured)
   - Data age: Last push Apr 29 09:00 UTC (SLA=60min, heavily breached)

5. **VCB Financial Data Parsing Corrupted** (HIGH)
   - Reports: 4 (Apr 29 06:10-08:09)
   - Status: Q4 2025 and Q1 2025 reports fail parsing
   - Error: "Assets(35.2B) != Liabilities(2M) + Equity(2B)" — parsing mismatch
   - Impact: VCB (top watchlist stock) conviction signals skipped; financial_confidence=0
   - Root cause: Vietnamese bank number format not handled by parseBctcReport()
   - Data: extraction_confidence=0.625-0.6875 (marginal)

---

## Observability Metrics

### Signal Effectiveness (7 days)
- **Status**: No data available
- **Interpretation**: Signal outcome tracking not functional
- **Implication**: Cannot measure whether agent signals are predictive

### Cascade Rules (30 days)
- **Total Hits**: 5,600+
- **Evaluated Rules**: 27 (4.8% of rules)
- **Overall Accuracy**: 0% (0/27 hits correct)
- **Dead Rules**: None
- **Worst Performer**: `oil_gas_rise` (135 hits, 0% accuracy)
- **Interpretation**: Rules are firing frequently but producing zero-value signals; evaluation backfill broken

### Prediction Accuracy (30 days)
- **Status**: No data available
- **Note**: Weekly validation scheduled; manual run needed

---

## Summary: Top 3 Actionable Issues

| Issue | Severity | Owner | Deadline | Action |
|-------|----------|-------|----------|--------|
| Foreign Flow CB stuck OPEN (TASK 1407) | CRITICAL | Dev | Mon Apr 29 02:00 UTC | Gate CB to market hours; add manual reset endpoint; fix half-open backoff |
| BCTC queue 44 missing URLs | CRITICAL | Ops | ASAP | DELETE placeholder rows; VPS discovery of real PDFs |
| post_agent_signal 'root' field blocking | CRITICAL | Dev | ASAP | Document/fix schema; unblock news-scout signals |

---

## Secondary Issues (High Priority)

1. **PDF_EXTRACTOR_URL misconfigured** (docker-compose): localhost:5001 → pdf-extractor:5001
2. **vps_service_health schema broken**: CHECK constraint doesn't allow "idle" status
3. **News fetch unavailable**: Investigate vn-news-fetch VPS service (pollNews 0 items)
4. **VCB parsing failure**: parseBctcReport() fails on Vietnamese bank format numbers
5. **46 overdue telegram reports** (Apr 17, 11+ days old): Mass mark processed or cleanup cron
6. **5 invalid watchlist tickers** (BDI, DLC, JSH, SIS, VDC): Remove or verify listing status

---

## Recommendations

**P0 — Ship Before Monday 02:00 UTC Market Open**:
- Fix `foreignFlow` CB gating to market hours + manual reset endpoint
- Fix `post_agent_signal` schema validation (root field)
- Clean BCTC queue (DELETE placeholder URLs)

**P1 — This Week**:
- Fix `PDF_EXTRACTOR_URL` docker-compose (localhost → service name)
- Investigate `vn-news-fetch` VPS service (pollNews 0 items)
- Fix VCB financial parsing (Vietnamese bank numbers)
- Run `run_prediction_outcome_check` manually for prediction accuracy data

**P2 — Next Sprint**:
- Add signal confirmation outcome tracking (41 signals, 0 confirmed)
- Watchlist audit: verify/remove 5 invalid tickers
- Cascade rule evaluation: 0% accuracy suggests rules need tuning or backtest data
- Pre-open alert gating: suppress price_pct alerts outside 02:00-09:00 UTC window

---

## Session Log

- **Started**: 2026-04-30 13:00 UTC (Sunday weekly)
- **Duration**: ~5 min data collection + analysis
- **Patterns Identified**: 6 systemic infrastructure + code issues
- **Critical Issues**: 3 (foreign-flow CB, BCTC URLs, post_agent_signal)
- **Report**: Sent to WORK channel via Telegram
- **Status**: WEEKLY_REVIEW complete | PIPELINE: ready for next agent
