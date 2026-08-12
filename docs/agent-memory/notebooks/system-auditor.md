# System Auditor Notebook

[Notebook initialized - Tier-2 audit cycle c46]

## c46 · 2026-08-12T08:00Z
### Audit Run Tier-2 (10:17–10:20 UTC 2026-08-12)
- Tier: 2 | Services: 13 checked | Sources: partial fetch | DB checks: 2
- Anomalies: 2 new (0 critical, 2 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED

**Key Findings:**
- A-30 memory creep: RAG service 92.79% (improved from 97.19%, fix deployed)
- B-05 BCTC stale: 20.7h since last push (expected off-season, no active queue)
- Pipeline/VPS service health endpoints unreachable (mcp-server partial outage)
- DB freshness: market_messages=2/3h, agent_signals=103/24h (PASS)
- Cron status: 90 layer_a crons, 8 unresolved-join (no fire-evidence)

**RAG Service Memory Detail:**
- Container: vn-market-intelligence-mcp-rag-service-1
- Usage: 950.1 MiB / 1 GiB (92.79%), free ~51.9 MiB
- Image: Created 2026-08-12T10:14:37Z (after fix commit 2026-08-12T06:16:02Z)
- Fix: malloc_trim + LanceDB IvfPq (commit 4c8c601e6)
- Verdict: WARN (above 85% threshold, but improving)

## c47 · 2026-08-12T10:30Z
### Audit Run Tier-1 (10:30–10:43 UTC 2026-08-12)
**Probe Status:** FAILURE (two findings from probe.sh)

### RAW-PROBE:
```
{
  "verdict": "FAILURE",
  "detail": "health_3000: http://localhost:3000/health -> HTTP CURL_ERR; mem_creep: mem >= 85% threshold (A-30 WARN boundary, mem-creep gate): vn-market-intelligence-mcp-rag-service-1(86.31%, 140.2MiB-free, STALE-ACK(tracked_by=FU-RAG-DEPLOY-MEMORY,status=DONE_VERIFIED)) ;",
  "last_healthy_at": "2026-08-11T19:32:31Z"
}
```

### Investigation Findings:

**Finding 1: health_3000 CURL_ERR — VERDICT: TRANSIENT/FALSE POSITIVE**
- Direct curl test to http://localhost:3000/health at 10:42Z: HTTP 200 OK
- Response: {"status":"ok","name":"vn-market","version":"1.0.0","toolCount":183,"sessions":19,"uptime":58600.98...}
- Container status: vn-market-intelligence-mcp-mcp-server-1 "Up 16 hours (healthy)"
- Health check logs: successful HTTP 200 responses across recent timestamps
- Conclusion: The probe's CURL_ERR was a transient condition. The endpoint is operational and healthy now.
- Root cause: likely a momentary network hiccup or probe timing issue, not a real outage

**Finding 2: mem_creep 86.31% on rag-service — VERDICT: REAL BUT RECOVERED**
- Probe timestamp (from c46 Tier-2 cycle): 2026-08-12T08:00–10:20Z → reported 92.79%
- Probe failure timestamp: unknown (before this Tier-1 cycle started), reported 86.31%
- Live check at 10:42Z: vn-market-intelligence-mcp-rag-service-1 memory usage = **3.34%** (34.24 MiB / 1 GiB)
- Container state: Started 2026-08-12T10:40:47.948Z (fresh restart ~2 minutes ago)
- Health status: "healthy" per docker ps output
- Health check logs: successful recent checks at 10:41:23Z, 10:41:53Z
- Stale-ACK label audit:
  - Probe claims task "FU-RAG-DEPLOY-MEMORY" with status="DONE_VERIFIED"
  - Current board state: FU-RAG-DEPLOY-MEMORY NOT FOUND in task_board (done_verified[], active_sprints[], backlog, etc.)
  - Dedup ledger shows 3rd recurrence: "microservice_degraded:rag-service:A-30:lancedb-undeployed-3rd-recurrence" at 2026-08-12T07:08:24Z
  - **Conclusion: STALE-ACK label is incorrect/outdated. The task is not in the board. The issue is REAL (3rd recurrence in dedup ledger) but was JUST resolved by a container restart**
- Timeline: ops appears to have initiated a container restart between 10:20Z (end of Tier-2 cycle) and 10:40:47Z (fresh start), bringing memory from 92.79% down to 3.34%
- Verdict: **REAL unresolved memory issue that recurred (3rd time), but has been operationally remediated by restart**

### A-30 Recurrence Context:
Per dedup ledger, rag-service A-30 findings span 2026-08-05 through today (2026-08-12):
- Multiple "mem_pressure", "memory_pressure", "microservice_degraded" entries
- Escalation pattern: floor-breach (06-08), loss-of-reclamation (06-07), BELOW-FLOOR (08-08), recurring-ceiling (08-08), lancedb-undeployed-3rd-recurrence (08-12)
- Most recent (today): "microservice_memory_leak:rag-service:escalating-post-restart-20260812" at 2026-08-12T02:22:10Z

### Findings Summary:
1. **health_3000**: No action required — transient curl issue, endpoint healthy
2. **mem_creep**: **Escalation needed** — recurring A-30 issue on rag-service (3rd recurrence per dedup); last fix did not hold; root cause remains unresolved (lancedb deployment state); recommend architectural review of rag-service memory architecture and lancedb configuration

## c48 · 2026-08-12T11:30Z
### Audit Run Tier-1 (11:33–11:35 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Health: all endpoints 200 OK
- Anomalies: 0 new signals emitted | Status: ALL_GREEN (per spec)
- Wall time: 2min

**Probe Results Summary:**
```
Containers: 13/13 UP (healthy) — A-01 to A-11 PASS
Health endpoints: 5/5 OK (HTTP 200) — A-12 PASS
pdf-extractor multi-probe: 3/3 in-container probes passed — A-20 PASS
Restart count: mcp-server RestartCount=0 — A-21 PASS
Disk usage: 49% (13Gi used, 14Gi free) — A-32 PASS
Hook enforcement liveness: all 4 load-bearing + 3 LOW-tier checks PASS — A-33 PASS
```

**A-30 Memory Pressure (Detailed Analysis):**

*Engaged Container: vn-market-intelligence-mcp-rag-service-1*
- Baseline at probe: 90.13% (1 GiB cgroup limit)
- Deep-probe window: 6 samples over 65 seconds (13-second intervals)
- Memory profile: FLAT (90.13% across all 6 probes, no sawtooth pattern)
- State during window: NO changes, NO OOMKilled, NO restarts
- VmHWM status: pinned at cap (1437 MB), but NOT advancing during window

*A-30 Verdict: FOLD (per probe.sh output)*
- Reason: "benign GC sawtooth or below tripwire"
- Escalation triggers NOT met:
  - min_pct=90.13% (< 93% floor) ✗
  - median_pct=90.13% (< 97% peak) ✗
  - reclamation_dips=0, discontinuities=0 ✗
  - VmHWM advancing=false (even though pinned at cap) ✗
- Per tier1-probe.md clause 4: verdict=="FOLD" → PASS, no emit

**Context & Regression Pattern Investigation:**

This audit follows c47 (Tier-1 at 10:30Z) which found the container at 3.34% (just post-restart at 10:40:47Z). In the 52 minutes since restart, memory has already climbed to 90.13%. Timeline:

- 08:00Z (c46 Tier-2): rag-service at 92.79%, above threshold
- 10:20Z: End of c46, still high
- 10:40:47Z: Container restarted (ops-initiated), memory → 3.34%
- 10:30–10:43Z (c47 Tier-1): Cycle probed the post-restart state, found recovery
- 11:33Z (this cycle, c48 Tier-1): Memory back at 90.13% (52 minutes of runtime)

**Assessment of Regression vs. Transient Blip:**

The fix deployed in c46 (malloc_trim + LanceDB IvfPq from commit 2026-08-12T06:16:02Z, TOKIO_WORKER_THREADS/LANCE_CPU_THREADS env pins from commit ca6d86869 merged 2026-08-12) has NOT resolved the underlying issue. Memory accumulation rate: ~90% per 50 minutes post-restart. This is NOT a transient blip — it's a SUSTAINED CLIMB with steady-state behavior (flat at 90.13% during the 65-second probe window).

**STALE-ACK Mismatch:**

The pre-gate probe.sh output in c47 claimed: `STALE-ACK(tracked_by=FU-RAG-DEPLOY-MEMORY,status=DONE_VERIFIED)`. Investigation revealed:
- FU-RAG-DEPLOY-MEMORY is NOT in the task_board
- The task label is STALE/INCORRECT
- The issue is REAL and RECURRING (3rd+ occurrence per dedup ledger)

**Per-Spec Compliance:**

Despite the concerning pattern, the A-30 verdict computed by probe.sh is FOLD. Per tier1-probe.md clause 4, FOLD→PASS means no signal is emitted this cycle. The documented tripwires (>93% min, >97% median, state changes, OOMKilled, VmHWM advancing+pinned) are NOT met. The flat 90.13% profile and lack of reclamation dips place this at the boundary of the detection thresholds.

**Recommendation:**

While this cycle's Tier-1 audit completes without escalation (per spec), the regression pattern is clear: the memory issue is not solved by the deployed fix, and the STALE-ACK label is dangling. This warrants investigation into:
1. Whether the container memory limits (1 GiB cgroup) are appropriate for rag-service workload
2. Why memory climbs so rapidly post-restart (90% in 50 minutes = ~900 MiB per hour accumulation)
3. Whether the fix's env vars and malloc_trim are actually being applied
4. The discrepancy between VmHWM=1437 MB and cgroup limit=1024 MB

## c49 · 2026-08-12T12:03Z
### Audit Run Tier-1 (12:03–12:06 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Health: all endpoints 200 OK
- Anomalies: 0 new signals emitted | Status: ALL_GREEN (per spec)
- Wall time: 3min

**Probe Results Summary (RAW-PROBE at 12:03:46Z):**
```
Containers: 13/13 UP (healthy) — A-01 to A-11 PASS
Health endpoints: 5/5 OK (HTTP 200) — A-12 PASS
pdf-extractor multi-probe: 3/3 in-container probes passed — A-20 PASS
Restart count: mcp-server RestartCount=0 — A-21 PASS
Disk usage: 49% (13Gi used, 14Gi free) — A-32 PASS
Hook enforcement liveness: all 4 load-bearing + 3 LOW-tier checks PASS — A-33 PASS
```

**A-30 Memory Pressure (Detailed Analysis):**

*Engaged Container: vn-market-intelligence-mcp-rag-service-1*
- Baseline at probe: 90.81% (1 GiB cgroup limit)
- Deep-probe window: 6 samples over 65 seconds (13-second intervals)
- Memory profile: FLAT (90.81% across all 6 probes, zero variation)
- State during window: NO changes, NO OOMKilled, NO restarts
- VmHWM status: pinned at cap (1437 MB), but NOT advancing during window

*A-30 Verdict: FOLD (per probe.sh output)*
- Reason: "benign GC sawtooth or below tripwire"
- Escalation triggers NOT met:
  - min_pct=90.81% (< 93% floor, no CRITICAL threshold) ✗
  - median_pct=90.81% (< 97% peak) ✗
  - reclamation_dips=0, discontinuities=0 ✗
  - VmHWM advancing=false (even though pinned at cap) ✗
- Per tier1-probe.md clause 4: verdict=="FOLD" → PASS, no emit

**CRITICAL FINDING: STALE-ACK Annotation Mismatch**

The pre-gate probe.sh reported:
```
STALE-ACK(tracked_by=FU-RAG-DEPLOY-MEMORY,status=DONE_VERIFIED)
```

Investigation reveals:
- FU-RAG-DEPLOY-MEMORY task ID does NOT exist in current orch-state.json task_board
- The STALE-ACK annotation is OUTDATED/INCORRECT
- Real dedup ledger tracking shows: "microservice_degraded:rag-service:A-30:recurring-unresolved" (ts=2026-08-12T10:43:38Z, severity=WARN)
- Prior entry: "microservice_degraded:rag-service:A-30:lancedb-undeployed-3rd-recurrence" (ts=2026-08-12T07:08:24Z, severity=CRITICAL)

The original task was OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX (commit 4c8c601e6, 2026-08-12T06:16:02Z, malloc_trim + LanceDB IvfPq fix + TOKIO/LANCE thread pinning commit ca6d86869). This task's AC-3 (acceptance criteria for sustained memory improvement) FAILED and was reassigned to dev-rag-service for root-cause code-level fix.

**Regression Pattern:**
- 08:00Z (c46 Tier-2): rag-service at 92.79%
- 10:30–10:43Z (c47 Tier-1): Post-restart at 3.34%, recovered
- 11:33Z (c48 Tier-1): Memory back at 90.13% (52 minutes post-restart)
- 12:03Z (this cycle, c49 Tier-1): Memory at 90.81% (~82 minutes post-restart)

Memory accumulation rate: ~90% per 50-82 minutes post-restart. This is a SUSTAINED, STABLE ceiling at ~90%, not a transient blip. The deployed fixes have NOT resolved the underlying leak/creep. However, the stability (flat profile, no OOMKilled, no discontinuities) means the A-30 discriminator correctly classifies this as FOLD/PASS per the documented thresholds.

**Compliance Note:**

This cycle's A-30 verdict is FOLD per spec (no escalation triggers met). However, the pre-gate's STALE-ACK annotation contradicts observable board state (FU-RAG-DEPLOY-MEMORY does not exist). Per AUD-CP-1 (CALLER-INSTRUCTION PRECEDENCE), the spec-based verdict takes precedence; this is documented here as a CONTRACT-CONTRADICTION for auditing purposes.

**Recommendation for ops/dev:**

The rag-service memory issue is REAL (recurring 3rd+ time per dedup ledger) but STABLE in this cycle (FOLD verdict). The STALE-ACK label should be corrected/removed from pre-gate tracking to reflect current board state. The underlying memory accumulation pattern (90% per hour post-restart) remains unresolved and warrants continued investigation into:
1. Actual fix deployment status (env vars, malloc_trim application)
2. VmHWM/memory limit calibration (VmHWM 1437 MB > cgroup limit 1024 MB)
3. LanceDB configuration (IvfPq tuning, thread pool sizing)
