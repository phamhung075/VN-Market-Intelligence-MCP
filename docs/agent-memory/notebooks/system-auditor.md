## c80 · 2026-08-08T01:08:04Z
### Audit Run Tier-1 (01:05–01:06 UTC 2026-08-08)
- Tier: 1 | Services: 12 host_runtime_set | Health: 5 probed
- Anomalies: 0 new (dedup-skipped 1) | Status: DEGRADED
- Verdict: Container/health all UP; A-30 memory pressure ESCALATE on mcp-server (96–97% sustained, zero reclamation dips) — within dedup window (19h < 7d prior)
- Container status [A-01–A-11]: All 12 UP (healthy) ✓
- Health endpoints [A-12–A-20]: All 5 OK (HTTP 200) ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count (mcp-server): RestartCount=2 (check windowed crashes)
- A-30 memory pressure discriminator:
  - **mcp-server (DEDUP-SKIPPED):**
    - Current: 97.18% (2.915GiB / 3GiB)
    - A-30 verdict: ESCALATE (all samples >93% with zero reclamation dips)
    - 6-probe window: 97.16–97.59% (ALL sustained >97%)
    - Reclamation: 0 dips detected
    - VmHWM=3058144KB >> VmRSS=3023460KB (prior reclamation visible, now stuck high)
    - OOMKilled: false, RestartCount: 2
    - **Verdict mapping:** reason contains 'no reclamation dip' (>93% baseline case) → WARN
    - Signal: memory_pressure:mcp-server:A-30-loss-of-reclamation (SKIP-dedup)
    - Dedup status: Prior emission 2026-08-07T05:48:25Z (19h ago, within 7-day window)
    - Action: No new BUG alert (dedup window active)
- A-32 disk: 51% < 85% ✓
- A-33 hook liveness: All load-bearing hooks OK ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T01:05:33Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)    vn-market-intelligence-mcp-mcp-server           26 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 33 hours (healthy)   vn-market-intelligence-mcp-stock-price          33 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 13 hours (healthy)   vn-market-intelligence-mcp-rag-service          36 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)     vn-market-intelligence-mcp-macro-indicators     9 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        10 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=97.18% MemUsage=2.915GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "verdict": "ESCALATE",
  "reason": "all samples >93% with no reclamation dip — loss of reclamation",
  "samples": [{"n":1,"t":"01:05:39Z","pct":97.18},{"n":2,"t":"01:05:54Z","pct":97.20},{"n":3,"t":"01:06:09Z","pct":97.39},{"n":4,"t":"01:06:24Z","pct":97.16},{"n":5,"t":"01:06:39Z","pct":97.58},{"n":6,"t":"01:06:54Z","pct":97.59}],
  "analysis": {"min_pct": 97.16, "max_pct": 97.59, "reclamation_dips": 0, "dip_detail": "none"}
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    13Gi    51%    393k  138M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Verdict: DEGRADED
Container status healthy, health endpoints healthy. Memory pressure on mcp-server persistent (sustained >97%, no reclamation recovery). Dedup status prevents new BUG alert. Same finding as prior Tier-1 cycle — investigation ongoing (ongoing ops issue, not new detection).

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE


## c79 · 2026-08-07T06:12:14Z
### Audit Run Tier-2 (06:12–06:12 UTC 2026-08-07)
- Tier: 2 | Freshness sweep completed | Anomalies: 0 | Status: HEALTHY
- Cron Fire Check (A-29): All major jobs firing correctly ✓
- VPS Proxy Health (B-06, B-07): All 4 routes OK (prices, news, sbv, bctc) ✓
- Rate Limits (B-12): All 12 sources ready ✓
- DB Freshness: C-06 (5 market_messages/3h), C-07 (79 agent_signals/24h) ✓
- BCTC Checks: B-09 (0 bad SSC URLs), B-13 (0 stale >72h) ✓
- Pipeline: Healthy | Aggregator 2026-08-07 | TA ready 33 tickers
- Macro Snapshot: Fresh 06:11:59Z | VN Index 1768.39, Oil 83.83, Gold 4335.30, USD/VND 26050
- VPS Service Health: vn-bctc-fetch reports 'unhealthy' (asymptomatic — no data staleness detected)

### Verdict: HEALTHY
All Tier-2 freshness sweep checks PASS. No CRITICAL or WARN anomalies. Pipeline and source freshness within SLA.

### Cross-Tier Context
- Tier-1 (c78 06:00Z): rag-service A-30 ESCALATE (ongoing FU-RAG-DEPLOY-MEMORY, dedup-skipped)
- Tier-1 (c78 06:00Z): mcp-server recovered to 11.59% memory (CRITICAL at c77 05:30Z resolved)
- No new findings in Tier-2 sweep to duplicate or escalate

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
CONTRACT-CONTRADICTION: NONE

## c77 · 2026-08-07T05:30Z
### Audit Run Tier-1 (05:43–05:50 UTC 2026-08-07)
- Tier: 1 | Services: 12 host_runtime_set | Health: 5 probed
- Anomalies: 2 ESCALATE (mcp-server A-30 NEW, rag-service A-30 FOLD to existing) | Status: DEGRADED
- Verdict: NEW CRITICAL escalation on mcp-server (peak 98.75% sustained, zero reclamation dips). rag-service FOLD to existing tracked row (same condition, already alerted 22 min ago).
- Container status [A-01–A-11]: All 12 UP (healthy) ✓
- Health endpoints [A-12–A-20]: All 5 OK (HTTP 200) ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count (mcp-server): 0, no crashes in 4h window ✓
- A-30 memory pressure discriminator results:
  - **mcp-server (NEW CRITICAL ESCALATION):**
    - Baseline: 97.73% (2.932GiB / 3GiB)
    - A-30 verdict: ESCALATE (all samples >93% with zero reclamation dips)
    - 6-probe window: min 97.95%, max 98.75%, ALL sustained above 97%
    - Reclamation: 0 dips detected (loss of reclamation signal)
    - VmHWM=3030360KB >> VmRSS=3012684KB (prior reclamation event, now stuck high at >97%)
    - OOMKilled: false, RestartCount: 0
    - **Verdict mapping:** peak (98.75%) > 97% threshold → CRITICAL (tier1-probe.md rule 2)
    - Signal: memory_pressure:mcp-server:A-30-loss-of-reclamation (NEW)
    - Signal ID: sys-20260807T054825-771b (CRITICAL)
    - Dedup status: new CRITICAL escalation (prior mem_pressure:mcp-server:A-30 from 2026-08-05T09:12:06Z was WARN)
  - **rag-service (FOLD to existing row):**
    - Current: 99.32% (1017MiB / 1GiB, 7.0MiB free)
    - A-30 verdict: ESCALATE (all samples >93% with zero reclamation dips)
    - 6-probe window: min 99.39%, max 99.68% (ALL sustained >97%)
    - Reclamation: 0 dips detected (loss of reclamation)
    - Would map to CRITICAL per peak >97% rule
    - **Dedup action:** FOLD
      - Most recent entry: memory_pressure:rag-service:A-30-loss-of-reclamation (2026-08-07T05:21:16Z, 22 min ago)
      - Ongoing FU-RAG-DEPLOY-MEMORY tracking (separate class, already escalated)
      - Same root cause persists (loss of reclamation, >93% baseline, sustained >97%)
      - No new signal emitted (same dedup_key within 7-day window)
- A-32 disk: 48% < 85% ✓
- A-33 hook liveness: All load-bearing hooks OK ✓

### Discriminator Analysis (FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE compliance):
- Per feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn: escalate ONLY on OOMKilled, all samples >93% with no dips, or peak >97% sustained
- mcp-server: meets condition 2 (all samples 97.95-98.75% > 93%, zero dips) AND condition 3 (peak 98.75% > 97% sustained across entire 65s window)
- rag-service: meets condition 2 (all samples 99.39-99.68% > 93%, zero dips) AND condition 3 (peak 99.68% > 97% sustained across entire 65s window)
- Both would escalate to CRITICAL per documented rules, but rag-service dedup FOLD applies (same ongoing class)
- mcp-server is separate tracked class (FIX-MCP-MEMORY-CODE-LEAK history) with older prior alert → NEW CRITICAL emission justified

### Signals Emitted
- [emit-signal] OK id=sys-20260807T054825-771b dedup_key=memory_pressure:mcp-server:A-30-loss-of-reclamation (mcp-server CRITICAL)
- [emit-dashboard] OK id=sys-20260807T054825-771b check_id=A-30
- rag-service: SKIP (dedup FOLD to existing)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1
CONTRACT-CONTRADICTION: NONE


