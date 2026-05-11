# Architecture Brief — Sprint 1871 Reconciliation Batch

**Date:** 2026-05-11
**Author:** architect
**Input:** MEMORY.md + brownfield scan of apps/mcp-server + .claude/knowledge + docs/ARCHITECTURE.md + docs/data/
**Status:** READY — hand to PM for TASKS.md insertion

---

## 1. Drift Survey

### D1 — ARCHITECTURE.md tool & scheduler counts are stale (code-says-132/53-but-doc-says-112/50)

`docs/ARCHITECTURE.md` line 78: "MCP Server: 112 tools, 50 cron jobs".
`docs/data/project-stats.json`: `toolCount: 132`, `schedulerFileCount: 50`.
Code reality:
- `cronConfig.ts` defines **56 cron keys**
- `startScheduler.ts` calls `cron.schedule()` **53 times** (plus 3 startup probes)
- `src/scheduler/` contains **62 TypeScript files** (ARCH says "38 files")

The discrepancy in `schedulerFileCount: 50` in project-stats vs 60+ actual `.ts` files is a secondary mismatch. The primary mismatch is ARCHITECTURE.md frozen at 112/50 from Phase-3 deploy, never updated after Sprint 054–1867.

**Confirmable:** `grep "112 tools\|50 cron\|38 files" docs/ARCHITECTURE.md` returns exact matches.

---

### D2 — ARCHITECTURE.md infrastructure/ folder tree is missing 7 subdirectories

`docs/ARCHITECTURE.md` folder tree under `infrastructure/` lists only: `db/`, `fetchers/`, `notifiers/`, `rag/`.

Actual code has **11 subdirectories**:
```
infrastructure/
  adapters/       ← NOT in ARCH
  agents/         ← NOT in ARCH
  cache/          ← NOT in ARCH
  db/
  fetchers/
  fileStore/      ← NOT in ARCH (holds alertVerdictStore used by Sprint 1863)
  microservices/  ← NOT in ARCH
  notifiers/
  observability/  ← NOT in ARCH
  rag/
  vps/            ← NOT in ARCH
```

`infrastructure/fileStore/alertVerdictStore.ts` is the primary store for alert verdicts (Sprint 1863) — it is entirely absent from the ARCHITECTURE.md tree. Agents, cache, observability, vps, microservices subdirectories likewise absent.

**Confirmable:** `find apps/mcp-server/src/infrastructure -maxdepth 1 -type d`

---

### D3 — ARCHITECTURE.md tools/ module tree missing `analysis/` and `backtesting/` modules

`docs/ARCHITECTURE.md` lists 10 tool module subdirectories (market-data, financial-reports, news-analysis, alerts, portfolio, briefings, macro, sector, kinhdich, system). It omits two live modules:

- `interface/mcp/tools/analysis/` — `sequential_market_analysis` tool (Sprint 1842+)
- `interface/mcp/tools/backtesting/` — `run_backtest`, `get_backtest_runs`, `get_backtest_run` (Sprint 1842d/1844a)

Both modules are exported from `tools/index.ts` and have entries in `.claude/tools/list/`. The Module Boundaries table and the folder tree in ARCHITECTURE.md do not reference them.

**Confirmable:** `find apps/mcp-server/src/interface/mcp/tools -maxdepth 1 -type d | sort`

---

### D4 — cron-registry.json is missing 12+ jobs that are registered in startScheduler

`docs/data/cron-registry.json` contains **41 job entries** (SSOT per `cron-jobs.md`).
`apps/mcp-server/src/scheduler/cronConfig.ts` defines **56 keys**.
`startScheduler.ts` calls `cron.schedule()` **53 times**.

Jobs confirmed in code/cronConfig but absent from cron-registry.json include:
`verdictResolutionJob`, `alertOutcomeJob`, `signalOutcomeJob`, `vpsServiceHealth`, `freshnessSlaMonitor`, `dailyDashboard`, `parallelServiceDispatcher`, `foreignFlowFetch`, `bctcPdfPull`, `bctcQueueEnricher`, `marketEarningYield`, `bctcBatchSweep`, `integrityCheck`.

`project-stats.json` field `schedulerFileCount: 50` is also stale vs 60 actual scheduler `.ts` files.

**Confirmable:** `python3 -c "import json; d=json.load(open('docs/data/cron-registry.json')); print(len(d['jobs']))"` → 41

---

### D5 — `tran-ngoc-bau` flow calls `get_agent_signals` with wrong params (tool requires `agent`, flow passes `limit`/`hours`)

`apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` registers `get_agent_signals` with schema:
```typescript
{
  agent: z.string()  // REQUIRED — no .optional()
  status: z.enum(["unread","all"]).default("unread")
}
```

`.claude/flows/tran-ngoc-bau/main.md` line 83 calls:
```
get_agent_signals(limit=200, hours=24)
```
Neither `limit` nor `hours` are valid params. `agent` is missing entirely. The call will fail at runtime with a Zod validation error.

This is the "F8" open architectural question confirmed as a real drift. The same issue may affect other flows that omit `agent` — news-scout/cycle.md (line 28) is correct (passes `"agent": "news-scout"`). The tran-ngoc-bau flow is the confirmed broken caller.

**Confirmable:** `grep -n "get_agent_signals" .claude/flows/tran-ngoc-bau/main.md` → line 83

---

### D6 — DDD violation: `domain/repositories/IVnstockRepository.ts` imports from `infrastructure/fetchers/`

`docs/ARCHITECTURE.md` DDD rule: "domain/ never imports infrastructure/".
`apps/mcp-server/src/domain/repositories/IVnstockRepository.ts` line 17:
```typescript
} from "../../infrastructure/fetchers/vnstockBridge.js";
```

The domain repository interface is importing concrete infrastructure types (vnstock bridge types) rather than owning its own DTOs. This makes the domain layer depend on an infrastructure detail, inverting the dependency arrow. The dev-standards.md DDD contract says "domain ← application ← interface ← scheduler; cross-layer: inward only."

Secondary related: `domain/models/shared-types.ts` also has inline sourcing comments pointing to `infrastructure/fetchers/` types (lines 14, 51, 68, 111) indicating the pattern is repeated across the domain models file.

**Confirmable:** `grep "infrastructure/fetchers" apps/mcp-server/src/domain/repositories/IVnstockRepository.ts`

---

### D7 — `alert-policy.md` mischaracterizes alert verdict storage as DB column aggregate; actual store is fileStore JSON

`.claude/knowledge/alert-policy.md` line 68 states:
> "Verdict outcomes stored in `agent_signals.outcome` column. Aggregate data → `docs/data/alert-verdicts.json`"

Code reality (Sprint 1863):
- `agent_signals.outcome` column: correct — verdictResolutionJob writes here after price evaluation
- `docs/data/alert-verdicts.json`: NOT an aggregate of the DB column. It is the **primary pending-verdict store** written by `write_alert_verdict` MCP tool at alert-fire time, and *read* by verdictResolutionJob to find what to resolve
- Store path: `apps/mcp-server/src/infrastructure/fileStore/alertVerdictStore.ts`

The knowledge file describes the flow backwards. Agents reading this (alert-commander, tran-ngoc-bau) may skip calling `write_alert_verdict` believing the DB column is the entry point, when in fact the JSON file is where pending verdicts are registered first.

**Confirmable:** Read `infrastructure/fileStore/alertVerdictStore.ts` lines 100-110 (path hardcoded), then compare to `alert-policy.md` line 68.

---

## 2. Task Table

> Sprint label: SPRINT-S (≤30 lines, ≤5 files, 1 domain)
> Priority column: H=High (contract breakage), M=Medium (doc staleness), L=Low

| ID | Description | Priority | Sprint | Agent | Date |
|----|-------------|----------|--------|-------|------|
| 1871a | SPRINT-S: Update ARCHITECTURE.md MCP Server tool+cron counts. Zone: docs/ARCHITECTURE.md. Drift: doc says "112 tools, 50 cron jobs, 38 files" but code has 132 tools, 56 cronConfig keys, 62 scheduler files. Files: docs/ARCHITECTURE.md, docs/data/project-stats.json. AC: reconciliation-direction = doc-updated, ARCHITECTURE.md lines 78+188 corrected to match project-stats.json + actual file counts, divergence root-cause in task report. | M | SPRINT-S | developer | 2026-05-11 |
| 1871b | SPRINT-S: Expand ARCHITECTURE.md infrastructure/ folder tree to include all 11 subdirectories. Zone: docs/ARCHITECTURE.md. Drift: doc lists only 4 infra subdirs (db/fetchers/notifiers/rag/) but code has 11 (adds adapters/agents/cache/fileStore/microservices/observability/vps/). Critical: fileStore/alertVerdictStore.ts (Sprint 1863 primary store) is entirely absent. Files: docs/ARCHITECTURE.md. AC: reconciliation-direction = doc-updated, all 11 subdirectories in tree with one-line description each, divergence root-cause in task report. | H | SPRINT-S | developer | 2026-05-11 |
| 1871c | SPRINT-S: Add analysis/ and backtesting/ to ARCHITECTURE.md Module Boundaries table and folder tree. Zone: docs/ARCHITECTURE.md. Drift: doc lists 10 tool modules, code has 12 (adds analysis/ with sequential_market_analysis; backtesting/ with run_backtest + get_backtest_runs + get_backtest_run). Files: docs/ARCHITECTURE.md. AC: reconciliation-direction = doc-updated, Module Boundaries table row added per module with tool names listed, folder tree entry added, divergence root-cause in task report. | M | SPRINT-S | developer | 2026-05-11 |
| 1871d | SPRINT-S: Backfill 12+ missing jobs in cron-registry.json and correct project-stats.json schedulerFileCount. Zone: docs/data/. Drift: cron-registry.json has 41 jobs, cronConfig.ts defines 56 keys; project-stats.json schedulerFileCount=50 but 60 non-index scheduler .ts files exist. Missing jobs include: verdictResolutionJob, alertOutcomeJob, signalOutcomeJob, vpsServiceHealth, freshnessSlaMonitor, dailyDashboard, foreignFlowFetch, bctcPdfPull, bctcQueueEnricher, marketEarningYield, bctcBatchSweep, integrityCheck. Files: docs/data/cron-registry.json, docs/data/project-stats.json. AC: reconciliation-direction = doc-updated, cron-registry.json entry count matches cronConfig.ts key count ±startup-only probes, schedulerFileCount corrected, divergence root-cause in task report. | M | SPRINT-S | developer | 2026-05-11 |
| 1871e | SPRINT-S: Fix tran-ngoc-bau flow get_agent_signals call — passes wrong params (limit/hours), omits required agent param. Zone: .claude/flows/tran-ngoc-bau/main.md. Drift: tool schema requires {agent: string, status?} but flow calls get_agent_signals(limit=200, hours=24) — Zod validation fails at runtime. Files: .claude/flows/tran-ngoc-bau/main.md. AC: reconciliation-direction = doc-updated (flow fixed), call updated to pass agent="tran-ngoc-bau" with correct schema, runtime error no longer possible, divergence root-cause in task report. | H | SPRINT-S | developer | 2026-05-11 |
| 1871f | SPRINT-S: Resolve DDD violation in domain/repositories/IVnstockRepository.ts importing from infrastructure/fetchers/vnstockBridge.js. Zone: apps/mcp-server/src/domain/. Drift: doc rule says "domain/ never imports infrastructure/" but IVnstockRepository.ts line 17 imports from ../../infrastructure/fetchers/vnstockBridge.js; domain/models/shared-types.ts has secondary sourcing-comment coupling to 4 infra fetcher types. Files: apps/mcp-server/src/domain/repositories/IVnstockRepository.ts, apps/mcp-server/src/domain/models/shared-types.ts. AC: reconciliation-direction = code-fixed OR doc-updated (developer decides after root-cause): either extract shared types into domain/models/vnstockTypes.ts (inversion fix) or document the exemption with rationale in ARCHITECTURE.md, divergence root-cause in task report. | H | SPRINT-S | dev-mcp-server | 2026-05-11 |
| 1871g | SPRINT-S: Correct alert-policy.md verdict storage description — fileStore is primary write target, not DB column aggregate. Zone: .claude/knowledge/alert-policy.md. Drift: policy says "Verdict outcomes stored in agent_signals.outcome column. Aggregate data → docs/data/alert-verdicts.json" but actual flow is: write_alert_verdict MCP tool writes to alert-verdicts.json (primary store via infrastructure/fileStore/alertVerdictStore.ts) → verdictResolutionJob reads JSON, resolves price delta, then writes outcome to agent_signals.outcome column. Files: .claude/knowledge/alert-policy.md. AC: reconciliation-direction = doc-updated, Signal Verdict Lifecycle section accurately describes the two-stage write pattern (JSON first → DB second), divergence root-cause in task report. | H | SPRINT-S | developer | 2026-05-11 |

---

## 3. Routing Column Rationale

| ID | Routed to | Reason |
|----|-----------|--------|
| 1871a | `developer` | Pure doc edit in docs/ — no service-specific domain |
| 1871b | `developer` | Pure doc edit in docs/ — cross-infra, not owned by one service |
| 1871c | `developer` | Pure doc edit in docs/ — cross-tool-module |
| 1871d | `developer` | data/ JSON backfill — cross-scheduler, not service-specific |
| 1871e | `developer` | .claude/flows/ edit — agent flow, not a service |
| 1871f | `dev-mcp-server` | Code change in apps/mcp-server/src/domain/ — requires TypeScript edit + test run |
| 1871g | `developer` | .claude/knowledge/ edit — knowledge SSOT, not service-specific |

---

## 4. Sequencing Notes

**Tier 1 — Independent, can run in parallel:**
- 1871a, 1871c, 1871e, 1871g
  - 1871a and 1871c both edit ARCHITECTURE.md but non-overlapping sections (line 78 counts vs Module Boundaries table) — assign to same developer in sequence to avoid conflict, or split PR sections.
  - 1871e and 1871g edit different files with no overlap.

**Tier 2 — Depends on Tier 1 completion:**
- 1871b must come AFTER 1871a if both assigned to same person editing ARCHITECTURE.md (avoid merge conflict). Safe to parallelize with different developers owning separate PRs.
- 1871d is independent of all others (data/ only).

**Tier 3 — Code change requiring test run:**
- 1871f must run AFTER 1871g (1871g clarifies the expected behavior, which informs whether the domain violation is a true inversion or an acceptable shared-types exemption). If 1871g clarifies it is an exemption, 1871f becomes doc-only.

**File conflict risk:** 1871a + 1871b + 1871c all touch `docs/ARCHITECTURE.md`. Assign in sequence (a → b → c) or to one developer.

---

## 5. Sizing Reality Check

All 7 tasks are within SPRINT-S envelope (≤30 lines changed, ≤5 files, 1 domain):

| ID | Estimated lines | Files | Verdict |
|----|----------------|-------|---------|
| 1871a | 3–5 line edits | 2 | SPRINT-S |
| 1871b | 15–20 line additions | 1 | SPRINT-S |
| 1871c | 10–15 line additions | 1 | SPRINT-S |
| 1871d | ~40 JSON entries added | 2 | SPRINT-S (JSON append, no logic) |
| 1871e | 3–5 line edit | 1 | SPRINT-S |
| 1871f | 5–15 line edit or type extraction | 2 | SPRINT-S |
| 1871g | 5–8 line rewrite | 1 | SPRINT-S |

1871d is JSON-append only — no TypeScript changes — fits the envelope despite 40+ JSON lines.

---

## 6. Drifts Considered But Rejected

| Candidate | Reason rejected |
|-----------|----------------|
| Interface tools importing directly from infrastructure/db (85 occurrences across tools/) | Scope is too large for SPRINT-S — this is a systemic architectural pattern, not a single drift point. Would require a full DDD remediation sprint. Flagged as a known pattern in dev-standards.md already. |
| `project-stats.json` currentSprint=1867 vs pipeline-state.json currentSprint=1872 | These two files have different maintenance owners and update cadences by design. Not a structural mismatch. |
| `cron-jobs.md` intelligence cycle step list references legacy step labels (A, A2, A3b, B, C, D, E) that may not map 1:1 to current intelligenceCycleJob implementation | Insufficient confirmation signal without reading intelligenceCycleJob.ts deeply — deferred to a dedicated audit task if the team wants it. |
| `docs/ARCHITECTURE.md` database section says "market.db READ: technical-analysis, macro-indicators, kinh-dich-service (readonly:true)" — needs verification against docker-compose.yml volume mounts | This is an infra/ops verification task, not a code-doc drift the developer can fix without running containers. Redirect to ops if needed. |
