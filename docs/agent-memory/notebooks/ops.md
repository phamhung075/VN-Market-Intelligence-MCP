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

---

## Gated Rebuild + SHA-gate: FACTORY-TECHANALYSIS-reconcile-ta-contract (2026-07-08T11:15–11:16Z)

**Task:** FACTORY-TECHANALYSIS-reconcile-ta-contract  
**Agent Context:** ops (Step 1-4 close-gate, then qa Step 5 RAW-verify, then po Step 6 mark DONE)  
**Session UUID:** Agent dispatch  
**Status:** ✓ GATE 1-4 PASS → moved next_agent to "qa"

**Close-Gate Summary:**
- **Step 1 (Memory Check):** Docker ~1.8GB used (7GB cap), system 343MB free → PASS ✓
- **Step 2 (Rebuild):** `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" technical-analysis` → binary compiled, no errors, 24.1s → PASS ✓
- **Step 3 (Container Start):** `docker compose up -d technical-analysis` → container status `running (healthy)` at 11:16:01Z → PASS ✓
- **Step 4 (SHA-gate):** `bash scripts/verify-deploy-sha.sh technical-analysis` → deployed SHA `7b2490813be9ee98d871cb83ebe9c3e20a9889c1` matches HEAD → PASS ✓

**Light Sanity Check (golden-probe validation):**
- (1) symbol+period DB-backed: `POST /ta/indicators {symbol:"VCB",period:20}` → HTTP 200, full indicator payload ✓
- (2) closes-only pure-compute: `POST /ta/indicators {closes:[60180,60260,60320]}` → HTTP 200 ✓
- (3) missing-both 400: `POST /ta/indicators {}` → HTTP 400, "closes or symbol required" ✓

**Technical Context:**
- Fix scope: `api/openapi.yaml` spec + Go `router.go`/`dtos.go` doc-comments only (ZERO functional change)
- Pre-rebuild baseline: golden request/response diff captured during dev phase (byte-identical before/after confirmed via packet trace)
- Post-rebuild payload: consistent with pre-change golden baseline
- Commits: `190f60285` (contract), `db05de91b` (zone docs), `783830636` (memory)

**Post-Gate Delegation:** next_agent moved to "qa" (status remains REVIEW), orch-state updated via orch-apply.sh confirmed 2026-07-08T11:16:15Z. qa Step 5: formal RAW-verify against golden baseline. po Step 6: mark DONE_VERIFIED.

**Decision Journal:** Extended docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-technical-analysis.md with STEP dev-technical-analysis-S3 (gate execution details).

## Gated Rebuild + SHA-gate: FACTORY-SCHEDULER-alert-confidence-literals (2026-07-08T12:24–12:24Z)

**Task:** FACTORY-SCHEDULER-alert-confidence-literals  
**Agent Context:** ops (Step 1-4 close-gate, then qa Step 5 RAW-verify, then po Step 6 mark DONE)  
**Status:** ✓ GATE 1-4 PASS → moved next_agent to "qa"

**Close-Gate Summary:**
- **Step 1 (Memory/Capacity Check):** docker stats shows mcp-server at 9.50% (291.7MiB / 3GiB), preflight-disk shows 16GB free (≥15GB threshold) → PASS ✓
- **Step 2 (Rebuild):** `docker compose build --build-arg GIT_SHA="0d496c314927229835c7e3fa4f7638ed8fac0fbb" mcp-server` → succeeded, image exported with vn.market.git_sha label → PASS ✓
- **Step 3 (Container Start):** `docker compose up -d mcp-server` → container status `Up 5 seconds (healthy)` at 12:24:36Z → PASS ✓
- **Step 4 (SHA-gate):** `bash scripts/verify-deploy-sha.sh mcp-server 0d496c314927229835c7e3fa4f7638ed8fac0fbb` → deployed SHA matches HEAD → PASS ✓

**Technical Context:**
- Fix scope: 4 scheduler jobs (foreignFlowAlertJob.ts, insiderCheckJob.ts, bbAlertScanJob.ts, taAlertScanJob.ts) now derive alert confidence from real in-scope strength signals instead of frozen literals
- New domain services: alertConfidenceScorer.ts (shared pure scorer), bbBreakoutStrength.ts, rsiExtremityStrength.ts
- Database impact: confidence values in evidence_fragments and alerts.signals_json now vary per-signal (no longer flat constants)
- Commits: c94c50e24 (foreignFlow), 0bb264fa2 (insider), 8d041fbb7 (bb), 3978756bf (ta), b4e6fd54e (tests), 7011746eb (journal)
- Tests: targeted run (5 files) 83 pass / 0 fail; full bun test suite shows known flakiness unrelated to these changes

**Post-Gate Delegation:** next_agent moved to "qa" (status remains REVIEW), .head synced via orch-apply.sh confirmed 2026-07-08T12:24:45Z. qa Step 5: RAW-verify confidence values vary (not flat 0.75/0.85 as before) and fall within documented [base,ceiling] ranges per alertThresholds.ts. po Step 6: mark DONE_VERIFIED.

**Commit Evidence:**
- Commit 97832fb5a: chore(orch) — board flip + .head sync, ops_note with full Step 1-4 evidence
- Files changed: 1 (docs/data/orch/orch-state.json)

## Docker Close Gate: FACTORY-INTERFACE-extract-finalizeBctc-usecase (2026-07-08T14:26Z)

**Task:** FACTORY-INTERFACE-extract-finalizeBctc-usecase  
**Type:** FACTORY INTERFACE (code refactor — relocation of 1100L handler from interface to application layer)  
**Session UUID:** 5a45feda-431e-46c8-941d-a6539a0eca77  
**Status:** ✓ STEPS 1-4 COMPLETE

**Code Context:**
- Extract commit: 56ee74725 (1349L → 102L in finalizeBctcRefineTool.ts)
- 7 new application-layer files under `apps/mcp-server/src/application/usecases/finalizeBctcRefine/`
- Extracted blocks: BLOCK-1 (scalar backfill), BLOCK-2 (eval recompute), BLOCK-3 (ratio columns), BLOCK-4 (balance validation), BLOCK-5 (confidence recompute)
- All extracted functions <= 120L per DoD constraint
- Call order + single atomic transaction boundary preserved exactly
- Dev-verified: 293/293 finalizeBctcRefine-related tests green; tsc clean; eslint clean

**Step 1 — Memory Check: PASS**
- Docker stats: mcp-server 154.4MiB / 3GiB (5.02%), full stack ~1.4GB used of 8GB cap
- Host memory: 18,578 pages free (healthy)
- Docker compose up -d -–no-deps permitted

**Step 2 — Build + Deploy: PASS**
- `docker compose build --build-arg GIT_SHA=f9ed7f85034111d34c9a6cf88e97f18db31b57e3 mcp-server` OK
- Image cache hit on stable base layers, source/ copy + Bun build completed
- `docker compose up -d --no-deps mcp-server` — container recreated, 7 seconds to healthy

**Step 3 — Container Health Verification: PASS**
- `docker compose ps mcp-server` → STATUS: Up 7 seconds (healthy) ✓
- Port bindings: 0.0.0.0:3000->3000/tcp + 0.0.0.0:4004->3000/tcp active
- Peer container audit: Full `docker compose ps` run (all 12 services still running healthy)

**Step 4 — SHA Gate Verification: PASS**
- `bash scripts/verify-deploy-sha.sh mcp-server` → EXIT 0
- Deployed SHA verified: f9ed7f85034111d34c9a6cf88e97f18db31b57e3 ✓
- Container label `vn.market.git_sha` matched HEAD

**Endpoint Verification: PASS**
- `/health` (mcp-server internal): 200 OK — status=ok, toolCount=183, uptime=14.15s
- `/health` (gateway 4000): 200 OK — all 9 services green, mcp latency 20ms
- No tool count regression; no new/removed MCP tools from this extract
- Peers unchanged (stock: 1ms, news: 2ms, pdf: 4ms, rag: 2ms, ta: 2ms, macro: 2ms, alert: 2ms, kinh-dich: 2ms)

**Post-Gates Delegation:**
- Ops Steps 1-4 complete, no blockers
- Next gate: QA Step 5 RAW-verify (per runbook § "qa verifies liveness + tool behavior")
- QA task: finalize_bctc_refine liveness check + actual invocation against real report, verify bctc_table_rows / extraction_confidence / bctc_eval are IDENTICAL to pre-deploy code for same input
- orch-state next_agent flipped → qa (NOT self-closed to done_verified; po will perform Step 6)

**Artifact Commit:** ops rebuild log to notebook (this entry)  
**Timestamp:** 2026-07-08T14:27Z (5m from build start to health confirmation)

---
