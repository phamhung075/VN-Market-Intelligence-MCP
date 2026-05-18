# TASK_REPORT_1945 — Ops Docker Rebuild

## Task Summary
Sprint 1945 code merged all 3 tiers:
- **1945a**: getPriceHistory envelope unwrap fix in verdictResolutionJob.ts + clients.ts (verdict scoring was broken — ~520 alerts never scored)
- **1945b-backend**: GET /api/accuracy/digest HTTP handler in server.ts
- **1945b-frontend**: AccuracyDigestCard component in dashboard

## Rebuild Execution

### Step 1: Docker Build
```
docker-compose build mcp-server
```
- Status: PASS
- Build time: ~18s (cached base layers, only Dockerfile → src layers rebuilt)
- Image: vn-market-intelligence-mcp-mcp-server:latest
- SHA256: df00f8c926df6b24b149be3185088ff909670503477acfc55731a1eb0f9f325e

### Step 2: Container Restart
```
docker-compose up -d mcp-server
```
- Status: PASS
- Container: vn-market-intelligence-mcp-mcp-server-1
- Action: Recreated (clean start)

### Step 3: Health Status Verification
```
docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{.State.Health.Status}}'
```
- Result: **healthy** ✓
- Startup time: ~10s (post-WAL checkpoint, all cron jobs initialized)

### Step 4: Endpoint Smoke Test
```
curl -s 'http://localhost:3000/api/accuracy/digest?days=30' | head -c 300
```
- Status: 200 OK
- Response sample:
```json
{
  "totalResolved": 0,
  "totalCorrect": 0,
  "overallRate": null,
  "bySignalType": [],
  "newStocksCount": 1,
  "neutralOnlyRows": 0,
  "generatedAt": "2026-05-18T07:22:13.806Z"
}
```
- Verdict: **Endpoint live** ✓

### Step 5: Health Endpoint Check
```
curl -s 'http://localhost:3000/health' | jq .
```
- Status: 200 OK
- Response:
```json
{
  "status": "ok",
  "name": "vn-market",
  "version": "1.0.0",
  "toolCount": 142,
  "sessions": 0,
  "uptime": 10.675595963
}
```
- Verdict: **All services initialized, toolCount correct** ✓

### Step 6: Startup Logs Review
```
docker logs vn-market-intelligence-mcp-mcp-server-1 --tail 20
```
- Key events:
  - [vnstock-store] UNIQUE(code, date) index validated
  - [bootstrap] WAL checkpoint startup replay complete
  - [bootstrap] Database ready
  - [createBunServer] Tools registered: toolCount=142
  - [bctc-poison-cleanup] reset 4 poisoned bctc_vps_queue entries to pending
  - [createBunServer] MCP server ready on port 3000
  - [bootstrap] Telegram webhook registered
  - [bootstrap] pdf-extractor health check OK
  - [SCHEDULER] 70 cron keys in CRONS map (incl. WAL checkpoint + 5 summary) + vps-watchdog + VPS health + SLA monitor + macro-refresh + imf-poller + session-tool-usage active
  - Verdict: **Zero startup errors** ✓

## Code Changes Deployed
- verdictResolutionJob.ts: getPriceHistory envelope unwrap fixed (allows complex pricing objects to deserialize correctly)
- clients.ts: envelope handling aligned with backend response structure
- server.ts: GET /api/accuracy/digest route + 30-day accuracy window calculation + digest rate color coding
- routes/dashboard.analysis.tsx: AccuracyDigestCard component mounted + fetchAccuracyDigest(30) loader integration

## Recovery Expectation
The getPriceHistory fix (1945a) unblocks ~520 alerts that failed to score due to envelope deserialization. These alerts will resume scoring within next 48h based on:
1. Alert cron cycle: bbAlertScan + taAlertScan run every 2-3h
2. Verdict resolution: verdictResolutionJob runs as part of alert post-processing
3. Envelope fix: Now allows getPriceHistory response to unwrap and populate pricing fields correctly

## Infrastructure Status
- **mcp-server container**: healthy
- **MCP endpoint**: http://localhost:3000 (responsive)
- **Tool count**: 142 (unchanged — endpoint not separately counted)
- **Cron jobs**: 76 (unchanged)
- **Database**: Clean WAL checkpoint, no corruption
- **Microservices**: All healthy (pdf-extractor online, VPS watchdog active)

## Project Stats Updated
- currentSprint: 1945
- lastUpdated: 2026-05-18
- toolCount: 142
- cronJobCount: 76
- totalTasksDone: 560 (incremented from 559)
- infrastructureStatus.mcpServerHealth: healthy
- infrastructureStatus.lastSuccessfulCycle: 2026-05-18T07:22:00Z

## Conclusion
Sprint 1945 Docker rebuild **COMPLETE AND OPERATIONAL**. All 3 code tiers deployed. Verdict resolution envelope fix active. Accuracy digest endpoint live. No startup errors. All services healthy. Expected recovery of ~520 unscored alerts within 48h.
