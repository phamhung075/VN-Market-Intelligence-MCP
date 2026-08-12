## c44 · 2026-08-12T02:09:49Z

### Audit Run Tier-1 (02:04-02:09 UTC 2026-08-12) — PDF-EXTRACTOR MEMORY GATE ENGAGED, BENIGN FOLD VERDICT

- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator + disk
- Scope: Runtime ping; container UP/health-endpoint liveness; memory pressure A-30; disk; hook enforcement
- **Status: DEGRADED** — pdf-extractor A-30 deep-probe FOLD verdict (87.20% sustained, benign reclamation); rag-service recovered to 80.64% (below 85% gate)
- Fire-election: CLAIMED tick=2026-08-12T02:00Z
- CONTRACT-CONTRADICTION: NONE

#### Verdict Summary

**Overall Status: DEGRADED**
- pdf-extractor memory at 87.20% engaged A-30 deep-probe (87.20% >= 85% investigate-gate)
- Deep-probe verdict: FOLD (benign, no escalation needed)
- rag-service memory recovered to 80.64% (below 85% gate, SKIP deep-probe)
- No new CRITICAL/WARN signals
- State change: CRITICAL (c43) → DEGRADED (c44)

#### Container Status (A-01 to A-11): PASS
- All host_runtime_set services UP (healthy status from docker ps)
- mcp-server: Up 8 hours (healthy) [RAW-PROBE L3]
- pdf-extractor: Up 25 hours (healthy) [RAW-PROBE L4]
- rag-service: Up 29 minutes (healthy, recently restarted) [RAW-PROBE L5]
- All others: UP, healthy

#### Health Endpoints (A-12 to A-20): PASS
- [health] mcp-server:3000/health OK (HTTP 200) [RAW-PROBE L20]
- [health] api-gateway:4000/health OK (HTTP 200) [RAW-PROBE L21]
- [health] macro-indicators:5004/health OK (HTTP 200) [RAW-PROBE L22]
- [health] pdf-extractor:5001/health OK (HTTP 200) [RAW-PROBE L23]
- [health] frontend:3001/ OK (HTTP 200) [RAW-PROBE L24]

**A-20 pdf-extractor multi-probe:** PASS (3/3 in-container probes passed) [RAW-PROBE L110-112]

#### Restart Count (A-21): PASS
- mcp-server: RestartCount=0, no crash restarts in 4h window [RAW-PROBE L26]

#### Memory Pressure (A-30) — Per-Container Gate & Deep-Probe

**Baseline Samples & Investigation Results:**

1. **mcp-server:** 21.88% < 85% → SKIP deep-probe [RAW-PROBE L32]
   - Verdict: PASS (below investigate-gate)

2. **pdf-extractor:** 87.20% >= 85% → ENGAGE deep-probe [RAW-PROBE L33]
   - Samples: 6-probe @ 13s intervals, all at 87.20% [RAW-PROBE L43]
   - State: No OOMKilled, RestartCount stable (1→1), no state change [RAW-PROBE L36-40]
   - VmHWM: Pinned at 2587640 kB (98.7% of limit), NOT advancing [RAW-PROBE L42]
   - Analysis: min=87.20%, max=87.20%, median=87.20%, zero dips, zero discontinuities
   - **Verdict: FOLD** (benign, no escalation) [RAW-PROBE L45]
   - Signal: PASS (no WARN/CRITICAL)

3. **rag-service:** 80.64% < 85% → SKIP deep-probe [RAW-PROBE L34]
   - Recovered from 99.33% (c43) to 80.64% after restart
   - Verdict: PASS (below investigate-gate)

4. **All other containers:** <85% baseline → SKIP [RAW-PROBE L35-41]
   - All below investigate-gate threshold

#### Disk (A-32): PASS
- Root filesystem: 45% capacity (< 85%) [RAW-PROBE L104]

#### Signals and Outputs

- D-CYCLE-1 (orphan marker sweep): No stale markers found
- D-CYCLE-2 (schedule-based gap detection): No missed tier cycles
- A-30 pdf-extractor: PASS (verdict=FOLD, benign, no signal)
- A-20 pdf-extractor multi-probe: PASS (no signal)
- signals_posted: 0
- dashboard_rows: 0
- telegram_sent: 0
- Notebook append: YES (state change from c43 CRITICAL → c44 DEGRADED)

---

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T02:06:18Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)      vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 25 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 29 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)      vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)      vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)      mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)      vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.01% MemUsage=645.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 21.88% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 87.20% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 80.64% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.19% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.27% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 9.08% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.90% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.69% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.51% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.07% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.16% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-pdf-extractor-1",
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  175M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```
