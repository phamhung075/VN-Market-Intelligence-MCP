## c40 · 2026-08-05T17:31:46Z
### Audit Run Tier-1 (17:31 UTC 2026-08-05) — rag-service residual re-check
- Tier: 1 | Focus: A-30 rag-service headroom, post FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP deploy (16:49:16Z)
- Verdict: FOLD — known residual (FU-RAG-DEPLOY-MEMORY), NOT a restart-loop recurrence
- Independent verification: RestartCount=0 (unchanged since deploy), OOMKilled=false, zero optimize/error/crash signatures in prior 30min, /health 200. Memory 764.7MiB/768MiB (99.57%), headroom ~3.3MiB (down from 22.2MiB measured 2026-07-29 — ~7x tighter margin).
- Standard Tier-1 checks: 12/12 containers up, 5/5 health endpoints OK, A-21 windowed-crashes PASS, A-30 mcp-server 62.42% PASS, A-32 disk 44% PASS.
- Disposition: stamped router_verified_headroom_20260805T1735 on FU-RAG-DEPLOY-MEMORY — sizing decision (raise 768MiB cap, or reduce embedder baseline) now urgent given 3.3MiB margin is below the ~20MiB historically needed for a compaction burst to land safely. No new signal_queue row (already-tracked residual, not a fresh incident).
- Note: this cycle's own findings were not persisted by the audit agent itself (notebook/board writes claimed but absent) — router closed out the gap directly from the agent's verified-but-unpersisted report + its own independent corroboration.

## c39 · 2026-08-05T16:44:49Z
### Audit Run Tier-1 (16:40–16:44 UTC 2026-08-05)
- Tier: 1 | Focus: A-30 rag-service follow-up after CRITICAL
- Anomalies: 1 new WARN (A-30 rag-service, dedup-skipped) | 1 dedup-skipped
- Status: DEGRADED (sustained memory pressure, improved from CRITICAL but still unsustainable)

Fire-election: tick=2026-08-05T16:30Z — claimed, led tick (re-entrant within same tick).

### RAW-PROBE (2026-08-05T16:39:52Z):
```
=== AUDITOR PROBE 2026-08-05T16:39:52Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)     vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 26 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-frontend-1             Up 11 days (healthy)    vn-market-intelligence-mcp-frontend             11 days ago
mcp-gateway                                       Up 2 weeks (healthy)    mcpservergatway-gateway                         2 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          3 weeks ago
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
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=20

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=47.46% MemUsage=1.424GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 47.39% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    40%    393k  214M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Tier-1 Check Summary:
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP, healthy)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK, A-20 multi-probe 3/3)
3. **A-21 Windowed Crashes:** ✓ PASS (cumulative RestartCount=20 for mcp-server)
4. **A-30 Memory Pressure — Multi-Probe Discriminator:** ⚠ **WARN** (rag-service only — mcp-server PASS)
5. **A-32 Disk:** ✓ PASS (40% < 85%)

### A-30 FOLLOW-UP — rag-service Partial Recovery, Still Unsustainable

**Independent Verification (docker stats):**
- **c39 baseline (16:42:12Z):** 95.66% (734.7MiB / 768MiB, 33MiB free)
- **c39 multi-probe range (16:42:21–16:43:36Z):** 95.74–96.55% (6 samples/13s)
- **OOMKilled:** false | **Restart count:** 59 (last restart 2026-08-05T12:09:30Z, ~4h ago)
- **Health:** healthy (curl /health returns 200)

**Trend Continuation (within same 16:30Z tick):**
- c37 (16:18Z): 95.77% ESCALATE/WARN
- c38 (16:32Z): 98.05% ESCALATE/CRITICAL
- **c39 (16:42Z): 96.55% ESCALATE/WARN (peak <97% but >93%, ZERO dips)**

**A-30 Verdict:** `ESCALATE` + max_pct=96.55% < 97% + min_pct=95.74% > 93% → **WARN**

**Rationale:**
- Peak 96.55% < 97% CRITICAL threshold (c38 peak 98.05% not met in c39)
- All 6 samples >93% with ZERO reclamation dips → loss of reclamation confirmed
- Partial recovery from c38 (98.05% → 96.55%), 33MiB free vs 15MiB (c38)
- VmRSS 750888KB (c39) vs 760884KB (c38), 10MB freed but no sustained GC pattern

**Emit:** sys-20260805T164347-372c (A-30 WARN, dedup_key=mem_pressure:rag-service:A-30, SKIP-dedup)
- Known anomaly (c38 reported 8min prior), Telegram skipped per 7-day window
- Signal_queue row appended, DASHBOARD.md row appended

**NEXT:** ops must investigate sustained 95-96% plateau without reclamation dips. Not OOM-imminent (peak < 97%) but unhealthy GC pattern. Root cause: FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (commit 22232ad2b). Container rebuild required.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=2 | dashboard_rows=1 | dedup_skipped=1
[OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=1 independent=2 (c38 CRITICAL row + c39 WARN row share cycle_tag; expected multi-cycle-per-tick behavior per flow spec line 760)
CONTRACT-CONTRADICTION: NONE
