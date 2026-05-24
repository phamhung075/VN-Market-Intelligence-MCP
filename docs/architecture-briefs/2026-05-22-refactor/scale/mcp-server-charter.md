---
title: "Scale Charter — mcp-server (RUN-SOLO / HIGHEST-RISK)"
date: "2026-05-24"
author: "po"
status: "READY"
service: "mcp-server"
owner: "dev-mcp-server"
language: "TypeScript (Bun)"
scale_order: "LAST — RUN-SOLO, never parallel with other scale terminals"
risk: "HIGHEST"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `mcp-server`  ⚠️ RUN-SOLO / HIGHEST-RISK

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim, substituting `mcp-server` for `technical-analysis` and `dev-mcp-server` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking (canonical SSOT, schema = docs/data/pilot-status-schema.json):** `docs/data/pilot-status-mcp-server.json`

---

## ⚠️ Scheduling — RUN-SOLO, SCHEDULE LAST

**This service is NOT scheduled in parallel with any other scale terminal.** It runs SOLO, after every other service charter is complete (or at minimum after macro proves the pattern AND the per-service Go services are done). Rationale below. Parallel barrel edits across ~132 tools while other terminals also touch shared docs/signals would produce the concurrent-commit-race + SSOT-duplicate-key class of failures already seen in this repo.

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-mcp-server` |
| **Language** | **TypeScript (Bun)** (stays TS — it is the single MCP interface + scheduler host; not a pivot candidate). |
| **Anti-scope-creep boundary** | `apps/mcp-server/` ONLY. But note: this is the LARGEST single-service zone in the repo. |

### Current state — LARGE MODULAR MONOLITH (~132 tools, 10-module barrel structure)

`apps/mcp-server/` is the modular-monolith host: ~132 MCP tools across a 10-module subfolder structure, barrel `index.ts` per module, decomposed schema (8 slices), the cron scheduler, and all the HTTP-client wiring to the Go/Python microservices. It already absorbed a major modular-monolith refactor (Sprints 209-220) and a token-reduction pass.

This is the **opposite of a greenfield extract**. The refactor here is:
- **Barrel shrink** across ~132 tools — the highest-churn, widest-blast-radius edit surface in the codebase.
- **Sector splits / system splits** — decomposing the largest barrels into bounded sub-modules.
- **G5 is the inverse goal** — for the Go services, G5 deletes old mcp-server TS code (as TA's P2-B did). For the mcp-server's OWN refactor, G5 means removing the dead/migrated tool code that now lives in the microservices, with every MCP tool handler proven to route via HTTP.

### Candidate primitives
Cross-cutting + sector/portfolio + system-ops primitives (target-state §Cross-cutting, §Sector/portfolio, §System-ops): e.g. signal-bus helpers, sector-classifier, portfolio-aggregator, ops-debug triggers. But primitive extraction is secondary here — the dominant work is barrel decomposition and routing-rewire verification.

### Key risks (why HIGHEST-RISK / RUN-SOLO)
1. **~132-tool blast radius.** Any barrel edit can break many tools at once. Each split must be QA-gated against the full tool suite before proceeding.
2. **Concurrent-commit race.** mcp-server touches docs/signals, docs/data, and the scheduler — shared substrates other agents also write. Running it solo eliminates the parallel git-index race and SSOT-duplicate-key bugs.
3. **Recurring commit-boundary violations.** This zone has a history of `git add -am` over-staging (26-file sweeps). Explicit-add discipline is mandatory; the smart-skip / explicit-file-staging rules are load-bearing here.
4. **Scheduler coupling.** ~29 cron jobs run inside mcp-server. A refactor regression can silently break a cron (the daily-dashboard ENOENT class). Cron jobs need their own scenario/render verification.
5. **It is the trust-dashboard consumer too.** mcp-server hosts/serves several dashboards — circular-dependency care during the split.

### Sequencing mandate
Pattern already proven (TA + macro + stock-price + kinh-dich DONE). Remaining order:
1. The fresh Go/Python services + frontend + news-fetch in parallel waves (and alert-engine pilot-5 finishing its ACTIVE track).
2. **mcp-server LAST, SOLO** — no other scale terminal active. This is non-negotiable given the shared-substrate write surface.
