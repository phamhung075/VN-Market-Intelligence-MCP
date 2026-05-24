# TASKS Archive — VN Market Intelligence MCP

Index of completed sprints. Full details in `docs/archive/` files — load only when needed.

Active board → `TASKS.md`

---

## Archive — Added 2026-05-18 by PO c200 (Sprint 1949/1950/1951a-d rotation)

**Period:** 2026-05-18 | **Rows archived:** 11 (Sprint 1949/1950/1951a-d Done rows — sprints closed, freeing TASKS.md headroom for new Sprint 1952 Backlog entries)

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| SPIKE-1951d | DONE 2026-05-18 PO — Option C accepted (hourly fallback for 4 sub-hourly slots); brief §2.4 updated; follow-up 1951e. | HIGH | SPIKE | po | 2026-05-18 |
| 1951a | DONE 2026-05-18 PARTIAL — 12/16 RemoteTriggers created; 4 failed (cron <1h rejected); commits bb4ed0c3 + 2cc526a2. | HIGH | TASK | agent-father | 2026-05-18 |
| MAINT-1950b | DONE 2026-05-18 — Archived 5 oversized agent notebooks (>200L cap) to docs/archive/notebooks/. Live notebooks truncated to ≤200L. | LOW | MAINT | agent-father | 2026-05-18 |
| MAINT-1950c | DONE 2026-05-18 — semble-search YAML model field added; 2 orphan news-scout notebooks moved to archive. | LOW | MAINT | agent-father | 2026-05-18 |
| MAINT-1950d | DONE 2026-05-18 — Cleaned workflow-map.md L103 stale "monday predict" residue; verified cron-jobs.md SSOT unchanged. | LOW | MAINT | agent-father | 2026-05-18 |
| SPIKE-1951a | DONE 2026-05-18 — Resolved OQ-1/OQ-2/OQ-3; RemoteTrigger MCP tool identified; Sprint 1951 Phase 1 unblocked. | HIGH | SPIKE | claude-code-guide | 2026-05-18 |
| MAINT-1950a | DONE 2026-05-18 — Removed 3 stale agent-memory test files: task-lock sandbox, pre-dispatch debug, finalization check. Freed 48 KB. | LOW | MAINT | system-auditor | 2026-05-18 |
| 1950-PILOT-FEASIBILITY | DONE 2026-05-17 — Pilot feasibility proof-of-concept shipped 2026-05-14; 3 agents operational since. Archived per 1950-close signal. | HIGH | RESEARCH | architect | 2026-05-17 |
| 1949-PHASE2-SCOPE-EXPANSION | DONE 2026-05-16 — Phase 2 scope expanded 6→9 goals; risk gates documented; architect sign-off 2026-05-15; signal processed. | HIGH | SCOPE | architect | 2026-05-16 |
| MAINT-1950e-LEGACY-CLEANUP | DONE 2026-05-18 — Removed 2 deprecated agent files (pre-1950 dispatch pattern). No active references. | LOW | MAINT | agent-father | 2026-05-18 |
| 1951-OPEN-QUEUE | DONE 2026-05-18 — Sprint 1951 queued; Phase 1 ready for kickoff. PO c192 dispatch signal ready. | HIGH | META | po | 2026-05-18 |

---

## Archive — Added 2026-05-24 by claude-manager-helper (Backlog + Done pruning for TASKS.md ≤80L compliance)

**Period:** 2026-05-24 | **Rows archived:** 86 (Phase 0/2 Backlog tasks + Done section rows — archived to meet TASKS.md ≤80L invariant; Phase 0/2 active tasks retained in TASKS.md)

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| TASK_P0-1 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Create `docs/data/bug-inventory.json` baseline (G10 metric). Scan last 60 days: git log + docs/signals + agent notebooks. Extract: bug-id, module, fixCycles, status, date. Schema per charter §Baseline Metric Capture. Min 20 bugs. `baselineCycleCount` = avg fix cycles for TA bugs or system-wide 4-6. AC-1..AC-5: file exists, valid JSON, ≥20 bugs, TA-specific or system baseline, status field valid. Estimate: 2h. Size=M. Zone=`docs/data/`. Owner=system-auditor (audit authority). Pilot=technical-analysis. Phase=0. Unblocks Phase 0 exit gate verification. | HIGH | TASK | system-auditor | docs/handoffs/TASK_P0-1-bug-inventory.md | — |
| TASK_P0-2 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Create `docs/data/pilot-status.json` SSOT for 12 goals + decision matrix. Initialize all G1-G12 to `TBD`, decision matrix (speed/trust/scale) to `TBD`, status to `ACTIVE`, `sprintKickoff`/`sprintDeadline` to TBD. Schema per charter §Status Tracking (6-field goals dict, 3-field decision matrix). AC-1..AC-4: file exists, valid JSON, all 12 goals present, decision matrix present, all fields valid. Estimate: 1h. Size=S. Zone=`docs/data/`. Owner=architect (specification contract). Pilot=technical-analysis. Phase=0. PO uses file to gate Phase 0→1 transition. | HIGH | TASK | architect | docs/handoffs/TASK_P0-2-pilot-status.md | — |
| TASK_P0-3 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Verify or create `flows/dev-technical-analysis/main.md` + `.claude/agents/dev-technical-analysis.md`. Check existence; if missing, create via agent-md-factory standards. Flow MUST include G12 hard rule: "Do not mark task DONE until sandbox dashboard shows all TA scenarios green." AC-1..AC-5: files exist, YAML frontmatter valid, G12 rule present, factory compliance, load without errors. Estimate: 1h. Size=S. Zone=`.claude/`. Owner=agent-father (factory authority). Pilot=technical-analysis. Phase=0. Flow enables dev-technical-analysis zone dispatch for Phases 1-3. | HIGH | TASK | agent-father | docs/handoffs/TASK_P0-3-dev-ta-flow.md | — |
| TASK_P0-4 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Audit `apps/technical-analysis/` (read-only). Identify all 9 src files + current composition-root-equivalent. Document findings in `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md`. Output: current state analysis, issues found, clean rewrite plan per DDD (composition-root.ts wires module only, no business logic). AC-1..AC-5: audit complete, 9 files documented, plan sufficient for Phase 1 dev rewrite, G3 gates referenced, DDD compliance scoped. Estimate: 2h. Size=M. Zone=`apps/technical-analysis/`. Owner=dev-technical-analysis (zone owner, read-only). Pilot=technical-analysis. Phase=0. Plan unblocks Phase 1 composition-root rewrite (G3 goal). | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P0-4-composition-root-plan.md | — |
| 1965d-JANITOR-PATHFIX | **NEW 2026-05-22T03:22:35Z (po c247 cron-0307Z dispatch)** — tasksMdJanitor cron #1 fired at 03:00Z and logged `done — held=1 divergences=0 errors=2`. Both errors are container-path resolution bugs: (1) `R-2 pipeline-state.json not found` + (2) `R-3 TASKS.md not found`. Root cause: `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:501` uses local helper `const projectRoot = resolve(import.meta.dir, "..", "..", "..", "..", "..");` which resolves to `/` inside container (not `/app`). Identical anti-pattern to 1960-DAILYDASH (just shipped as 2f0a74e9). docker-compose mounts files at `/app/docs/...`; janitor looks at `/docs/...` → ENOENT. Fix: (1) replace local helper with `import { getProjectRoot } from "../../infrastructure/projectRoot.js"`; (2) add lint test under `apps/mcp-server/src/__tests__/lint/` that fails build if any scheduler file matches regex `const projectRoot\s*=\s*resolve\(import\.meta\.dir`. AC-1: tasksMdJanitorJob.ts imports getProjectRoot, local helper removed. AC-2: lint test GREEN (scans scheduler/ tree, asserts zero matches). AC-3: tsc 0 errors. AC-4: smoke-tasks-md-janitor.ts still 12/12 GREEN. AC-5: post-deploy next 03:00Z janitor fire (23T03Z) logs `errors=0`. Soak coupling: this fix RE-VALIDATES OBSERVE-1965c-soak final pass on 23T03:00Z (soak ends 23T18Z); c247 declares pass #1 (this cycle) as OBSERVE-AMBIGUOUS (no crash, no BUG flood, but errors!=0) and defers final SOAK_PASS/FAIL verdict to qa-1965c-soak-result.json post-23T18Z. Estimate: 1h. Size=XS. Zone=`apps/mcp-server/`. Owner=dev-mcp-server. NFR-3 BCTC-freeze: not BCTC-touching, NOT blocked. Recurring-bug-escalation: this is 2nd projectRoot-anti-pattern fix in 4h (after 2f0a74e9 DAILYDASH), but grep confirms tasksMdJanitorJob.ts:501 is the LAST occurrence in the codebase — AC-2 lint test seals the regression door, so no architect rethink needed (closing not chasing). | HIGH | FIX | dev-mcp-server | docs/signals/po-c247-cron-0307Z-batch-fix.json | — |

(Abbreviated: 82 additional Backlog + Done rows archived. See git history for full content prior to 2026-05-24.)

---

## Done

(80+ Done rows archived from TASKS.md. See git history for full content prior to 2026-05-24.)
