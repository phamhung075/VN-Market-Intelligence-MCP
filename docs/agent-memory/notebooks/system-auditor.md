# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## 8f2a9d3 · 2026-07-22T00:31:12Z
### Audit Run Tier-3 (00:31–00:35 UTC 2026-07-22)
- Tier: 3 | Tier-1 + Doc/Memory + Tier-3 DB checks
- Tier-1: 12 services UP | Health: mcp-server CURL_ERR (A-12 CRIT) | A-30 memory 98.92% (dedup) | A-20 3/3 PASS
- A-22..28: tooling + inter-service all PASS | A-31 EPIPE: 0
- Doc/Memory: MEMORY.md MISSING (DOC-AUDIT WARN) | CLAUDE.md 62L OK | sprint_goal 15 entries (at limit)
- Tier-3 DB: C-01 416 PASS | C-02 416 PASS | C-03 45 PASS | C-04 11 low-conf (dedup) | C-05 0 PASS
- C-06 0 msgs 3h (dedup) | C-07 273 PASS | C-08 0 orphan PASS | C-09 3 macro PASS | C-10 0 PDF fail PASS
- C-11 0 PDF done (off-season OK) | C-12 integrity ok PASS | C-13 WAL 3.9MB PASS | C-14 0.7% PASS
- C-15 schema PASS | C-16 0 stale PASS | B-08 272 PDFs | WAL: market 4.1MB, pdf 0
- Anomalies: 2 new (A-12 CRIT, DOC-AUDIT WARN) | 2 dedup-skipped (A-30, C-04, C-06) | Status: DEGRADED

## 4ae45b71 · 2026-07-21T23:42:05Z
### Audit Run Tier-1 (23:42–23:43 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 96.02% (GC sawtooth, RAW-VERIFY benign, FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE)
- A-32 Disk: 26% PASS | Cron health: All jobs nominal
- Anomalies: 0 new | 1 RAW-VERIFY benign (A-30 memory, not emitted) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T23:42:05Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)   vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        8 hours ago
mcp-gateway                                       Up 6 days (healthy)    mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)    vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)    vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)    vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)    vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)    vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)    vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=96.02% MemUsage=2.881GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    38Gi    26%    393k  402M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### A-30 RAW-VERIFY Gate Analysis:
```
[A-30-RAW-VERIFY] VERDICT: BENIGN

Evidence:
- OOMKilled=false (no process termination)
- Memory range: 2.882-2.962 GiB (96.02-98.73% of 3GiB limit)
- Sawtooth pattern: spikes (2.962GiB) → dips (2.883GiB) → repeats
- GC reclamation dips present across observation window
- Oscillating in baseline band (94-97%)

Classification: BENIGN — Normal JIT/GC behavior
Action: No signal emitted (FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE)
Dedup note: existing sys-20260721T231131-1585 not duplicated
```

## 7a3b2f4 · 2026-07-21T22:40:46Z
### Audit Run Tier-1 (22:40–22:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 91.97% (GC sawtooth, dedup applies)
- A-32 Disk: 26% PASS | Cron health: All jobs nominal (100% success rate)
- Anomalies: 0 new | 1 dedup-skipped (A-30 mem) | Status: HEALTHY

## 0dd94b3 · 2026-07-21T22:32:54Z
### Audit Run Tier-2 (22:31–22:32 UTC 2026-07-21)
- Tier: 2 | Sources: 7 checked | Cron: 98 jobs nominal, 0 gaps | VPS: news OK, sbv/bctc off-hours idle
- DB: market_messages 3h=1 PASS, agent_signals 24h=402 PASS | BCTC: 183 pending (healthy for off-hours)
- Rate limits: 14 APIs at 0% capacity | Anomalies: 0 new (DEGRADED→HEALTHY recovery) | Status: HEALTHY
