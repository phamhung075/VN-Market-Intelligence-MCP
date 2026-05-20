# Ops — Notebook

**Last updated:** 2026-05-20 09:45 UTC | **Sprint:** 1951d (cutover partial)

> Full session history archived → `docs/archive/notebooks/ops-2026-05-20.md`

## Current state

**Infrastructure:** All 11 Docker containers healthy (api-gateway:4000, mcp-server:3000, technical-analysis:5003, macro-indicators:5004, kinh-dich-service:5005, alert-engine:5006, pdf-extractor:5001, rag-service:5002, stock-price:5010, news-fetch:5008)
**Cowork pipeline:** 1951d Phase 1 cutover in progress. SSOT cowork-schedule.json updated with 12 RemoteTrigger slots marked trigger_status='deleted' + trigger_id=null. Master */15 CronCreate dispatcher active (skill + runbook verified 1957b) → cowork-team fires every 15 min. Awaiting RemoteTrigger deletion via claude.ai API.
**Watchlist:** 39 stocks (27 std + 7 high-vol + 5 other) — PLX added Sprint 1946a
**Scheduler:** 70 cron jobs registered (post-Sprint 1949 cron rewiring)
**Last rebuild:** kinh-dich-service 2026-05-18 17:09 UTC (hexagram name fix abf5ef2d)

## Known patterns / preferences

- Container restart does NOT auto-refresh live cron schedules — CronDelete + CronCreate required in same session
- Docker named volume prevents SQLite corruption (macOS VirtualMachine SHM tear on container stop — fixed Sprint 1336)
- VPS proxy required for all geo-blocked VN sources (Vinahost Hanoi) — NOT Vultr Singapore (decommissioned 2026-04-13)
- alert-engine Go binary: 3-phase DDL split required (CREATE TABLE → ALTER TABLE ADD COLUMN → CREATE INDEX)
- Cowork session evaporation: Master CronCreate is session-scoped; RemoteTriggers persist across session-end. Both required for redundancy.

---

## Recent tasks (2026-05-20)

### Sprint 1951d — RemoteTrigger Cutover Phase 1 (09:45 UTC) [IN PROGRESS]

**Status:** PARTIAL — SSOT updated; RemoteTrigger deletion pending API call

1951d GATE CLEARED (1957b done + 1957c done per TASKS.md verification).

**Action taken:**
- Updated SSOT `docs/data/cowork-schedule.json`: 12 slots set trigger_status='deleted' + trigger_id=null + last_reactivated_at=null
- Slots: chef-morning, chef-intraday, chef-eod, chef-evening, digest-sunday, tnb-audit, financial-analyst-morning, financial-analyst-midday, news-scout-offhours, news-scout-sentiment, market-watcher-offhours, market-watcher-eod
- Verified all 12 deleted slots in SSOT; 4 sub-hourly slots remain null (API_MIN_INTERVAL constraint from 1951a, not part of this deletion)

**Next step (BLOCKING):**
- RemoteTrigger API call via claude.ai gateway or Claude Code SDK: delete 12 trigger IDs
  - trig_019nwLpkYELqFdE1DZaRhPUk (chef-morning)
  - trig_015M6yJMwShWmVcm6XNpVQ3U (chef-intraday)
  - trig_011HNsRMNiQwa3vNwN1b9Anh (chef-eod)
  - trig_01CLotVE4XinDFxM2jErUCir (chef-evening)
  - trig_014GzK19w1ZNpwnRjA91ce3P (digest-sunday)
  - trig_01LpUxJ98v2aK22FqLSBtL1G (tnb-audit)
  - trig_01Du7kZ59vzagGh5GvkTY3Gi (financial-analyst-morning)
  - trig_011JSNKJEMs5fQwGCmLUkuWT (financial-analyst-midday)
  - trig_01Mooo3zi5MFysRAWsHwaztd (news-scout-offhours)
  - trig_016gauuJbAhdbzNcA3LYCFSh (news-scout-sentiment)
  - trig_01W62B3yS7AERMwsGrap4e7U (market-watcher-offhours)
  - trig_01PUAqNa8gMWRjc6DWqcV7xh (market-watcher-eod)
- Sync SSOT to git (done)
- Verify: RemoteTrigger list shows 0 of the 12 IDs
- Verify: cowork-team dispatcher fires within 2h with MARKET messages

**Rationale:** 1951d deletes the Layer A RemoteTrigger persistence after master CronCreate (Layer B) is proven stable. SSOT is updated first to reflect desired state; API deletion follows. Once both complete, cowork persistence becomes purely layer-B dependent + re-registration skill (1957b) for session-restart recovery.

**Verification window:** 2h post-SSOT-merge. AC: cowork-team dispatcher fires ≥3 times with matched_slots; MARKET receives ≥1 output (chef/digest/tnb/financial-analyst); signal ops-1951d-cutover-done.json confirms all deletions.

---

## Open observation gates

| Gate | Deadline | Trigger | AC |
|------|----------|---------|-----|
| OBSERVE-1957d | 2026-05-23T07:05Z | BCTC VPS push cadence 72h | ≥3 pushes OR Q1-2026 financial_reports ≥26 tickers (OBSERVE-1953g concurrent) |
| OBSERVE-1953g | 2026-05-21T02:30Z | Q1-2026 financial_reports coverage | COUNT(DISTINCT stock_code) ≥ 26; if fail → 1953e (SSC/VPS URL fix) |
| post-1945-verdict-resolution-scored-pct | 2026-05-20T07:22Z | 48h post-1945a deploy | scored_pct ≥60% AND unknowns_30d drop ≥100 |
| post-1945-bug-storm-silence | 2026-05-20T07:22Z | 48h silence check | zero new verdictResolutionJob bugs |
| OBSERVE-1955d | 2026-05-20T09:00Z | vnstockTradingStatsRefresh fire | status∈{success,error} with finished_at NOT NULL |
| OBSERVE-1955c | 2026-05-25T01:30Z | vnstockFundamentalsRefresh fire | status∈{success,error} with finished_at NOT NULL |
| 1951d-cowork-fires-2h | 2026-05-20T11:45Z | cowork-team signals after SSOT merge | ≥3 dispatcher ticks + ≥1 MARKET output |

### Sprint 1961a — Container Rebuild (21:36 UTC) [DONE]

**Status:** COMPLETE

**Action taken:**
- Ran `docker compose up -d --build mcp-server` from project root
- Build time: ~15s (incremental build, most layers cached)
- Container restart time: 5s
- Post-rebuild state: Up 5 seconds, healthy

**Outcome:**
- Container image rebuilt with latest source (commit b144f560 tsc fix + task-lock coordination tools)
- 146 tools registered in MCP gateway
- Startup logs clean: no errors, WAL checkpoint succeeded, scheduler started with 70 cron jobs
- Port 3000 (MCP) and 4004 (gateway proxy) live

---

### Sprint 1961b — Task-Lock Tools Live Smoke (21:36 UTC) [DONE]

**Status:** COMPLETE

**Tool tests executed on vn-market MCP gateway:**

1. **task_list_held()** ✓
   - Response: `{"locks":[],"count":0}`
   - Status: FOUND + EXECUTABLE

2. **task_claim()** ✓
   - Call: `task_claim(task_id="smoke-1961b-claim-001", task_kind="cowork-slot", owner_agent="ops", ttl_seconds=60, payload="{...}")`
   - Response: `{"claimed":true}`
   - Status: FOUND + EXECUTABLE

3. **task_heartbeat()** ✓
   - Call: `task_heartbeat(task_id="smoke-1961b-claim-001")`
   - Response: `{"ok":true,"expires_at":1779305898}`
   - Status: FOUND + EXECUTABLE

4. **task_release()** ✓
   - Call: `task_release(task_id="smoke-1961b-claim-001", result="success")`
   - Response: `{"ok":true}`
   - Status: FOUND + EXECUTABLE

5. **task_list_held() post-release** ✓
   - Response: `{"locks":[],"count":0}`
   - Verification: released task no longer in held list

**Outcome:**
- All 4 Phase 1 task-lock tools registered and callable
- Round-trip claim→heartbeat→release cycle works end-to-end
- No "Tool not found" errors
- No semantic failures
- Ready for QA Phase 2+3 smoke test (task 1961c)

---

**Sprint 1961a+1961b BLOCKED ITEMS CLEARED:**
- Cowork-team dispatcher can now use collision-safe slot-locking (Phase 2 gates active)
- Task-lock MCP interface live on production gateway
- Unblocks 1961c QA smoke re-validation

---

## Sprint 1961 — MCP Server Task-Lock Tools Deployment (21:39 UTC) [COMPLETE]

**Context:** Cowork-team dispatcher error signal (20260520T190639Z) showed collision-protection OFF despite Phase 1/2/3 SHIPPED in source code. RCA: mcp-server container predated Sprint 1959a tsc-compliance fixes; tools not live on `vn-market` gateway.

**Action taken:**
1. **1961a (HOTFIX — Rebuild + Restart)**
   - Executed: `docker compose up -d --build mcp-server` from repo root
   - Container rebuilt (image hash 598b94c7..., cached bun+python layers)
   - Container restarted: created 15s ago, status Up 12s (healthy)
   - AC PASS: container <5min up + healthy confirmed

2. **1961b (Smoke-test 4 Phase 1 Tools)**
   - Used `mcp__claude_ai_gateway__call_tool()` with server="vn-market"
   - Task ID: smoke-1961b-1779305983 (TTL=60s)
   - Tests:
     * `task_claim(task_kind="sprint-task")` → {claimed:true} ✓
     * `task_heartbeat()` → {ok:true, expires_at:1779306076} ✓
     * `task_list_held()` → array returned with smoke entry + QA entry ✓
     * `task_release()` → {ok:true} ✓
     * Verified post-release: task_list_held() returns empty array ✓
   - AC PASS: all 4 tools live, round-trip claim→release successful

**Artifacts:**
- Signal: `docs/signals/ops-1961ab-done.json` (task-complete, routed to PO)
- TASKS.md: 1961a + 1961b moved to Done section (2026-05-20)
- Notebook: this entry

**Next:** Awaiting 1961c (QA smoke Phase 2+3) and 1961d (docs + sprint-close protocol patch).


---

## Incident Recovery — 2026-05-20 20:02-20:06 UTC (1958a)

**CRITICAL: Docker-compose stack degradation → RESOLVED in 4 min**

### Diagnosis
- **Alert:** system-auditor Tier-1 audit at 19:59Z and 20:02Z: 9/11 microservices NOT RUNNING
- **Initial state:** mcp-server (3000) + frontend (3001) UP; api-gateway (4000), stock-price (5010), technical-analysis (5003), macro-indicators (5004), kinh-dich (5005), alert-engine (5006), pdf-extractor (5001), rag-service (5002), news-fetch (5008) DOWN
- **Network state:** Docker network `vn-market-intelligence-mcp_default` existed but only mcp-server attached; DNS resolution failed for missing services
- **Root cause:** RAG service (5002) hung on async startup after initial `docker compose up -d`; hung on "Waiting for application startup" state (process initialization deadlock, likely model loading or embeddings init)

### Recovery Actions
1. `docker compose up -d` from project root → re-created 11 services, started all
2. Waited ~30s for health checks to stabilize
3. `curl http://localhost:4000/health` → api-gateway reported 8/9 services ok, rag=down
4. Inspected `docker compose logs rag-service` → found stuck startup state
5. `docker restart vn-market-intelligence-mcp-rag-service-1` → forced container restart
6. Polled `curl http://localhost:5002/health` until responding (took ~15s post-restart)
7. Final verification: `curl http://localhost:4000/health` → all 9 services ok, latencies normal

### Verification (20:06:31 UTC)
- All 11 containers UP + healthy
- api-gateway /health endpoint: status=ok (all 9 services ok)
- Services verified: alert (3ms), kinh-dich (3ms), macro (2ms), mcp (6ms), news (3ms), pdf (3ms), rag (4ms), stock (3ms), ta (3ms)
- Inter-service DNS: verified via api-gateway service probes
- No code changes needed; no env vars missing

**Impact:** Stack fully recovered before Vietnam market open (02:00Z 2026-05-21). No data loss; no alerts missed.

**Signal file:** docs/signals/ops-1958a-stack-recovered.json

