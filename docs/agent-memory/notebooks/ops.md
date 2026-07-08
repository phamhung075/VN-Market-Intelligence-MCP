# ops — Notebook

Zone: `apps/mcp-server/` + `services/` | Stack: Multi-service Docker | DB: market.db (write)

**Runbook:** `docs/protocols/ops-rebuild.md` — rebuild protocol (no-deps mandatory), race check, peer verification, disk cleanup.

## Incident Diagnosis: RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL (2026-07-03T19:37–20:15Z)
## Gated Live-Container Swap: FACTORY-INTERFACE-source-confidence-10-mask (2026-07-08T06:45Z)

**Task:** FACTORY-INTERFACE-source-confidence-10-mask  
**Image Swap:** `180382145ee7` → `35c8117c1f85` (QA-approved)  
**Session UUID:** 5a45feda-431e-46c8-941d-a6539a0eca77  
**Status:** ✓ COMPLETE

**Swap Summary:**
- Single-service mcp-server container swap via `docker compose up -d mcp-server`
- Image verified via docker inspect: `35c8117c1f85` ✓
- All 12 peer containers remained healthy, untouched
- `/health` endpoint: 200 OK, toolCount: 183 (unchanged)
- Container health: Up 7s after swap, healthy status confirmed
- Peer uptime audit: Zero side effects, no cascading restarts

**Technical Context:**
- Root cause fix: bctc_table_rows.source_confidence column NULL-handling enforcement
- Fix behavior: Routes low-confidence (≤0.2) scores to separate queue, prevents NULL propagation
- QA Post-Swap Sanity Check: Verify distribution `{0.1: 380, 0.4: 2, 1.0: 3257}` with 0 NULLs (no new BCTC finalize runs should violate NOT NULL)
- Idempotent fix: behavior-preserving, rollback available if sanity check flags data anomaly

**Post-Swap Delegation:** next_agent=qa → orch-state updated via orch-apply.sh, confirmed via jq

---


**Incident:** Critical BCTC pipeline stall, 36-item+ queue blocked for 396.6 hours (16.5 days), ~50 extraction 0-rows alerts.

**Provenance:** ops router-dispatched (session redacted)
**Duration:** 38 minutes (diagnostic phase)
**Status:** ROOT CAUSE IDENTIFIED → ESCALATION READY

### Ground Truth

**VPS Proxy Health:**
- bctc endpoint: STALE since 2026-06-16 18:02:24Z (396.6h, 16.5 days)
- Last push: 1 item, 0 pushes in 7 days
- Other endpoints (prices/news/sbv): FRESH (last push <2h ago)

**Local Queue State (bctc_vps_queue):**
- Total: 431 rows
- deferred_infra: 328 (293 with NULL source_url) — PRIMARY BLOCKAGE
- done: 67
- enrich_failed: 18
- url_not_found: 18

**Enricher Job (bctcQueueEnricherJob):**
- Last run: 2026-07-03 19:30:01 (successful)
- Success rate: 100% across 1041 runs
- Duration: avg 352ms
- **Problem:** Finding 0 URLs despite 328 pending items

### Root Cause Analysis

**PART A — Discovery Pipeline Failure (PRIMARY)**

The bctcQueueEnricherJob cannot discover PDF URLs for 328 pending items. Tested discovery function directly:

```
discoverHosePdfUrls('FPT', {year:2025, quarter:4}) → 0 URLs
discoverHosePdfUrls('GVR', {year:2025, quarter:4}) → 0 URLs
discoverHosePdfUrls('MBB', {year:2025, quarter:4}) → 0 URLs
(tested all Q1-Q4 2025-2026 → all return 0 URLs)
```

**Why (diagnosis chain):**

1. **Strategy 0 (HSX mediafiles API):** Returns 0 URLs
   - **Cause:** FPT/GVR/MBB/etc are **NOT HOSE-listed**
   - They trade on HNX or UPCOM, not HOSE
   - HSX mediafiles API only returns HOSE tickers → empty result

2. **Strategy 1 (VPS Playwright via /proxy/bctc-discover):** Times out
   - Fallback on VPS runs discover-bctc-urls-browser.py
   - Script searches HNX/UPCOM first (still 0 results for non-HOSE tickers)
   - Falls back to SSC (Tổng Cục Thống Kê) API
   - **SSC API returns HTTP 503 Service Unavailable**
   - Script enters retry loop: waits 60s between attempts
   - mcp-server call timeout (5s default) → aborts waiting
   - Result: exception caught silently → discovery returns []

3. **Symptom:** 328 rows stay in deferred_infra (source_url remains NULL)
   - 30-min enricher cycle: repeats discovery attempt
   - 7 days × 48 cycles = 336 failed discovery attempts
   - Queue never progresses → "pipeline blocked"

**VPS Script Test (on Vinahost SSH):**
```
timeout 15 python3 /root/discover-bctc-urls-browser.py FPT 2025 4
  [HNX] no results at page 1
  [UPCOM] no results at page 1
  [SSC-CURL] step1 GET transient error (attempt 0): HTTP Error 503: Service Unavailable — retrying in 60s
  (hangs waiting for retry...)
```

**PART B — Extraction Returns 0 Rows (SECONDARY)**

~50 "[bctcPdfPull] ENRICH 0-rows FAIL-LOUD" telegram alerts for Q4-2025 tickers.

Pattern: PDFs WERE extracted (text layer succeeded) but enrichment returned 0 financial tables.

**Hypothesis (not yet confirmed):**
- Parser defect in B02-TCTC bank-form extraction
- Blank/corrupted PDF images (OCR failing)
- Source publishes placeholder/draft PDFs with no tables

**Note:** Orthogonal to discovery stall. These extractions happened before discovery broke; the 0-rows issue emerged separately.

### Diagnostic Artifacts

| Source | Finding | Timestamp |
|--------|---------|-----------|
| VPS proxy health | bctc stale 396.6h | 2026-07-03 19:37Z |
| mcp-server queue | 328 deferred_infra items | 2026-07-03 19:37Z |
| Enricher job log | 0 URLs found, 1041 runs | last run 19:30:01 |
| Discovery function test | 0 URLs for FPT/GVR/MBB/VHM/ACB all quarters | 2026-07-03 20:05Z |
| HSX API test | 0 results (non-HOSE tickers) | 2026-07-03 20:07Z |
| VPS script test | SSC 503 + 60s retry hang | 2026-07-03 20:10Z |
| bctcHttpFetch test | Timeout (strategy 1 hang) | 2026-07-03 20:12Z |

### Remediation Paths

**Path A (Most Likely):** Tickers are HNX/UPCOM-listed, not HOSE
- Action: PO decision to expand discovery scope OR update ticker classifier
- Escalate to: po, system-auditor
- Impact: 328 items unblock once tickers routed to correct strategy

**Path B:** SSC API is down or changed endpoints
- Action: Replace SSC fallback with alternate source
- Update: discover-bctc-urls-browser.py to fail-fast on 503 (don't hang 60s)
- Escalate to: dev-team
- Impact: Prevents timeout hangs, improves discovery reliability

**Path C:** Code defect in discovery service
- Action: Review commits to hsxBctcFetcher.ts, discover-bctc-urls-browser.py post-2026-06-16
- Escalate to: dev-pdf-extractor or dev-mcp-server
- Impact: Restore discovery for correct exchange

**Path D (Secondary):** 0-rows extraction alerts
- Action: Collect PDF parser output, analyze B02-TCTC extraction logs
- Escalate to: dev-mcp-server (parser defect) or dev-pdf-extractor (OCR)
- Impact: Separate from discovery fix; handle after stall resolved

### What Is NOT the Problem

✓ VPS connectivity (prices/news/sbv services all fresh)
✓ VPS bctc-fetch service (running, logging correctly every 6h)
✓ mcp-server enricher job (running successfully every 30min, just finding 0 URLs)
✓ PDF extractor service (healthy, waiting for PDFs to extract)
✓ Local Docker fleet (all 11 services healthy, no crashes)
✓ Database (market.db queries returning correct row counts, no corruption)

### Prevention

1. **Ticker Classification:** Mark HNX/UPCOM tickers separately; route to correct discovery strategy per exchange
2. **Discovery Health:** Add 503 detection + fail-fast (don't retry 60s); log per-strategy failures; fire BUG when 2+ strategies fail
3. **Backlog Management:** The 328 deferred_infra items are LEGACY; once discovery fixed, monitor drain rate

### Escalation Status

**BUG Channel:** Message sent (ID 3234) with diagnosis summary
**WORK Channel:** Status update sent with next-step routing
**Signal Candidates:** PO triage (classifier), dev-team (SSC/discovery), dev-mcp-server (parser)

---

## Session: FACTORY-INTERFACE-sequential-confidence-05-mask Docker Swap (2026-07-08T05:21–05:24Z)

**Task:** ops-gated mcp-server image swap (dev-mcp-server completed confidence-field fix + QA approved).

**Dispatcher:** dev-team (session 5a45feda-431e-46c8-941d-a6539a0eca77)

**Status:** COMPLETE — image swapped, verified, awaiting QA post-swap sanity check.

### Execution Summary

| Step | Action | Result | Duration |
|------|--------|--------|----------|
| 1 | Record peer container state before swap | 10 containers healthy, rag-service independently restarting (created 4min ago, not from prior ops) | <1s |
| 2 | docker compose up -d mcp-server | Container recreated + started | ~4s |
| 3 | Verify image swap via docker inspect | Old: 4c8ea4cfd41f → New: 180382145ee7 ✓ | <1s |
| 4 | Health check (GET /health) | 200 OK, status=ok, toolCount=183, uptime=5.8s | <1s |
| 5 | Peer container health verify | All still "Up 11 hours" (healthy); rag-service unchanged at "Up 4min" (independent) | <1s |
| 6 | Update orch-state.json via orch-apply.sh | next_agent → "qa", next_action updated with swap summary | ~2s |
| 7 | git add + commit | Commit 675451c2c, 1 file changed (orch-state.json) | ~1s |

### Technical Details

**Image Verification:**
- Old image hash (4c8ea4cfd41f) served CONTAM-10-WRITER-H fix (unrelated to this swap)
- New image hash (180382145ee7) built by dev-mcp-server earlier today
- Confirmed via docker inspect immediately post-swap
- No image collision or race detected

**Health Validation:**
- Server responding: `/health` endpoint returns 200 OK within <100ms
- Tool count stable: 183 tools (unchanged, validates no tool-registration side effects)
- Uptime: 5.8s (confirms fresh container)
- No error messages in response

**Peer Container Impact:**
- 9 peer containers: ZERO restarts (created times unchanged)
- rag-service: independently restarting (created 4 min before swap start) — NOT caused by this operation
- Conclusion: Swap was surgical, no collateral damage

**Board State Transition:**
- `.head.status`: remains "in_progress" (QA will flip to done_verified after sanity check)
- `.head.active_task_id`: remains "FACTORY-INTERFACE-sequential-confidence-05-mask"
- `.head.next_agent`: "ops" → "qa" (routed to QA for post-swap LIGHTER check)
- `.head.next_action`: updated with swap summary + next step description

### Next Steps (QA Ownership)

QA will execute LIGHTER post-swap sanity check (no full RAW HTTP probe needed):
1. Verify `/health` returns 200 OK ✓ (ops already confirmed)
2. Verify toolCount unchanged at 183 ✓ (ops already confirmed)
3. Confirm confidence field is internal-only (no live HTTP surface) — per QA code review
4. Flip FACTORY-INTERFACE-sequential-confidence-05-mask → done_verified via orch-apply.sh

**Why LIGHTER check:** confidence field fix has no external API surface; handle() returns only {status, thought, progress, nextSteps}. No downstream consumer affected.

### Artifacts

- Commit: 675451c2c (main branch)
- orch-state.json change: `.head.next_agent` "ops" → "qa"
- Decision journal: DJ-GATE-1 (this section)

---
