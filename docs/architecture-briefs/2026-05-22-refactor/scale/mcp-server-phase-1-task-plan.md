---
title: "Phase 1 Task Plan — mcp-server (TypeScript/Bun) — FULL Track"
date: "2026-05-25"
author: "architect (P0-MCP-5)"
pilot: "mcp-server"
fleet_pilot_number: 11
phase: "1"
status: "READY-FOR-DISPATCH — pending PO sequencing signal (RUN-SOLO, SCHEDULE LAST)"
sprint_kickoff: "TBD — PO sequencing signal required"
sprint_deadline: "TBD + 6 sprints"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
brownfield_ref: "docs/handoffs/TASK_P0-MCP-1-brownfield-inventory.md"
bug_baseline_ref: "docs/handoffs/TASK_P0-MCP-2-bug-inventory-baseline.md"
language: "TypeScript"
runtime: "Bun 1.3.13 / Ubuntu 22.04"
owner: "dev-mcp-server"
wip_limit: 1
schedule_constraint: "RUN-SOLO — zero other scale terminals active. LAST after ALL other service pilots complete."
risk: "HIGHEST"
mvr_verdict: "FULL"
---

# Phase 1 Task Plan — `mcp-server` (TypeScript/Bun) — FULL Track

**Generated:** 2026-05-25 by architect (Phase 0, task P0-MCP-5)
**Zone:** `apps/mcp-server/` ONLY (anti-scope-creep clause binding)
**Owner:** `dev-mcp-server` specialist
**Language:** TypeScript / Bun 1.3.13 (locked — not a rewrite candidate; sole MCP interface + scheduler host)
**WIP:** 1 task at a time, SOLO terminal, throughout entire Phase 1
**Status:** READY-FOR-DISPATCH — awaiting PO sequencing signal

---

## CRITICAL SCHEDULING CONSTRAINT — READ BEFORE DISPATCHING

This service runs **LAST** and **SOLO**. No other scale terminal may be active while any mcp-server Phase 1 task is in progress. This is non-negotiable per the charter (`docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md` §Scheduling Mandate).

Rationale:
1. **Shared-substrate write surface.** mcp-server writes `docs/signals/`, `docs/data/`, the scheduler state, and `market.db`. Other active terminals writing the same paths produce the concurrent-commit-race + SSOT-duplicate-key class of failures already documented in this repo.
2. **146-tool blast radius.** Any barrel edit in the 12-module interface-layer tree can silently break multiple tools. QA gate covers all 146 tools after every wave.
3. **68-cron-job coupling.** Scheduler job registrations are import-coupled to every barrel file. A broken import in any barrel silences that cron at startup with no visible error.

**PO must emit a sequencing signal confirming all other service pilots are DONE (or at minimum all active scale terminals are stopped) before dispatching P1-A.**

---

## GIT DISCIPLINE RULES — BINDING FOR EVERY COMMIT IN THIS ZONE

These rules are non-negotiable. Violations in this zone have caused 26-file over-staging incidents.

1. **Explicit-file staging ONLY.** `git add <exact-path>` per file. NEVER `git add -A`, `git add .`, `git add -am`, or any wildcard flag.
2. **Pre-commit diff review.** Run `git diff --cached --name-only` and verify ONLY the intended files appear before committing.
3. **Acquire commit-mutex** before staging → skill: `.claude/skills/commit-mutex/SKILL.md` (kind='sprint-task', key='commit-mutex:main', TTL=60s per BUG-1 enum-drift workaround). Stage → verify diff → commit → release.
4. **No --force, --no-verify, --no-gpg-sign.**
5. **All work on main. No branches.**
6. **SOLO terminal confirmation.** Confirm no other scale terminal is active before each commit wave.
7. **Pre-commit: verify no `.git/index.lock` and no live git process** (`ps aux | grep git`) before staging.

**BUG-1 workaround reminder (commit-mutex enum drift):** The `task_claim` tool enum lacks `commit-mutex` kind. Acquire mutex using `kind='sprint-task'`, `task_id='commit-mutex:main'`. This is the binding workaround until the enum is extended.

---

## MVR-vs-FULL Scope Verdict — BINDING

**VERDICT: FULL (Minimum Viable Refactor path is NOT appropriate for mcp-server)**

**Rationale from brownfield (P0-MCP-1 §9):** mcp-server IS the domain host. It does not delegate to itself. The MVR path (dashboards + scenarios only, skip primitive extraction and barrel decomposition) is correct for services whose business logic was already extracted upstream. mcp-server is the opposite: it IS the orchestration host, the scheduler host, the single MCP interface, and the trust gateway for all 146 tools. Every G1-G12 goal must be proven here directly.

Specific factors that make FULL mandatory:
- **No upstream service to fall back to.** If a barrel edit silences a tool, there is no fallback service. The blast radius is the entire user-visible tool surface.
- **G5-inverse is the dominant risk.** Two live R-CRITICAL violations exist (`kinhDichWrapper` bypass in 2 tool files + `QUE_META` import in `portfolioTools.ts`). These must be remediated with "every handler proven HTTP-routed" evidence — this is FULL scope work, not MVR.
- **G4 ESLint fence does not exist.** The only current architecture fence is a single lint test (`no-local-project-root.test.ts`). Installing `eslint-plugin-boundaries` is a FULL G4 deliverable.
- **G6 trust dashboard does not exist.** The existing BCTC inspector and news-fetch dashboard are operational dashboards, not the G6 three-tier trust layer. The trust dashboard must be built from scratch.
- **3 barrel seams require decomposition waves.** `system/` (21 files), `macro/` (14 files), `sector/` (15 files) are Priority-1 barrel violations — each requires its own QA-gated wave.

---

## Phase 1 Overview

Phase 1 for `mcp-server` has **four equal-weight tracks** that run sequentially (WIP=1):

**Track A — Sandbox + Dashboard Foundation (P1-A, P1-B):**
Build the mcp-server sandbox runner and the three-tier trust dashboard stub. This enables G1/G6 in Phase 2 and establishes the G12 DoD gate evidence infrastructure.

**Track B — Barrel Decomposition Waves (P1-C, P1-D, P1-E):**
Decompose the 3 Priority-1 barrel seams identified by P0-MCP-1: `system/` (21 files → 5 sub-barrels), `macro/` (14 files → HTTP-proxy vs local-computation split), `sector/` (15 files → 3 cluster cuts). Each wave is QA-gated against the full 146-tool surface before the next wave starts. These are the **G12 streak tasks** (P1-B/P1-C/P1-D per `.claude/flows/dev-mcp-server/main.md` §G12 Streak Rule).

**Track C — G5-Inverse Remediation (P1-F, P1-G):**
Remediate the R-CRITICAL `kinhDichWrapper` bypass, resolve `portfolioTools.ts QUE_META` import, and verify the `pdf.ts`/`pdfOcrWorker.ts` post-1954c state. Each task ends with "every handler proven HTTP-routed" evidence.

**Track D — G1 Primitive Scaffolding (P1-H):**
Extract the secondary primitive candidates (signal-bus helper, sector-classifier) as scenario-JSON-testable pure functions. Validates that the barrel decomposition produced clean seams.

**Closing tasks:** P1-QA (Phase 1 close-gate), P1-EXIT (PO SSOT reconciliation + pilot-status flip).

Phase 1 does NOT:
- Install the G4 ESLint architecture fence (Phase 2)
- Delete any files from `domain/services/kinhDich/` (Phase 2 G5 delete)
- Promote primitives to `packages/primitives/` (Phase 2 G1-full)
- Execute G10/G11 bug injection cycles (Phase 2)

Phase 1 DOES:
- Establish the three-tier trust dashboard stub (enables G6 Phase 2 readiness)
- Decompose the 3 Priority-1 barrel seams into bounded sub-barrels
- Verify the G5-inverse routing state for every handler touching kinh-dich, macro, and pdf-extractor
- Prove the kinhDichWrapper bypass is remediated with HTTP-route evidence
- Scaffold 2 primitive candidates (scenario-JSON-testable, pure, zero I/O)
- Demonstrate G12 streak (3 consecutive tasks dashboard/test-green before DONE)

---

## Pre-Revert Tags

| Tag | Created at | Purpose |
|---|---|---|
| `mcp-server-pre-barrel-wave1` | Start of P1-C | Rollback anchor before system/ barrel split |
| `mcp-server-pre-barrel-wave2` | Start of P1-D | Rollback anchor before macro/ barrel split |
| `mcp-server-pre-barrel-wave3` | Start of P1-E | Rollback anchor before sector/ barrel split |
| `mcp-server-pre-g5-remediation` | Start of P1-F | G5-inverse rollback anchor before kinhDichWrapper rewire |
| `mcp-server-pre-ci` | Phase 2, P2-A | G4 ESLint fence freeze anchor |
| `mcp-server-pre-delete` | Phase 2, P2-G5a | G5 rollback anchor before `_deprecated/` moves |
| `mcp-server-pre-inject` | Phase 2, QA task | G10 rollback anchor before bug injection |

No Phase 1 tags other than the three barrel wave tags need to be created. The G5-inverse remediation tag (`mcp-server-pre-g5-remediation`) is created at P1-F start.

---

## G12 Streak Tasks (3-Task Streak — Binding)

Per `.claude/flows/dev-mcp-server/main.md` §G12 Streak Rule, the three G12 streak tasks for Phase 1 are:

1. **P1-B** (three-tier dashboard stub) — G12 streak task #1
2. **P1-C** (barrel wave 1: system/ decomposition) — G12 streak task #2
3. **P1-D** (barrel wave 2: macro/ split) — G12 streak task #3

**Streak rule (binding):** Each of these tasks must carry BOTH gate evidence pasted into its handoff before it is marked DONE:
- Gate 1: `bun test` showing pass ≥9408 / fail ≤348
- Gate 2: Tool-suite probe showing tsc EXIT:0 + server health 200 + tool count ≥146 + scheduler count 68

The streak is broken if ANY task in the sequence ships without this evidence. If broken: reopen the task, re-run both gates, re-paste evidence before re-marking DONE.

**G12 Canonical source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12.

---

## Task Ledger

| ID | Title | Goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|----------------|--------|------------|-----|----------|
| **P1-A** | Sandbox runner + scenario scaffolding | G1, G7 | P1-B | — | 3h | 7 |
| **P1-B** | Three-tier trust dashboard stub | G6, G8, G9, G12 | P1-C | P1-A | 3h | 8 |
| **P1-C** | Barrel wave 1: `system/` (21 files → 5 sub-barrels) | G2, G12 | P1-D | P1-B | 5h | 10 |
| **P1-D** | Barrel wave 2: `macro/` (14 files → HTTP-proxy vs local-computation) | G2, G12 | P1-E | P1-C | 5h | 10 |
| **P1-E** | Barrel wave 3: `sector/` (15 files → 3 cluster cuts) | G2 | P1-F | P1-D | 4h | 9 |
| **P1-F** | G5-inverse remediation: kinhDichWrapper bypass + QUE_META | G5 | P1-G | P1-E | 4h | 11 |
| **P1-G** | G5-inverse remediation: pdf.ts / pdfOcrWorker.ts post-1954c verify | G5 | P1-H | P1-F | 2h | 6 |
| **P1-H** | G1 primitive scaffolding: signal-bus-helper + sector-classifier | G1, G7 | P1-QA | P1-E | 3h | 8 |
| **P1-QA** | Phase 1 close-gate verification | G1, G2, G5, G6, G7, G8, G12 | P1-EXIT | P1-H | 1h | 9 |
| **P1-EXIT** | PO: SSOT reconciliation note + pilot-status Phase 1 close | — | — | P1-QA | — | — |

**Total atomic tasks:** 10 (9 dev + 1 PO close-out)
**Total estimated dev effort:** ~30h (1.5-2 sprints at RUN-SOLO pace)
**Total AC count:** 78

---

## Regression Tripwires — Re-Checked After EVERY Wave

The following probes are carried from P0-MCP-2 bug-inventory baseline. They MUST be re-run and compared after every barrel wave (P1-C, P1-D, P1-E) and after every G5-inverse task (P1-F, P1-G). A deviation from any tripwire is a **blocking regression**.

| Tripwire | Baseline | Probe Command | Block if |
|----------|----------|---------------|----------|
| **Tool count** | ≥146 | `grep -rn "server\.tool(" apps/mcp-server/src --include="*.ts" \| grep -v "//" \| wc -l` | < 146 |
| **Gate 2c tool count** | ≥146 | `grep -rc "server.tool\|addTool" apps/mcp-server/src/interface/mcp/tools/ \| awk -F: '{sum+=$2} END {print sum}'` | drops vs pre-wave |
| **Scheduler (Gate 2d)** | 68 | `grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts` | ≠ 68 |
| **cronConfig.ts keys** | 73 | `grep -E "^\s+\w+:" apps/mcp-server/src/scheduler/cronConfig.ts \| grep "Bun\.env" \| wc -l` | < 73 |
| **TypeScript** | EXIT:0 | `cd apps/mcp-server && bun run check` | non-zero exit |
| **bun test pass** | ≥9408 | `cd apps/mcp-server && bun test` | < 9408 pass |
| **bun test fail** | ≤348 | `cd apps/mcp-server && bun test` | > 348 fail |
| **Dashboard BCTC inspect** | HTTP 200 | `curl -s http://localhost:3000/api/bctc-inspect \| head -5` | 500 or empty |
| **Dashboard news-fetch** | HTTP 200 | `curl -s http://localhost:3000/dashboards/news-fetch/ \| head -5` | 500 or empty |
| **No new domain→infra import** | 0 matches | `grep -r "from.*infrastructure" apps/mcp-server/src/domain/ --include="*.ts"` | any match |

These tripwires are SSOT-binding baselines from P0-MCP-2. Post-barrel evidence must be pasted into each task handoff before RETURN.

---

## Barrel Decomposition Waves — Sequencing and Rationale

The barrel-decomposition waves are ordered **smallest-blast-radius first**. Each wave is QA-gated against all 146 tools before the next wave starts.

### Why This Ordering

**Wave 1 (`system/`, 21 files):** Largest file count but most self-contained sub-domains. The 5 natural clusters (memory/coordination/ops-debug/observability/VPS) have minimal import fan-in from tool handlers outside `system/`. A wrong import in `system/` produces a visible startup error (the coordination tools are scaffolded at startup), making regression detection fast.

**Wave 2 (`macro/`, 14 files):** Chosen second because the HTTP-proxy vs local-computation split is structurally well-defined (P0-MCP-1 §2 SEAM-2). The `macroHttpClient.ts` + `macroSnapshotGuard.ts` routing helpers are already isolated, so the split seam is clean. The macro barrel has medium import fan-in (mainly from `macro/` tool handlers and the `macroIndicatorRefreshJob`).

**Wave 3 (`sector/`, 15 files):** Third because sector files are largely self-contained per-topic files with low cross-domain fan-in. Each cluster cut (domestic/market/cross-cutting) can be verified independently. `severityLabels.ts` is extracted as a primitive candidate at this wave.

**After Wave 3:** G5-inverse remediation (P1-F, P1-G) runs against the now-stable barrel structure. Primitive scaffolding (P1-H) runs last, using the clean barrel seams as extraction targets.

---

## Per-Task Acceptance Criteria

---

### P1-A — Sandbox Runner + Scenario Scaffolding

**Goals advanced:** G1 (primitive scenarios), G7 (edit-JSON-rerun)
**Blocks:** P1-B
**Blocked by:** none (first task)
**Estimated:** 3h
**Files to create:**
- `apps/mcp-server/src/sandbox/runner.ts` — scenario loader + dispatch + `--emit-traces` flag
- `apps/mcp-server/src/sandbox/types.ts` — `ScenarioInput`, `TraceOutput` interfaces
- `apps/mcp-server/src/sandbox/scenarios/` — directory
- `apps/mcp-server/src/sandbox/scenarios/sparkline-golden-happy.json`
- `apps/mcp-server/src/sandbox/scenarios/sparkline-golden-empty.json`
- `apps/mcp-server/src/sandbox/scenarios/sparkline-failure-null.json`
- `apps/mcp-server/dashboard/traces/` — directory (sandbox runner writes here)

**Background:** The mcp-server sandbox verifies pure-function domain services (candidates for Phase 2 primitive extraction). It does NOT exercise HTTP routes or the full MCP server. The first target is `domain/services/sparkline.ts` — a pure bar-chart generator with zero I/O, zero imports from infrastructure.

**Security clause (mandatory):** The sandbox runner MUST have zero DB credentials and zero external API keys in its process environment. Verify: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty when running the sandbox runner in isolation.

**AC-1:** `src/sandbox/runner.ts` exists. Imports ONLY from `src/domain/services/` pure functions. ZERO infrastructure imports (`grep -r "from.*infrastructure" src/sandbox/runner.ts` returns 0).

**AC-2:** `src/sandbox/types.ts` exports `ScenarioInput` and `TraceOutput` interfaces. Both are pure-data types (no class instances, no I/O types).

**AC-3:** 3 scenario JSON files created for `sparkline`: happy path (valid price array → sparkline string), empty input ([] → empty sparkline), null input (null → expected error output). Scenario schema: `{ "scenario": "...", "input": {...}, "expected": {...} }`.

**AC-4:** `bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/sparkline-golden-happy.json` exits 0 and writes trace to `dashboard/traces/`.
`bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/sparkline-failure-null.json` exits non-zero with expected output matched.

**AC-5 (zero-creds audit):** `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty in sandbox runner process context. Evidence pasted in handoff.

**AC-6 (regression tripwires):** `bun test` passes (pass ≥9408, fail ≤348). `bun run check` exits 0. Tool count unchanged. Scheduler count 68. Evidence pasted.

**AC-7:** `git diff --cached --name-only` before commit shows ONLY the new sandbox files. No scheduler, no tool handler, no infra files staged.

**G12 gate:** NOT yet in effect (streak starts at P1-B). But both tripwires must still pass.

---

### P1-B — Three-Tier Trust Dashboard Stub

**Goals advanced:** G6 (trust layer renders), G8 (honest red/green), G9 (dashboard trust contract), G12 (streak #1)
**Blocks:** P1-C
**Blocked by:** P1-A
**Estimated:** 3h
**Files to create/modify:**
- `apps/mcp-server/dashboard/index.html` (CREATE — three-panel stub)
- `apps/mcp-server/src/sandbox/runner.ts` (MODIFY — confirm `--emit-traces` writes to `dashboard/traces/`)

**Background:** This is the G6 trust layer for mcp-server. The dashboard reads from static `traces/` JSON written by the sandbox runner. Phase 1 delivers a functional stub; Phase 2 fills in the module and microservice panels. The dashboard must open via `file://` URL with zero network dependency.

**CSS namespace rule:** Use `.mcp-*` class namespace. NEVER use `dot-*`, `.category-chip`, or `"not wired"` / `"not_wired"` text (dash-check conventions carried from Go service pilots).

**Three panels required:**
1. **Primitives panel** — reads `dashboard/traces/*.json`, shows one card per scenario trace. Green dot = pass, red dot = fail.
2. **Module panel** — "Phase 2 — not yet extracted" placeholder. No JavaScript errors.
3. **Microservice panel** — "146 tools registered (static — Phase 2 live link)" static label.

**AC-1:** `dashboard/index.html` opens via `file://` URL. Three panels visible without server dependency.

**AC-2:** Primitives panel shows sparkline scenario cards loaded from `dashboard/traces/` JSON files. At least 1 card with green dot (happy path), 1 card with red dot (failure scenario).

**AC-3:** Module panel shows "Phase 2 — not yet extracted" placeholder. Zero JavaScript console errors.

**AC-4:** Microservice panel shows "~146 tools registered" static text. No live HTTP call to mcp-server from the dashboard (file:// mode, no CORS).

**AC-5 (G8 honest red/green):** Dev deliberately edits `sparkline-golden-happy.json` `expected` value to a wrong output, reruns sandbox, refreshes dashboard — card flips red. Reverts expected, reruns — card returns green. Evidence (before/after screenshots or trace JSON diff) pasted in handoff.

**AC-6:** `bun run src/sandbox/runner.ts --emit-traces` writes `dashboard/traces/<scenario-name>.json`. Dashboard reloads and shows updated trace.

**AC-7 (regression tripwires):** `bun test` pass ≥9408, fail ≤348. `bun run check` exits 0. Tool count ≥146. Scheduler count 68. Dashboard routes BCTC+news-fetch HTTP 200. Evidence pasted.

**AC-8:** `git diff --cached --name-only` before commit shows ONLY dashboard files and sandbox runner. No unintended files.

**G12 gate (streak #1 — binding):** Task DONE only after AC-5 (honest red/green proof) AND AC-7 (all tripwires green) evidence is pasted into handoff. Screenshot of three-panel dashboard with at least one red and one green card required before RETURN.

---

### P1-C — Barrel Wave 1: `system/` (21 files → 5 sub-barrels)

**Goals advanced:** G2 (module composes from bounded sub-barrels), G12 (streak #2)
**Blocks:** P1-D
**Blocked by:** P1-B
**Estimated:** 5h
**Pre-revert tag:** `mcp-server-pre-barrel-wave1` (create BEFORE any file edit)
**Zone files touched:**
- `apps/mcp-server/src/interface/mcp/tools/system/index.ts` (MODIFY — split into 5 sub-barrel index files)
- `apps/mcp-server/src/interface/mcp/tools/system/memory/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/system/coordination/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/system/ops-debug/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/system/observability/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/system/vps/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/index.ts` (MODIFY — re-point system import)

**Background (from P0-MCP-1 §2 SEAM-1):** The `system/` barrel contains 21 tool files spanning 5 logically distinct sub-domains:
- `memory/` — `agentMemoryTools.ts`, `agentMemoryUpdateTools.ts`, `agentWorkLogTools.ts`
- `coordination/` — `coordinationTools.ts`, `askQueueTools.ts`
- `ops-debug/` — `bctcDebugTriggerTool.ts`, `foreignFlowDebugTriggerTool.ts`, `newsDebugTriggerTool.ts`, `priceDebugTriggerTool.ts`, `sbvDebugTriggerTool.ts`
- `observability/` — `slaStatusTools.ts`, `signalDiagnosticsTools.ts`, `cronHealthTools.ts`, plus any system-monitoring files
- `vps/` — `vpsHealthTools.ts`, `vpsProxyTools.ts`, `vpsServiceRestartTool.ts`

The root `system/index.ts` becomes a thin re-exporter of 5 sub-barrel `index.ts` files. The tool files themselves do NOT move — only `index.ts` files are created/modified.

**What to do:**
1. Create `mcp-server-pre-barrel-wave1` git tag.
2. Read the full list of files in `src/interface/mcp/tools/system/` to confirm the exact 21 files before any edit.
3. Create 5 sub-barrel `index.ts` files, each re-exporting only the tool files belonging to that cluster. File format: same as existing barrel index (re-export all named exports, no logic).
4. Update root `system/index.ts` to import from the 5 sub-barrel index files instead of listing all 21 tool files directly.
5. Verify that the root `tools/index.ts` still imports from `./system/index.js` (no path change needed at the root level).
6. Run all regression tripwires.

**AC-1:** `mcp-server-pre-barrel-wave1` git tag created before any file edit. Tag SHA recorded in handoff.

**AC-2:** All 5 sub-barrel `index.ts` files created under `system/memory/`, `system/coordination/`, `system/ops-debug/`, `system/observability/`, `system/vps/`. Each file contains ONLY re-exports (no logic, no new imports from infrastructure).

**AC-3:** Root `system/index.ts` updated. Line count reduced (previously listing 21 individual files → now 5 import lines).

**AC-4:** `bun run check` (tsc --noEmit) exits 0.

**AC-5:** `bun test` pass ≥9408, fail ≤348.

**AC-6:** Server startup check: `bun run src/index.ts` starts without import errors. `curl -s http://localhost:3000/health` returns `{"ok":true}`.

**AC-7 (tool count probe):** `grep -rc "server.tool\|addTool" apps/mcp-server/src/interface/mcp/tools/ | awk -F: '{sum+=$2} END {print sum}'` — count ≥146 (no tool silenced by the split).

**AC-8:** Scheduler count probe: `grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts` = 68.

**AC-9:** Dashboard routes intact: `curl http://localhost:3000/api/bctc-inspect | head -5` returns HTML. `curl http://localhost:3000/dashboards/news-fetch/ | head -5` returns HTML. No 500.

**AC-10:** `git diff --cached --name-only` before commit shows ONLY `system/index.ts` + 5 new sub-barrel index files + root `tools/index.ts` if changed. No scheduler files, no domain files, no infra files.

**G12 gate (streak #2 — binding):** Task DONE only after AC-4 through AC-9 all pass with evidence pasted into handoff. Pre-revert tag SHA recorded. Both gates (bun test + tool-suite) confirmed before RETURN.

---

### P1-D — Barrel Wave 2: `macro/` (14 files → HTTP-proxy vs local-computation)

**Goals advanced:** G2, G12 (streak #3)
**Blocks:** P1-E
**Blocked by:** P1-C
**Estimated:** 5h
**Pre-revert tag:** `mcp-server-pre-barrel-wave2`
**Zone files touched:**
- `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` (MODIFY)
- `apps/mcp-server/src/interface/mcp/tools/macro/http-proxy/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/macro/local-computation/index.ts` (CREATE)

**Background (from P0-MCP-1 §2 SEAM-2):** The `macro/` barrel (14 files) has a natural split between:
- **HTTP-proxy tools** (delegate to `macro-indicators:5004` via `clients.ts`): `macroTools.ts`, `carryTools.ts`, `dinhGiaTools.ts`, `policyTools.ts`, `calibrationTools.ts`, `rateLimitTools.ts`, and any tools that call `getMacroSnapshot()` or `getMacroExternal()` from `clients.ts`.
- **Local-computation tools** (legitimately owned by mcp-server, NOT G5 targets): `investmentClockTools.ts`, `imfSignals.ts` (IMF fetch via `imfDataFetcher.ts`), `getFedLiquiditySpreadTool.ts`, `getIsmSubcomponentsTool.ts`, `evidenceTools.ts`, `predictionTools.ts`, and any tools that call local domain services in `domain/services/macro/`.

The split is NOT a DDD violation — local-computation tools are legitimately mcp-server-owned domain logic. The sub-barrel split makes the routing boundary explicit and reviewable.

**Routing helpers:** `macroSnapshotGuard.ts` belongs in `http-proxy/` (guards stale HTTP responses). Verify zero-IO before assigning.

**What to do:**
1. Create `mcp-server-pre-barrel-wave2` git tag.
2. Read all 14 tool files in `src/interface/mcp/tools/macro/` to confirm the HTTP-proxy vs local-computation classification for each.
3. Create `macro/http-proxy/index.ts` re-exporting HTTP-proxy tool files.
4. Create `macro/local-computation/index.ts` re-exporting local-computation tool files.
5. Update `macro/index.ts` to import from both sub-barrels.
6. Run all regression tripwires (same as P1-C AC-4 through AC-9 pattern).

**AC-1:** `mcp-server-pre-barrel-wave2` git tag created before any file edit.

**AC-2:** `macro/http-proxy/index.ts` created. All tools in this sub-barrel verified to call HTTP clients (import from `infrastructure/microservices/clients.ts` or `infrastructure/fetchers/`). Zero direct domain service calls.

**AC-3:** `macro/local-computation/index.ts` created. All tools in this sub-barrel confirmed as legitimate local computation (call `domain/services/macro/` functions). Added `// LOCAL-COMPUTATION: legitimately mcp-server-owned — not a G5 violation` comment at top of file.

**AC-4:** Root `macro/index.ts` updated. Re-exports both sub-barrels.

**AC-5:** `bun run check` exits 0.

**AC-6:** `bun test` pass ≥9408, fail ≤348.

**AC-7:** Server start + health 200 confirmed.

**AC-8:** Tool count probe ≥146. Scheduler count 68. Dashboard routes HTTP 200.

**AC-9:** `macroIndicatorRefreshJob.ts` scheduler coupling verified: grep confirms it imports from `infrastructure/microservices/clients.ts` (HTTP path), NOT from `domain/services/macro/macroIndicatorFetcher.ts` directly. Result documented in handoff.

**AC-10:** `git diff --cached --name-only` shows ONLY `macro/index.ts` + 2 new sub-barrel files.

**G12 gate (streak #3 — STREAK COMPLETE — binding):** Task DONE only after AC-5 through AC-8 evidence pasted in handoff. Streak complete: 3 consecutive tasks (P1-B + P1-C + P1-D) each showing dashboard/test-green before DONE. G12 streak completion evidence: 3 handoff links referenced in P1-QA.

---

### P1-E — Barrel Wave 3: `sector/` (15 files → 3 cluster cuts)

**Goals advanced:** G2
**Blocks:** P1-F
**Blocked by:** P1-D
**Estimated:** 4h
**Pre-revert tag:** `mcp-server-pre-barrel-wave3`
**Zone files touched:**
- `apps/mcp-server/src/interface/mcp/tools/sector/index.ts` (MODIFY)
- `apps/mcp-server/src/interface/mcp/tools/sector/domestic/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/sector/market/index.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/tools/sector/cross-cutting/index.ts` (CREATE)

**Background (from P0-MCP-1 §2 SEAM-3):** The `sector/` barrel (15 files) splits into 3 topic clusters:
- **`domestic/`** — `pharmaEventTools.ts`, `legalRiskTools.ts`, `leadershipSignalTools.ts`, `publicInvestmentTools.ts` (Vietnam-domestic sector topics)
- **`market/`** — `sectorRotationTools.ts`, `sectorComparisonTools.ts`, `correlationTools.ts` (market-structure topics)
- **`cross-cutting/`** — `creditFlowTools.ts`, `crisisPatternTools.ts`, `supplyChainTools.ts`, `climateImpactTools.ts`, `energyMarketTools.ts`, `brokerCredibilityTools.ts`, `bondMaturityTools.ts`, `severityLabels.ts` (thematic cross-cutting topics)

`severityLabels.ts` is a pure data-in→label-out helper with zero I/O. It is a G1 primitive candidate (Phase 2); for Phase 1, place in `cross-cutting/` and add `// G1-PRIMITIVE-CANDIDATE: pure data mapping` comment.

**What to do:**
1. Create `mcp-server-pre-barrel-wave3` git tag.
2. Read all 15 files in `src/interface/mcp/tools/sector/` to confirm cluster classification.
3. Create 3 sub-barrel `index.ts` files.
4. Update root `sector/index.ts` to import from 3 sub-barrels.
5. Run all regression tripwires (same pattern as P1-C/D).

**AC-1 through AC-9:** Same QA pattern as P1-C (pre-revert tag, 3 sub-barrel files, root index update, tsc EXIT:0, bun test pass/fail bounds, server start + health, tool count ≥146, scheduler count 68, dashboard routes HTTP 200, git diff clean staging).

**AC-10 (severity-labels annotation):** `src/interface/mcp/tools/sector/cross-cutting/index.ts` re-exports `severityLabels.ts` with `// G1-PRIMITIVE-CANDIDATE: pure data mapping — no I/O, zero infra imports` comment in the file header.

**Note:** G12 streak is already complete after P1-D. P1-E still requires both regression tripwire gates to pass before DONE, but is not a streak task.

---

### P1-F — G5-Inverse Remediation: kinhDichWrapper Bypass + QUE_META Import

**Goals advanced:** G5 (old code routed via HTTP)
**Blocks:** P1-G
**Blocked by:** P1-E
**Estimated:** 4h
**Pre-revert tag:** `mcp-server-pre-g5-remediation`
**Risk class:** R-CRITICAL (from P0-MCP-1 §9 and P0-MCP-2 BUG-5)

**Background:** Three R-CRITICAL G5-inverse violations identified by P0-MCP-1:

1. **`marketTools.ts` imports `appendKinhDich()` from `domain/services/kinhDich/kinhDichWrapper.ts`** — bypasses `kinh-dich-service:5005` HTTP path. The correct call is `clients.ts getKinhDichReading()` (already used by `kinhDichTools.ts`).

2. **`news-analysis/analysis.ts` imports `appendKinhDich()` from `domain/services/kinhDich/kinhDichWrapper.ts`** — same bypass, same fix.

3. **`portfolioTools.ts` imports `QUE_META` from `domain/services/kinhDich/hexagramLibrary.ts`** — `QUE_META` is a static hexagram metadata constant. Ruling: move `QUE_META` to a reference file or re-export from `kinhDichTools.ts` barrel; do NOT import directly from the domain kinhDich module.

**Remediation mandate:** Every handler that previously imported from `domain/services/kinhDich/` must either:
- Route via `infrastructure/microservices/clients.ts` (for runtime calls), OR
- Import from a sanctioned reference export (for static data), OR
- Have a `// GLUE: intentional — reviewed P0-MCP-1 G5-inverse, kept because <reason>` comment (for integration glue that cannot be HTTP-routed)

**Zone files touched:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` (MODIFY — replace `appendKinhDich()` import with HTTP client call)
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` (MODIFY — same)
- `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts` (MODIFY — replace `QUE_META` import)
- `apps/mcp-server/src/domain/services/kinhDich/kinhDichWrapper.ts` (MODIFY — add `// DEPRECATED: direct callers must use kinh-dich-service:5005 via clients.ts — see P1-F`)

**What to do:**
1. Create `mcp-server-pre-g5-remediation` git tag.
2. Read `marketTools.ts` and `analysis.ts` to identify the exact call sites for `appendKinhDich()`. Determine whether the call is pre/post HTTP response (i.e., does it augment the response after the main tool logic, or is it the main logic).
3. Replace `appendKinhDich()` calls with the equivalent call to `clients.ts getKinhDichReading()`. The function signature from `clients.ts` should provide the same data that `appendKinhDich()` injected locally. If the HTTP call is async and the current code is sync, adapt the call sites accordingly.
4. For `QUE_META` in `portfolioTools.ts`: determine if it is used for display labels only. If so, inline the needed subset as a local constant (pure static data, no domain module import needed) or re-export from a dedicated reference file.
5. Add `// DEPRECATED` comment to `kinhDichWrapper.ts`.
6. Run all regression tripwires.

**AC-1:** `mcp-server-pre-g5-remediation` tag created before any file edit.

**AC-2:** `marketTools.ts` — `appendKinhDich` import from `domain/services/kinhDich/kinhDichWrapper.ts` REMOVED. Replaced with HTTP client call via `clients.ts`. `grep "from.*kinhDichWrapper" apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` returns 0.

**AC-3:** `news-analysis/analysis.ts` — same. `grep "from.*kinhDichWrapper" apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` returns 0.

**AC-4:** `portfolioTools.ts` — `QUE_META` import from `hexagramLibrary.ts` REMOVED. `grep "from.*hexagramLibrary" apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts` returns 0.

**AC-5 (every-handler-proven-HTTP-routed evidence):** Run: `grep -r "from.*domain/services/kinhDich" apps/mcp-server/src/interface/mcp/tools/ --include="*.ts"` — must return 0 results or ONLY lines with `// GLUE:` comment annotations. This is the "every handler proven HTTP-routed" evidence gate. Paste output in handoff.

**AC-6:** `kinhDichWrapper.ts` has `// DEPRECATED` comment at top of file (NOT deleted — deletion is Phase 2 G5 task).

**AC-7:** `bun run check` exits 0.

**AC-8:** `bun test` pass ≥9408, fail ≤348.

**AC-9:** Server start + health 200. Tool count ≥146. Scheduler 68. Dashboard routes HTTP 200.

**AC-10:** Verify `kinhDichTools.ts` (the `kinhdich/` barrel) still routes via `clients.ts` — confirm not broken by P1-F changes. `grep "from.*infrastructure/microservices/clients" apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` must return ≥1 result.

**AC-11:** `git diff --cached --name-only` shows ONLY the 4 modified files + pre-G5 tag creation. No domain files deleted. No scheduler files touched.

---

### P1-G — G5-Inverse Remediation: pdf.ts / pdfOcrWorker.ts Post-1954c Verify

**Goals advanced:** G5
**Blocks:** P1-H
**Blocked by:** P1-F
**Estimated:** 2h
**Risk class:** R-MEDIUM (from P0-MCP-1 §9)

**Background:** Per P0-MCP-1 §4, the 1954c consolidation brief rewired 4 BCTC callers to route via `pdf-extractor:5001`. However, `infrastructure/fetchers/pdf.ts` and `pdfOcrWorker.ts` themselves were NOT moved to `_deprecated/` as of the P0-MCP-1 scan. This task verifies the post-1954c state and closes the R-MEDIUM flag.

**Zone files audited/touched:**
- `apps/mcp-server/src/infrastructure/fetchers/pdf.ts` (AUDIT + possibly MODIFY)
- `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` (AUDIT + possibly MODIFY)
- `apps/mcp-server/src/infrastructure/_deprecated/` (POSSIBLY MOVE to)

**What to do:**
1. `grep -rn "from.*fetchers/pdf" apps/mcp-server/src/ --include="*.ts"` — find all callers of `pdf.ts`.
2. `grep -rn "from.*pdfOcrWorker" apps/mcp-server/src/ --include="*.ts"` — find all callers of `pdfOcrWorker.ts`.
3. If zero live callers exist: move both files to `infrastructure/_deprecated/` with `// DEPRECATED: 1954c — callers now route via pdfExtractorClient.ts` comment. Update any barrel that re-exported them.
4. If live callers still exist: document each caller, classify as ROUTE (should use HTTP client) or KEEP (legitimate local fallback). Flag any ROUTE callers as Phase 2 G5 targets.
5. Run regression tripwires regardless of action taken.

**AC-1:** `grep` commands above run and output pasted in handoff. Zero ambiguity about caller state.

**AC-2 (if zero callers — expected post-1954c):** `pdf.ts` and `pdfOcrWorker.ts` moved to `infrastructure/_deprecated/`. `// DEPRECATED: 1954c — all BCTC callers now route via pdfExtractorClient.ts` comment added to both files. Files exist in `_deprecated/` directory.

**AC-2 (if live callers found):** Each caller documented with classification (ROUTE/KEEP). Phase 2 G5 tasks registered for any ROUTE callers. `pdf.ts` and `pdfOcrWorker.ts` remain in place with `// G5-DEBT: live caller found — deprecation deferred to Phase 2` comment.

**AC-3 (every-handler-proven evidence):** `grep -r "from.*fetchers/pdf" apps/mcp-server/src/interface/ --include="*.ts"` returns 0 (no tool handler directly imports the OCR path). Paste output.

**AC-4:** `bun run check` exits 0. `bun test` pass ≥9408, fail ≤348. Tool count ≥146. Scheduler 68.

**AC-5:** `bctcPdfPullJob.ts` verified: `grep "from.*pdfExtractorClient" apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` returns ≥1 result (confirms 1954c routing is in place for the scheduler job).

**AC-6:** `git diff --cached --name-only` shows ONLY the deprecated files (if moved) or annotated files (if kept). No scheduler files modified.

---

### P1-H — G1 Primitive Scaffolding: signal-bus-helper + sector-classifier

**Goals advanced:** G1 (primitives ship with scenarios), G7 (edit-JSON-rerun)
**Blocks:** P1-QA
**Blocked by:** P1-E (barrel waves complete — clean seams available as extraction targets)
**Estimated:** 3h

**Background:** Phase 1 delivers 2 primitive scaffolds as secondary work relative to barrel decomposition (per charter). These are scenario-JSON-testable, pure-function, zero-I/O extractions from the now-stable barrel structure. Phase 2 promotes them to `packages/primitives/`.

**Target 1 — `signal-bus-helper`**
- Source: `apps/mcp-server/src/domain/signals/signalBuilders.ts`
- Type: Pure signal-envelope construction (input: raw signal data → output: normalized `SignalEnvelope`)
- Zero infra imports (verified P0-MCP-1 §3)
- Files to create:
  - `apps/mcp-server/src/sandbox/scenarios/signal-bus-golden-valid.json`
  - `apps/mcp-server/src/sandbox/scenarios/signal-bus-golden-minimal.json`
  - `apps/mcp-server/src/sandbox/scenarios/signal-bus-failure-missing-required.json`

**Target 2 — `sector-classifier`**
- Source: `apps/mcp-server/src/domain/services/sectorPeers.ts`
- Type: Maps stock code → sector peer group (pure lookup, static data)
- Zero infra imports (verified P0-MCP-1 §3)
- Files to create:
  - `apps/mcp-server/src/sandbox/scenarios/sector-classifier-golden-known-ticker.json`
  - `apps/mcp-server/src/sandbox/scenarios/sector-classifier-golden-unknown-ticker.json`
  - `apps/mcp-server/src/sandbox/scenarios/sector-classifier-failure-null-input.json`

**AC-1:** 3 scenario JSON files created for `signal-bus-helper`. All 3 pass through sandbox runner: `bun run src/sandbox/runner.ts --scenario=<file>`. Happy/edge exit 0 with correct trace; failure exits non-zero with expected output.

**AC-2:** 3 scenario JSON files created for `sector-classifier`. Same verification.

**AC-3 (G7 edit-JSON-rerun):** Dev edits `signal-bus-golden-valid.json` expected output (change one field value), reruns sandbox runner, observes trace changes (output no longer matches expected → exit non-zero). Reverts expected value, reruns → exit 0. Evidence pasted in handoff.

**AC-4 (zero-creds audit):** Sandbox runner with these scenarios: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty. Zero infra imports in scenario dispatch path for these two primitives.

**AC-5:** `grep -r "from.*infrastructure" apps/mcp-server/src/domain/signals/signalBuilders.ts` returns 0.
`grep -r "from.*infrastructure" apps/mcp-server/src/domain/services/sectorPeers.ts` returns 0.
(Confirms these ARE pure-function primitive candidates for Phase 2.)

**AC-6:** `bun test` pass ≥9408, fail ≤348. `bun run check` exits 0.

**AC-7:** Tool count ≥146. Scheduler 68. Dashboard routes HTTP 200.

**AC-8:** `git diff --cached --name-only` shows ONLY new scenario JSON files. No domain service files modified. No infra files touched.

---

### P1-QA — Phase 1 Close-Gate Verification

**Owner:** qa
**Blocks:** P1-EXIT
**Blocked by:** P1-H
**Files touched:** None (read-only verification; `docs/data/pilot-status-mcp-server.json` update is PO-only at P1-EXIT)

**AC-1:** `bun run check` exits 0. Evidence: tsc output pasted.

**AC-2:** `bun test` pass ≥9408, fail ≤348. Evidence: full test summary pasted.

**AC-3:** Tool count: `grep -rn "server\.tool(" apps/mcp-server/src --include="*.ts" | grep -v "//" | wc -l` = 146 (or higher — no regression). Evidence pasted.

**AC-4:** Scheduler: `grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts` = 68. Evidence pasted.

**AC-5:** G12 streak confirmed: QA reads handoffs for P1-B, P1-C, P1-D. Each handoff has bun test green evidence + tool-suite probe evidence pasted before RETURN. No evidence = streak broken, task reopened.

**AC-6:** G5-inverse evidence: `grep -r "from.*domain/services/kinhDich" apps/mcp-server/src/interface/mcp/tools/ --include="*.ts"` returns 0 (or only GLUE-annotated lines). Paste output.

**AC-7:** Three-tier dashboard: `dashboard/index.html` opens via file://, three panels visible, Primitives panel shows ≥6 scenario cards (3 sparkline + 3 signal-bus or sector-classifier from P1-H), at least 1 red and 1 green card. Screenshot attached to handoff.

**AC-8:** Barrel decomposition verified: root `tools/index.ts` imports `system/index.ts`, `macro/index.ts`, `sector/index.ts`. Each has sub-barrel structure. `grep -c "^import" apps/mcp-server/src/interface/mcp/tools/system/index.ts` returns ≤6 (5 sub-barrels + possible 1 direct re-export).

**AC-9:** No new domain→infra imports introduced: `grep -r "from.*infrastructure" apps/mcp-server/src/domain/ --include="*.ts"` returns 0 matches. Evidence pasted.

---

### P1-EXIT — PO: SSOT Reconciliation + Pilot-Status Phase 1 Close

**Owner:** PO (NOT dev-mcp-server — PO-owned per anti-scope-creep clause)
**Blocked by:** P1-QA

This task is a PO action item, not a dev task. It is documented here as a dependency in the chain for visibility.

PO actions at P1-EXIT:
1. Update `docs/data/pilot-status-mcp-server.json` phase1 fields (PO-only flip).
2. Reconcile stale SSOT baselines (see §Carried-Debt / SSOT Reconciliation Note below).
3. Emit sequencing signal for Phase 2 dispatch.

---

## G5-Inverse Remediation Track — Explicit Evidence Requirements

For complete traceability, this section summarizes all three G5-inverse targets, their current violation state, and the "every handler proven HTTP-routed" evidence gate that closes each.

| Target | Violation | Remediation task | Evidence gate |
|--------|-----------|-----------------|---------------|
| `kinhDichWrapper.appendKinhDich()` bypass in `marketTools.ts` | R-CRITICAL: imports local TS domain service, bypasses kinh-dich-service:5005 | P1-F AC-2 | `grep "from.*kinhDichWrapper" .../marketTools.ts` = 0 |
| `kinhDichWrapper.appendKinhDich()` bypass in `analysis.ts` | R-CRITICAL: same | P1-F AC-3 | `grep "from.*kinhDichWrapper" .../analysis.ts` = 0 |
| `QUE_META` import from `hexagramLibrary.ts` in `portfolioTools.ts` | R-CRITICAL: imports from kinh-dich domain module | P1-F AC-4 | `grep "from.*hexagramLibrary" .../portfolioTools.ts` = 0 |
| Full tool-layer kinh-dich bypass scan | Verify no other tool files bypass kinhDich service | P1-F AC-5 | `grep -r "from.*domain/services/kinhDich" .../tools/` = 0 or GLUE-annotated |
| `pdf.ts` / `pdfOcrWorker.ts` not in `_deprecated/` post-1954c | R-MEDIUM: in-process OCR fallback path may still be live | P1-G AC-2 | Files in `_deprecated/` OR documented as KEEP with `// G5-DEBT` annotation |
| BCTC callers route via pdfExtractorClient | Post-1954c verification | P1-G AC-5 | `grep "from.*pdfExtractorClient" bctcPdfPullJob.ts` ≥1 |

---

## G1 Primitive Candidates — Scenario-JSON-Testable, Pure

Per charter, primitive extraction is SECONDARY to barrel decomposition for mcp-server. The following candidates are addressed in Phase 1 (scaffolded in P1-H) and promoted in Phase 2.

| Candidate | Source file | Pure? | Scaffolded in | Phase 2 promotion |
|-----------|-------------|-------|---------------|-------------------|
| `signal-bus-helper` | `domain/signals/signalBuilders.ts` | YES — zero infra imports confirmed | P1-H | P2-B1 |
| `sector-classifier` | `domain/services/sectorPeers.ts` | YES — pure lookup table | P1-H | P2-B2 |
| `severity-label-mapper` | `interface/mcp/tools/sector/severityLabels.ts` | YES — pure string→label | P1-E (annotation only) | P2-B3 |
| `portfolio-aggregator` | `domain/services/portfolioRiskCalculator.ts` + `portfolioPnlCalculator.ts` | YES — pure number-in→metrics-out | Not in Phase 1 (post-G5-cleanup first) | P2-B4 |
| `macro-snapshot-guard` | `interface/mcp/tools/macro/macroSnapshotGuard.ts` | Likely (verify zero-IO in P1-D) | P1-D annotation if zero-IO confirmed | P2-B5 |

**ops-debug-trigger is NOT a primitive candidate** — all 5 debug trigger files perform I/O (cron runs, VPS fetches). They belong in the ops-debug sub-barrel, not `packages/primitives/`.

---

## Carried-Debt / SSOT Reconciliation Note

The following baseline drifts were identified in P0-MCP-2 and are **NOT in scope for Phase 1 dev tasks**. They are flagged for PO action at P1-EXIT.

| SSOT field | Current SSOT value | Live value (P0-MCP-2) | Action |
|------------|-------------------|----------------------|--------|
| `docs/data/project-stats.json#cronJobCount` | 77 | 73 (cronConfig.ts keys) / 68 (startScheduler.ts probe) | PO: update to 68 or 73 (choose which is canonical) at P1-EXIT after confirming post-refactor count |
| `docs/data/project-stats.json#testBaselinePass` | 9277 | 9408-9411 | PO: update to 9408 (conservative floor) at P1-EXIT |
| `docs/data/project-stats.json#testBaselineFail` | 34 | 345-348 | PO: update to 348 (conservative ceiling) at P1-EXIT |
| `docs/data/system-map.json` MCP tool count | 125 | 146 | PO: update system-map to 146 at P1-EXIT (curation lag) |

**These reconciliations are PO-owned.** dev-mcp-server must NOT touch `project-stats.json` or `pilot-status-mcp-server.json` as part of any Phase 1 task. Touching them during barrel waves is a scope violation and will be rejected by QA.

---

## Build Wave Docker Rebuild — Deferred

The Docker rebuild for `mcp-server` is **deferred to a separate session** (memory cap constraint noted in charter). The Phase 1 barrel and G5-inverse work is verified at the host level (`bun test` + tsc + health probe on local server start). The container rebuild occurs only after Phase 1 QA gate passes, as a separate PO-sequenced session. This is consistent with the RUN-SOLO constraint (the rebuild session is itself solo).

---

## Sequencing Diagram

```
P1-A (sandbox runner + scenarios)
  └─► P1-B (three-tier trust dashboard stub)         ← G12 streak #1
        └─► P1-C (barrel wave 1: system/ 21→5)       ← G12 streak #2
              └─► P1-D (barrel wave 2: macro/ 14→2)  ← G12 streak #3
                    └─► P1-E (barrel wave 3: sector/ 15→3)
                          ├─► P1-F (G5-inverse: kinhDichWrapper + QUE_META)
                          │     └─► P1-G (G5-inverse: pdf.ts / pdfOcrWorker post-1954c)
                          │           └─► P1-H (G1 primitives: signal-bus + sector-classifier)
                          │                 └─► P1-QA (Phase 1 close-gate)
                          │                       └─► P1-EXIT (PO: SSOT reconcile)
                          └─► (P1-H also depends on P1-E via barrel stability)
```

All tasks are strictly sequential. WIP=1 throughout. No task starts until the prior task is DONE (QA-gated, not just "submitted").

---

## Hard Constraints

| Constraint | Source |
|---|---|
| WIP=1 sequential throughout Phase 1 | RUN-SOLO policy |
| Anti-scope-creep: `apps/mcp-server/` ONLY | charter |
| No `pilot-status-mcp-server.json` edits by dev | §4.5 compliance |
| No `docs/TASKS.md` edits by dev (PO-owned this cycle) | scope rule |
| Explicit-file staging ONLY (`git add <exact-path>`) | HIGHEST-RISK zone discipline |
| Commit-mutex acquired (kind=`sprint-task` per enum-drift workaround) before any add/commit | BUG-1 workaround |
| Both gate evidence pasted before RETURN on every task | G12 DoD rule |
| G12 streak tasks (P1-B, P1-C, P1-D): DONE only with dashboard + tripwire evidence | streak rule |
| No ESLint fence changes in Phase 1 | Phase 2 scope only |
| No files deleted from domain/ in Phase 1 | Phase 2 G5 scope only |
| Docker rebuild deferred to separate session | memory cap constraint |
| No --force, no --no-verify, no --no-gpg-sign | CLAUDE.md |
| No branch creation — all work on main | CLAUDE.md |

---

## Goals Roadmap — Phase 1 Contributions

| Goal | Status after Phase 1 | Verification source |
|---|---|---|
| G1 (primitives + scenarios) | EARNED-PENDING | 2 primitive candidates scaffolded (P1-H): signal-bus-helper + sector-classifier, ≥3 scenarios each |
| G2 (module composes from bounded sub-barrels) | EARNED-PENDING | 3 barrel splits into 5+2+3 sub-barrels (P1-C/D/E) |
| G5 (G5-inverse: HTTP-routed handlers) | EARNED-PENDING | kinhDichWrapper bypass remediated (P1-F), pdf.ts/pdfOcrWorker verified (P1-G) |
| G6 (trust layer renders) | EARNED-PENDING | Three-tier dashboard stub renders via file:// (P1-B) |
| G7 (edit-JSON-rerun, zero creds) | EARNED-PENDING | P1-A + P1-H scenario edit cycles + P1-A zero-creds audit |
| G8 (honest red/green) | EARNED-PENDING | P1-B deliberate-fail proof (scenario expected value mutated → red card) |
| G12 (streak 3/3) | EARNED-PENDING | P1-B + P1-C + P1-D streak with evidence in handoffs |
| G3 (clean composition root) | STILL-UNMET | Phase 2: composition-root.ts does not exist yet — current entry is `src/index.ts` (≥200L); Phase 2 extracts it |
| G4 (architecture fence) | STILL-UNMET | Phase 2: ESLint + eslint-plugin-boundaries config |
| G9 (trust contract verbal) | STILL-UNMET | Phase 2: user verbal confirmation of dashboard |
| G10 (AI fixes bug ≤2 cycles) | STILL-UNMET | Phase 2: QA injects bug in primitive |
| G11 (regression alarm) | STILL-UNMET | Phase 2: 2-trial coupling proof |

**goalsEarned:** stays 0. PO-only flip at 12/12 terminal Phase 2 (§4.5 compliance — dev-mcp-server does NOT update pilot-status goal fields).

---

## §4.5 Compliance

NO goal-flip instructions in any task. `dev-mcp-server` does NOT update `pilot-status-mcp-server.json` goal fields. `goalsEarned` stays 0. `decisionMatrix` stays all-TBD throughout Phase 1. Phase 1 tasks carry only `goals advanced` labels (informational). PO is the sole authority for terminal goal state transitions.
