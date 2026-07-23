# Session 2026-07-21T16:49-17:00Z: FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T Diagnostics

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Task:** FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T  
**Phase:** Baseline Capture + VPS Service Diagnosis  
**Status:** ESCALATION REQUIRED — VPS BCTC Service Down (39+ hours)

### Phase 1: BASELINE CAPTURE (CRITICAL DELIVERABLE)

**Purpose:** Serve-plane baseline for all 15 tickers, FIRST TIME captured (prior census only sampled 3 of 15).

**Captured 2026-07-21T16:49:00Z+:**

| Ticker | Mode | Serving Result | Note |
|--------|------|---|---|
| DBC | 1_ABSENT | Chưa có dữ liệu BCTC | Ingest stall |
| DGC | 2_CORRUPT | total_assets=0 — OCR failure | Extraction failed |
| DXG | 2_CORRUPT | total_assets=0 — OCR failure | Extraction failed |
| FRT | 2_CORRUPT | total_assets=0 — OCR failure | Extraction failed |
| GEX | 2_CORRUPT | total_assets=0 — OCR failure | Extraction failed |
| HUT | 1_ABSENT | Chưa có dữ liệu BCTC | **Natural control** (never reparse-touched) |
| KDC | 1_ABSENT | Chưa có dữ liệu BCTC | Ingest stall |
| KDH | 2_CORRUPT | total_assets=0 — OCR failure | Extraction failed |
| MSN | 1_ABSENT | Chưa có dữ liệu BCTC | Ingest stall |
| PDR | 2_CORRUPT | total_assets=0 — OCR failure | Extraction failed |
| PLX | 1_ABSENT | Chưa có dữ liệu BCTC | **Natural control** (never reparse-touched) |
| SAB | 1_ABSENT | Chưa có dữ liệu BCTC | Ingest stall |
| SHB | 1_ABSENT | Chưa có dữ liệu BCTC | Ingest stall |
| VJC | 2_CORRUPT | total_assets=0 — OCR failure | Extraction failed |
| VND | 1_ABSENT | Chưa có dữ liệu BCTC | Ingest stall |

**Baseline Summary:**
- Mode 1 (ABSENT, no row exists): 8 tickers [DBC HUT KDC MSN PLX SAB SHB VND]
- Mode 2 (CORRUPT, row exists total_assets=0): 7 tickers [DGC DXG FRT GEX KDH PDR VJC]
- **Natural Controls PASS:** HUT and PLX both ABSENT (confirm ingest-stall reproduces without reparse involvement)

**Stored PDFs Verified:** All 15 have *_2026_Q1.pdf on VPS, stored 2026-06-07..06-14

### Phase 2: D2D Disposition

**Confirmed:** D2D_2026_Q1.pdf (11.6 MB, stored 2026-06-07) exists  
**Serving result:** Chưa có dữ liệu BCTC  
**Decision:** STAYS WITH OPS-BCTC-REFINE-REPASS-NONBANK-5T (per PO directive 2026-07-21T16:49Z)  
**AC remains:** 15 tickers (do NOT widen)

### Phase 3: Reprocessing Attempt

**Trigger command:** 2026-07-21T16:59:32Z executed `trigger_bctc_vps_fetch` for all 15 tickers  
**Result:** SSH command queued (fire-and-forget) but NO DATA CHANGES observed in post-check

**Post-trigger verification (2026-07-21T17:00Z):** Samples DBC, MSN, HUT, PLX, DGC re-checked → IDENTICAL TO BASELINE

### Critical Root Cause: VPS BCTC SERVICE STALE/DOWN

**VPS Proxy Status:**
- Last BCTC push: 2026-07-20T01:26:41Z (39+ hours ago)
- Pushes in last 24h: 0
- Status flag: STALE ✗

**VPS Service Health:**
- vn-bctc-fetch status: unhealthy
- Response time: 0 (timeout)

**PDF-Extractor Jobs (FUNCTIONAL):**
- bctcExtractReconcileJob: last_run=2026-07-21T16:35:04Z, status=success
- bctcPdfPullJob: last_run=2026-07-21T16:30:02Z, status=success

**Diagnosis:** Extraction pipeline functional, but VPS BCTC proxy unreachable — data flow blocked from VPS → local MCP database

### Actions Taken

1. ✓ Captured serving-plane baseline for all 15 tickers (FIRST TIME)
2. ✓ Verified natural controls HUT + PLX (both ABSENT, control passes)
3. ✓ Confirmed D2D stays with nonbank row (AC remains 15)
4. ✓ Attempted VPS BCTC fetch trigger
5. ✓ Diagnosed VPS BCTC proxy STALE (39h no pushes)
6. ✓ Sent diagnostic alert to BUG channel (msg_id=3855)

### Escalation Required

**Severity:** HIGH — Infrastructure (VPS service unreachable)  
**Blocker:** Data ingest stalled since 2026-07-20T01:26:41Z

**Required Action:** Infrastructure/network team must restore VPS BCTC service connectivity

**Next Steps Once VPS Restored:**
1. Re-trigger bctc-vps-fetch for 15 tickers
2. Verify ingest completes
3. Re-check get_bctc_full for all 15 tickers
4. Compare post-fix results to baseline to measure remediation delta

---
