# Docker Close Gate: FACTORY-DOMAIN-extract-bctc-parsing-lib

**Task:** FACTORY-DOMAIN-extract-bctc-parsing-lib  
**Type:** FACTORY DOMAIN (shared code extraction — parsing primitives library)  
**Session UUID:** 5a45feda-431e-46c8-941d-a6539a0eca77 (ops dispatch)  
**Status:** ✓ STEPS 1-4 COMPLETE → next_agent=qa  
**Commit:** e3e0dfeb9  
**Timestamp:** 2026-07-08T16:10:45Z

## Close-Gate Execution Summary

### Step 1 — Memory + Disk Check: PASS ✓

**Disk Preflight:**
- Initial: 12GB free (below 15GB threshold)
- Action: `docker builder prune -a -f && docker image prune -a -f` (81.45MB reclaimed)
- Final: 36GB free (≥15GB threshold) ✓

**Memory Check:**
- Docker stats: mcp-server 168.1MiB / 3GiB (5.47%)
- Full stack usage: ~800MB of 8GB cap
- Verdict: PASS ✓ (ample headroom for build)

### Step 2 — Build + Deploy: PASS ✓

**Build:**
- Command: `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" mcp-server`
- Duration: ~155s (full build with Bun 1.3.13 + npm packages)
- Image: `vn-market-intelligence-mcp-mcp-server:latest`
- Result: Binary compiled, no errors, image exported with vn.market.git_sha label ✓

**Deploy:**
- Command: `docker compose up -d --no-deps mcp-server`
- Result: Container recreated + started ✓
- Ports: 0.0.0.0:3000->3000/tcp, 0.0.0.0:4004->3000/tcp active

### Step 3 — Container Health Verification: PASS ✓

**Status at 16:10:30Z:**
- `docker compose ps mcp-server` → STATUS: `Up 14 seconds (healthy)` ✓
- Port bindings: Both 3000 and 4004 responding
- Peer container audit: Full `docker compose ps` run confirms all 12 services remain healthy (no cascading restarts from swap)

### Step 4 — SHA Gate Verification: PASS ✓

**Command:** `bash scripts/verify-deploy-sha.sh mcp-server`  
**Result:** `OK: deployed SHA matches HEAD (dd37ec6c33451d93f4597a812d6fb1accccced99).` ✓  
**Verification:** Container label `vn.market.git_sha` confirmed via docker inspect

### Endpoint Health Verification: PASS ✓

**GET /health (mcp-server:3000):**
```json
{
  "status": "ok",
  "name": "vn-market",
  "version": "1.0.0",
  "toolCount": 183,
  "sessions": 0,
  "uptime": 20.623297711
}
```

**Key Findings:**
- Status: ok (200 response)
- Tool count: 183 (matches pre-deploy baseline — no tool regression)
- Uptime: 20.6s (confirms fresh container boot)
- Sessions: 0 (no active client connections at probe time)

## Code Context — Refactor Scope

**Extract Deliverable:**
- New: `financial-reports/lib/lineScan.ts` (canonical findValue + findValueByCode + scaleNumericFields + detectDivisor)
- New: `financial-reports/lib/vasPatterns.ts` (shared Total Assets/Liabilities/Equity regex patterns)
- Modified (5 files): balanceSheetExtractor, cashFlowExtractor, incomeStatementExtractor, bctcScalarAggregator (call-site adaptations), bctcMagnitudeValidator (documentation pointer only)

**Migration Strategy:**
- Reconciliation: balanceSheetExtractor + income/cashFlow originally had different findValue() signatures (2-arg vs 4-arg with fallback); canonical lib version accepts both via optional parameters, preserving exact pre-migration behavior per call site
- Untouched: bctcMagnitudeValidator (comment-only diff — its regex patterns operate on different data shape than the canonical OCR-fuzzy patterns; merging would silently broaden fraud-detection matching, requires dedicated verification)

## QA Next Steps (Per Runbook § Step 5)

**QA Assignment:** Verify RAW behavior + finalize_bctc_refine liveness check

1. Pick 2-3 already-parsed reports spanning all 3 statement types (e.g. FPT/VCB/a bank)
2. Confirm balance_sheet_json / income_statement_json / cash_flow_json scalar values are BYTE-IDENTICAL pre- vs post-rebuild for SAME source PDF
3. Confirm total_assets/total_liabilities/equity_total scalars in financial_reports (bctcScalarAggregator output) unchanged for spot-check report
4. bctcMagnitudeValidator DT-2/DT-3 BLOCK detection behavior verification (comment-only diff — skip A/B, but flag for completeness)

**Board State Transition:**
- `.head.status`: remains "REVIEW" (QA will flip to done_verified after Step 5)
- `.head.next_agent`: "ops" → "qa" (routed for RAW-verify step)
- PO Step 6 (mark DONE_VERIFIED) deferred until QA Step 5 passes

## Artifacts

- Commit: e3e0dfeb9 (chore: ops close-gate orch-state board flip)
- Files changed: 1 (docs/data/orch/orch-state.json)
- Docker image: vn-market-intelligence-mcp-mcp-server (sha256:dec2cccdad1099283f0a0d23b287dd9fea0c7e581f61073eb47c6e43ffbccb25)

## Technical Notes

**Why rebuild was required:**
- Shared lib extraction requires Bun compilation (TypeScript → JavaScript)
- 5 call sites + 2 new lib files = new symbol table in bundled output
- Container image must include new bytecode before live parsing operations access the extracted functions
- Restart ≠ Rebuild: reusing previous image would silently miss the extraction, leaving old inline code paths active (Restart ≠ Rebuild gotcha per memory: project_host_memory_panic, feedback_ship_completion)

**Build complexity drivers:**
- Full Bun+npm rebuild (not cache-only): ensures all dependency vectors resolved
- PDF extraction suite dependencies (tesseract-ocr, poppler-utils, python3-dev): ~121MB apt-get fetch + install
- Bun runtime + TypeScript compiler: adds ~100MB to build layer
- Total binary export time: ~65s after compilation

**Peer containers verification:**
- All 12 services remained running throughout rebuild + swap
- No cascading restarts or health degradation
- Gateway health endpoint (localhost:4000/health) would show all 9 downstream services at Step 5 (QA-owned)

---

**Decision:** Close-gate Steps 1-4 complete. Ready for QA Step 5 RAW-verify + PO Step 6 signoff.
