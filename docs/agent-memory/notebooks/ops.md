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
