# System Audit Dashboard

## Anomaly: A-30 · mcp-server memory pressure
**Severity:** WARN | **Date:** 2026-07-21 | **Status:** OPEN  
**Location:** mcp-server container (vn-market-intelligence-mcp-mcp-server-1)  
**Details:** Memory pressure at 75.14% (2.254GiB / 3GiB); exceeds 68% anomaly threshold. Trending up: 55.89% → 64.65% → 61.27% → 63.96% → 75.14%  
**Impact:** Sustained high memory utilization may impact performance or trigger OOM kills during peak load  
**Root cause:** Possible memory leak in MCP server or subagent processes; or peak workload during market analysis cycles  
**Zone owner:** dev-mcp-server  
**Last reported:** 2026-07-19T08:11:04Z (dedup 7d)  
**Mitigation:** Monitor memory trend; investigate for leaks if sustained >80%; consider restart if approaches 90%  

---

## Anomaly: A-12 · api-gateway health endpoint CURL_ERR
**Severity:** WARN | **Date:** 2026-07-21 | **Status:** OPEN  
**Location:** api-gateway service (4000/health endpoint)  
**Details:** Health endpoint returned CURL_ERR (connection failed or timeout from probing host)  
**Impact:** Health aggregation for downstream services may be stale; affects cowork agent liveness detection  
**Root cause:** Transient network issue or api-gateway process CPU stall; correlates with recurring A-12 pattern since 2026-07-20  
**Zone owner:** dev-api-gateway  
**Last reported:** 2026-07-20T06:12:10Z (dedup 7d)  
**Mitigation:** Check api-gateway logs; restart if stall persists  

---

## Anomaly: A-11 · pdf-extractor UNHEALTHY
**Severity:** WARN | **Date:** 2026-07-20 | **Status:** OPEN  
**Location:** pdf-extractor container (vn-market-intelligence-mcp-pdf-extractor-1)  
**Details:** Docker health check reports unhealthy status; container marked as unhealthy in docker ps output  
**Impact:** BCTC PDF extraction may be blocked or severely degraded; earnings report processing delayed  
**Root cause:** Likely event loop stall or resource exhaustion (correlates with A-20 multi-probe failure)  
**Zone owner:** dev-pdf-extractor  
**Last reported:** 2026-07-20T02:11:41Z (dedup 7d)  

---

## Anomaly: A-20 · pdf-extractor event-loop stall
**Severity:** WARN | **Date:** 2026-07-20 | **Status:** OPEN  
**Location:** pdf-extractor service (event loop / uvicorn)  
**Details:** In-container health probe failed 0/3 times (HTTP 000 = no response from event loop); host-side proxy ports unreachable from container namespace  
**Impact:** PDF extraction pipeline stalled; BCTC earnings reports cannot be processed or extracted  
**Root cause:** Uvicorn event loop wedged (wedged thread, resource exhaustion, or deadlock); requires container restart to recover  
**Zone owner:** dev-pdf-extractor  
**Last reported:** 2026-07-19T20:46:16Z (dedup 7d)  
**Mitigation:** Container restart may clear event loop stall; escalate to dev-pdf-extractor for investigation  

---
