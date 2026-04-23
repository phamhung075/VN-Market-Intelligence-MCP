# Financial Analyst Cycle — 2026-04-23

## Analysis Cycle: 01:00 UTC (08:00 VN)

**Time**: 2026-04-23 01:00 UTC | **Market**: CLOSED (outside 02:00–08:59 UTC)
**Bootstrap**: Agent signals=0, Market context=20 alerts (from 22/04), System=OK

### Stocks Analyzed
- **VEA** (Q4-2025): PDF filed 2026-04-22. Parsing errors confirmed (operating margin 330% > revenue). Data unreliable.
- **VNM** (Q4-2025): PDF filed 2026-04-22. Parsing errors confirmed (zero profits despite 63.6B revenue). Sentiment BULLISH (+1.00 slope).
- **Total**: 2 stocks (only filed reports available)

### BCTC Filing Status (Critical)
| Status | Count | Detail |
|--------|-------|--------|
| OVERDUE | 29 | Q4-2025 deadline 30/03/2026 — now 23 days late |
| FILED | 2 | VEA, VNM (both 22/04) |
| **Total** | **31** | 6% compliance rate |

**Deadline breakdown**:
- HOSE/standard: 30/03/2026 (23 days overdue) — 25 stocks
- Banks (VCB, BID, EIB, SHB): 14/04/2026 (9 days overdue) — 4 stocks

### Data Quality Issues

**PDF Storage**:
- VEA PDF: 16.8 MB (valid)
- VNM PDF: 4.0 MB (valid)
- BID, DGC, BSR: 0.0 MB (corrupted/zero-byte) — downloaded but not populated
- test.pdf: 0.0 MB (test artifact)

**Parsing Failures**:
- VEA: Operating profit 858.5T > Revenue 259.9T (impossible)
- VNM: EBITDA=0 → Net Debt/EBITDA = NaN (-74B×)
- Detection: System flagged confidence 88% (VEA) and 69% (VNM) as moderate/low

### Insider Signals
- VEA: 0 transactions detected
- VNM: 0 transactions detected
- Legal risks: None detected in 30-day window

### Chain Findings
- Open findings (last 30min): 0
- No cross-validate signals from other agents

### Key Findings
1. **BCTC compliance crisis persists** — 29/31 stocks 9–23 days overdue
2. **PDF ingestion incomplete** — 3× zero-byte files suggest VPS push-bctc failed to populate storage
3. **Parser confidence degraded** — Multiple all-zero profit entries indicate OCR failure on consolidated statements
4. **Market closed** — No intraday price signals available for validation

### Recommendations
1. **Dev team**: Investigate VPS `vn-bctc-fetch.service` — check if service pushing empty payloads
2. **QA**: Run backfill on BID, DGC, BSR PDFs from SSC portal (retry VPS fetch)
3. **Analysis**: Mark VEA + VNM Q4-2025 as UNRELIABLE until manual PDF review completes

---

**Cycle end**: No fundamental_validation signals posted (data too corrupted). Deferred to next morning cycle when more PDFs expected.
