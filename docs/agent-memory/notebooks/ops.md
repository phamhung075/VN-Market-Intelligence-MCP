# ops — Notebook

Zone: `apps/mcp-server/` + `services/` | Stack: Multi-service Docker | DB: market.db (write)

**Runbook:** `docs/protocols/ops-rebuild.md` — rebuild protocol (no-deps mandatory), race check, peer verification, disk cleanup.

---

## Archive: Sessions 2026-05-31 through 2026-06-13 
Historical rebuild logs: `git log ops.md` (2026-05-31–2026-06-13). Archived sessions: FIX-FETCH-VERYSTALE-LABEL, EVIDENCE-ACCUM-SILENT-CRON, CONTAM-9, VPSQUEUE, CONFIDENCE, TICKER-TARGETING, LIMIT-CHECKKIND, FIX-ALERT-ORPHAN-CORRELATION, A-1 live-verify. All QA gates cleared; zero contamination live.


## Session: 2026-06-14 (FIX-MCP-CRASH-LOOP-D-1 — WAL escalation live-verify gate)

**Task:** Execute live-verify gate for D-1 (WAL>10MB escalation guardrail injection). Prerequisites: BC-1 done_verified ✓, A-1 done_verified ✓, QA approved code commit e7289070.

### Execution Summary

**Step 1: Rebuild (targeted --no-deps --force-recreate)**
- Build image 1: `73c3b4bc6dc4...` — dependency cache miss on ajv-formats; rolled back
- Builder prune; full rebuild: image 2: `8cd74fce111941...` — 425 packages installed, SUCCESS
- New image ID: `sha256:8cd74fce111941352c2fc3e84f49e56e519013fd665375e4cb9231a32755e2a9`
- Container up 34 seconds, health=healthy
- All 13 peers intact (mcp-frontend, api-gateway, kinh-dich, rag-service, news-fetch, stock-price, alert-engine, technical-analysis, pdf-extractor, macro-indicators, headroom-proxy, mcp-gateway)

**Step 2: Code path verification**
- Confirmed escalateFn parameter present in running container's checkpoint.ts
- Test 1 (normal WAL): checkWalFileSize called with real WAL (136.8 KB) → warningFired=false ✓
- Test 2 (simulated >10MB): Created 15MB test WAL file → escalateFn invoked → signal appended
- Signal row persisted to orch-state: id=`wal-escalation-1781422530317`, type=WAL_ESCALATION, severity=HIGH, wal_bytes=15728640

**Step 3: Escalation silence (normal operation)**
- Current live market.db-wal: 528 KB (well below 10MB threshold)
- No spurious WAL_ESCALATION rows firing; escalation gate silent when WAL ≤ 10MB ✓

**Step 4: Board state promotion**
- Promoted D-1: done[APPROVED] → done_verified + live_verification_result populated
- Moved umbrella FIX-MCP-CRASH-LOOP-WRITEWAL: in_progress[] → done[] (status=done_verified)
- Set head: idle (active_task_id=null, next_agent=null)

**QA Gate Results:** ALL PASS ✓
- Rebuild: image rebuilt, new ID confirmed, peers intact
- Code path: escalateFn injection works end-to-end; signal persisted atomically
- Escalation silence: verified below 10MB threshold (no false positives)
- Board: D-1 + umbrella promoted; FIX-MCP-CRASH-LOOP-WRITEWAL umbrella CLOSED

**Root cause fix verification:**
- BC-1 (WAL checkpoint policy) + A-1 (restart alert) + D-1 (WAL escalation guardrail) all live-verified
- Combined: root cause fixed (wal_autocheckpoint=1000 + TRUNCATE every 30min), alert fired on restart-cadence, escalation guard fires on anomaly
- Next: monitor for >4h with WAL <5MB and zero restarts; if holds, close entire sprint


---
## Session: 2026-06-14 (KINHDICH-HOVER-ENRICH-FE-rebuild — frontend rebuild)

**Task:** Rebuild Remix frontend container to ship hoverSummary via que-descriptions.generated.ts into QueName quẻ hover tooltip on :3001.

**Commit:** 067e484d (fe: hoverSummary now flows through que-descriptions.generated.ts into QueName hover)

### Execution Summary

**Rebuild Execution**
- Command: `docker compose build frontend && docker compose up -d --no-deps frontend`
- Service: frontend (Remix app bundler, must rebuild for .ts code changes)
- Build time: 115s (npm ci + Vite SSR bundle)
- Image transition: `sha256:3a4f33c7...` → `sha256:d349d070...` ✓ (new build deployed, not cached)

**Post-Rebuild Verification**
1. **All 11 containers healthy:** 6 host_runtime_set + 5 peers remain Up/healthy ✓
2. **Frontend liveness:** `curl -sI localhost:3001` → 200 OK ✓
3. **Gateway port stable:** mcp-server port 3000 still bound (0.0.0.0:3000) ✓
4. **Builder cache prune:** Reclaimed 1.696GB (z807cdx1, 893fk4uv, mxqb1arg, ikktra3k, etc.) ✓
5. **No collateral damage:** Zero peer restarts, zero port conflicts ✓

**QA Gate:** CLEARED ✓
- New image SHA confirmed live in container
- Remix build completed without errors (1750 modules transformed, Vite SSR 1.38s)
- QueName.tsx and que-descriptions.generated.ts bundled into build/client/assets/
- Frontend :3001 responsive; ready for QA hover tooltip verification

---
## Session: 2026-06-14 (KINHDICH-HOVER-DETAIL — frontend rebuild)

**Task:** Rebuild apps/frontend to ship Kinh Dịch quẻ hover tooltip enrichment (QueName.tsx: coreMeaning + Trạng thái + Thuận + Cảnh báo + trend via que-descriptions.generated.ts).

**Commit:** de8d8d0a (dev-frontend shipped KINHDICH-HOVER-DETAIL enrichment)

### Execution Summary

**Rebuild Execution**
- Command: `docker compose build frontend && docker compose up -d --no-deps frontend`
- Old image ID: `8978f8ceb322`
- New image ID: `3ed501d2f5c2` ✓
- Build time: ~150s (npm ci + vite build + export layers)
- Container lifecycle: Recreate only (targeted no-deps, zero peer impact)

**Build Output**
- npm ci: 892 packages, 68.7s
- vite client build: 1750 modules, 19.16s (includes QueName-CweIuF2T.js 61.66 kB gzip:23.01 kB + que-descriptions-detail.generated-BvF1P1Ra.js 66.08 kB gzip:18.41 kB)
- vite SSR build: 96 modules, 1.98s (server/index.js 689.01 kB)
- Image export: 28.9s (unpacking to runtime layer)

**Post-Rebuild Verification**
1. **Peer integrity:** 13 containers before → 13 containers after ✓ (no cascade kill/restart)
   - All services listed: frontend, kinh-dich-service, mcp-server, api-gateway, rag-service, news-fetch, stock-price, alert-engine, technical-analysis, pdf-extractor, macro-indicators, headroom-proxy, mcp-gateway
2. **Frontend health:** Container 650e6e3dd7f5 Up 18s (healthy) ✓
3. **HTTP endpoint:** curl -sI http://localhost:3001/ → HTTP 200 OK ✓
4. **Builder prune:** Reclaimed 1.697GB from build cache (11 reclaimable layers) ✓

**QA Gate:** CLEARED ✓
- New image ID confirmed distinct from old
- Image digest: sha256:3ed501d2f5c2babcba908a6f2bee21e6aa1472f94ae0fa922f2eee01021f5886
- Service responds on :3001 with 200 status
- Zero peer downtime (all 13 services still running)
- Ready for QA RAW-verify of served QueName tooltip content (coreMeaning + details rendered in browser)
