# Ops Re-Measurement: FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T

**Date:** 2026-08-23T00:30Z  
**Agent:** ops  
**Task ID:** FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T  
**Cohort:** {HUT, PLX, BID, DAG}

## Re-Measurement Results

### Verification Gate: live_tool_reconcile AC

Ran `get_bctc_full(code, 2026, Q1)` for all 4 cohort members:

| Ticker | Result | Status |
|--------|--------|--------|
| HUT | "Chưa có dữ liệu BCTC" | FAIL |
| PLX | "Chưa có dữ liệu BCTC cho PLX" | FAIL |
| BID | "Chưa có dữ liệu BCTC cho BID" | FAIL |
| DAG | "Chưa có dữ liệu BCTC cho DAG" | FAIL |

**AC Verdict:** 0/4 PASS (required: non-empty structured_data with plausible non-zero total_assets)

## Root Cause Analysis

The serving-gate fix (FIX-BCTC-SERVING-GATE-VPSSTALE-IGNORES-DEMAND-QUEUE-DEPTH, DONE_VERIFIED) did NOT resolve these failures.

**Two distinct upstream defects pinned:**

1. **HUT, PLX (ingest-enqueue layer)**
   - Q1-2026 PDFs are stored on VPS (2026-06-07..06-13)
   - No financial_reports rows exist
   - Extraction-enqueue pipeline never processed them
   - Requires: code fix in extraction trigger/enqueue layer

2. **BID, DAG (discovery/fetch layer)**
   - No Q1-2026 PDFs acquired at all
   - DAG has zero stored PDFs for ANY period (per census)
   - Requires: discovery source validation + acquisition fix

## Escalation

**Status:** BLOCKED → dev-team (not ops operational scope)

**Action:** Route to dev-mcp-server for layer-specific code fixes:
- Extraction pipeline investigation (HUT/PLX)
- Discovery/fetch source validation (BID/DAG)

**Note:** Not a re-measurement of serving-gate contamination. Root causes are at acquisition/ingest layers, requiring code investigation + fixes, not operational reprocess.
