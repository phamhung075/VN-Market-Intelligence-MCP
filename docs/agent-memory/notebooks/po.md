# PO Notebook

## Last updated: 2026-05-13T00:37Z (c59 triage — BATCH(3): c59-T1-F2a + c59-T2-F4 + CLEAN-c58-leftovers-c59)

---

## Cycle 59 triage

### Trigger
Dev-team c59 PREFLIGHT @ 00:36:20Z caught **8th HEAD.lock recurrence** w/ same PID **51247** (Docker Desktop VM). Mechanism stable — H4 confirmed THIRD time. Evidence: `docs/agent-memory/sessions/preflight-lsof-20260513T003620Z.log`. Pipeline=idle, c58-closed. pendingSignals[]=EMPTY (drained at Step 0a).

Architect's c59 plan is **already published** in `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md` §7 (commit `b31722b9`). PO role this cycle = batch-dispatch, no new spec.

### Step 0-TNB / Step 0-SIG / Channel audit
- TNB: no new audit handoff this cycle (c58 verdict closed: TNB-c43 #1 = MONITOR false-alarm)
- Signals: empty
- Channels: light scan — MARKET clean, WORK PREFLIGHT-only, BUG clean, market-group clean. 0 new TG reports.

### USER carry — Cloudflare bundle 8th cycle
- 1894a-cloudflare-tunnel-routing (In Progress, USER 5th-cycle awaits dashboard)
- 1862c-E-dashboard (Todo, USER awaits dashboard)
- NON-DISPATCHABLE in cron. Carry to c60.

### Decision: F2a + F4 are now ESSENTIAL
8th recurrence with same PID = mechanism unchanged, PREFLIGHT symptomatic cure not sustainable. Architect's recommendation (F2 primary, F4 secondary) is the right path. Execute both this cycle.

### BATCH selection — 3 entries

1. **c59-T1-F2a-named-volumes** (FIX-HIGH, HIGH). Owner: developer (NOT dev-mcp-server zone-agent — `docker-compose.yml` is root config, cross-service). Migrate `./reports` + `./docs/data` bind-mounts → named volumes in `docker-compose.yml`. Zone: `cross-service/`. Goal: shrink VirtioFS scan surface on project root so Docker Desktop VM stops scanning into `.git/`. Lowest-risk pair (these paths don't need host-side editing in the dev loop; CLI tools like alert-engine + BCTC pipeline reach them via container path remap if needed). Files: `docker-compose.yml` + any container path docs. Baseline: bind-mounts removed for both paths; alert-engine + BCTC tools still resolve paths; 8804 tests pass. Size: S.

2. **c59-T2-F4-retry-wrapper** (FIX-MEDIUM, MEDIUM). Owner: dev-team (touches dev-team flow + `.claude/skills/*`, not docker-compose). Wrap `git commit` + `git add` calls with retry-on-lock helper: 3 retries × 2s on `index.lock` / `HEAD.lock` EEXIST. Update `docs/protocols/head-lock-self-cure.md` to reference the wrapper. Defense-in-depth — survives even if F2a leaves residual VirtioFS scan. Zone: `cross-service/`. Files: dev-team flow + 1-2 skill files + 1 protocol doc. Size: S. Baseline: helper active in flow; no regression in flow tests.

3. **CLEAN-c58-leftovers-c59** (CLEAN, MEDIUM). Owner: agent-father. Bundle c58→c59 boundary drift: (a) 3 staged notebooks (news-scout staged + report-analyzer staged + alert-commander modified) from concurrent crons; (b) modified `docs/agent-memory/modules/tool-usage-stats.json`; (c) untracked `docs/agent-memory/sessions/preflight-lsof-20260513T003620Z.log` (c59 PREFLIGHT evidence — 8th-cycle log); (d) TASKS.md is already 80L clean — no archive needed this cycle. Zone: `cross-service/`. Size: S.

### Cross-pollution + WIP check
- c59-T1 (F2a) touches: `docker-compose.yml`, possibly path-remap doc
- c59-T2 (F4) touches: `.claude/flows/dev-team/main.md` + `.claude/skills/*` + `docs/protocols/head-lock-self-cure.md`
- CLEAN touches: `docs/agent-memory/{notebooks,sessions,modules}/` only
- File overlap: NONE. F2a = root config; F4 = dev-team flow/skills; CLEAN = memory dirs.
- WIP: 0 → +1 (T1 developer) +1 (T2 dev-team) +1 (CLEAN agent-father) = 3. **Per-agent WIP ≤2: PASS** (3 different agents).
- Same-agent serialization: none required (3 different owners, disjoint zones).
- Recurring-bug rule: 8-cycle pathology with H4 CONFIRMED + architect brief approved F2/F4. This is NOT another fix attempt on the symptom — it is the architect-approved root-cause fix. Rule satisfied.
- Zone enforcement: all 3 entries carry explicit `cross-service/`.

### Items deferred to c60+
- USER Cloudflare bundle (8th cycle ask, carry)
- c60-T1 F2b — migrate `./docs/agent-memory` after writer-audit (gated on F2a stable + writer-audit complete)
- F1 USER queue — Docker Desktop file-sharing exclusion (carry indefinitely)
- TNB-PLANNED-RESTART convention SPRINT-S (defer to c61 per architect)
- NB-HDR-bundle-22-agents ba spec (TNB drift cluster)
- 1881a / 1890a / 1888b-k SSOT cluster (9 items)
- 6 JANITOR DRY items
- 1862c-F SSE eviction (after 1862c-E-dashboard)

### Hard-constraint compliance
- WIP ≤2 per-agent: PASS (3 distinct owners)
- Disjoint zones (§2a): PASS
- No shared-SSOT writes (§2c): PASS — F2a writes compose, F4 writes flow/skills, CLEAN writes memory
- No file overlap (§2b): PASS
- Recurring-bug check: F2/F4 = architect-approved RCA fix, not symptom retry
- Zone enforcement: all 3 entries carry `cross-service/`

### Files written this cycle
- docs/agent-memory/notebooks/po.md (this overwrite)
- docs/TASKS.md (3 rows inserted by dev-team Step 2 from BATCH)

### Carry-over to c60
1. USER Cloudflare bundle (9th cycle ask)
2. c60-T1 F2b — migrate `docs/agent-memory` to named volume (after F2a stable + writer-audit)
3. F1 USER — Docker Desktop file-sharing exclusion (long-tail user queue)
4. TNB-PLANNED-RESTART convention SPRINT-S
5. NB-HDR-bundle-22-agents ba spec
6. Tool registry SSOT 133/138 drift
7. 1881a / 1890a / 1888b-k SSOT cluster
8. 6 JANITOR DRY items
9. 1862c-F SSE eviction
10. Container-restart MONITOR (TNB-c43 #1 closed false-alarm; watch for re-emergence)

---

## Cycle 58 summary (compacted)
c58 BATCH(3): ARCH-1896-RE-RCA-c58 (TNB-c43 #1 verdict = monitor / false alarm) + ARCH-BRIEF-UPDATE-H4-c58 (H4 CONFIRMED, F2+F4 picked, brief 118→139L) + CLEAN-c57-leftovers+worktree-orphan-c58 (5 atomic commits, orphan worktree cleared).

## Cycle 57 summary (compacted)
c57 BREAKTHROUGH: H4 root cause CONFIRMED = Docker Desktop VirtualMachine VirtioFS holds fds on `.git/HEAD.lock`. PID 51247.

## Persisting infra patterns
- HEAD.lock: **8-cycle recurrence c52→c59**. H4 CONFIRMED 3x (c57, c58, c59 — same PID 51247). F2a+F4 dispatched c59 = end of cycle expected.
- Container restart: TNB-c43 #1 closed FALSE-ALARM c58 (3 restarts = intentional ops deploys, exit 0/137-SIGKILL not OOM). MONITOR only.
- Cloudflare dashboard: 8+ USER-BLOCKED cycles (1894a + 1862c-E-dashboard)
- Wave-2 split-policy residue: ongoing boundary drift, weekly CLEAN bundle pattern stable
