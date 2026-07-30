# Decision Journal: FIX-BCTC-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK

**Dispatch Date:** 2026-07-30T17:46:46Z  
**Investigation Completed:** 2026-07-30T21:50Z  
**Agent:** ops  
**Mode:** Plan-only diagnostic spike (manual review gate required for status flip)  
**Coordinator:** dev-team (PO-triage batch, zero-picker class)

---

## Investigation Summary

### Timeline
- **2026-07-28T11:06:59Z:** Last `bctc_layout_units` write (1193 rows)
- **2026-07-28T11:11:00Z:** "Circuit breaker fires" noted in prior ops spike
- **2026-07-28T18:04:41Z:** pdf-extractor container restart (7-hour gap)
- **2026-07-30T17:47Z:** Discovered still dormant (55+ hours stale)
- **2026-07-30T21:50Z:** This diagnostic completed

### Root Cause Hypotheses: Status

| Hypothesis | Finding | Evidence |
|---|---|---|
| **OCR Gateway Deadlock** | **TRANSIENT** (cleared by restart) | Container restart at 18:04Z resolved `semaphore=1 != os_children=0`. Current state healthy: `semaphore=0, os_children=0` matched. However, extraction has NOT resumed post-restart. |
| **Network Push Failure** | **INCONCLUSIVE** | No layout push calls (`/api/push-bctc-layout`) observed in mcp-server logs. Network connectivity verified working (`pdf-extractor → mcp-server:3000/health`). Cannot determine if push fails because extraction never runs. |
| **Missing Extraction Trigger** | **PRIMARY DEFECT IDENTIFIED** | No caller of `POST /extract-layout-first` found in mcp-server codebase. Last extraction timestamp (07-28 11:06:59Z) does not align with any documented cron schedule. Extraction pipeline appears manually triggered or tied to undiscovered mechanism. |

---

## Technical Findings

### OCR Gateway Health (Current State)
```json
{
  "max": 1,
  "semaphore": 0,
  "os_children": 0,
  "oldest_child_s": null
}
```
✓ Healthy. No deadlock currently present. Semaphore and OS ground truth match.

### Network Connectivity
```bash
docker exec pdf-extractor curl http://mcp-server:3000/health
→ {"status":"ok","name":"vn-market","version":"1.0.0",...}
```
✓ Working. pdf-extractor can reach mcp-server on port 3000.

### MCP Server Push Logs (Past 6 hours)
| Endpoint | Count | Status |
|---|---|---|
| `push-news` | ✓ Multiple | Active, periodically firing |
| `push-sbv-rates` | ✓ 2+ | Active |
| `push-ohlcv-history` | ✓ Many | Active |
| **`push-bctc-layout`** | **✗ 0** | **No recent calls** |

**Interpretation:** No layout extraction attempts have reached mcp-server since restart.

### Code Review (extraction pipeline)
- ✓ `extraction_engine.py:221` correctly calls `ocr_gateway.run_image_sync()`
- ✓ `ocr_gateway.py` implements concurrency bounds + `/proc` observability
- ✓ `layout_first_push_client.py:68` configured for `http://mcp-server:3000/api/push-bctc-layout`
- ✓ `routes_layout_first.py` endpoint registered and operational
- ✗ **No caller found** for `POST /extract-layout-first` in mcp-server

### Trigger Search Results
- **pdfExtractorClient.ts:** Methods for `/extract`, `/health`, `/page-text`, `/rasterize` — **no `/extract-layout-first`**
- **grep -r "extract-layout-first" apps/mcp-server:** Only handler and push-receiver found, no initiator
- **Scheduled jobs:** `bctcBatchSweepJob` fires on "25th of month" (next: Oct 2026); does not match 07-28 timestamp

---

## Acceptance Criteria Analysis

| Criterion | Status | Blocker |
|---|---|---|
| "Layout extraction resumes" | ❌ BLOCKED | Unknown what triggers extraction; cannot invoke to resume |
| "Terminal enrich_failed backlog (128 rows) start recovering" | ❌ BLOCKED | Depends on extraction running first |
| "Decision journal written before status flip" | ✓ DONE | This document |

---

## Disposition

### Current Status
**Remains IN_PROGRESS.** Do NOT flip to DONE_VERIFIED or REVIEW.

### Next Agent: dev-pdf-extractor
The defect is **not purely infrastructure** (deadlock/network are partially cleared or working). The real blocker is:

**Extraction is not being triggered.** Resolution requires:

1. **Identify the extraction trigger:** Where was `/extract-layout-first` being called from on 2026-07-28 before 11:06:59Z?
   - Check Telegram work channel history for manual invocations
   - Search for undiscovered MCP tools that call pdf-extractor
   - Search for webhook handlers, event subscriptions, external scripts
   - Check for scheduled jobs not yet located in mcp-server codebase

2. **Test extraction end-to-end:** Once trigger is located:
   - Manually invoke `/extract-layout-first` with a sample report_id + pdf_path
   - Verify `/api/push-bctc-layout` push succeeds
   - Confirm `bctc_layout_units` accumulates new rows

3. **Unblock backlog:** Once extraction is active:
   - Terminal enrich_failed rows should resume transitioning
   - Original SPIKE (`SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD`) can then flip REVIEW → DONE_VERIFIED

---

## Risk Assessment

- **Severity:** P0 (extraction pipeline offline)
- **Scope:** PEK layout extraction leg only (refine leg is fresh per prior spike)
- **Recovery Path:** Clear once trigger is identified and tested
- **No infrastructure changes required** — OCR gateway is healthy; network is working

---

## Cross-References

- **Prior Spike:** `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` (REVIEW, awaiting this fix)
- **Blocked by:** Locating extraction trigger (dev-pdf-extractor investigation)
- **Unblocks:** Enrich_failed backlog recovery, prior spike closure

---

## Session Info
- **Session:** 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae
- **Conducted:** 2026-07-30 17:46–21:50Z
- **Method:** Read-only diagnostics only (no mutations, no code changes)
