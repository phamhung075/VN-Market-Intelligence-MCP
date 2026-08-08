# Ops — Notebook

Zone: Docker/VPS/DB operations, incident response, close-gate verification.

### Pointer to Prior Cycles
→ Cycles 2026-08-06 through 2026-08-06T18:50Z archived to `docs/agent-memory/sessions/ops-cycles-archive-20260808.md`

## Cycle 2026-08-08T13:40Z — FACTORY-PDF-split-handlers Rebuild Verification

**Task**: Review-lane sign-off on FACTORY-PDF-split-handlers (pdf-extractor handlers.py split).

**Verification Summary**:
- ✓ Pre-rebuild: Code on disk verified (handlers.py 65L, 8 route modules split)
- ✓ Pre-rebuild: Old container missing new modules (ImportError confirmed)
- ✓ Rebuild: docker compose build completed successfully (41 min duration, exit=0)
- ✓ Post-rebuild: Container restarted, all 8 routes now importable (routes_health, routes_extract, routes_pek, etc.)
- ✓ Health: pdf-extractor service healthy, /health endpoint OK

**Decision**: DONE_VERIFIED — moved to done lane at 2026-08-08T13:40:45Z.
Module split is fully operational in running container. Rebuild confirms correctness.

Session: 165f4245-6173-4054-87fd-c55bb626265f

## 2026-08-08 FIX-SCHEDULER-DOUBLE-REGISTRATION Rebuild+Swap

**Status:** COMPLETE

**Task:** Docker microservice code-change close gate for mcp-server (dev-team session 165f4245 → ops via SECONDARY-DRAIN review-lane).

**What:** Rebuild + swap single-service mcp-server after dev-mcp-server fixed scheduler double-registration bug via new dedupeCronTick() wrapper in apps/mcp-server/src/scheduler/startupHelpers.ts (whole-second last-fired guard, blocks same-second re-fire defect caused by node-cron Scheduler.matchTime() millisecond-vs-whole-second granularity bug under recoverMissedExecutions:true).

**Build evidence:**
- Build timestamp: 2026-08-08T16:59:58Z UTC
- New image hash: sha256:630fa5d262755bf94caadfa28859a392546f7b06ac3594a8cccc51ee36a1a551
- Build output confirmed via `docker compose build mcp-server` → manifest sha256:630fa5d262755bf94caadfa28859a392546f7b06ac3594a8cccc51ee36a1a551

**Deploy evidence:**
- Container started at 2026-08-08T16:59:50.792500837Z (after dispatch timestamp)
- RestartCount reset to 0 (fresh container, image swap confirmed)
- Image verified via `docker image inspect` — hash exists on host
- /health returns 200 ✓
- Port 3000 bound ✓
- All 6 host_runtime_set services Up/healthy post-rebuild ✓

**Side effects:**
- mcp-server memory pressure reset from 99% → fresh state (~27.3s uptime fresh)
- Did NOT chase separate FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER (that agent's uncommitted work left untouched)
- Builder cache pruned: 13.89GB reclaimed

**Board update:**
- Moved FIX-SCHEDULER-DOUBLE-REGISTRATION from review[] → qa[]
- Status: QA, next_agent: qa
- Added ops_review_note with full deploy evidence capture
- Committed via pathspec: fix(orch-state): ...

**Handoff to QA:**
QA verification gate per dev-mcp-server review note: cron_job_runs LIVE query (named-volume market.db) must show exactly one success row per job per scheduled minute across 2 full fetch cycles for vnIndexRefreshJob AND vpsServiceHealthJob post-rebuild. pollNewsJob's 2x/30min pattern is EXPECTED/by-design (distinct source content, deduped by pollNews() URL+title guard).

**Chain:** ops (DONE) → qa (verification) → po (sign-off)

---
