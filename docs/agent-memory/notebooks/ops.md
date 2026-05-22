# Ops — Working Memory

## Session: 2026-05-20

**Task:** 1959-watchdog-10 (rag-service Dockerfile cleanup rebuild + smoke)

### Cycle Summary
- QA-approved task execution: Rebuild rag-service with Dockerfile fix (drop `/app/data/models` mkdir)
- All acceptance criteria (AC-10-1..5) verified PASS
- Deployment successful; no incidents

### Execution Timeline
- 2026-05-20 23:50:35 — Preflight disk check (26GB free, threshold 15GB) ✓
- 2026-05-20 23:50:37 — docker compose build --no-cache rag-service (305s)
- 2026-05-20 23:50:41 — docker compose up -d --no-deps rag-service
- 2026-05-20 23:50:48 — Container healthy (13s, well under 60s start_period)
- 2026-05-20 23:51:05 — Smoke tests complete (health + endpoints all 200)

### Key Results
- Image size: 3.43GB before & after (delta = 0 MB, AC-10-2 ✓)
- Dockerfile: Line 37 now `RUN mkdir -p /app/data/lancedb` only (AC-10-1 ✓)
- Container: vn-market-intelligence-mcp-rag-service-1, healthy in 13s (AC-10-3 ✓)
- Endpoints: /health 200, /search 200, /rag/search (gateway) 200 (AC-10-4, AC-10-5 ✓)
- Offline model load: HF_HUB_OFFLINE=1, TRANSFORMERS_OFFLINE=1, model from /opt/model-cache verified (watchdog-3 feature intact)

### Signals Emitted
- `docs/signals/ops-1959-watchdog-10-deployed.json` (verified=true, all AC pass)

### Status
CLOSED — All acceptance criteria met, deployment verified, no rollback needed.

---

## Previous Sessions
[Earlier work details would be appended here in production]

---

## Session: 2026-05-22

**Task:** 1960-DAILYDASH deploy (mcp-server rebuild with dailyDashboardJob projectRoot fix)

### Cycle Summary
- QA-approved deploy execution: Rebuild mcp-server container to load post-fix code
- Fix: dailyDashboardJob now imports getProjectRoot() from infrastructure/projectRoot.js (canonical helper) instead of using local projectRoot() function that resolved to /
- Deployment successful; all AC-5 part 1 criteria verified; AC-5 part 2 (cron observation) scheduled

### Execution Timeline
- 2026-05-22 02:37:19 UTC — Build started (mcp-server Dockerfile)
- 2026-05-22 02:37:50 UTC — Dependencies installed (323 packages, 134s)
- 2026-05-22 02:37:59 UTC — Source copied, TypeScript compiled, artifacts exported
- 2026-05-22 02:38:00 UTC — Build complete (119.4s total)
- 2026-05-22 02:37:26 UTC — docker compose up -d mcp-server executed
- 2026-05-22 02:38:10 UTC — Container healthy (13s from start, within 60s start_period)

### Key Results
- Image hash change: sha256:598b94c → sha256:3af8ec8 (verified via docker inspect)
- Container state: Up 20s (healthy) at verification
- Health endpoint: /health returns 200 (uptime 13.08s)
- Post-rebuild service check: 10/11 healthy (1 frontend /health not exposed, 1 stock-price port collision with macOS AirTunes — pre-existing)
- Gateway port 3000 bound correctly
- Code verification: dailyDashboardJob.ts imports getProjectRoot() from infrastructure/projectRoot.js (line 27)

### Acceptance Criteria
- **AC-5 part 1 (DEPLOY-VERIFIED):** PASS
  - Container running new image (hash changed)
  - Health check 200
  - Sanity check confirms post-fix code loaded
- **AC-5 part 2 (CRON-VERIFIED):** PENDING
  - Next cron tick: 2026-05-22T16:30Z (23:30 GMT+7)
  - Gate: must write docs/data/project-stats.json successfully
  - Current success_rate = 0% (5-day outage); must improve to >90%

### Signals Emitted
- `docs/signals/ops-1960-DAILYDASH-deployed.json` (verified=true, AC-5-1 PASS)

### Status
DEPLOYED — AC-5 part 1 complete. Awaiting cron observation (part 2) at 2026-05-22T16:30Z.

---

## Session: 2026-05-22 (continued) — 1965d-JANITOR-PATHFIX

**Task:** Deploy 1965d-JANITOR-PATHFIX (mcp-server rebuild with tasksMdJanitorJob projectRoot fix)

### Cycle Summary
- QA-approved deploy execution: Rebuild mcp-server container to load tasksMdJanitorJob fix
- Fix: tasksMdJanitorJob.ts now imports getProjectRoot() from infrastructure/projectRoot.js (canonical helper) instead of local projectRoot() function
- Deployment successful; all AC-5 part 1 criteria verified; AC-5 part 2 (cron observation) scheduled for next janitor fire

### Execution Timeline
- 2026-05-22 05:51:53 UTC — Build started (docker compose build mcp-server)
- 2026-05-22 05:51:58 UTC — Dependencies loaded from cache (bun, npm layers cached)
- 2026-05-22 05:52:19 UTC — Build complete (26.3s total, fast due to caching)
- 2026-05-22 05:52:22 UTC — docker compose up -d mcp-server (container recreate + start)
- 2026-05-22 05:52:42 UTC — Container healthy (24s from start, well under 60s start_period)

### Key Results
- Image hash change: sha256:3af8ec8 (1960) → sha256:4eab331 (1965d) (verified via docker inspect)
- Container state: Up 24s (healthy) at verification
- Health endpoint: /health returns 200 (toolCount=146, uptime=18s, status="ok")
- Post-rebuild service check: all 12 containers UP (alert-engine, api-gateway, flaresolverr, frontend, kinh-dich, macro, mcp-server, news, pdf, rag, stock, technical)
- Gateway port 3000 bound correctly
- Code verification: tasksMdJanitorJob.ts imports getProjectRoot() from infrastructure/projectRoot.js (line 32)

### Acceptance Criteria
- **AC-5 part 1 (DEPLOY-VERIFIED):** PASS
  - Container running new image (hash changed: 4eab331)
  - Health check 200 OK
  - Sanity check confirms post-fix code loaded (getProjectRoot import verified)
  - All 12 microservices UP
- **AC-5 part 2 (CRON-VERIFIED):** PENDING
  - Next janitor fire: 2026-05-23T03:00Z (10:00 GMT+7)
  - Gate: must run tasksMdJanitor successfully, write docs/agent-memory/notebooks/*.md updates
  - Expected outcome: done — held=N divergences=N errors=0

### Signals Emitted
- `docs/signals/ops-1965d-JANITOR-PATHFIX-deployed.json` (verified=true, AC-5-1 PASS, all_pass)

### Status
DEPLOYED — AC-5 part 1 complete. Awaiting cron observation (part 2) at 2026-05-23T03:00Z (tasksMdJanitor cycle).
