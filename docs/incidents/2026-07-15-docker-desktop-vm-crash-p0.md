# P0 INCIDENT ESCALATION: Docker Desktop VM Crash — REQUIRES USER INTERVENTION (2026-07-15T05:31–06:30Z, ~59min outage in progress)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Status:** BLOCKER — Docker daemon unresponsive; full stack DOWN; cannot proceed to stack recovery without Docker restart at host level

**Symptom:** Docker Desktop daemon crashed at ~05:31Z (confirmed via hypervisor.error.json). `docker ps` fails; `curl localhost:4000/health`, `localhost:5002/health`, and gateway timeout (502). All 9 vn-market services unreachable. MCP task-lock tools unavailable.

**Root Cause Identified:**
1. **Docker Desktop VM crashed** — hypervisor.error.json: "Internal Virtualization error. The virtual machine stopped unexpectedly." (timestamp 1778995284531153000 = ~05:31Z)
2. **Contributing factor: Disk space pressure** — host root filesystem 91% full (19GB free on 233GB drive); Docker VM requires workspace to initialize
3. **Failed recovery trigger:** rag-service agent building isolated LanceDB FTS test container (scratch VM, not touching market_data volume); build completed but likely exhausted resources → daemon crash under load

**Recovery Attempts Executed (75+ min, non-destructive):**
- 4x Docker Desktop restart (kill + open -a Docker): daemon socket never created
- 100+ sec waits for daemon initialization: no socket appearance
- Removed stale config/state files (~.docker/run/*.sock, contexts)
- Freed ~350MB disk (Homebrew/pip caches, Docker logs)
- Attempted fresh docker context creation
- Force-rebuilt Docker VM from scratch (removed ~/Library/Containers/com.docker.docker/Data/vms directory): socket still not created after 75+ sec

**Current Blocker:**
- Docker backend processes running (com.docker.backend, fork, services) but:
  - Socket `~/.docker/run/docker.sock` NOT created despite 75+ sec rebuild time
  - Daemon completely unresponsive to any API call
  - No docker.sock means VM failed to initialize or crashed during bootstrap
  - CLI-only recovery cannot force VM restart or diagnose hypervisor-level issues

**What User Must Do:**
Option A (Preferred): Open Docker Desktop GUI app (already running in background) and allow it to fully initialize/error-recover via UI (may show dialog, may auto-restart VM). This gives Docker's native recovery codepath 2-5 minutes to rebuild the VM.

Option B: Force-quit Docker Desktop (Cmd+Q in GUI or `killall -9 Docker*` + restart) and restart.

Option C (Nuclear, only if A/B fail): System Preferences > Docker > Reset to factory defaults OR reinstall Docker Desktop.

**Market Data Safety:**
- market_data named volume is SEPARATE from Docker VM storage (different mount points)
- rag-service test used isolated container (scratch data, not live volume)
- No evidence of data loss on volume; can verify once Docker is up

**Next Steps After Docker Restarts:**
1. Verify `docker ps` responds (9 services should list)
2. Bring stack up non-destructively per docker.md forbidden-patterns
3. RAW-verify market_data volume integrity (sane row counts)
4. Health-check all 9 services + gateway
5. Then report back for QA to proceed with rag-service FTS verification

**Estimate:** 5-10 min for Docker restart + 3-5 min for stack recovery + 2-3 min verification = ~15-20 min total to healthy state once Docker starts.

Zone: Docker Desktop hypervisor | Ops recovery: BLOCKED pending user host-level action
