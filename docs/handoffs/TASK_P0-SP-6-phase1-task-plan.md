---
task_id: "P0-SP-6"
pilot: "stock-price"
phase: "0"
title: "Phase-1 task plan authoring (architect)"
estimate: "3h"
owner: "architect"
status: "READY"
date: "2026-05-24"
---

# TASK P0-SP-6 — Phase 1 Task Plan Authoring

## Summary

Architect authors `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` defining all atomic Phase 1 tasks to extract and test the first stock-price primitives + module stub, with the sandbox up and running under CGO_ENABLED=0.

Phase 1 is the scaffolding phase: establish the Go module structure, write the first 3–5 primitives, stub the module and composition root, build the sandbox with JSON fixtures, and verify the DoD gate (dashboard green before done). 

This task plan must include R-CGO gate baked into the first-primitive task AC, exactly as macro baked R-1 (math/rand) into P1-B1.

## Acceptance Criteria

### AC-1: Phase 1 skeleton understood (from pilot-charter.md)
- [ ] Read charter §Phase Skeleton:
  - Phase 1 goal: Go scaffold + first primitive + module stub + dashboard stub + sandbox green
  - Duration: 2–3 sprints
  - Owner: dev-stock-price
- [ ] Understand: Phase 1 exit gate requires (4 criteria):
  1. Time to first primitive ≤ 4 hours (P1-A1 → P1-B1 ready)
  2. Sandbox all-green (3-tier: primitive, module, all)
  3. Dashboard ≥90% (3 panels, edit-rerun handler, zero secrets)
  4. G12 earned (3 consecutive tasks with DoD gate satisfied)

### AC-2: Phase 1 task structure planned (buckets per macro analogy)
- [ ] Identify task buckets (follow macro-indicators P1 pattern):
  - **Bucket A:** Go module init + composition root stub (cmd/server/main.go)
  - **Bucket B:** First 3–5 primitives (per brownfield P0-SP-1 confirmation) — each ≤2h
  - **Bucket C:** Module stub (pkg/module/price_resolution/) — ≤1h
  - **Bucket D:** Dashboard stub (apps/stock-price/dashboard/index.html) — ≤2h
  - **Bucket E:** Edit-rerun handler + env audit — ≤2h
  - **Bucket F:** Flex / catchup / scenario fixes
  - **Bucket G:** Phase 1 close gate verification (QA)
- [ ] Estimate total Phase 1 dev time: 11–14 dev hours (2–3 sprints)

### AC-3: First-primitive task R-CGO gate templated
- [ ] Document: first primitive task (P1-A1 / P1-B1 analog) must include these ACs:
  ```
  AC-R-CGO-1: Build under CGO_ENABLED=0
    CGO_ENABLED=0 go build -o ./bin/sp-[primitive] ./cmd/sandbox exits 0
  
  AC-R-CGO-2: Zero CGO in primitive package
    grep -rn "mattn/go-sqlite3\|cgo\|import \"C\"" pkg/primitive/[primitive] exits 1 (0 matches)
  
  AC-R-CGO-3: Zero infrastructure imports in primitive
    grep -rn "pkg/infrastructure" pkg/primitive/[primitive] exits 1 (0 matches)
  
  AC-R-CGO-GATE: R-CGO verdict
    If all 3 above PASS → R-CGO CLEAR, continue to module stub
    If any FAIL → R-CGO BLOCKED, abort Phase 1 and escalate
  ```
- [ ] Note: R-CGO gate is a BLOCKER (hard failure, not a warning)

### AC-4: G12 DoD gate documented in P1 tasks
- [ ] Each Phase 1 task includes: "Sandbox-green before DONE" gate
  - Primitive tasks: `go run ./cmd/sandbox -tier=primitive -scenario=all -module=stock-price` must exit 0
  - Module task: `go run ./cmd/sandbox -tier=module -scenario=all -module=stock-price` must exit 0
  - Dashboard task: `go run ./cmd/sandbox -tier=all -scenario=all -module=stock-price` must exit 0
- [ ] Flow rule: dev-stock-price flow enforces this; dev cannot mark DONE if sandbox exits != 0

### AC-5: Task plan file created and structured
- [ ] Create file: `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md`
- [ ] Sections (following macro pattern):
  1. Executive summary (Phase 1 scope, 2–3 sprints, 11–14 dev-hours)
  2. Phase 1 exit criteria (4 gates with metrics)
  3. Task buckets (A–G with estimates, ACs, hard gates)
  4. Per-task details:
     - P1-A: Go module init
     - P1-B1: First primitive (e.g., price-quote-normalizer) — **R-CGO gate baked in AC**
     - P1-B2..B4: Additional primitives (2nd, 3rd, 4th) — R-CGO inherited from P1-B1
     - P1-C: Module stub
     - P1-D: Dashboard stub
     - P1-E: Edit-rerun handler
     - P1-F: Flex / catchup
     - P1-G: Phase 1 close-gate verification (QA)
  5. WIP policy (WIP=1 sequential)
  6. Critical path (P1-A → P1-B1 → P1-B2+ → P1-C → P1-D → P1-E → P1-G)
  7. Open questions (OQ-1..OQ-N) with resolution notes from P0-SP-1 (brownfield)

### AC-6: Per-task AC count and hard gates documented
- [ ] For each task P1-A through P1-G:
  - Title, estimate, owner, AC count
  - List of ACs (brief, 1-line each)
  - Hard gates section (which ACs are BLOCKING)
  - Dependencies (which earlier tasks must complete)
  - Files touched (zones, no hardcoded paths)
- [ ] Total AC count: expect 40–60 ACs across all Phase 1 tasks

### AC-7: Open questions resolved / forward work documented
- [ ] Cross-ref with brownfield P0-SP-1 findings:
  - OQ-1: Which 3–5 primitives highest-leverage? (brownfield confirms candidates)
  - OQ-2: Existing domain/application logic retained or moved to _deprecated/? (brownfield G5a scope)
  - OQ-3: MCP-server handlers that need HTTP rewire? (brownfield G5b scope, deferred to Phase 2)
  - OQ-4: Dashboard panels layout (3-level: primitives + module + microservice) from macro template
  - OQ-5: Sandbox JSON fixtures (golden scenarios per primitive, golden + edge + failure per module)
- [ ] Resolve each OQ with: rationale, reference to brownfield findings, or deferred reason

### AC-8: File size and markdown validation
- [ ] Run: `wc -l docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` (expect 200–400 lines)
- [ ] Run: `cat phase-1-task-plan-go.md | head -1` (valid markdown, no binary)
- [ ] Verify: no hardcoded values (all generic to stock-price + Go)

## Implementation Guidance

1. **Reference:** Clone macro-indicators Phase 1 task plan (`phase-1-task-plan-go.md`) and specialize for stock-price
2. **Deliverables from P0:**
   - P0-SP-1: brownfield inventory with primitive candidates + module design + MCP-server scope
   - P0-SP-5: R-CGO verdict (CLEAR or BLOCKED) — if BLOCKED, task plan must document remediation path
3. **Template copying:** Use macro P1-B1 (first-primitive) as template, add stock-price R-CGO gate ACs (mattn/go-sqlite3 specific)
4. **Scenario fixtures:** Document expectation that each primitive needs ≥3 scenario JSON files (golden + edge + failure)
5. **Forbidden:** do NOT write any Go code; task plan is design + specification only

## Handoff File Output

**File:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md`

**Structure (example outline):**
```markdown
---
title: "Phase 1 Task Plan — Stock-Price Microservice"
date: "2026-05-24"
author: "architect"
pilot: "stock-price"
phase: "1"
---

# Phase 1 Task Plan — Stock-Price Microservice (Go)

## Phase 1 Overview
- **Goal:** Go scaffold + 3–5 primitives + module stub + dashboard + sandbox green
- **Duration:** 2–3 sprints
- **Owner:** dev-stock-price
- **WIP:** 1 sequential

## Exit Criteria
1. Time to first primitive ≤ 4h
2. Sandbox all-green (5/5 pass)
3. Dashboard ≥90%
4. G12 earned (3/3 streak)

## Task Buckets

### P1-A: Go Module Init (1h)
- AC-1: cmd/server/main.go stub wires module + adapters
- AC-2: pkg/module/price_resolution/ empty Go file
- AC-3: Go mod/sum unchanged (no new external deps)
- Hard gate: tsc 0 errors

### P1-B1: First Primitive (2h) — **R-CGO Gate Baked In**
- AC-1: pkg/primitive/price-quote-normalizer/main.go extracted
- AC-2: ≥3 scenario JSON files (golden + edge + failure)
- AC-3: go run ./cmd/sandbox -tier=primitive -module=stock-price exits 0
- **AC-R-CGO-1:** CGO_ENABLED=0 go build -o ./bin/sp-quote-norm ./cmd/sandbox exits 0
- **AC-R-CGO-2:** grep mattn/go-sqlite3 pkg/primitive/price-quote-normalizer exits 1 (0 matches)
- **AC-R-CGO-3:** grep pkg/infrastructure pkg/primitive/price-quote-normalizer exits 1 (0 matches)
- **AC-R-CGO-GATE:** If all R-CGO ACs PASS → clear for P1-B2. If any FAIL → BLOCKER, abort.
- Hard gate: R-CGO clear + sandbox primitive-tier green

[... P1-B2, P1-B3, P1-C, P1-D, P1-E, P1-G ...]

## Critical Path
P1-A → P1-B1 (R-CGO gate) → P1-B2..B4 → P1-C → P1-D → P1-E → P1-G

## Open Questions Resolved
- OQ-1: Primitives = [price-quote-normalizer, tier-fallback-selector, ohlcv-aggregator] per P0-SP-1 brownfield
- OQ-2: Existing domain logic retained until Phase 2 G5a (deletion deferred)
- OQ-3: MCP-server HTTP rewire deferred to Phase 2 (G5b)
- [... more OQs ...]
```

## Constraints

- **L84 explicit-file staging:** 1 markdown file
- **No source code:** design/specification only
- **No git push:** local-only
- **Anchor held:** no tag/rewrite
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Phase Skeleton + §Phase 0

## Hard Gates

- [ ] **File exists:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md`
- [ ] **Sections present:** overview, exit criteria, task buckets (P1-A through P1-G), critical path, OQ resolutions
- [ ] **R-CGO baked:** P1-B1 (first primitive) includes all 3 R-CGO ACs + R-CGO-GATE blocker
- [ ] **Total ACs:** 40–60 ACs documented across all tasks
- [ ] **Markdown valid:** file parses without syntax errors

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-sp6-phase1-task-plan-complete-<UTC>.json
- Status: DONE | BLOCKED
- file: phase-1-task-plan-go.md path
- task_count: N (P1-A through P1-G)
- ac_count: N (total across all tasks)
- r_cgo_gate_baked: YES | NO
- exit_criteria_documented: YES | NO
- critical_path_documented: YES | NO
- Next task: PM waits for all 6 Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 or 2026-05-25 (same-day or next-day delivery, architect)
