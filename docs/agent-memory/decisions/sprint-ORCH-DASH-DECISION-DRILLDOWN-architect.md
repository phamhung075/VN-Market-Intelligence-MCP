# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · architect

**Sprint goal:** Clickable DONE-task decision trail on /dashboard/orchestration
**Agent:** architect
**Started:** 2026-06-08T02:30:00Z

---

### STEP architect-S1 · architect · 2026-06-08T02:30:00Z
**task-id:** ARCH-A20-CPU-CGROUP-REVIEW
**what-done:** Raised pdf-extractor cpus limit from 1.0 to 2.0 in docker-compose.yml; bumped healthcheck start_period from 15s to 60s; authored architecture brief 2026-06-08-pdf-extractor-cpu-cgroup-fix.md
**what-considered:**
- Option A: cpus 1.0→2.0 (1 line, simplest, mirrors mcp-server pattern)
- Option B: OCR sidecar (new container, IPC overhead, no capacity gain)
- Option C: exec-form healthcheck only (does NOT escape cgroup — exec probe throttled identically)
**why-decision:** docker stats confirmed pdf-extractor at 99.01% CPU (pinned at cgroup limit); all other peers idle. Docker VM has 6 CPUs, total active load ~3 cores. Raising to 2.0 gives Tesseract ~1 core + uvicorn ~1 core. Peers unaffected. Option C is a no-op for this failure mode.
**why-change:** no change from plan — RECURRING-BUG rule demanded architect decision; Option A was the obvious correct choice once evidence confirmed peer headroom
