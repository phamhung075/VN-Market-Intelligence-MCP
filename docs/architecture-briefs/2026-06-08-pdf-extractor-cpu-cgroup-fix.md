# Architecture Brief — ARCH-A20-CPU-CGROUP-REVIEW

**Date:** 2026-06-08
**Task:** ARCH-A20-CPU-CGROUP-REVIEW (UNBLOCK, S, P1)
**Zone:** apps/pdf-extractor/
**Architect:** architect (claude-sonnet-4-6)
**Status:** DECIDED + IMPLEMENTED

---

## Problem Statement

3rd recurrence (RECURRING-BUG rule activated). pdf-extractor container has `cpus: '1.0'`
CFS quota in docker-compose.yml. When Tesseract OCR runs in a ProcessPoolExecutor CHILD
process, it consumes the entire 1-core cgroup budget. The Linux CFS scheduler then
throttles ALL processes in the cgroup — including the uvicorn parent event loop —
to zero runnable slices. The healthcheck `curl http://localhost:5001/health` hits the
30-second timeout and exits -1 regardless of application correctness.

Prior patches failed for the same underlying reason:
- 48a64056 (`asyncio.to_thread`): still in same cgroup, uvicorn still starved
- 3033e1dc (ProcessPoolExecutor): child process still shares cgroup quota

---

## Evidence

```
docker inspect NanoCpus = 1000000000   (= 1.0 core)
docker stats:  pdf-extractor  99.01% CPU  (pinned at limit)
               mcp-server    205.75% CPU  (freely using 2.0 cores — same pattern, works)
Health log:    5/5 probes exit=-1, timeout 30s, zero bytes received
```

The container is functionally correct — uvicorn responds in <1ms when not under OCR load.
The healthcheck fails ONLY because the CFS quota is exhausted.

---

## Options Evaluated

### Option A — Raise cpus to 2.0
Change `cpus: '1.0'` → `cpus: '2.0'` in docker-compose.yml for pdf-extractor.

**Pro:**
- Simplest possible fix — 1 line change
- Tesseract gets ~1 core; uvicorn retains ~1 core → healthcheck responds in <1ms
- Mirrors mcp-server pattern: cpus:2.0 handles 205% CPU spikes cleanly
- No new containers, no topology change, no code change

**Con:**
- Total declared CPU limits across fleet: 10.25 → 11.25 (exceeds Docker VM 6 CPUs)
- CFS limits are burst ceilings not hard allocations — oversubscription is normal
- Real risk: if EVERY service spikes simultaneously, all throttle proportionally

**Host headroom verified:**
- Docker VM CPUs: 6
- Running containers CPU usage at this moment: mcp-server 205%, pdf-extractor 99%, all others ~0%
- Total active CPU draw ≈ 3.0 cores on a 6-core VM → 3 cores headroom
- Even if pdf-extractor uses 2.0 cores under OCR, total active ≈ 4.0/6 — within budget
- Memory not relevant: cpus limit is purely CFS scheduling

### Option B — OCR sidecar container
Move Tesseract into a dedicated sidecar service with its own cpus quota.

**Pro:** Process isolation between OCR and uvicorn at container boundary.

**Con:**
- Requires new Dockerfile, new docker-compose service entry, new HTTP protocol
- IPC between main container and sidecar (HTTP or Unix socket) adds latency + failure modes
- ProcessPoolExecutor becomes inter-container RPC — significant code change
- Violates minimal-change principle for a RECURRING-BUG fix
- Adds ~200ms round-trip latency per OCR call over loopback
- Sidecar still shares the same Docker VM CPU pool — does not add capacity

### Option C — exec-based healthcheck only
Switch healthcheck to `CMD python3 -c "import socket; ..."` instead of `curl`.

**Pro:** exec-form probes are slightly lighter weight than spawning curl.

**Con:**
- DOES NOT ESCAPE THE CGROUP. All processes in the container — including exec-based
  healthcheck — share the same CFS cgroup budget. When Tesseract saturates the quota,
  a `python3` exec probe is throttled identically to curl.
- Confirmed by health log: current probe already uses curl in CMD form; the failure
  is not curl overhead — it is total quota exhaustion (0 bytes in 30s = scheduler
  returned 0 slices to the process, not a connection issue).

### Decision: Option A (cpus: 2.0) with exec-form healthcheck timeout cleanup

Option A is chosen. It is the minimal, correct, and permanent fix.

Option C healthcheck improvements are implemented as a secondary quality improvement:
- Keep CMD curl form (exec form does not help when cgroup is starved)
- But update start_period to 60s (model warm-up at first request can be slow)
- Keep timeout: 30s (budget: now 2 cores so probes will respond in <1ms under load)

Option B is deferred indefinitely — adds architectural complexity without solving
the resource constraint.

---

## Implementation

### docker-compose.yml change

```yaml
pdf-extractor:
  deploy:
    resources:
      limits:
        memory: 2.5g
        cpus: '2.0'      # was '1.0' — ARCH-A20-CPU-CGROUP-REVIEW
      reservations:
        memory: 1g
        cpus: '0.5'
  healthcheck:
    start_period: 60s    # was 15s — model warm-up on first /extract call
```

### No code changes required
The fix is infrastructure-only (compose). No Python, no Dockerfile changes.

---

## Risk Flags

**R-1 (low):** If BCTC ingest and mcp-server batch both run at peak simultaneously,
combined draw could reach ~4 cores on 6-core VM. Acceptable — no peer has stated SLA
that can be broken by a 20% CPU throttle in a worst-case scenario.

**R-2 (mitigated):** Memory limit stays at 2.5g. Tesseract + PEK models fit in ~700MB RSS.
No memory headroom risk from this change.

**R-3 (not applicable):** mcp-gateway and headroom-proxy have no cpus: limits in compose —
they run uncapped and are not affected by pdf-extractor's quota.

---

## Baseline Pass Criteria

- Container status: `healthy` after `docker compose up -d --no-deps --build pdf-extractor`
- Health log: consecutive probes exit=0 (not -1)
- Duration: healthy >=15min with an in-flight /extract or /extract-tables request

---

## DDD Layer Assignment

This change is infrastructure-only:
- **Infrastructure layer**: docker-compose.yml resource limits (deploy.resources.limits)
- No domain / application / interface layer changes
- BUILD-STANDARD: not-applicable (maintenance / infra config only)

---

## Unblocks (for router sequencing — NOT architect's job to trigger)

1. FIX-PDF-EXTRACTOR-UNHEALTHY (BLOCKED → unblocked after healthy verify)
2. 22-filing Q1-2026 initial ingest
3. VHM/HCM/HSG/KBC reparse
4. Re-queue: `UPDATE bctc_vps_queue SET status='pending' WHERE status='blocked_pdf_extractor' AND period_year=2026 AND period_quarter='Q1'` (26 rows)
5. pdfx zone unfreeze
