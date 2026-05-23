---
title: "Fleet Factory Rollout — Program Roadmap"
date: "2026-05-23"
author: "architect"
status: "DRAFT — awaiting PO ratification"
program: "fleet-factory-rollout"
parent_factory: "docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md (CLOSED)"
pilot_1_ref: "docs/data/pilot-status.json (TA, DONE 2026-05-23, verdict=scale)"
pilot_2_ref: "docs/data/pilot-status-macro-indicators.json (macro, DONE 2026-05-23, verdict=scale)"
---

# Fleet Factory Rollout — Program Roadmap

## Purpose

Both factory pilots (technical-analysis and macro-indicators) closed 12/12 G-goals with verdict=`scale`.
This document defines the program-level plan to apply the proven factory pattern to EVERY remaining microservice —
each with a working dashboard that reveals the service's functions and sandbox health.

Sub-documents:
- `01-service-inventory.md` — per-service brownfield survey and readiness verdict
- `02-phasing.md` — ordered pilot sequence with rationale
- `03-dashboard-standard.md` — concrete dashboard template / contract for all services

## Factory Bar (inherited from proven pilots)

A service is factory-complete (GREEN) when ALL of the following hold:

| Gate | Evidence |
|---|---|
| G1 — Anchor commit frozen | `git log --ancestry-path` confirms one deterministic hash |
| G2 — Primitive decomposition | `pkg/primitive/<name>/` dirs exist; each primitive has contract.md + unit tests |
| G3 — Module layer | `pkg/module/<name>/` exists; module composes 2+ primitives; cohesion-tested |
| G4 — Fence linter wired | `golangci-lint + depguard` (Go) / ESLint import rules (TS/Python equiv) — CI-wired |
| G5 — MCP rewire complete | Zero direct domain imports from mcp-server into this service's domain; all via HTTP |
| G6 — Dashboard renders | `apps/<svc>/dashboard/index.html` opens in browser, shows primitives + pass/fail |
| G7 — Sandbox zero-creds | `cmd/sandbox` or equiv process reads ZERO env credentials |
| G8 — All sandbox scenarios green | Every scenario in sandbox harness passes deterministically |
| G9 — User-readable dashboard | Non-technical user can see service's functions and their status |
| G10 — Bug cycle baseline | `docs/data/bug-inventory.json` has service entry; baseline measured |
| G11 — Cycle-time improvement | Post-pilot fix cycles ≤ pilot baseline |
| G12 — AI-fixability rule | Dev flow encodes the G12 DoD gate; 3-task streak verified |

Language determines tool selection for G4: Go → golangci-lint+depguard; TS → ESLint custom rules; Python → TBD (see §risks in 01-service-inventory.md).

## Scope Boundaries — What Is NOT a Factory Target

| Service | Reason excluded |
|---|---|
| `api-gateway` (port 4000) | Pure routing / health aggregator — no domain logic to decompose into primitives. Its "primitives" would be trivial health-check proxies. Factory overhead >> value. SSOT: see `01-service-inventory.md`. |
| `frontend` (port 3001) | UI rendering layer — Playwright-tested; Vue/Nuxt component architecture ≠ DDD primitives model. Different trust model (visual regression, not sandbox scenarios). |
| `mcp-server` (port 3000) | Orchestrator / interface layer — its job is to compose primitives FROM other services via HTTP. It is the consumer of the factory, not a factory target itself. The G5 rewire completes it gradually as each service is factored. |

These three remain in the G5 dependency path (mcp-server rewire per service) but do not receive their own 12-G-goal charter.

## Program Decision Matrix

At the end of each per-service pilot, PO re-applies the same 3-YES → scale / 2-YES → re-scope / 0-1 YES → MVR stop rule from the charter.

If two consecutive pilots score 0-1 YES → full program review before continuing.

## Files in This Brief

| File | Content |
|---|---|
| `00-roadmap.md` | This file — program context and scope |
| `01-service-inventory.md` | Per-service brownfield survey, readiness verdicts, owning dev agents |
| `02-phasing.md` | Ordered pilot sequence with rationale, shared-infra prework |
| `03-dashboard-standard.md` | Dashboard template specification for all services |
