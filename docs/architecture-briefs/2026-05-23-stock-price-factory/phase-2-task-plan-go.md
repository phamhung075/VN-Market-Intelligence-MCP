---
title: "Phase 2 Task Plan (Go) — stock-price Pilot (fleet pilot 3)"
date: "2026-05-24"
author: "architect (Phase 2 dispatch)"
pilot: "stock-price"
fleet_pilot_number: 3
phase: "2"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-04"
charter_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md"
ssot_ref: "docs/data/pilot-status-stock-price.json"
language: "Go (mcp-server zone stays TypeScript — handler-only G5b audit)"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc (INTACT — do NOT retag/rewrite/push)"
inbound_signal: "docs/signals/po-stock-price-phase2-authorize-20260523T234647Z.json"
phase1_gate: "GO (PO ratified 2026-05-23T23:46:47Z — 4/4 criteria PASS, anchor INTACT)"
service_port_internal: 5000
service_port_external: 5010
service_zone: "apps/stock-price"
service_specialist: "dev-stock-price"
---

# Phase 2 Task Plan (Go) — stock-price Pilot (fleet pilot 3)

**Generated:** 2026-05-24 by architect (Phase 2 dispatch)
**Phase 1 Gate:** GO (PO, 2026-05-23T23:46:47Z — sandbox 11/11, fences clean, G12 streak 3/3)
**Phase 2 Goal scope:** G3, G4, G5, G9, G10, G11 (G1, G2, G6, G7, G8, G12 = EARNED-PENDING from Phase 1)
**WIP:** 1 sequential (charter wip_limit — no parallel dispatch within Phase 2)

> **IMPORTANT — no goal flips in Phase 2:** Task completion does NOT flip any G-goal state.
> All goal flips (including EARNED-PENDING → YES) are PO-only, in one atomic Phase-3 commit,
> after ALL 12 goals reach terminal state simultaneously. Every task in this plan says so explicitly.
> §4.5 matrix-authorship rule is binding and inviolable.

---

## Service Facts (verified via jq on docs/data/system-map.json — never hardcode)

```
id: stock-price | language: go | runtime: go1.22+cgo
port: 5000 (internal) | external_port: 5010 | zone: apps/stock-price
specialist: dev-stock-price
```

---

## Phase 2 Summary

Phase 2 closes the 6 still-unmet goals (G3, G4, G5, G9, G10, G11). The 6 EARNED-PENDING goals
(G1, G2, G6, G7, G8, G12) require no new code tasks — they carry forward with their Phase-1
evidence and are re-confirmed at the Phase-2 close-gate (P2-Z).

**Total tasks:** 13 atomic tasks (P2-A through P2-Z)
**Total AC count:** 56
**Critical path (sequenced by pre-revert tag discipline):**

```
P2-A (stock-price-pre-ci tag)
  ↓
P2-B (.golangci.yml Fence-A/B/C + CI wiring)
  ↓
P2-C (G4 deliberate-violation proof — AC-4b — reverted, NEVER committed)
  ↓
P2-D (G4 freeze anchor AC-4c confirmed)
  ↓
P2-E (stock-price-pre-delete tag)
  ↓
P2-F (G5a — git mv superseded domain logic to pkg/_deprecated/)
  ↓
P2-G (G5b/G5c — MCP rewire audit + zero TODO.*migrat)
  ↓
P2-H (G3 — composition root cleanup + OpenAPI contract)
  ↓
P2-I (G6/SI-2 — 3-panel dashboard finalization + SI-2 fleet index)
  ↓
P2-J (G8 honest-red proof)
  ↓
P2-K (G9 PO Playwright Path B)
  ↓
P2-L (stock-price-pre-inject tag + G10 bug injection)
  ↓
P2-M (G10 fix ≤2 cycles + G11 2-trial coupling proof)
  ↓
P2-Z (Phase-2 close-gate — QA)
```

**WIP=1 enforced throughout.** PM dispatches ONE task at a time. Next task dispatched only after
current task DONE signal is received and recorded.

---

## Pre-Revert Tags (Phase 2 — binding creation sequence)

Tags are created IN THE TASK THAT GATES THEM, BEFORE any mutation. No retag, no `--force`, no push.

| Tag | Created in | Step within task | Protects |
|-----|-----------|------------------|---------|
| `stock-price-pre-ci` | **P2-A** | Step 0 (first action of P2-A) | Rollback point before G4 CI/golangci.yml work |
| `stock-price-pre-delete` | **P2-E** | Step 0 (first action of P2-E) | Rollback point before G5a git mv to _deprecated/ |
| `stock-price-pre-inject` | **P2-L** | Step 0 (first action of P2-L) | Rollback point before G10 bug-injection commit |

---

## Hard Constraints (every task inherits all)

| Constraint | Rule |
|---|---|
| **G12 DoD gate** | `cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all` exits 0 BEFORE DONE on every task that produces sandbox-runnable artefacts |
| **Fence-A** | `pkg/primitive/*/` imports stdlib only — no module, application, interface, infrastructure, no `mattn/go-sqlite3` |
| **Fence-B** | `pkg/module/*/` imports primitives + stdlib only — no application, infrastructure, interface, no `mattn/go-sqlite3` |
| **Fence-C** | `mattn/go-sqlite3` + CGO SQLite importable ONLY from `cmd/server/main.go` (composition root). Exclusions: `!**/cmd/server/main.go`, `!**/*_test.go` |
| **CGO sandbox fence** | `CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox` exits 0 on every task that touches sandbox |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source/CI files |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor before AND after every commit. Verify with `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` — must return a non-empty line |
| **SSOT freeze** | Do NOT modify `docs/data/pilot-status-stock-price.json` — PM-owned. Do NOT flip any G-goal field |
| **Charter §4.5** | `decisionMatrix.{speed,trust,scale}` stays `TBD`. PO-only authorship at 12/12 terminal in Phase 3 |
| **SI-2 exclusive** | Only stock-price (this plan) creates `docs/dashboards/index.html`. No other pilot touches that file |
| **git index.lock** | If lock error: verify no git process is running, then retry with exponential backoff (2s, 4s, 8s). NEVER blindly delete the lock file |
| **Out-of-zone ban** | Do NOT modify `apps/technical-analysis/`, `apps/macro-indicators/`, their closed SSOTs, or any other microservice zone |

---

## Task Ledger

| ID | Title | Owner | G-goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-----------------|--------|------------|-----|----------|
| **P2-A** | Create `stock-price-pre-ci` tag (pre-revert anchor before G4 work) | dev-stock-price | G4 (setup) | P2-B | — | 5m | 3 |
| **P2-B** | `.golangci.yml` Fence-A/B/C creation + CI job wiring | dev-stock-price | G4 partial | P2-C | P2-A | 1h | 5 |
| **P2-C** | G4 deliberate-violation proof (AC-4b) — Fence-A violation, non-zero exit, reverted | dev-stock-price + qa | G4 full | P2-D | P2-B | 30m | 5 |
| **P2-D** | G4 freeze anchor confirmation (AC-4c) | qa | G4 finalized | P2-E | P2-C | 10m | 3 |
| **P2-E** | Create `stock-price-pre-delete` tag (pre-revert anchor before G5a work) | dev-stock-price | G5 (setup) | P2-F | P2-D | 5m | 3 |
| **P2-F** | G5a — `git mv` superseded domain/application logic to `pkg/_deprecated/` | dev-stock-price | G5a | P2-G | P2-E | 1h | 6 |
| **P2-G** | G5b/G5c — MCP handler HTTP-port audit + zero `TODO.*migrat` verification | qa | G5b, G5c | P2-H | P2-F | 30m | 5 |
| **P2-H** | G3 — composition root cleanup + OpenAPI contract (`api/openapi.yaml`) | dev-stock-price | G3 | P2-I | P2-G | 1.5h | 6 |
| **P2-I** | G6/SI-2 — 3-panel dashboard finalization + SI-2 fleet index (`docs/dashboards/index.html`) | dev-stock-price | G6, SI-2 | P2-J | P2-H | 2h | 7 |
| **P2-J** | G8 honest-red deliberate-break proof (Test A corrupted + Test B golden) | qa | G8 | P2-K | P2-I | 30m | 5 |
| **P2-K** | G9 PO Playwright Path B (chromium-headless-shell, TCC-staged) | po | G9 | P2-L | P2-J | 30m | 4 |
| **P2-L** | Create `stock-price-pre-inject` tag + G10 bug injection | qa | G10 setup | P2-M | P2-K | 20m | 4 |
| **P2-M** | G10 AI-fixability proof (≤2 cycles) + G11 2-trial coupling proof | dev-stock-price + qa | G10, G11 | P2-Z | P2-L | 1.5h | 5 |
| **P2-Z** | Phase 2 close-gate verification (QA) — all Phase-2 goals chain confirmed | qa | (no flip) | Phase 3 | P2-M | 30m | 5 |

**Total atomic tasks:** 14 (P2-A through P2-Z)
**Total AC count:** 66
**Total estimated effort:** ~9.5 hours (dev-stock-price + qa + po combined, WIP=1 sequential)
**G12:** EARNED-PENDING (carry-forward — no new task; QA re-confirms streak at P2-Z)

---

## Per-Task Acceptance Criteria

---

### P2-A — Create `stock-price-pre-ci` Tag

**Owner:** dev-stock-price
**Blocked by:** — (first Phase 2 task)
**Files touched:** none (tag only)

**Background:** L5 lesson baked Day 0. The pre-revert tag MUST exist BEFORE any `.golangci.yml` or
CI work lands. This is a standalone task so PM can verify the tag before dispatching P2-B.

**Step 0 (only action):**
```bash
git tag stock-price-pre-ci HEAD
```
Confirm with:
```bash
git log --oneline stock-price-pre-ci
```
Must return the current HEAD commit SHA + subject (the P1-G close-gate commit or a commit after it).

**AC-1:** `git log --oneline stock-price-pre-ci` returns exactly one line referencing a Phase-1 commit
(the commit that is ancestor of HEAD at Phase-2 kickoff). No `--force`, no push.

**AC-2:** `git tag | grep stock-price-pre-ci` returns `stock-price-pre-ci` (tag exists in local repo).

**AC-3:** Anchor still INTACT: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` returns non-empty output.

**Commit:** No commit required for tag creation. Dev creates a signal file documenting the tag SHA,
stages with L84 explicit path, and commits it as the evidence record.

**Signal file:** `docs/signals/dev-sp-P2-A-done-<UTC>.json` (fields: task=P2-A, tag=stock-price-pre-ci,
tagged_sha=<sha>, anchor_intact=true, next=pm).

**G-goal posture:** NO goal flips. Tag is infrastructure only. §4.5 SSOT untouched.

---

### P2-B — `.golangci.yml` Fence-A/B/C Creation + CI Job Wiring

**Owner:** dev-stock-price
**Blocked by:** P2-A DONE (tag exists)
**Files touched:**
- `apps/stock-price/.golangci.yml` (CREATE)
- `.github/workflows/ci.yml` (MODIFY — add `stock-price-go-lint` job)

**Background:** stock-price is Go (same proven path as TA + macro pilots). Three depguard fences
mirror the macro `.golangci.yml` structure exactly, adapted for stock-price primitives/module paths.
The config is created AFTER the pre-ci tag (P2-A) so the freeze anchor is unambiguous.

**AC-1:** `apps/stock-price/.golangci.yml` exists and contains a `depguard` linter configuration
with THREE named rules:
- **fence-a**: `pkg/primitive/` — deny imports of `application`, `interface`, `infrastructure`,
  and `github.com/mattn/go-sqlite3`. Allow: stdlib + `pkg/domain`.
- **fence-b**: `pkg/module/` — deny imports of `application`, `interface`, `infrastructure`,
  and `github.com/mattn/go-sqlite3`. Allow: stdlib + `pkg/primitive/*` + `pkg/domain`.
- **fence-c**: `github.com/mattn/go-sqlite3` (and `pkg/infrastructure`) importable only from
  `cmd/server/` (deny from primitive, module, and interface zones).

Config includes `run.timeout: 120s`. File is ≤80 lines.

**AC-2:** `cd apps/stock-price && golangci-lint run` exits 0 on the CURRENT codebase (no fence
violations exist in existing Phase-1 code — primitives and module are already stdlib-only).

**AC-3:** `.github/workflows/ci.yml` includes a job named `stock-price-go-lint` with
`working-directory: apps/stock-price` that runs `golangci-lint run`. Evidence:
```bash
grep -n "stock-price-go-lint\|stock-price" .github/workflows/ci.yml
```
Returns ≥1 match containing the job name.

**AC-4:** `git log --oneline apps/stock-price/.golangci.yml` shows ONLY P2-B as the most recent
commit on that file (establishes the freeze anchor path for AC-4c in P2-D).

**AC-5 — G12 DoD gate:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0. Paste output summary to handoff doc.

**Commit subject pattern:**
```
feat(stock-price): P2-B — .golangci.yml Fence-A/B/C + CI go-lint job (G4 partial)
```

**G-goal posture:** NO goal flips. G4 advances but does NOT flip to YES here. §4.5 SSOT untouched.

---

### P2-C — G4 Deliberate-Violation Proof (AC-4b) — Reverted, NEVER Committed

**Owner:** dev-stock-price + qa (QA reproduces independently)
**Blocked by:** P2-B DONE (golangci.yml exists and passes clean run)
**Files touched:** NONE committed — violation is local-only, reverted before any commit

**Background:** AC-4b requires proof that the fence CATCHES a real violation. The violation is a
controlled local experiment only. It MUST be reverted before any commit is made. `git status` must
be clean after revert. This is the most critical discipline in G4 — a committed violation would
corrupt the fence's integrity.

**Violation procedure (dev-stock-price executes, qa reproduces):**

Step 1 — Add ONE temporary Fence-A violation:
Open any file under `apps/stock-price/pkg/primitive/` (e.g. `price-quote-normalizer/normalizer.go`).
Add one import line that imports `github.com/mattn/go-sqlite3` or any package from `pkg/infrastructure/`.
Do NOT save a commit — keep the edit local only.

Step 2 — Run the linter:
```bash
cd apps/stock-price && golangci-lint run
```
Must exit non-zero. The output must contain the fence name (`fence-a` or `Fence-A`) and name the
violating file.

Step 3 — Revert the violation immediately:
```bash
git checkout apps/stock-price/pkg/primitive/price-quote-normalizer/normalizer.go
```
(or whichever file was edited)

Step 4 — Confirm clean linter run:
```bash
cd apps/stock-price && golangci-lint run
```
Must exit 0.

Step 5 — Confirm git status is clean:
```bash
git status --short
```
Must show no changes to any file under `apps/stock-price/pkg/primitive/`.

**AC-1:** Linter exits non-zero on the violation run. Output contains fence name. Evidence (full
linter output) pasted into handoff doc section `§Evidence — AC-4b Violation Run`.

**AC-2:** Linter exits 0 after revert. Evidence pasted into `§Evidence — AC-4b Clean Run`.

**AC-3:** `git status --short | grep "pkg/primitive"` returns empty after revert. Violation was
NEVER staged, NEVER committed.

**AC-4:** QA independently reproduces the violation proof using the same procedure above on a
different primitive file (e.g. `tier-fallback-selector/selector.go`). QA pastes their own evidence.

**AC-5 — G12 DoD gate:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0 (sandbox still green after AC-4b exercise — no code changed).

**Commit:** No violation committed. Dev-stock-price commits the HANDOFF EVIDENCE ONLY (handoff doc
update with pasted linter outputs). QA commits their reproduction evidence similarly.

**G-goal posture:** NO goal flips. AC-4b is the deliberate-violation arm of G4; G4 is not yet
terminal. §4.5 SSOT untouched.

---

### P2-D — G4 Freeze Anchor Confirmation (AC-4c)

**Owner:** qa
**Blocked by:** P2-C DONE (violation reverted, handoff evidence complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** AC-4c is a git-log check confirming the `.golangci.yml` freeze anchor. The freeze
anchor is the P2-B commit — the MOST RECENT commit on `.golangci.yml`. No subsequent commit should
have touched that file.

**AC-1 — Freeze anchor verification:**
```bash
git log --oneline apps/stock-price/.golangci.yml
```
The MOST RECENT commit on that file must be the P2-B commit. No commit after P2-B has touched
`.golangci.yml`. Record the commit SHA as `golangci_freeze_sha` in the G4 evidence.

**AC-2 — `stock-price-pre-ci` tag ancestry:**
```bash
git log --oneline stock-price-pre-ci
```
Must return a commit that is an ancestor of HEAD (i.e., the tag is not newer than current HEAD).
The `stock-price-pre-ci` tag points at a commit BEFORE the P2-B `.golangci.yml` creation commit.
Confirm: `git merge-base stock-price-pre-ci HEAD` returns a non-empty SHA.

**AC-3 — G4 evidence compilation:**
QA writes a G4 evidence summary to `docs/handoffs/TASK_P2-D-sp-g4-evidence.md` containing:
- `ac_4a_ci_job_wired: YES` (from P2-B AC-3 evidence)
- `ac_4b_violation_proof: YES` (from P2-C — linter caught Fence-A violation, violation reverted)
- `ac_4c_freeze_sha: <sha>` (the P2-B commit SHA)
- `stock_price_pre_ci_tag_sha: <sha>` (the P2-A tag SHA)
- `g4_ready_to_grade: YES` (all 3 ACs satisfied)

QA emits completion signal `docs/signals/qa-sp-P2-D-g4-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G4 evidence is complete but PO flips G4 only at 12/12 terminal
Phase-3 close. §4.5 SSOT untouched.

---

### P2-E — Create `stock-price-pre-delete` Tag

**Owner:** dev-stock-price
**Blocked by:** P2-D DONE (G4 evidence confirmed — fence is proven before deletion)
**Files touched:** none (tag only)

**Background:** L5 discipline. The `stock-price-pre-delete` tag must exist BEFORE any `git mv` of
superseded domain/application logic. This sequencing ensures G4 fence is proven on the pre-deletion
codebase, so any fence violation introduced during the git mv operation is immediately detectable.

**Step 0 (only action):**
```bash
git tag stock-price-pre-delete HEAD
```
Confirm:
```bash
git log --oneline stock-price-pre-delete
```
Must return the HEAD commit at P2-D close (the G4 evidence commit).

**AC-1:** `git log --oneline stock-price-pre-delete` returns the commit immediately after P2-D
evidence signal (or the P2-D signal commit itself).

**AC-2:** `git tag | grep stock-price-pre-delete` returns `stock-price-pre-delete`.

**AC-3:** Anchor still INTACT: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` non-empty.

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-F — G5a: `git mv` Superseded Domain/Application Logic to `pkg/_deprecated/`

**Owner:** dev-stock-price
**Blocked by:** P2-E DONE (`stock-price-pre-delete` tag confirmed)
**Files touched:**
- `apps/stock-price/pkg/domain/services.go` → `apps/stock-price/pkg/domain/_deprecated/services_v1.go` (MOVE via `git mv`)
- `apps/stock-price/pkg/domain/services_test.go` → `apps/stock-price/pkg/domain/_deprecated/services_v1_test.go` (MOVE via `git mv`)
- `apps/stock-price/pkg/application/usecases.go` (MODIFY — rewire `FetchPriceUseCase` to call `price_resolution` module instead of `ResolvePriceService`)

**Background:** Per brownfield §4 and phase-1-task-plan OQ-2:
- `pkg/domain/services.go` (`ResolvePriceService`) is the predecessor of the `price_resolution` module.
  When the module is validated (Phase 1 DONE), `ResolvePriceService` is superseded. It moves to
  `pkg/domain/_deprecated/services_v1.go`.
- `pkg/application/usecases.go` (`FetchPriceUseCase`) currently calls `ResolvePriceService`. After
  the move, `FetchPriceUseCase.Execute()` must be updated to call the module's `Resolve()` method.
- The 7 existing unit tests in `services_test.go` move alongside the deprecated service. They remain
  compilable (under their new package path) but are now DEPRECATED tests — they are NOT deleted.

**Pre-condition (mandatory — verify before any `git mv`):**
```bash
git log --oneline stock-price-pre-delete
```
Must return the P2-E commit (proving the tag exists before this mutation). If tag is missing, STOP.

**AC-1 — G5a file moved:**
```bash
test -f apps/stock-price/pkg/domain/_deprecated/services_v1.go && echo FOUND
test -f apps/stock-price/pkg/domain/services.go && echo STILL_EXISTS
```
First command echoes FOUND. Second command echoes nothing (original path is gone).

**AC-2 — Application use case rewired:**
```bash
grep -n "ResolvePriceService\|NewResolvePriceService" apps/stock-price/pkg/application/usecases.go
```
Must return 0 matches (the use case no longer imports the deprecated domain service directly).
Instead, it calls the `price_resolution.PriceResolutionModule.Resolve()` method.

**AC-3 — Build clean:**
```bash
cd apps/stock-price && go build ./...
```
Exits 0 (the deprecation move did not break compilation — the deprecated service compiles under its
new path, and the use case now calls the module).

**AC-4 — Fence-A/B clean post-move:**
```bash
cd apps/stock-price && golangci-lint run
```
Exits 0 (no new fence violations introduced by the git mv or the use-case rewire).

**AC-5 — G12 DoD gate:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0. Sandbox still green after deprecation move.

**AC-6 — `_deprecated/` directory exists with moved files:**
```bash
find apps/stock-price/pkg -path "*_deprecated*" -type f | sort
```
Output must include `services_v1.go` and `services_v1_test.go` under the `_deprecated/` path.

**Commit subject pattern:**
```
chore(stock-price): P2-F — git mv ResolvePriceService → _deprecated/ + FetchPriceUseCase rewire (G5a)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-G — G5b/G5c: MCP Handler HTTP-Port Audit + Zero `TODO.*migrat`

**Owner:** qa
**Blocked by:** P2-F DONE (G5a move complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** Per brownfield §5, the G5b scope is NARROWER than anticipated:
- `fetchStockPrice` and `getPriceHistory` in `apps/mcp-server/src/infrastructure/microservices/clients.ts`
  already route to port 5000 (internal). These functions call the correct external-facing stock-price
  service — no rewire is required for them.
- The three market-data tool files (`priceHistoryTools.ts`, `tickerIntelligenceTools.ts`,
  `priceAlertTools.ts`) query mcp-server's own SQLite via `bun:sqlite`, NOT via stock-price domain
  imports. This is NOT a DDD violation — it is a dual-write caching pattern.
- G5b confirmation task is a grep-only audit proving zero direct stock-price domain imports in any
  mcp-server tool handler.

**AC-1 — Zero direct stock-price domain imports in mcp-server:**
```bash
grep -rn "from.*apps/stock-price\|require.*stock-price" \
  apps/mcp-server/src/interface/mcp/tools/market-data/
```
Must return 0 matches. (Per brownfield §5 audit — confirmed zero cross-service domain imports.)

**AC-2 — HTTP client confirmed at correct port:**
```bash
grep -n "5000\|5010\|stock-price" \
  apps/mcp-server/src/infrastructure/microservices/clients.ts
```
Must return ≥1 match showing `5000` or `stock-price` (confirming HTTP integration exists at the
correct service address). The client routes to port 5000 (internal service address per system-map).

**AC-3 — Zero `TODO.*migrat` markers (G5c):**
```bash
grep -rn "TODO.*migrat" \
  apps/stock-price/ \
  apps/mcp-server/src/interface/mcp/tools/market-data/ \
  --include='*.ts' \
  --include='*.go'
```
Must return 0 matches.

**AC-4 — `_deprecated/` path free of TODO.*migrat:**
```bash
grep -rn "TODO.*migrat" apps/stock-price/pkg/_deprecated/ apps/stock-price/pkg/domain/_deprecated/
```
Must return 0 matches (the moved files must not carry TODO.*migrat markers).

**AC-5 — G5 evidence compiled:**
QA writes G5 grade evidence to `docs/handoffs/TASK_P2-G-sp-g5-evidence.md`:
- `g5a_deprecated_path: apps/stock-price/pkg/domain/_deprecated/services_v1.go`
- `g5b_zero_direct_domain_imports: YES`
- `g5b_http_client_present: YES (port 5000 in clients.ts)`
- `g5c_zero_todo_migrat: YES`
- `g5_ready_to_grade: YES`

QA emits `docs/signals/qa-sp-P2-G-g5-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G5 evidence complete. §4.5 SSOT untouched.

---

### P2-H — G3: Composition Root Cleanup + OpenAPI Contract

**Owner:** dev-stock-price
**Blocked by:** P2-G DONE (G5 chain confirmed clean — safe to clean up composition root)
**Files touched:**
- `apps/stock-price/cmd/server/main.go` (MODIFY — wire `price_resolution` module; remove any
  remaining logic that belongs in domain/module layer; ensure port 5000 wiring via env-var or
  system-map query, not hardcoded)
- `apps/stock-price/api/openapi.yaml` (CREATE — OpenAPI contract documenting all HTTP endpoints)

**Background:** G3 requires the composition root to be a pure wiring file (no business logic, no
if-on-data-values, no calculations) AND an HTTP contract document (OpenAPI YAML) at
`apps/stock-price/pkg/interface/http/` or `apps/stock-price/api/`. The CGO SQLite fetcher
(`mattn/go-sqlite3`) is wired HERE as the infra implementation of the `TierFetcher` port —
this is the ONLY place it is injected.

**AC-1 — Zero business logic in composition root:**
```bash
grep -c "FetchPrice\|tierResult\|normalize\|SelectWinning\|Classify" \
  apps/stock-price/cmd/server/main.go
```
Must return 0. Business logic lives in primitives/module, not the composition root.

**AC-2 — CGO infra injected at composition root (Fence-C confirmed):**
```bash
grep -n "infrastructure\|SQLite\|mattn\|fetcher" apps/stock-price/cmd/server/main.go
```
Must return ≥1 match (the CGO SQLite adapter is wired here — this is correct per Fence-C).
The match must be an import or instantiation, not business logic.

**AC-3 — Composition root ≤100 lines:**
```bash
wc -l apps/stock-price/cmd/server/main.go
```
Must return ≤100. If it exceeds 100 lines, dev-stock-price must extract wiring helpers into
`cmd/server/wire.go` (DI helper file, not business logic).

**AC-4 — OpenAPI contract exists and covers all live endpoints:**
```bash
test -f apps/stock-price/api/openapi.yaml && echo FOUND
```
Echoes FOUND. The YAML must document at minimum:
- `GET /health` → `{ status, service, port }`
- `POST /price/fetch` → request: `{ code }`, response: `PriceQuote` shape
- `GET /price/history?code=X&days=N` → response: `[]DailyOHLCV` shape

Validation: `cat apps/stock-price/api/openapi.yaml | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)"` exits 0 (valid YAML).

**AC-5 — Build + lint still clean:**
```bash
cd apps/stock-price && go build ./... && golangci-lint run
```
Both exit 0.

**AC-6 — G12 DoD gate:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0. Paste output to handoff doc.

**Commit subject pattern:**
```
feat(stock-price): P2-H — composition root cleanup + OpenAPI contract (G3)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-I — G6/SI-2: 3-Panel Dashboard Finalization + SI-2 Fleet Index

**Owner:** dev-stock-price
**Blocked by:** P2-H DONE (composition root and OpenAPI in place — microservice panel can now show
real endpoint facts)
**Files touched:**
- `apps/stock-price/dashboard/index.html` (MODIFY — finalize all 3 panels: add G5a _deprecated note,
  link OpenAPI contract, update microservice panel port facts from Phase-1 stub)
- `docs/dashboards/index.html` (CREATE — SI-2 fleet dashboard index — **stock-price OWNS this file**
  as the first fleet pilot to reach G6 per ratification Decision 3)

**Background — SI-2 ownership:**
stock-price is the FIRST fleet pilot to hit G6. Per pilot charter §G6 and ratification Decision 3,
`dev-stock-price` OWNS the creation of `docs/dashboards/index.html`. No other pilot may create or
modify this file. The file is a fleet-level index linking each microservice's per-service dashboard.
At Phase-2 kickoff, only stock-price has a complete dashboard — the index must render correctly
with partial fleet population (other services link as "NOT-YET-ACTIVE").

**SI-2 fleet index spec (`docs/dashboards/index.html`):**
- Static HTML, `file://` accessible, zero external CDN, zero network calls
- One row per microservice in the fleet (from system-map.json): stock-price, technical-analysis,
  macro-indicators, kinh-dich-service, alert-engine, news-fetch, pdf-extractor, rag-service
- Each row: service name, zone path, link to per-service `dashboard/index.html` (relative path),
  status badge (`ACTIVE` = has a dashboard, `NOT-YET-ACTIVE` = no dashboard yet)
- stock-price row links to `../../apps/stock-price/dashboard/index.html` and shows `ACTIVE`
- technical-analysis and macro-indicators rows: `ARCHIVED-CLOSED` (pilot DONE, FROZEN)
- All other services: `NOT-YET-ACTIVE`
- Zero credentials, zero live API calls, zero `mattn/go-sqlite3` references

**3-panel dashboard finalization spec (`apps/stock-price/dashboard/index.html`):**
- Phase-1 stub had 3 primitive cards + 1 module card + 1 microservice card — all NOT-RUN
- Phase-2 finalization: add a "Deprecated" notice section listing `pkg/domain/_deprecated/services_v1.go`
  (so the trust layer shows the G5a move)
- Microservice panel: confirm port 5000 (internal) / 5010 (external) per system-map query (not
  hardcoded in HTML prose — cite system-map.json as source)
- All existing panel cards remain; G5a note is additive only

**AC-1 — Per-service dashboard finalized:**
```bash
test -f apps/stock-price/dashboard/index.html && echo FOUND
```
Echoes FOUND. File opens via `file://` with zero network calls (QA verifies by opening cold).

**AC-2 — SI-2 fleet index created:**
```bash
test -f docs/dashboards/index.html && echo FOUND
```
Echoes FOUND. Fleet index is a NEW file — not an overwrite of an existing file (directory did not
exist before this task per current repo state).

**AC-3 — Fleet index row count:**
```bash
grep -c "ACTIVE\|NOT-YET-ACTIVE\|ARCHIVED-CLOSED" docs/dashboards/index.html
```
Must return ≥ 8 (one status per microservice in scope).

**AC-4 — PO Playwright compatibility (Path B pre-check for P2-K):**
Per-service dashboard AND fleet index both render correctly in chromium-headless-shell preview:
- ZERO console errors, ZERO pageerrors, ZERO requestfailed
- All primitive + module + microservice cards visible in DOM for per-service dashboard
- All fleet service rows visible in DOM for fleet index
Dev-stock-price pastes a dry-run verification (manual browser open or headless preview) to handoff.

**AC-5 — Zero credentials in both HTML files:**
```bash
grep -c "DB_PATH\|STOCK_PRICE_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" \
  apps/stock-price/dashboard/index.html \
  docs/dashboards/index.html
```
Must return 0 total matches across both files.

**AC-6 — SI-2 exclusivity confirmed:**
```bash
git log --oneline docs/dashboards/index.html
```
The ONLY commit touching this file must be the P2-I commit (stock-price is the sole author).

**AC-7 — G12 DoD gate:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0. Paste output to handoff doc. Dashboard cards show GREEN state after sandbox run.

**Commit subject pattern:**
```
feat(stock-price): P2-I — dashboard finalization + SI-2 fleet index docs/dashboards/index.html (G6)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-J — G8 Honest-Red Deliberate-Break Proof

**Owner:** qa
**Blocked by:** P2-I DONE (dashboard finalized — honest-red test requires a working dashboard)
**Files touched:** none committed (test edits to scenario JSON are reverted; handoff doc is committed)

**Background:** G8 honest-red contract. Two tests prove the dashboard is not a false-green machine:
- Test A (deliberately corrupted scenario) → dashboard shows RED / non-green status
- Test B (golden scenario after revert) → dashboard shows GREEN

**Test A — Corrupted scenario:**
1. Edit one golden scenario JSON (e.g. `docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json`).
   Change one expected output field to a wrong value (e.g. flip the expected winning tier source).
2. Run sandbox:
   ```bash
   cd apps/stock-price && go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
   ```
   Must exit non-zero with ≥1 FAIL for `tier-fallback-selector`.
3. Open `apps/stock-price/dashboard/index.html` — `tier-fallback-selector` card must show RED / FAIL.
4. Capture terminal output + dashboard state description.
5. Revert the JSON edit: `git checkout docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json`

**Test B — Golden scenario (after revert):**
1. Run sandbox:
   ```bash
   cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
   ```
   Must exit 0 with all scenarios PASS.
2. Open dashboard — all cards show GREEN. No false greens on NOT-RUN items.

**AC-1 (Test A):** Sandbox exits non-zero on corrupted scenario AND dashboard shows non-green for
affected card. Evidence (terminal output) pasted to handoff `§Evidence — G8 Test A`.

**AC-2 (Test B):** Sandbox exits 0 after revert AND dashboard shows green for all cards.
Evidence pasted to handoff `§Evidence — G8 Test B`.

**AC-3 — 2 additional known-bad runs:**
QA runs 2 more deliberately corrupted scenario invocations using different primitives
(e.g. `price-quote-normalizer` then `price-staleness-classifier` golden files). All 2 return
exit non-zero. Evidence: paste exit codes.

**AC-4 — Reverted files clean:**
```bash
git status --short | grep "scenarios"
```
Returns empty (no staged or unstaged changes to any scenario file).

**AC-5 — G8 evidence compiled:**
QA writes `docs/handoffs/TASK_P2-J-sp-g8-evidence.md` and emits
`docs/signals/qa-sp-P2-J-g8-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G8 evidence complete. §4.5 SSOT untouched.

---

### P2-K — G9 PO Playwright Path B (Chromium-Headless-Shell, TCC-Staged)

**Owner:** po
**Blocked by:** P2-J DONE (dashboard honest-red proven — trust contract can now be verified)

**Background:** Charter §G9 Path B is the Day-0 default (L6 lesson baked in). No synchronous user
wait required. PO runs Playwright chromium-headless-shell against the per-service dashboard
(`apps/stock-price/dashboard/index.html`). If user is available for a Path A verbal confirm, PO
may substitute Path A — either path satisfies G9.

**AC-1:** PO runs Playwright headless chromium against `file://apps/stock-price/dashboard/index.html`.
All 3 panels (primitives, module, microservice) are rendered in the DOM.

**AC-2:** ZERO console errors, ZERO pageerrors, ZERO requestfailed in Playwright log.

**AC-3:** All primitive cards (≥3) + module card + microservice card are visible. Status displayed
honestly (GREEN for sandbox-run items, NOT-RUN for cold-open items — no false greens).

**AC-4:** PO records verdict in `docs/po-decisions/<date>-g9-stock-price-user-confirmation.md`
per charter §G9 Path B template. Fields: `pilot: stock-price`, `path: B (PO Playwright)`,
`verdict: PASS` (or FAIL if zero-console-errors not met). Emits
`docs/signals/po-sp-P2-K-g9-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G9 evidence complete. §4.5 SSOT untouched.

---

### P2-L — Create `stock-price-pre-inject` Tag + G10 Bug Injection

**Owner:** qa
**Blocked by:** P2-K DONE (G9 confirmed — trust layer proven before deliberately breaking things)
**Files touched:** 1 committed injection file (deliberate bug in primitive)

**Background:** L5 tag discipline + G10 bug injection spec from charter §G10. The pre-inject tag
MUST exist BEFORE the injection commit. QA injects a SINGLE-LITERAL bug into a stock-price primitive.

**Step 0 (mandatory — before any file edit):**
```bash
git tag stock-price-pre-inject HEAD
git log --oneline stock-price-pre-inject
```
Must return the P2-K evidence commit. STOP if tag fails.

**Bug injection spec (calibrated for stock-price, off-by-one / wrong-literal pattern):**
- **Target:** `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go`
- **Injection:** Change the staleness threshold comparison — for example, change the STALE guard
  from `>= freshThresholdSeconds` to `> freshThresholdSeconds` (off-by-one, or change a constant
  from `60` to `600` if one exists). Alternatively, flip the `FRESH` / `STALE` return value for
  the boundary case.
- **Effect:** `price-staleness-classifier-golden.json` scenario fails (expected FRESH but returns
  STALE or vice versa).
- **Dashboard:** `price-staleness-classifier` card turns RED after sandbox run.
- **Single literal:** the change is ONE character / one literal — deterministic correct fix exists.

**AC-1:** `stock-price-pre-inject` tag exists on the commit BEFORE the injection:
```bash
git log --oneline -2
```
Shows injection commit on top, `stock-price-pre-inject` tag on the commit below it.

**AC-2:** After injection commit, sandbox shows at least 1 FAIL:
```bash
cd apps/stock-price && go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```
Exits non-zero. Paste output to handoff (evidence of FAIL state).

**AC-3:** Dashboard shows RED for `price-staleness-classifier` card after sandbox run.
QA describes dashboard state in handoff `§Evidence — G10 Injection`.

**AC-4:** Injection commit subject:
```
test(stock-price): P2-L — deliberate bug injection for G10 AI-fixability proof (stock-price-pre-inject tagged)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-M — G10 AI-Fixability Proof (≤2 Cycles) + G11 2-Trial Coupling Proof

**Owner:** dev-stock-price (fix) + qa (cycle count + Trial-2)
**Blocked by:** P2-L DONE (bug injected, dashboard RED, pre-inject tag confirmed)

**Background:** G10 and G11 are proven in sequence within this task.

#### G10 — Fix the injected bug (≤2 dispatch cycles)

**The injected bug:** wrong literal / off-by-one in `price-staleness-classifier.go`.

Dev-stock-price diagnoses from the RED dashboard, fixes the bug, verifies sandbox green, verifies
dashboard green — all within ≤2 dispatch cycles.

**Cycle counting:** QA counts from receipt of P2-L DONE signal to sandbox-exit-0 again.
Each dev-stock-price dispatch = 1 cycle. Target: ≤2 cycles.

**AC-1 (G10):**
```bash
cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0 after fix. Paste full output to handoff.

**AC-2 (G10):** Dashboard shows GREEN for `price-staleness-classifier` card after fix and sandbox run.

**AC-3 (G10 cycle count):** QA records cycle count in `docs/handoffs/TASK_P2-M-sp-g10-g11.md`:
- Cycle count = 1 → G10 EXCEEDS baseline (1.5 system-wide)
- Cycle count = 2 → G10 MEETS baseline
- Cycle count > 2 → G10 FAILS — PM escalates to architect before Phase 3

**AC-4 (G12 DoD gate — dev-stock-price):**
```bash
cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0 BEFORE dev declares DONE. Evidence pasted to handoff.

#### G11 — 2-Trial Regression Alarm Coupling Proof

**Trial-1** uses the G10 fix sequence already completed:
- QA verifies: during the G10 bug injection, at least ONE other scenario (a scenario for a
  primitive that IMPORTS or DEPENDS on the staleness classifier's output — e.g. the module-level
  `price-resolution-golden.json` scenario if the module uses ClassifyStaleness) went RED alongside
  the injected bug scenario. If no coupled scenario went RED, QA notes that the module scenario
  must be updated to exercise the staleness path — then re-runs Trial-1 with the corrected module
  scenario.
- Single-edit fix (the one-literal revert) repairs ALL coupled REDs simultaneously.
- Outcome-(a): ≥1 coupled scenario went RED; single-edit fix restored all GREEN. PASS.

**Trial-2** (a different primitive mutation + coupling proof):
1. QA injects a DIFFERENT one-literal mutation into `price-quote-normalizer/normalizer.go`
   (e.g. change the `ChangePercent` field mapping to use `rawChange` instead of `rawChangePct`).
2. Confirm: `price-quote-normalizer-golden.json` fails AND ≥1 module-level scenario also fails
   (coupling proof — the module that calls the normalizer is affected).
3. Dev-stock-price reverts the mutation in 1 edit.
4. Sandbox exits 0 after fix. All coupled REDs resolved.
5. QA reverts the Trial-2 injection commit (or the injection is a local-only test — QA decides
   whether to commit Trial-2 injection or keep it local; either is acceptable as long as git is
   clean at P2-M completion).

**AC-5 (G11):** QA records both trials in `docs/handoffs/TASK_P2-M-sp-g10-g11.md`:
- `trial_1_outcome: outcome-(a)` (coupled REDs from G10 injection + single-edit fix)
- `trial_2_outcome: outcome-(a)` (coupled REDs from different primitive mutation + single-edit fix)
- `g11_verdict: PASS`
QA emits `docs/signals/qa-sp-P2-M-g10-g11-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G10 and G11 evidence complete. §4.5 SSOT untouched.

---

### P2-Z — Phase 2 Close-Gate Verification (QA)

**Owner:** qa
**Blocked by:** P2-M DONE (G10 + G11 chain complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** Final Phase-2 gate. QA verifies the complete goal evidence chain before emitting
the signal that authorizes PM to transition SSOT to phase2=CLOSED and notify PO for Phase 3.
NO goal flips in this task — that is a Phase-3 PO-only event.

**AC-1 — Sandbox all-green (Phase-2 state):**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
All three exit 0. QA pastes all three outputs to close-gate doc.

**AC-2 — All 6 Phase-2 goal evidence files present:**
```bash
ls docs/handoffs/TASK_P2-D-sp-g4-evidence.md \
   docs/handoffs/TASK_P2-G-sp-g5-evidence.md \
   docs/handoffs/TASK_P2-J-sp-g8-evidence.md \
   docs/handoffs/TASK_P2-M-sp-g10-g11.md
```
All 4 files exist. G3 evidence: composition root clean per P2-H AC-1..AC-3 handoff.
G9 evidence: PO decision doc from P2-K.

**AC-3 — G12 streak carry-forward (EARNED-PENDING re-confirmed):**
QA re-verifies: the 3 Phase-1 streak tasks (P1-B1, P1-B2, P1-B3) each have sandbox-green evidence
in their Phase-1 handoff docs. Every Phase-2 dev task (P2-B, P2-F, P2-H, P2-I, P2-M) has sandbox-
green evidence pasted to its handoff. G12 streak = EARNED-PENDING (continuous, no task skipped
the DoD gate). Records `g12_streak_carryforward: CONFIRMED` in close-gate doc.

**AC-4 — Pre-revert tags all present and ordered correctly:**
```bash
git log --oneline stock-price-pre-ci stock-price-pre-delete stock-price-pre-inject 2>/dev/null | sort
```
All three tags resolve to commits (no "unknown revision" error). Tag ancestry order must be:
`stock-price-pre-ci` ≤ `stock-price-pre-delete` ≤ `stock-price-pre-inject` (each tags a commit
no newer than the next in sequence).

**AC-5 — Frozen anchor INTACT and SSOT not mutated:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```
Non-empty output (anchor is still a proper ancestor of HEAD).
```bash
jq '{phase,goalsEarned,decisionMatrix}' docs/data/pilot-status-stock-price.json
```
`goalsEarned` must still be 0 (no goals flipped by any Phase-2 task). `decisionMatrix.speed`,
`.trust`, `.scale` must all be `"TBD"`. §4.5 untouched.

**Signal:**
QA emits `docs/signals/qa-sp-phase2-close-gate-<UTC>.json` with fields:
```json
{
  "pilot": "stock-price",
  "phase": "2",
  "gate": "CLOSE-GATE",
  "sandbox_all_green": true,
  "goals_evidence_complete": ["G3","G4","G5","G8","G9","G10","G11"],
  "g12_streak_carryforward": "CONFIRMED",
  "pre_revert_tags": ["stock-price-pre-ci","stock-price-pre-delete","stock-price-pre-inject"],
  "anchor_intact": true,
  "ssot_not_mutated": true,
  "goals_earned": 0,
  "decision_matrix": "TBD",
  "next_actor": "pm",
  "next_action": "transition pilot-status-stock-price.json phase2=CLOSED, notify PO for Phase-3 atomic close"
}
```

**G-goal posture:** NO goal flips in P2-Z. The close-gate signal authorizes PM to transition
the SSOT phase field. PO then executes the 12/12 terminal atomic close (Phase 3) at their cadence.

---

## Goal Coverage Matrix

| G-goal | Phase-1 status | Phase-2 task(s) | Phase-2 evidence location |
|--------|---------------|-----------------|--------------------------|
| G1 | EARNED-PENDING | (no task — carry-forward) | P1-G + P2-Z AC-1 re-confirm |
| G2 | EARNED-PENDING | (no task — carry-forward) | P1-G + P2-Z AC-1 re-confirm |
| G3 | STILL-UNMET | P2-H | TASK_P2-H handoff + P2-Z AC-2 |
| G4 | STILL-UNMET | P2-A, P2-B, P2-C, P2-D | TASK_P2-D-sp-g4-evidence.md |
| G5 | STILL-UNMET | P2-E, P2-F, P2-G | TASK_P2-G-sp-g5-evidence.md |
| G6 | EARNED-PENDING | P2-I (finalization) | TASK_P2-I handoff + P2-Z AC-2 |
| G7 | EARNED-PENDING | (no task — carry-forward) | P1-E AC-3..AC-5 + P2-Z re-confirm |
| G8 | EARNED-PENDING | P2-J (re-confirm via deliberate-break) | TASK_P2-J-sp-g8-evidence.md |
| G9 | STILL-UNMET | P2-K | docs/po-decisions/<date>-g9-stock-price-user-confirmation.md |
| G10 | STILL-UNMET | P2-L, P2-M | TASK_P2-M-sp-g10-g11.md |
| G11 | STILL-UNMET | P2-M | TASK_P2-M-sp-g10-g11.md |
| G12 | EARNED-PENDING | (DoD gate re-applied on each dev task) | P2-Z AC-3 streak carry-forward |

**No goal flips are authorized by any task in this table. 12/12 terminal is a Phase-3 PO-only event.**

---

## Phase 2 Exit Criteria (for QA close-gate P2-Z)

| # | Criterion | Measurement | PASS threshold |
|---|---|---|---|
| 1 | Sandbox all-green | `go run ./cmd/sandbox -tier=all -scenario=all` exit code | 0 |
| 2 | G4 evidence complete | AC-4a + AC-4b (violation proof + revert) + AC-4c (freeze anchor) | All 3 present in TASK_P2-D |
| 3 | G5 chain complete | G5a _deprecated/ + G5b zero-domain-imports + G5c zero-TODO-migrat | All 3 present in TASK_P2-G |
| 4 | G3 composition root clean | wc -l ≤100, zero business logic, OpenAPI exists | All 3 in TASK_P2-H handoff |
| 5 | SI-2 fleet index exists | `docs/dashboards/index.html` created by P2-I | File exists, P2-I is sole commit |
| 6 | G9 PO Playwright | ZERO console errors, all cards rendered | docs/po-decisions from P2-K |
| 7 | G10 ≤2 cycles | dev-stock-price fixed injected bug in ≤2 dispatches | cycle_count ≤ 2 in TASK_P2-M |
| 8 | G11 2-trial proof | Both trials show outcome-(a) coupling | g11_verdict=PASS in TASK_P2-M |
| 9 | G12 streak carry | All Phase-2 dev tasks have sandbox-green evidence | g12_streak_carryforward=CONFIRMED |
| 10 | Anchor INTACT | debba8ea is ancestor of HEAD | git merge-base check exits 0 |

**All 10 criteria PASS → PM transitions SSOT phase2=CLOSED → PO executes Phase-3 atomic close.**

---

## WIP Policy

**WIP=1 sequential.** PM dispatches ONE task at a time. dev-stock-price works through P2-A → P2-Z
in the order above. No parallel dispatches within Phase 2.

**Rationale:** Pre-revert tags (P2-A, P2-E, P2-L) require that previous work is cleanly committed
before the tag is created. Running tasks in parallel would break the tag sequence discipline and
could cause git index contention (kinh-dich pilot is also active concurrently in a separate zone).

**Kinh-dich concurrency note:** `dev-kinh-dich` is concurrently active in `apps/kinh-dich-service/`.
If `dev-stock-price` encounters a `.git/index.lock` error: verify no git process is running across
both zones, wait 4s, retry. NEVER blindly delete the lock — confirm it is orphaned first.

---

## Open Questions (for PM)

**OQ-1 — G5b optional route decision:**
Per brownfield §5, `priceHistoryTools.ts` and `tickerIntelligenceTools.ts` currently query
mcp-server's own SQLite rather than routing via stock-price HTTP. This is NOT a mandatory rewire
(brownfield §5 OQ-7 reasoning). PM decides at P2-G time whether the dual-write pattern needs
resolution or is acceptable for Phase 2. Architect recommendation: accept as-is for Phase 2,
add a post-pilot-3 backlog item to evaluate routing consistency.

**OQ-2 — P1-F ohlcv-aggregator status:**
If Phase 1 did not dispatch P1-F (flex task), the `ohlcv-aggregator` primitive is absent from
`pkg/primitive/`. G5a in P2-F should still proceed — `ohlcv-aggregator` is not a prerequisite
for the deprecation move. PM confirms P1-F status before dispatching P2-F.

**OQ-3 — G11 Trial-2 injection: commit vs local-only:**
The Trial-2 mutation in P2-M can be local-only (never committed) or committed-then-reverted.
QA decides at task time. Either is acceptable per the grading rubric as long as git is clean
at P2-M DONE and the coupling proof is documented.
