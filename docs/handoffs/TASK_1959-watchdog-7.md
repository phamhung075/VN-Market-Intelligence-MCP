# TASK 1959-watchdog-7 — Bump flaresolverr healthcheck start_period 30s → 60s

**Sprint:** 1959 (Watchdog Hardening Batch)
**Owner:** dev-mcp-server
**Zone:** `apps/mcp-server/` (owns `docker-compose.yml`)
**Priority/Size:** HIGH / XS
**Estimate:** 0.5 h
**Depends:** —
**Spawned by:** PO c223 2026-05-20T20:40Z (signal `docs/signals/po-1958-mid-checkpoint.json`)

## Origin

Symmetric trivial follow-up to **1958-watchdog-2** (rag-service `start_period` 30s→60s, DONE 2026-05-20T20:36Z, commit `76e5d1cd`). The watchdog-2 implementation signal (`docs/signals/dev-mcp-server-1958-watchdog-2.json`) included a `start_period_audit` block that flagged:

> `flaresolverr: 30s — FLAG: Chromium-based cold-start may exceed 30s under disk pressure; recommend follow-up task to bump 30s→60s`

This task takes that audit recommendation and lands the symmetric fix. Same shape as watchdog-2, same risk profile (Chromium cold-start under disk pressure mirrors the sentence-transformers cold-start in RAG), same trivial XS edit.

## Work

1. Edit `docker-compose.yml`. Locate the `flaresolverr` service block. Change `healthcheck.start_period` from `30s` to `60s`.
2. Rolling restart: `docker compose up -d flaresolverr` (recreates only flaresolverr container, no full-stack restart).
3. Smoke verify 3 consecutive restart cycles. For each:
   - `docker compose restart flaresolverr`
   - `docker inspect <flaresolverr-container> --format '{{.State.Health.Status}}'` — wait until `healthy`.
   - Record time to `healthy` (should be < 60s).
4. Send WORK Telegram: brief one-line confirmation with three timings.
5. Drop signal `docs/signals/dev-mcp-server-1959-watchdog-7.json` with:
   - `task: "1959-watchdog-7"`
   - `status: "DONE"`
   - `change: { file, service, field, before, after }`
   - `smoke_test: { restart_1_seconds, restart_2_seconds, restart_3_seconds }`
   - `next: "qa"` or `next: "po"` (XS, can skip qa if dev confident).

## Acceptance Criteria

- **AC-1:** `docker-compose.yml` flaresolverr healthcheck start_period = 60s (visible in `git diff`).
- **AC-2:** Rolling restart deployed; flaresolverr container Up + healthy.
- **AC-3:** 3-of-3 restart smoke PASS (healthy within 60s each).
- **AC-4:** At least one restart shows `healthy` at < 60s (proves headroom adequate, not just expanded gate).
- **AC-5:** Signal emitted; commit message follows LITE convention: `fix(ops/1959-watchdog-7): bump flaresolverr healthcheck start_period 30s→60s`.

## Boundary

- This is XS preventive hardening — no test suite changes expected.
- If flaresolverr fails to come healthy within 60s on any of the 3 restarts → STOP, escalate to PO with BUG Telegram (means the issue is deeper than start_period — likely full architectural disk-pressure problem).
- Do NOT bump any other service's start_period in this task — symmetric audit-driven extension only.

## Related

- Predecessor (DONE): `docs/signals/dev-mcp-server-1958-watchdog-2.json` (rag-service 30→60)
- Sprint goal: `docs/SPRINT_GOAL.md` (Sprint 1959 head)
- Mid-checkpoint signal: `docs/signals/po-1958-mid-checkpoint.json`

## [Developer] Implementation Record
- **Service:** mcp-server (docker-compose.yml owner)
- **Zone:** apps/mcp-server/ (infra config)
- **Files modified:** docker-compose.yml:401 — flaresolverr healthcheck start_period 30s → 60s
- **Tests written:** NONE (XS infra config change — no test suite changes per task boundary)
- **Git commits:** TBD (fix(ops/1959-watchdog-7): bump flaresolverr healthcheck start_period 30s→60s)
- **Type check:** N/A (no TS changes)
- **Service tests:** N/A
- **Docs updated:** docs/signals/dev-mcp-server-1959-watchdog-7.json | docs/signals/DASHBOARD.md | docs/TASKS.md | docs/handoffs/TASK_1959-watchdog-7.md | docs/agent-memory/notebooks/dev-mcp-server.md
- **Deployment:** docker compose up -d flaresolverr — initial healthy at 18s; 3-of-3 restart smoke PASS (11s/13s/11s)
- **Smoke test:** flaresolverr API POST status=ok, solution_status=200; gateway /health 200
- **Graphify:** skipped (no docs/architecture impacted)
