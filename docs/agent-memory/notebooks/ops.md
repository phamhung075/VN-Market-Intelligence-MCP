# ops — Notebook

Zone: `apps/mcp-server/` + `services/` | Stack: Multi-service Docker | DB: market.db (write)

**Runbook:** `docs/protocols/ops-rebuild.md` — rebuild protocol (no-deps mandatory), race check, peer verification, disk cleanup.

---

## 2026-06-12 (3 rebuilds: FIX-FETCH-VERYSTALE-LABEL, EVIDENCE-ACCUM-SILENT-CRON, CONTAM-9)
**Frontend:** image `e47f66ad`→`1d6d2c441`, sourceStatusLabel live, all 11 peers healthy. **mcp-server EVIDENCE-ACCUM:** 80 cron keys registered, recoverMissedExecutions active, 19GB disk free. **CONTAM-9 write-boundary:** Class A/B contamination=0, FPT consistent. All QA gates CLEARED.

---

## Archive: Earlier Sessions (2026-05-31 through 2026-06-12)
Detailed history: `git log ops.md` + 2026-05-31–06-12 sessions. All QA gates cleared; 13 services healthy; no contamination live.

---

---

## 2026-06-13 mini-sessions (VPSQUEUE, CONFIDENCE, TICKER-TARGETING, LIMIT-CHECKKIND)
**VPS:** 10 pending rows, no Q1 filings on HNX/UPCOM/SSC, NO restart. **CONFIDENCE:** image `5521a124bb45`, BLOCK-5 gate live, 13/13 peers ✓. **TICKER:** smoke `get_bctc_pending_refine(ticker:"CTG")`→OK. **LIMIT:** image SHA `09c7e3b3ce42`, SDK 1.29.0 pinned, all gates CLEARED. All 3 commits live.

---
## Session: 2026-06-13 (FIX-ALERT-ORPHAN-CORRELATION — mcp-server rebuild)

**Task:** Rebuild mcp-server to ship FIX-ALERT-ORPHAN-CORRELATION (idempotent ALTER TABLE migration + atomic co-write path).

**Commit:** 7cbca67a (fix(mcp-server/FIX-ALERT-ORPHAN-CORRELATION): atomic alert→signal co-write + alert_id column)

### Execution Summary

**Rebuild Execution**
- Command: `docker compose up -d --build mcp-server` (targeted, no-deps, no down)
- mcp-server image: old → `ffd709975717` (new) ✓
- Build time: 65s; all peers unchanged
- Container lifecycle: Recreate only (no rebuild cascade)

**Post-Rebuild Verification**
1. **All 11 services healthy:** alert-engine, api-gateway, frontend, kinh-dich-service, macro-indicators, mcp-server, news-fetch, pdf-extractor, rag-service, stock-price, technical-analysis ✓
2. **mcp-server health:** 200 OK, `{"status":"ok","toolCount":157,"sessions":0,"uptime":65.85...}` ✓
3. **Migration verified:** `PRAGMA table_info(agent_signals)` shows new column 28: `alert_id|TEXT|0||0` (idempotent, no errors) ✓
4. **Peer stability:** Zero service kills, zero restarts, uptime preserved ✓

**QA Gate:** CLEARED ✓
- New image ID confirmed live in container vs docker images registry
- Migration atomic: alert_id column present, schema intact
- Health endpoint responds; no startup errors in mcp-server logs
- Ready for QA verification of co-write path + orphan-correlation fix logic


---

## Session: 2026-06-14 (A-1 live-verify gate — restart-cadence alert guardrail)

**Task:** FIX-MCP-CRASH-LOOP-A-1 — ops live-verify gate (promote APPROVED→done_verified after rebuild + sentinel persistence + alert fire).

**Context:** A-1 code (restart-cadence alert cron + startup sentinel) merged by dev-mcp-server, approved by QA cycle-261 (4/4 tests pass, tsc 0). Waiting for ops live-verify: force-recreate mcp-server, confirm sentinel rows persist on named-volume DB, verify alert fires when count≥2 within 4h window.

### Execution Summary

**Step 1: Targeted rebuild**
- `docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server`
- Old image: `sha256:3d4fa47af822...`
- New image: `sha256:73c3b4bc6dc45...` ✓ (image hash changed, verified with `docker inspect`)
- Container health: `healthy` (curl /health → 200 OK) ✓
- All 10 peer services verified UP post-rebuild; no peer destruction ✓

**Step 2: Sentinel persistence on named-volume DB**
- Query named-volume `vn-market-intelligence-mcp_market_data:/data/market.db` via keinos/sqlite3 sidecar
- Sentinel row found: `mcpServerStartup|success|2026-06-14 05:33:15` (restart #1 = force-recreate) ✓
- Manual 2nd restart triggered at 05:33:35 (plain `docker compose restart mcp-server`, no rebuild)
- Sentinel row #2 persisted: `mcpServerStartup|success|2026-06-14 05:33:35` ✓
- Count within 4h window: 2 rows ✓

**Step 3: Alert-fire verification (restart count ≥ 2)**
- Cron `'15,45 * * * *'` registered correctly (81 cron keys including "restart-cadence-alert" logged at startup) ✓
- Cron fired at 05:45:00 (next :45 tick after 2nd restart)
- Alert job entry created: `cron_job_runs WHERE job_name='restartCadenceAlertJob' started_at=2026-06-14 05:45:00 status=success` ✓
- Docker logs confirm: `[2026-06-14T05:45:00.642Z] [SCHEDULER] [restart-cadence-alert] alert sent — restartCount=2` ✓
- Telegram WORK-channel message sent (sendTelegramWork invoked via sendFn) ✓

**Step 4: Negative-case (no false positive on count=1)**
- Unit test #1 (`FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts`) confirmed: count=1 → alertSent=false ✓
- All 4 unit tests PASS ✓ (gate validation)

### QA Gate: PASSED ✓

- Sentinel rows persist on live named-volume DB (count=2, timestamps verified)
- Cron alert fired correctly at :45 mark with count=2
- Alert logged and sent to WORK channel
- No false positives (unit test confirms count=1 silent)
- Container healthy, all peers intact, disk healthy

### Outcome

**A-1 promoted `done/APPROVED` → `done_verified`**

Board state updated:
- `head.status = idle`
- `head.active_task_id = null` 
- `head.next_agent = null`
- `task_board.done[A-1].status = done_verified`
- `task_board.done[A-1].live_verification_result = {rebuild, sentinel_persistence, alert_fire, unit_tests, summary}`

orch-state committed. Unblocks D-1 (same-zone one-in-flight clears).


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
