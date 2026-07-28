## c9k7w2l4 · 2026-07-28T13:44:56Z
### Audit Run Tier-1 Freshness Investigation (13:44 UTC 2026-07-28)
- Tier: 1 + Tier-2 Freshness Deep-Dive (unscheduled focus on SLA breaches)
- Tier-1 Probe: All services UP (13/13) ✓ | All health endpoints 200 OK (5/5) ✓
- pdf-extractor mem: 85.54% (continuation from 12:45Z, plateau confirmed) | rag-service mem: ~1h post-restart (12:21:47Z)
- **INVESTIGATION: Two Data-Freshness SLA Breaches (CRITICAL + HIGH)**

#### FINDING-1: sbv_fx (macro_indicators) CRITICAL Breach
- Age: 91 minutes | SLA threshold: 30 min | Status: **CRITICAL BREACH**
- Database last update: 2026-07-28T12:13:01Z (91 min stale)
- VPS layer: Fetching actively (last push 13:26:32Z) but **returning zero-values**
- Log evidence: "[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row" (timestamps 12:56:31Z, 13:26:32Z)
- Rejected zero-columns: overnight_rate_pct, refinancing_rate_pct, max_deposit_rate_pct, max_lending_rate_pct
- Prior valid row: {overnight_rate_pct:3, refinancing_rate_pct:4.5, max_deposit_rate_pct:5, max_lending_rate_pct:12, usd_vnd_official:26145}
- **Verdict:** (b) Genuine fetch stall — not a config/SLA-mismatch defect. Root cause: **SBV data source returning malformed data (zero-values)**. The SLA (30 min) is reasonable for macro data; the pipeline is correctly rejecting corrupt writes. Data integrity gate is working; upstream source quality is degraded.

#### FINDING-2: news (market_messages) CRITICAL Breach
- Age: 389 minutes (6h 29m) | SLA threshold: 30 min | Status: **CRITICAL BREACH**
- Database last update: 2026-07-28T07:15:02Z (389 min stale) — pre-market window
- VPS layer: Fetching actively (last push 13:34:12Z, 10 min ago) — **zero inserts despite fetches**
- Log evidence (13:34 cycle): "[push-news] fetched":61, "inserted":0, "duplicates":60 — ALL news detected as duplicates, none entering DB
- Pattern across all recent cycles (since ~07:15Z): 100% duplicate-rate, zero new inserts
- **Verdict:** (b) Genuine pipeline stall — not a config defect. Root cause: **news deduplication logic broken or news API genuinely delivering all-duplicate articles**. Two-layer disconnect: VPS successfully receiving news → mcp-server deduplication layer rejecting 100% as duplicates → zero storage. Requires investigation into (a) duplicate-detection algorithm or (b) news source behavior.

#### Two-Layer Fetch Architecture Confirmed
- Layer 1 (VPS Proxy Fetch): HEALTHY — news/sbv data arriving on schedule
- Layer 2 (Database Storage): BROKEN — data not reaching DB due to (sbv: data quality validation, news: deduplication overreach)

#### Timing Correlation (rag-service restart 12:21:47Z)
- sbv last DB write: 12:13:01Z (8 min BEFORE restart)
- news last DB write: 07:15:02Z (5+ hours BEFORE restart)
- rag-service restart appears **coincidental, not causal** — sbv/news staleness predates or is independent of restart

#### Note: foreign_flow Approaching Threshold
- Age: 283 min | SLA: 313 min | Status: OK but close (headroom ~30 min)
- No action needed; monitor next cycle

#### Note: cycle_snapshot_promoted = false (22+ days)
- Known tracked epic TASK-COWORK-CATCHUP-1..10; not re-minting

#### Anomalies: 2 CRITICAL (sbv_fx pipeline, news pipeline)
- Status: **CRITICAL** (two data-freshness failures affecting market analysis)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-28T13:42:02Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 days (healthy)          vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)          vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 hours (healthy)         vn-market-intelligence-mcp-pdf-extractor        6 days ago
mcp-gateway                                       Up 12 days (healthy)         mcpservergatway-gateway                         12 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)         vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 12 days (healthy)         ghcr.io/flaresolverr/flaresolverr:latest        12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)         vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)         vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 12 days (healthy)         vn-market-intelligence-mcp-technical-analysis   12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)         vn-market-intelligence-mcp-alert-engine         12 days ago
vn-market-intelligence-mcp-stock-price-1          Up 12 days (healthy)         vn-market-intelligence-mcp-stock-price          12 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 12 days (healthy)         vn-market-intelligence-mcp-kinh-dich-service    12 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=75.77% MemUsage=2.273GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 75.78% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  270M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c8v5x2m7 · 2026-07-28T13:12:27Z
### Audit Run Tier-1 (13:07 UTC 2026-07-28) — Memory Pressure Continuation
- Tier: 1 | Services: 13 checked | Health: 5 endpoints
- A-01–A-11: ALL UP (13/13) ✓ | A-12–A-19: ALL 200 OK (5/5) ✓
- A-20 pdf-extractor: 3/3 PASS ✓ | A-21 restarts: 0 (4h) ✓ | A-32 disk: 35% ✓
- A-30 mcp-server: 69.58% (< 85% gate, SKIP deep-probe) ✓
- **FINDINGS:** pdf-extractor 85.54% (same as 12:45Z, plateau confirmed). rag-service 88.32% post-restart (restarted 12:21Z from 99.10%, RestartCount=15). Both WARN signals emitted (ids: sys-20260728T131219-3fca, sys-20260728T131227-5964).
- Anomalies: 2 memory pressure events (both continuation/monitoring)
- Status: DEGRADED

### RAW-PROBE:
[PROBE 2026-07-28T13:07:55Z]: All services UP, all health endpoints 200 OK, mcp-server mem 69.58%, disk 35%, pdf-extractor multi-probe 3/3, restarts=0 in 4h window.
