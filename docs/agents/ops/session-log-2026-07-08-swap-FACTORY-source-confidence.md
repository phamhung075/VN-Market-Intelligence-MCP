# Ops Session Log — FACTORY-INTERFACE-source-confidence-10-mask Swap
**Date:** 2026-07-08T06:44:31+02:00  
**Session UUID:** 5a45feda-431e-46c8-941d-a6539a0eca77  
**Task:** FACTORY-INTERFACE-source-confidence-10-mask  
**Operator:** ops (gated swap)

## Summary
Executed gated live-container swap for mcp-server service. Image `180382145ee7` → `35c8117c1f85` (QA-approved). Single-service swap with zero peer-container side effects.

## Execution Log

### Pre-Swap State
- Running container: `180382145ee7` (unhealthy after source_confidence mask regression)
- Tool count: 183
- Peer containers: 12 healthy, uptimes 5min–12h
- Status: Ready for swap per QA approval & regression root-cause fix

### Swap Steps Executed
1. **`docker compose up -d mcp-server`** → Container recreated successfully
   - No peer services touched (single-service invocation)
   - Compose warnings: version attr obsolete (expected), volume already exists (expected)

2. **Post-Swap Verification via `docker inspect`**
   - Container ID: `c0dc4c1c7168`
   - Image: `sha256:35c8117c1f85...` ✓
   - Status: Up 7 seconds, healthy ✓

3. **Peer Container Health Audit**
   ```
   ✓ frontend                 12h  healthy
   ✓ technical-analysis       12h  healthy
   ✓ stock-price              12h  healthy
   ✓ macro-indicators         12h  healthy
   ✓ api-gateway              12h  healthy
   ✓ pdf-extractor            12h  healthy
   ✓ kinh-dich-service        12h  healthy
   ✓ rag-service              5m   healthy
   ✓ news-fetch               12h  healthy
   ✓ alert-engine             12h  healthy
   ✓ headroom-proxy           12h  (no healthcheck configured)
   ✓ mcp-gateway              12h  healthy
   ```
   All peer containers untouched. No restarts. No cascade.

4. **Service Health Endpoints**
   - `/health` → 200 OK
   - Response: `{"status":"ok","name":"vn-market","version":"1.0.0","toolCount":183,"sessions":0,"uptime":11.474091969}`
   - Tool count: 183 (unchanged) ✓

## Technical Details

**Fix Rationale** (per QA review_note):
- Root cause: bctc_table_rows.source_confidence column had stale NULL-allowance definition (was NOT NULL in schema but runtime didn't enforce)
- Symptom: BCTC finalize pipeline wrote final rows with source_confidence=NULL for edge cases (low-confidence scores)
- Fix: Updated column definition + backfill logic; image 35c8117c1f85 includes enforcement + clean DB state
- Behavior: Mask now correctly routes low-confidence (≤0.2) to separate queue; prevents NULL propagation

**QA Sanity-Check Expectations** (post-swap verification task):
- Query: `SELECT source_confidence, COUNT(*) FROM bctc_table_rows GROUP BY source_confidence`
- Expected distribution (live DB): `{0.1: 380, 0.4: 2, 1.0: 3257}` with 0 NULLs
- This is smoke-test re-confirmation, NOT before/after delta (fix is behavior-preserving)

## Post-Swap Status
- **Swap Status:** ✓ COMPLETE
- **Container Health:** ✓ HEALTHY
- **Tool Count:** ✓ 183 (unchanged)
- **Peer Impact:** ✓ ZERO
- **Next Agent:** qa (for post-swap sanity check as per orch-state.head.next_action)

## Rollback Available
If QA sanity check fails, revert to `180382145ee7`:
```bash
docker compose up -d mcp-server  # pulls previous image from local cache
```
No data corruption risk (fix is idempotent on read; backfill already ran offline).

---
