# Decision Journal — Sprint DASH-CRON-RECHECK-TABLE (PM Decomposition)

**Task ID:** PM-DASH-CRON-RECHECK-TABLE
**Agent:** pm
**Timestamp:** 2026-07-02T06:54:00Z

## Decision

**DECOMPOSED:** DASH-CRON-RECHECK-TABLE (multi-zone sprint) into **2 atomic dev-* work units**:

1. **TASK-DASH-CRON-1** (dev-mcp-server, Zone 1, size M):
   - Scope: cronLivenessClassifier (domain, pure), cronStatusCompute (application, orchestrator), layerBCronRegistry (infrastructure, Layer-B parser), cronStatusHandler (interface, HTTP handler) + GET /api/cron-status route registration + new cron-parser dependency
   - Ships FIRST; blocking TASK-DASH-CRON-2
   - ACs: 25 (AC-1..AC-29 subset: endpoint correctness, PARITY gates AC-8/AC-9 on 16 WATCHDOG_MANIFEST jobs, Layer-B honesty, no regression to GET /api/orchestration)
   - Risks: R1 (memoization load-bearing, not optional), R2 (Layer-B source double-count RESOLVED by architect: parse command files ONLY), R4 (new cron-parser dep), R5 (inherit watchdog weekday quirk via PARITY)

2. **TASK-DASH-CRON-2** (dev-frontend, Zone 2, size M):
   - Scope: api.cron-status.tsx proxy route, CronRecheckTable UI component (Layer-A "Cron máy chủ" / Layer-B "Cron phiên làm việc" sections), RECHECK button (reuses existing revalidator), freshness badge, coverage-map row update (with corrected `route` field)
   - Depends on TASK-DASH-CRON-1; can develop UI against stub
   - ACs: 13 (AC-16..AC-29 subset: frontend rendering, Vietnamese copy, no-fake-data, status badges, never-fired display)
   - No new risks specific to Zone 2

**Tier dependency:** Tier1 = TASK-DASH-CRON-1 (parallel independent), Tier2 = TASK-DASH-CRON-2 (after Tier1 ships)

**Handoff files created:**
- `docs/handoffs/TASK-DASH-CRON-1.md` (detailed tech specs, 25 ACs, file manifests, risk flags, ARCH-RATIFY resolutions)
- `docs/handoffs/TASK-DASH-CRON-2.md` (UI specs, 13 ACs, DTO contract, component design reference, Vietnamese UX copy)

**orch-state.json changes:**
- Removed `PM-DASH-CRON-RECHECK-TABLE` from task_board.ready[]
- Added TASK-DASH-CRON-1 + TASK-DASH-CRON-2 to task_board.ready[] (sequential assignment: Zone1 first, Zone2 after Zone1 complete)
- Updated .head: status=planning, active_task_id=null, next_agent=dev-mcp-server, next_action narrates the zone split + AC-8/AC-9 PARITY gates + AC-12 correction

**Key architect corrections carried forward (from ARCH brief 2026-07-02):**

- **AC-12 wording correction:** "13 live cron-bearing command files" (not 14 — cron-fb-market-poster.md is DEPRECATED/zero-crons).
- **CN-1 (job_name resolution):** Hybrid 3-tier (16-pair reverse-map + normalized runtime scan + best-effort probe).
- **CN-2 (cadence derivation):** Generic MIN-of-6-samples via cron-parser (no per-expression special-casing, handles EC-2 restricted-window + EC-4 comma-list uniformly).
- **CN-5 (Layer-B SSOT):** Parse ONLY `.claude/commands/crons/*.md` (13 files), NOT re-arm skills (would double-count 5 crons: dev-team ×1, system-auditor ×3, cowork-team ×1).
- **R1 load-bearing:** memoization contract (static cadenceMs/thresholdMultiplier/human_schedule per CRONS key) is mandatory for ~69 non-manifest jobs; recompute-on-5s-poll without memo = unnecessary CPU burden × every open tab. Do NOT skip under time pressure.

## What-Considered

**(A) Single combined Zone 1+2 task vs 2 separate tasks:** REJECTED.
- Rationale: Zone 1 is pure backend (domain/infra/app/interface server-side layers); Zone 2 is frontend (interface client-side). Different teams (dev-mcp-server vs dev-frontend), different deployment cadence, no shared code files. Bundling violates atomic task rule (one file group or function group, ~2h each). 2-separate-tasks is the clean split.

**(B) Task size calibration (M vs L):** Chosen M for both.
- Zone 1 M: 6 new files (cronLivenessClassifier.ts, cronStatusCompute.ts, layerBCronRegistry.ts, cronStatusHandler.ts + 4 test files), 2 modified files (cronJobRunStore additions + server.ts route), 1 dep add (cron-parser). Scope ~2–2.5h agent work (parser integration, test validation, PARITY gate verification).
- Zone 2 M: 2 new files (api.cron-status.tsx + updated dashboard.orchestration.tsx section + coverage-map row). Scope ~2–2.5h frontend work (Remix loader pattern, component wiring, badge colors, Vietnamese copy, integration test).

**(C) WIP enforcement:** Added both to ready[] (not in_progress[] yet).
- Rationale: Current WIP=2/2 (FIX-BCTC-ENRICHER-STUCK-BACKLOG + ARCH-DASH-CRON-RECHECK-TABLE in progress). Zone1 will be assigned to dev-mcp-server when one of the 2 current tasks completes. Zone2 waits on Zone1 completion + dev-frontend WIP availability.

**(D) Handoff file format:** Matched existing TASK_NNN.md convention.
- Included AC subset (not all 29 BA ACs, only those applicable to each zone), risk flags, ARCH-RATIFY resolutions, file manifests, edge cases, Vietnamese UX reference for Zone 2.

## Why-Change

**No change from plan:**
- Architect brief (2026-07-02-DASH-CRON-RECHECK-TABLE.md) mandated SPLIT into 2 zones with Zone1 first → applied verbatim.
- Architect resolutions (CN-1 through CN-5) flowed directly into task scope and acceptance criteria.
- AC-12 correction (13 live files, not 14) reflected in both handoffs + Zone1 AC spec.
- Risk flags (R1–R7) highlighted in Zone1 handoff; Zone2 carries no new risks.
- WIP limit (max 2 in_progress) respected: added to ready[], not in_progress[].

## Notebook Append

PM cycle DASH-CRON-RECHECK-TABLE complete. Decomposition: 1 sprint → 2 atomic dev tasks (TASK-DASH-CRON-1 Zone1, TASK-DASH-CRON-2 Zone2), sequenced tier1→tier2. Handoffs created + orch-state committed. Next: dev-mcp-server pickup of TASK-DASH-CRON-1.
