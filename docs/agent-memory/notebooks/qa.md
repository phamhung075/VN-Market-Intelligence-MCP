# QA — Notebook

**Last updated:** 2026-05-18 | **Sprint:** 1945 | **Session:** c190 — 1945d reparse pipeline gap — APPROVED

## Session 2026-05-18 c188 — 1946a PLX watchlist crisis coverage

### TASK REPORT — 1946a (compact)

```
date: 2026-05-18
outcome: APPROVED
commit: 5762ce2d (on main, no task branch)
type: FIX (HIGH, size S) — watchlist SSoT + seed + frontend + tests
zone: apps/mcp-server/ + apps/frontend/ + docs/data/ + mcp.config.json
round: 1
```

#### Pipeline

- Zone tests (1946a + 1343a): 22/22 GREEN — 7/7 new + 15/15 restored (339ms)
- tsc: 0 errors
- Full suite baseline (pre-commit): 9239 pass / 280 fail
- Full suite post-commit: 9240 pass / 279 fail (net +1 pass, -1 fail — improvement)
- DDD: PASS — zero domain->infra imports in changed files
- Security: PASS — no process.env, no hardcoded secrets

#### AC Matrix

| AC | Result |
|----|--------|
| AC-1: PLX in system-map.json active=true, HOSE, Oil & Gas / Petroleum Retail | PASS |
| AC-2: PLX in mcp.config.json .market.watchlist (pos 31, after BSR) | PASS |
| AC-3: PLX in seedWatchlist.ts WATCHLIST_SEED (line 39, domain=oil_gas) | PASS |
| AC-4: velocity ratio >=2.0 -> PLX in crisisIndicators | PASS |
| AC-5: tsc 0 errors | PASS |
| AC-6: 7 new tests + 1343a restored GREEN | PASS |
| Cross-check: frontend market.ts PLX matches system-map.json | PASS |

#### Notes

- 279 remaining suite failures confirmed pre-existing (same pattern as pre-commit 280 baseline)
- 1343a: 15 tests pass — "26" in task description = DB row count in assertions, not test count
- WORK notified: "[QA] 1946a APPROVED — PLX added to watchlist"
- Ops to be spawned for Docker rebuild + seedWatchlist live injection

## Cycle — 2026-05-18

- **cycle_date**: 2026-05-18
- **findings**: 1946a all GREEN — 22/22 zone tests, net suite improvement, tsc clean, DDD clean
- **actions**: TASKS.md already QA-APPROVED (dev pre-marked), task report updated with QA Review Record, WORK notified, notebook written, commit staged
- **next_cycle_hint**: Ops agent must run seedWatchlist after Docker rebuild to inject PLX into live DB; verify SELECT code FROM watchlist WHERE code='PLX' returns 1 row
- **estimated_tokens**: 8500

## Session 2026-05-18 c190 — 1945d reparse pipeline gap

### TASK REPORT — 1945d (compact)

```
date: 2026-05-18
outcome: APPROVED
commit: 7f8335d9 (on task branch, merged to main)
type: FIX (HIGH) — BCTC reparse pipeline gap, two fixes
zone: apps/mcp-server/ scheduler + interface
round: 1
```

#### Pipeline

- Zone tests (1945d): 12/12 GREEN [134ms]
- Full suite: 9682 pass / 350 fail (pre-existing baseline)
- tsc: 0 errors (pre-push hook confirmed)
- DDD: PASS — scheduler/interface importing infra is correct DDD pattern; domain/ clean
- Security: PASS — no hardcoded secrets; process.env at server.ts:195 is pre-existing (CLOUDFLARE_PATH_PREFIX)

#### AC Matrix

| AC | Result |
|----|--------|
| AC-3: 12 new tests covering disk scan for freshly-stored PDFs | PASS |
| tsc 0 errors | PASS |
| No regression in existing BCTC tests | PASS — 1196 pre-existing failure confirmed not from 1945d |

#### Notes

- pre-existing process.env at server.ts:195 (CLOUDFLARE_PATH_PREFIX) — not in 1945d scope
- 1196 pre-existing failure: watchlist-only guard broken by task 1915-fix-part2, not introduced here
- Merge: `chore(1945/bctc): merge task/1945d-reparse-pipeline-gap` → pushed to main @ 72203965
- Branch deleted (local + no remote to remove)
- Part B (6/7 banks VPS gap) documented in handoff as out-of-zone root cause

## Cycle — 2026-05-18 c190

- **cycle_date**: 2026-05-18
- **findings**: 1945d all GREEN — 12/12 zone tests, tsc clean, DDD clean, security clean
- **actions**: merged to main, TASKS.md updated (In Progress → Done), handoff QA record appended, task report written, notebook committed
- **next_cycle_hint**: Ops agent should `docker-compose build mcp-server && docker-compose up -d mcp-server` to deploy GAP-A+GAP-B fixes; verify bctcReparseJob picks up EIB+DHG PDFs on next cycle
- **estimated_tokens**: 9200

## Session 2026-05-18 — Sprint 1949 QA gate

### TASK REPORT — Sprint 1949 (full)

```
date: 2026-05-18
outcome: APPROVED
commits: d4d5d0cf (Phase 1) + 9848bf49 (Phase 2/3/5/6/7) + 44aa791a (Phase 4)
type: FEAT — cowork reorder, chef pipeline, gatherer demotion, cron rewiring
zone: .claude/agents/ + .claude/flows/ + apps/mcp-server/src/scheduler/ + docs/
round: 1
```

#### Pipeline

- Zone tests (1949 + 1133): 22/22 GREEN — 9 new TC-1..TC-9 + 13 1133 regression [387ms]
- Full suite: 9220 pass / 286 fail (pre-existing baseline; consistent with prior sessions 279-350)
- tsc: 0 errors
- DDD: PASS — scheduler/infra imports correct DDD pattern; domain/ clean
- Security: PASS — no process.env in changed files; no hardcoded secrets

#### 10 Acceptance Checks

| Check | Result |
|---|---|
| 1. Phase 1 GATE invariant (unified-agent market:write:true, rule:chef_dishes_only) | PASS |
| 2. MARKET allowed_senders consistency (system-map.json vs agent permissions) | PASS |
| 3. Signal-bus symmetry (receives_from / sends_to / business-context fields) | PASS |
| 4. Chef recipe present (chef.md 8-step, convergence rule 4 triggers, silent-exit gate) | PASS |
| 5. Cron off-minute hygiene (no :00/:17/:30; 24min gaps confirmed by TC-5/TC-6) | PASS |
| 6. Alert-commander narrowed (event_only, no_cycle_headers, 140-char, no off-hours) | PASS |
| 7. Digest-predict shrunk (daily/monthly removed, weekly 47 13 * * 0) | PASS |
| 8. TNB auditor reframe (chef narrative audit, 6-layer, cron 13 20 * * *) | PASS |
| 9. Tests pass (22/22 zone GREEN, 9220 full suite, tsc 0) | PASS |
| 10. Docs consistency (workflow-map, alert-policy, cron-jobs.md) | PASS |

#### Non-blocking observations

- system-map.json cron descriptions for foreignFlowAlertJob + macroIndicatorRefreshJob are stale (descriptive only; SSOT is cronConfig.ts which is correct). Recommend fix next maintenance cycle.

#### Notes

- All 3 commits already on main. No branch merge required.
- QA report written to docs/handoffs/sprint-1949-qa-report.md

## Cycle — 2026-05-18 Sprint 1949

- **cycle_date**: 2026-05-18
- **findings**: Sprint 1949 all GREEN — 22/22 zone tests, full suite baseline stable, tsc clean, DDD clean, security clean; all 10 acceptance checks PASS
- **actions**: QA report written, notebook updated, commit staged
- **next_cycle_hint**: Deploy docker-compose restart to pick up new cron schedule (foreignFlow 08:13, macroRefresh 19:13). Monitor first morning dish (05:23 UTC) and first EOD dish (08:37 UTC) for correct publish. system-map.json cron descriptions should be updated in next maintenance pass.
- **estimated_tokens**: 11500

## Carry-over

- Ops agent: `docker-compose build mcp-server && docker-compose up -d mcp-server` — deploy 1945d fixes (disk scan unconditional + triggerPushBctcExtraction)
- Ops agent (from c188): `docker-compose build mcp-server && docker-compose up -d mcp-server` then `seedWatchlist` + verify PLX row in live DB
- Ops agent (from Sprint 1949): `docker-compose up -d mcp-server` — activate new cron schedule (foreignFlow 08:13, macroRefresh 19:13); no rebuild needed (cron config reload)
- Maintenance: update system-map.json cron descriptions for foreignFlowAlertJob (09:30→08:13) and macroIndicatorRefreshJob (0 6→13 19)
