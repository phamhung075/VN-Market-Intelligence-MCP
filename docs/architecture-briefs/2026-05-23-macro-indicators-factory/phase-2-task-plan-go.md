---
title: "Phase 2 Task Plan (Go) — macro-indicators Pilot"
date: "2026-05-23"
author: "architect (c282 cycle-22)"
pilot: "macro-indicators"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-23"
sprint_deadline: "2026-07-04"
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md"
ssot_ref: "docs/data/pilot-status-macro-indicators.json"
language: "Go (mcp-server zone stays TypeScript — handler-only rewire)"
anchor: "1776df8e (held throughout Phase 1, must remain ancestor throughout Phase 2)"
inbound_signal: "docs/signals/po-cycle21-dispatch-architect-phase2-spec-20260523T121526Z.json"
phase1_gate: "GO (2026-05-23T12:15:26Z — 4/4 criteria PASS, G12 EARNED-PENDING)"
---

# Phase 2 Task Plan (Go) — macro-indicators Pilot

**Generated:** 2026-05-23 by architect (c282 cycle-22)
**Phase 1 Gate:** GO (PO cycle-21, 2026-05-23T12:15:26Z)
**Phase 2 Goal scope:** G1, G4, G5, G8, G9, G10, G11 (G2/G3/G6/G7 addressed via prior Phase 1 work + Phase 2 expansion; G12 EARNED-PENDING §4.5)
**WIP recommendation:** WIP=1 (see §WIP Decision below)

---

## Phase 2 Summary

Phase 2 delivers the remaining 5 primitives, module expansion, architecture fence (G4), TS deprecation + MCP HTTP rewire (G5), and the G8/G9/G10/G11 verification chain. It closes all 11 non-G12 goals, enabling the PO §4.5 atomic close (Phase 3).

**Total tasks:** 14 atomic tasks across 6 buckets (B, C, D, E, F, G)
**Critical path:** P2-B1 (MCP HTTP rewire) → P2-B2 (pre-revert tag + git mv) → P2-B3 (G5 verification) → P2-G1 (G1 verification) → P2-G2 (G2/G3 health check) → P2-F (G8 honest-red) → P2-C (G9 Playwright)
**WIP=1** throughout: dev-macro-indicators works one task at a time.

---

## WIP Decision

**Recommendation: WIP=1 (no parallel P2-A + P2-B)**

Justification (per OQ-6 from Phase 1 plan):

- P2-A (golangci.yml fence) and P2-B (MCP HTTP rewire) touch separate zones (`apps/macro-indicators/` vs `apps/mcp-server/`). They are technically file-disjoint.
- However, dev-macro-indicators is a single-agent scope. Running P2-B1 (mcp-server rewire, TS zone) in parallel with P2-A1 (Go zone) requires the agent to hold context for two separate language zones simultaneously — TS handler rewire + Go linter config. This increases error risk.
- P2-B1 is the HIGHEST PRIORITY task (R-3 unblock). Splitting focus before R-3 is resolved delays the most critical unblock.
- Charter OQ-6 note from Phase 1: "Phase 2 should start with P2-A1 in parallel with P2-B1" — but that note was a suggestion, not a mandate. PO signal explicitly states WIP=1 default per charter §Constraints unless architect justifies WIP=2.
- **Decision: WIP=1. Start with P2-B1 (R-3 unblock) immediately. P2-A1 follows in next slot after P2-B1 DONE.**

If PM needs to recover schedule: P2-A1 (golangci.yml creation only — no code change) is dispatchable in parallel ONLY after P2-B1 is DONE, because both will have gone through commit and signal cycle without shared file conflict. PM decides at that point.

---

## Hard Constraints (binding on every task)

Every task in this plan inherits the following. Dev agent reads these before every commit.

| Constraint | Enforcement |
|---|---|
| **R-1 deterministic scoring** | `grep -rE "math/rand\|rand\.Intn\|rand\.Float\|time\.Now.*Seed\|time\.Now.*nanosecond" apps/macro-indicators/` must exit 1 (zero matches) before DONE |
| **G12 DoD gate** | `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` must exit 0 before DONE (on Go tasks) |
| **Fence-A** | `pkg/primitive/*/` may only import stdlib. Zero imports from `pkg/module/`, `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/`. |
| **Fence-B** | `pkg/module/*/` may only import `pkg/primitive/` + stdlib. Zero imports from `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/`. |
| **Fence-C** | `pkg/infrastructure/` is only importable from `cmd/server/main.go` (composition root). |
| **L84 staging** | `git add <explicit-path>` per file. Never `git add -A` or `git add .`. |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source/CI. |
| **Anchor 1776df8e** | Must remain ancestor before AND after every commit. Check: `git log --oneline --ancestry-path 1776df8e..HEAD | tail -1` must return a line. |
| **Out-of-zone ban** | Do NOT modify `apps/technical-analysis/` (TA pilot FROZEN). |
| **FRED_API_KEY ban** | Zero FRED_API_KEY references in committed .go/.html/.json/.md files (brownfield OBS-1 exemption: legacy .ts files in src/ are exempt — scan scoped to Go pilot zone). |
| **Charter §4.5** | decisionMatrix fields stay TBD. PO-only authorship at 12/12 terminal. |

---

## Pre-Revert Tags (Phase 2 — binding creation times)

| Tag | Created before | Who creates | Why |
|---|---|---|---|
| `macro-pre-ci` | P2-A2 (CI job activation) | dev-macro-indicators | Rollback point before any CI mutation |
| `macro-pre-delete` | P2-B2 (`git mv src/ src/_deprecated/`) | dev-macro-indicators | Rollback point before TS deprecation |
| `macro-pre-inject` | P2-D2 (bug injection commit) | qa | Rollback point before deliberate regression |

**Protocol:** `git tag macro-pre-<name> HEAD` (no `--force`, no push). Confirm `git log --oneline macro-pre-<name>` shows expected commit before proceeding.

---

## Task Ledger

| ID | Title | Owner | G-goals retired | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-----------------|--------|------------|-----|----------|
| **P2-B1** | MCP tool handler HTTP rewire (R-3 unblock) | dev-mcp-server | G5b | P2-B2 | — | 2h | 7 |
| **P2-A1** | `.golangci.yml` creation (Fence-A/B/C rules) | dev-macro-indicators | G4 partial | P2-A2 | P2-B1 DONE | 45m | 5 |
| **P2-A2** | CI job + deliberate violation proof + pre-ci tag | dev-macro-indicators | G4 full | P2-B2 | P2-A1 | 1h | 5 |
| **P2-B2** | Pre-delete tag + `git mv src/ src/_deprecated/` | dev-macro-indicators | G5a | P2-B3 | P2-A2 | 30m | 5 |
| **P2-B3** | G5 verification (zero TODO.*migrat + G5c) | qa | G5 full | P2-X1 | P2-B2 | 20m | 4 |
| **P2-X1** | Remaining 5 primitives extraction (oil/gold/usdvnd/carry/yield) | dev-macro-indicators | G1 partial | P2-X2 | P2-B3 | 3h | 7 |
| **P2-X2** | Module expansion: macro-signals wires all 6 primitives | dev-macro-indicators | G2 update | P2-X3 | P2-X1 | 1h | 5 |
| **P2-X3** | Snapshot endpoint implementation (Go handler → real use case) | dev-macro-indicators | G3 update | P2-G1 | P2-X2 | 1h | 5 |
| **P2-G1** | G1 + G2 + G3 terminal verification (primitives ≥5, module wires all, composition root clean) | qa | G1, G2, G3 | P2-F1 | P2-X3 | 30m | 6 |
| **P2-F1** | G8 honest-red proof (Test A corrupted + Test B golden) | qa | G8 | P2-C1 | P2-G1 | 30m | 5 |
| **P2-C1** | G9 PO Playwright short-circuit (Path B default) | po | G9 | P2-D1 | P2-F1 | 30m | 4 |
| **P2-D1** | Bug injection pre-tag + QA injects deliberate primitive bug | qa | G10 setup | P2-D2 | P2-C1 | 20m | 3 |
| **P2-D2** | dev-macro-indicators fixes injected bug (≤2 cycles proof) | dev-macro-indicators | G10 | P2-E1 | P2-D1 | 1h | 4 |
| **P2-E1** | Regression alarm proof (2 trials coupling-proven outcome-(a)) | qa + dev-macro-indicators | G11 | Phase 3 | P2-D2 | 45m | 4 |

**Total tasks:** 14
**Total estimated effort:** ~12.5 hours across dev-macro-indicators + qa + po
**G12:** EARNED-PENDING — no additional task needed (§4.5 flip by PO at 12/12 terminal)

---

## Per-Task Acceptance Criteria

---

### P2-B1 — MCP Tool Handler HTTP Rewire (R-3 Unblock)

**Priority: HIGHEST — starts immediately (no blocker)**

**DDD zone:** `apps/mcp-server/src/interface/mcp/tools/macro/` (TypeScript interface layer only — no domain logic moves)

**Background:** 4 MCP tools currently bypass the macro-indicators HTTP service entirely via direct domain imports within mcp-server. This is a DDD violation: the interface layer of mcp-server imports domain services (`computeCarryTradeSignal`, `computeYieldSpreadSignal`, `getMacroCalendar`) that belong to the macro-indicators bounded context. G5b requires all 4 tools to route through HTTP to the Go service at port 5004.

**Brownfield analysis of the 4 tools:**

| Tool | File | Current implementation | New implementation |
|---|---|---|---|
| `get_macro_snapshot` | `macroTools.ts` | Calls `fetchYahooFinancePrices`, `fetchSbvRates` directly + DB reads + `computeCarryTradeSignal`, `computeYieldSpreadSignal` inline | HTTP POST `http://macro-indicators:5004/snapshot` (or localhost:5004 in dev) |
| `get_carry_trade_signal` | `carryTools.ts` | Reads sbv_rates + tracked_indicators from DB, calls `computeCarryTradeSignal()` | HTTP GET `http://macro-indicators:5004/carry-trade-signal` |
| `get_yield_spread_signal` | `dinhGiaTools.ts` | Reads tracked_indicators + sbv_rates from DB, calls `computeYieldSpreadSignal()` | HTTP GET `http://macro-indicators:5004/yield-spread-signal` |
| `get_macro_calendar` | `carryTools.ts` | Calls `getMacroCalendar()` directly from mcp-server domain | HTTP GET `http://macro-indicators:5004/macro-calendar?days={days}` |

**Go service endpoints to add (P2-B1 also adds routes to the Go router):**

The Go `pkg/interface/http/router.go` currently has only `/health` and `/snapshot`. P2-B1 must ADD three new routes:
- `GET /carry-trade-signal` — reads SBV deposit rate + fed rate (from DB or config), calls `macro_carry_trade_signal.Compute()`, returns JSON
- `GET /yield-spread-signal` — reads earning yield + deposit rate, calls `macro_yield_spread_signal.Compute()`, returns JSON
- `GET /macro-calendar?days=60` — calls macro calendar logic, returns JSON

**Sequencing note within P2-B1:** Dev must implement Go endpoints first (or in same commit), then rewire TS handlers. The Go primitives `macro_carry_trade_signal` and `macro_yield_spread_signal` do NOT exist yet (they are Phase 2 primitives in P2-X1). For P2-B1, stub the Go handlers returning fixture JSON with the correct contract shape — Phase 2 P2-X1 implements the real logic. This ensures G8 + G11 can test against real data when P2-X1 lands.

**Alternative approach (preferred if stub is too fragile):** P2-B1 implements the Go carry-trade + yield-spread primitives inline in the handler (no `pkg/primitive/` package yet) and P2-X1 extracts them to the proper package. Dev agent decides at task time which approach maintains cleaner Fence-A. The preferred approach is stub-first with clear `// TODO(P2-X1)` markers.

**Files to modify:**

- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (MODIFY — replace direct fetchers + domain calls with HTTP client call)
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts` (MODIFY — replace `computeCarryTradeSignal` + `getMacroCalendar` with HTTP calls)
- `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts` (MODIFY — replace `computeYieldSpreadSignal` with HTTP call)
- `apps/macro-indicators/pkg/interface/http/router.go` (MODIFY — add 3 new routes)
- `apps/macro-indicators/pkg/interface/http/handlers_carry.go` (CREATE — carry-trade-signal handler stub)
- `apps/macro-indicators/pkg/interface/http/handlers_yield.go` (CREATE — yield-spread-signal handler stub)
- `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` (CREATE — macro-calendar handler stub)

**Forbidden reads/writes:**
- Do NOT modify `apps/technical-analysis/` (FROZEN)
- Do NOT modify `apps/mcp-server/src/domain/` (business logic stays in mcp-server domain for now — only handler layer changes)
- Do NOT modify `docs/data/pilot-status-macro-indicators.json` (SSOT — PM/QA owned)

**AC-1:** `grep -rn "computeCarryTradeSignal\|computeYieldSpreadSignal\|getMacroCalendar\|fetchYahooFinancePrices\|fetchSbvRates" apps/mcp-server/src/interface/mcp/tools/macro/` returns 0 matches (all direct domain/infra imports removed from tool handler files).

**AC-2:** All 4 MCP tools route exclusively via HTTP client to `http://macro-indicators:5004` (containerised) or `http://localhost:5004` (local dev). HTTP base URL read from env var `MACRO_INDICATORS_URL` with fallback `http://localhost:5004` — never hardcoded.

**AC-3:** Each tool handles HTTP failure gracefully — if the Go service is unreachable, tool returns `{ error: "macro-indicators service unavailable" }` (no crash, no unhandled rejection).

**AC-4:** Go router (`router.go`) has 3 new routes registered: `GET /carry-trade-signal`, `GET /yield-spread-signal`, `GET /macro-calendar`. `go build ./...` exits 0 in apps/macro-indicators.

**AC-5:** Smoke test — with Go service running (`go run ./cmd/server`), invoke each MCP tool via `curl http://localhost:5004/<route>`. Each returns HTTP 200 (or stub 501 if P2-X1 primitives not yet landed) with correct Content-Type: application/json. Paste curl output to handoff doc.

**AC-6:** Zero new domain imports from `apps/macro-indicators/` in `apps/mcp-server/src/`. `grep -rn "from.*apps/macro-indicators\|require.*macro-indicators" apps/mcp-server/src/` returns 0 (no new cross-service imports; existing ones from before P2-B1 do not increase).

**AC-7:** R-1 guard: `grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/` exits 1 (zero matches in Go pilot zone).

**G12 DoD gate (Go zone):** `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` exits 0. The sandbox must remain green throughout P2-B1 even though new Go handler stubs are added.

**Anchor check (pre+post commit):** `git log --oneline --ancestry-path 1776df8e..HEAD | tail -1` must return non-empty output both before and after commit.

**Commit subject pattern:**
```
feat(macro-indicators/mcp): P2-B1 — MCP HTTP rewire (R-3 unblock, 4 tools → port 5004)
```

---

### P2-A1 — `.golangci.yml` Creation (Fence-A/B/C Rules)

**Blocked by:** P2-B1 DONE
**DDD zone:** `apps/macro-indicators/` (Go zone only)

**Background:** G4 requires architecture fence via `golangci-lint + depguard`. The TA pilot proved offline deliberate-violation evidence is equivalent to CI-green evidence (TA Amendment 1, architect cycle-22). This task creates the config only — no CI job yet.

**Files to create/modify:**
- `apps/macro-indicators/.golangci.yml` (CREATE — Fence-A/B/C depguard rules)

**AC-1:** `.golangci.yml` contains `depguard` linter enabled. Three named rules:
  - `fence-a`: `pkg/primitive/*/` must not import any package containing `module`, `application`, `interface`, `infrastructure`
  - `fence-b`: `pkg/module/*/` must not import any package containing `application`, `interface`, `infrastructure`
  - `fence-c`: `pkg/infrastructure/` importable only from `cmd/server/` (deny from primitive + module + interface zones)

**AC-2:** `cd apps/macro-indicators && golangci-lint run` exits 0 on current codebase (no fence violations in existing code).

**AC-3:** Config includes `run.timeout: 120s` and `linters-settings.depguard` block with per-rule `deny` entries. File is ≤80 lines.

**AC-4:** `git log --oneline apps/macro-indicators/.golangci.yml` shows ONLY this commit as the most recent commit on that file — this establishes the freeze anchor for AC-4c.

**AC-5:** R-1 guard confirmed: `grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/pkg/` exits 1.

**Forbidden reads/writes:** Do NOT modify `.github/workflows/ci.yml` in this task (that is P2-A2).

**Commit subject pattern:**
```
feat(macro-indicators): P2-A1 — .golangci.yml Fence-A/B/C depguard rules (G4 partial)
```

---

### P2-A2 — CI Job + Deliberate Violation Proof + Pre-CI Tag

**Blocked by:** P2-A1 DONE
**DDD zone:** `.github/workflows/ci.yml` + `apps/macro-indicators/` (Go zone)

**Background:** G4 AC-4a/b/c verbatim from TA pilot. Pre-revert tag `macro-pre-ci` must be set BEFORE any CI mutation.

**Files to modify:**
- `.github/workflows/ci.yml` (MODIFY — add `go-lint` job scoped to `apps/macro-indicators/`)
- `apps/macro-indicators/.golangci.yml` (touch to confirm freeze anchor is not drifting)

**Step 0 (before any file edit):** `git tag macro-pre-ci HEAD` — confirm `git log --oneline macro-pre-ci` shows the P2-A1 commit (freeze anchor commit).

**AC-4a:** `.github/workflows/ci.yml` includes a `golangci-lint` job with `working-directory: apps/macro-indicators`. Job runs on push to main. Evidence: `grep -n "macro-indicators" .github/workflows/ci.yml` returns ≥1 match.

**AC-4b (deliberate violation proof — local only, violation NEVER committed):**
1. Add 1 temporary line to any file under `apps/macro-indicators/pkg/primitive/macro_investment_clock/` that imports a package from `pkg/application/`.
2. Run `cd apps/macro-indicators && golangci-lint run` — must exit non-zero with "fence-a" (or "Fence-A") in output.
3. Revert the violation (remove the temporary import line).
4. Run `golangci-lint run` again — must exit 0.
5. Confirm `git status` is clean (violation never staged, never committed).
6. Paste both linter outputs (exit-nonzero + exit-0) to handoff doc `§Evidence to Record`.

**AC-4c (freeze anchor):** `git log --oneline apps/macro-indicators/.golangci.yml` shows `macro-pre-ci` tagged commit as MOST RECENT commit on that file. No newer commit has touched `.golangci.yml` since P2-A1.

**AC-5 (G12 + R-1):** `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -scenario=all` exits 0 AND R-1 grep exits 1.

**Forbidden reads/writes:** Violation import line is NEVER committed. `git diff HEAD` after violation revert must show zero changes to primitive files.

**Commit subject pattern (CI wiring only — not violation):**
```
feat(macro-indicators): P2-A2 — CI go-lint job + macro-pre-ci tag (G4 AC-4a/4b/4c)
```

---

### P2-B2 — Pre-Delete Tag + `git mv src/ src/_deprecated/` (G5a)

**Blocked by:** P2-A2 DONE (G4 must be green before deletion; fence proves deletion doesn't bypass architecture)

**DDD zone:** `apps/macro-indicators/src/` (TS legacy zone — move to `_deprecated/`)

**Pre-condition (mandatory):** `git tag macro-pre-delete HEAD` BEFORE any `git mv`. Confirm `git log --oneline macro-pre-delete` shows the P2-A2 commit.

**Files to move:**
- `apps/macro-indicators/src/` → `apps/macro-indicators/src/_deprecated/` (all TS source files)
  - EXCEPTION: `apps/macro-indicators/src/infrastructure/scrapers/` stays in place (kept as live sidecar per brownfield §9 Option A decision from Phase 0). The scrapers provide live data to the Go service via the HTTP adapter pattern. Do NOT move scrapers directory.

**AC-1:** `find apps/macro-indicators/src -path "*_deprecated*" -prune -o -type f -name "*.ts" -print | grep -v scraper` returns 0 results (all non-scraper TS files moved to `_deprecated/`).

**AC-2:** `find apps/macro-indicators/src/_deprecated -type f -name "*.ts" | wc -l` returns ≥ 10 (confirms files moved, not deleted).

**AC-3:** Scrapers directory is intact: `ls apps/macro-indicators/src/infrastructure/scrapers/*.ts | wc -l` returns ≥ 7 (7 live scrapers preserved).

**AC-4:** `cd apps/macro-indicators && go build ./...` exits 0 (Go build not broken by TS deprecation).

**AC-5:** G12 DoD gate: `go run ./cmd/sandbox -tier=all -scenario=all` exits 0 (sandbox still green after deprecation).

**Commit subject pattern:**
```
chore(macro-indicators): P2-B2 — git mv src/ src/_deprecated/ (G5a TS deprecation, macro-pre-delete tagged)
```

---

### P2-B3 — G5 Terminal Verification (G5b confirmed + G5c zero TODO)

**Owner: qa**
**Blocked by:** P2-B2 DONE

**This is a QA-only verification task — no code changes.**

**AC-1 (G5b):** Confirm all 4 MCP tools route via HTTP (from P2-B1): `grep -rn "computeCarryTradeSignal\|computeYieldSpreadSignal\|getMacroCalendar\|fetchYahooFinancePrices" apps/mcp-server/src/interface/mcp/tools/macro/` returns 0 matches.

**AC-2 (G5c):** `grep -r "TODO.*migrat" apps/macro-indicators/ apps/mcp-server/src/interface/mcp/tools/macro/ --include='*.ts' --include='*.go'` returns 0 matches.

**AC-3 (G5a):** `find apps/macro-indicators/src -path "*_deprecated*" -prune -o -type f -name "*.ts" -print | grep -v scraper` returns 0 results.

**AC-4:** QA writes G5 grade evidence to `docs/handoffs/TASK_P2-B3-macro.md` and creates completion signal. G5 status ready to flip to YES after P2-G1 confirms full picture.

**Commit:** QA creates verification record only — no source file changes.

---

### P2-X1 — Remaining 5 Primitives Extraction

**Blocked by:** P2-B3 DONE (G5 clean — safe to expand primitives)
**DDD zone:** `apps/macro-indicators/pkg/primitive/` (Go zone)

**Primitives to extract (5 remaining from the 6-primitive plan, per brownfield §7):**

| # | Primitive | Go package | Source logic | Scenario files |
|---|---|---|---|---|
| 2 | macro-oil-impact-classifier | `pkg/primitive/macro_oil_impact_classifier/` | `MacroScoreService.oilDirection()` — BEARISH/BULLISH/NEUTRAL threshold | 3 (golden + edge + failure) |
| 3 | macro-gold-direction-classifier | `pkg/primitive/macro_gold_direction_classifier/` | `MacroScoreService.goldDirection()` | 3 |
| 4 | macro-usdvnd-direction-classifier | `pkg/primitive/macro_usdvnd_direction_classifier/` | `MacroScoreService.usdVndDirection()` | 3 |
| 5 | macro-carry-trade-signal | `pkg/primitive/macro_carry_trade_signal/` | `computeCarryTradeSignal(vndRate, fedRate)` from mcp-server domain | 3 |
| 6 | macro-yield-spread-signal | `pkg/primitive/macro_yield_spread_signal/` | `computeYieldSpreadSignal(earningYield, depositRate)` from mcp-server domain | 3 |

**Per-primitive structure:**
- `<package>/<package>.go` — exported `Classify()` or `Compute()` function + input/output structs
- `<package>/<package>_test.go` — table-driven tests (≥5 rows per primitive)
- `docs/scenarios/macro-indicators/primitives/<primitive-name>-{golden,edge,failure}.json` — frozen fixture data

**Note for carry-trade + yield-spread:** The Go handler stubs created in P2-B1 may inline the computation logic. P2-X1 extracts that logic into the proper `pkg/primitive/` packages and updates the P2-B1 handler stubs to call the packages. This is the "extract" part of the refactoring sequence.

**AC-1:** `find apps/macro-indicators/pkg/primitive -type d | wc -l` returns ≥ 6 (1 existing + 5 new).

**AC-2:** Each new primitive: `go test ./pkg/primitive/<name>/...` exits 0 with ≥5 test rows in table.

**AC-3:** All 15 new scenario JSON files are valid JSON: `find docs/scenarios/macro-indicators/primitives -name '*.json' -exec jq . {} \; > /dev/null` exits 0 (including the 3 from P1-B1 + 15 new = 18 total).

**AC-4:** Fence-A clean: `grep -rn "application\|interface\|infrastructure" apps/macro-indicators/pkg/primitive/` returns 0 (no cross-layer imports in any primitive package).

**AC-5:** `cd apps/macro-indicators && golangci-lint run` exits 0 (depguard fence holds across all 6 primitives).

**AC-6:** G12 DoD gate: `go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all` exits 0 with total ≥ 18 scenarios pass. Paste output.

**AC-7:** R-1 guard: `grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/primitive/` exits 1.

**Commit subject pattern (one commit per primitive is acceptable; single batch commit is also OK):**
```
feat(macro-indicators): P2-X1 — 5 primitives extracted (oil/gold/usdvnd/carry/yield + scenarios)
```

---

### P2-X2 — Module Expansion: macro-signals Wires All 6 Primitives

**Blocked by:** P2-X1 DONE
**DDD zone:** `apps/macro-indicators/pkg/module/macro_signals/` (Go zone)

**Background:** Phase 1 (P1-C1) created `macro-signals` module stub with only macro-investment-clock. Phase 2 expands it to compose all 6 primitives.

**Files to modify:**
- `apps/macro-indicators/pkg/module/macro_signals/macro_signals.go` (MODIFY — add composition of 5 new primitives)
- `apps/macro-indicators/pkg/module/macro_signals/macro_signals_test.go` (MODIFY — expand tests)
- `docs/scenarios/macro-indicators/module/macro-signals-golden.json` (MODIFY — add signals for all 6 primitives)
- `docs/scenarios/macro-indicators/module/macro-signals-edge.json` (MODIFY — edge scenario with partial data)

**AC-1:** `pkg/module/macro_signals/macro_signals.go` imports all 6 primitive packages via their exported function (not via infra adapter). `MacroSignalsOutput` struct includes fields for all 6 primitive results.

**AC-2 (Fence-B):** `grep -rn "application\|infrastructure\|interface" apps/macro-indicators/pkg/module/macro_signals/` returns 0 (no cross-layer imports).

**AC-3:** `go test ./pkg/module/macro_signals/...` exits 0 with ≥1 multi-primitive test case (verifies all 6 signals computed in single `BuildMacroSignals()` call).

**AC-4:** Module sandbox green: `go run ./cmd/sandbox -tier=module -scenario=all` exits 0 with ≥2 module scenarios pass.

**AC-5:** G12 DoD gate (all tiers): `go run ./cmd/sandbox -tier=all -scenario=all` exits 0. Total pass count ≥ 20 (18 primitives + ≥2 module).

**Commit subject pattern:**
```
feat(macro-indicators): P2-X2 — macro-signals module wires all 6 primitives (G2 update)
```

---

### P2-X3 — Snapshot Endpoint Implementation (Go Handler → Real Use Case)

**Blocked by:** P2-X2 DONE
**DDD zone:** `apps/macro-indicators/` Go zone — `pkg/interface/http/` + `pkg/application/` + `pkg/infrastructure/`

**Background:** `handleSnapshot()` in `router.go` currently returns 501. This task implements the real handler using `ComputeMacroUseCase.Execute()`. Also implements the carry-trade and yield-spread handler stubs from P2-B1 using the real primitives from P2-X1.

**Files to modify:**
- `apps/macro-indicators/pkg/interface/http/router.go` (MODIFY — replace 501 stub with real handler wiring)
- `apps/macro-indicators/pkg/interface/http/handlers_carry.go` (MODIFY — replace stub with real primitive call)
- `apps/macro-indicators/pkg/interface/http/handlers_yield.go` (MODIFY — replace stub with real primitive call)
- `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` (MODIFY — replace stub with real calendar logic)
- `apps/macro-indicators/pkg/application/usecases.go` (MODIFY — implement Execute() body using module)
- `apps/macro-indicators/pkg/infrastructure/repositories.go` (MODIFY — implement HTTPCommodityFetcher with real fetch logic or fixture-mode)

**AC-1:** `GET /health` returns `{"status":"ok","service":"macro-indicators","port":5004}` (unchanged).

**AC-2:** `POST /snapshot` returns HTTP 200 with a `MacroSnapshotResponse` shaped JSON (not 501). Fields: `vnIndex`, `oilUsd`, `goldUsd`, `usdVnd`, `signals`, `fetchedAt`.

**AC-3:** `GET /carry-trade-signal` returns HTTP 200 with `CarryTradeSignal` JSON shape (regime, carrySpread, vndDepositRate, fedFundsRate, computedAt).

**AC-4:** `GET /yield-spread-signal` returns HTTP 200 with `YieldSpreadSignal` JSON shape (label, spread, earningYield, depositRate, computedAt).

**AC-5:** G12 DoD gate (all tiers): `go run ./cmd/sandbox -tier=all -scenario=all` exits 0. Pass count unchanged from P2-X2.

**Commit subject pattern:**
```
feat(macro-indicators): P2-X3 — snapshot + carry + yield handlers implemented (G3 update, 501 resolved)
```

---

### P2-G1 — Terminal Verification of G1 + G2 + G3

**Owner: qa**
**Blocked by:** P2-X3 DONE

**This is a QA-only verification task — no code changes.**

**AC-1 (G1):** `find apps/macro-indicators/pkg/primitive -type d | wc -l` returns ≥ 6. `find docs/scenarios/macro-indicators/primitives -name '*.json' | wc -l` returns ≥ 18 (≥3 per primitive × 6 primitives). `go run ./cmd/sandbox -tier=primitive -scenario=all` exits 0 with total ≥18/18 PASS.

**AC-2 (G1 failure scenario check):** `find docs/scenarios/macro-indicators/primitives -name '*failure*' | wc -l` returns ≥ 6 (one failure scenario per primitive).

**AC-3 (G2):** `grep -rn "from.*pkg/module/" apps/macro-indicators/pkg/module/macro_signals/` returns 0 (no cross-module imports). `go run ./cmd/sandbox -tier=module -scenario=all` exits 0 with ≥2/2 PASS.

**AC-4 (G3):** `grep -c "scoreIndicator\|buildSnapshot\|oilDirection\|if.*price\|for.*signal" apps/macro-indicators/cmd/server/main.go` returns 0. `wc -l apps/macro-indicators/cmd/server/main.go` shows ≤100 lines. `test -f apps/macro-indicators/api/openapi.yaml && echo PASS`.

**AC-5:** `go run ./cmd/sandbox -tier=all -scenario=all` exits 0 with all scenarios passing. QA pastes full output to handoff doc.

**AC-6:** QA writes G1/G2/G3 grade evidence to `docs/handoffs/TASK_P2-G1-macro.md`. All three goals ready to flip YES.

---

### P2-F1 — G8 Honest-Red Proof (Test A Corrupted + Test B Golden)

**Owner: qa**
**Blocked by:** P2-G1 DONE (dashboard must show real data before honest-red can be proven)

**This is a QA-only verification task — no code changes.**

**Test A (corrupted scenario — dashboard must show RED):**
1. Edit one existing primitive scenario JSON (e.g., `macro-investment-clock-golden.json`) — change one field to an invalid value (e.g., indicator name → empty string).
2. `go run ./cmd/sandbox -tier=primitive -scenario=<path-to-modified-file>` — must exit non-zero with "FAIL" in output.
3. Open `apps/macro-indicators/dashboard/index.html` in browser — macro-investment-clock card must show RED (or FAIL status), not green.
4. Capture terminal output diff + dashboard screenshot description.
5. Revert the JSON edit (`git checkout` the scenario file).

**Test B (golden scenario — dashboard must show GREEN):**
1. `go run ./cmd/sandbox -tier=all -scenario=all` — must exit 0 with all PASS.
2. Open dashboard — all cards show GREEN (or PASS) status, not RED.
3. Confirm no false greens: at least 1 card for each primitive is green.

**AC-1 (Test A):** Sandbox exits non-zero on corrupted scenario AND dashboard shows non-green status for affected primitive. Evidence pasted to handoff.

**AC-2 (Test B):** Sandbox exits 0 on golden scenarios AND dashboard shows green/pass for all primitives.

**AC-3 (5 known-bad scenarios):** QA runs 5 additional deliberately corrupted scenario invocations (can reuse Test A pattern with 5 different primitives). All 5 return exit non-zero. Evidence: paste exit codes.

**AC-4:** Corrupted files are REVERTED before handoff submission. `git status` clean on scenario files.

**AC-5:** G8 grade evidence written to `docs/handoffs/TASK_P2-F1-macro.md`. G8 ready to flip YES.

---

### P2-C1 — G9 PO Playwright Short-Circuit (Path B Default)

**Owner: po**
**Blocked by:** P2-F1 DONE (dashboard must be honest-red proven before trust contract verification)

**Background:** Charter §G9 Path B (PO Playwright) is the Day-0 default (L6 lesson baked in). No synchronous user wait needed.

**AC-1:** PO runs Playwright headless chromium against `file://apps/macro-indicators/dashboard/index.html`. All 3 panels (primitives, module, microservice) are rendered.

**AC-2:** ZERO console errors, ZERO pageerrors, ZERO requestfailed events in Playwright log.

**AC-3:** All primitive + module + microservice cards visible. Status honestly displayed (PASS/NOT-RUN/FAIL — no false greens on NOT-RUN items).

**AC-4:** PO records verdict in `docs/po-decisions/<date>-g9-macro-user-confirmation.md` per charter §G9 Path B template. G9 grade = YES.

---

### P2-D1 — Bug Injection Pre-Tag + Deliberate Bug Injection

**Owner: qa**
**Blocked by:** P2-C1 DONE (G9 must be proven before deliberately breaking things)

**Pre-condition (mandatory):** `git tag macro-pre-inject HEAD` BEFORE the injection commit. Confirm with `git log --oneline macro-pre-inject`.

**Bug injection spec (TA pattern — variant A: off-by-one/wrong-divisor):**
- Target: `pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go`
- Injection: change the carry spread threshold comparison from `> 2.5` to `> 5.0` (wrong threshold — HOT_MONEY_INFLOW regime will never fire for realistic inputs)
- Result: `macro-carry-trade-signal-golden.json` scenario should fail (regime mismatch — golden expects `HOT_MONEY_INFLOW` but function now returns `NEUTRAL`)
- Dashboard: macro-carry-trade-signal card turns RED after sandbox run

**AC-1:** Injection commit exists with `macro-pre-inject` tag on the PREVIOUS commit (the commit before injection). `git log --oneline -2` shows injection commit on top.

**AC-2:** `go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all` exits non-zero. At least 1 FAIL for macro-carry-trade-signal golden scenario.

**AC-3:** Dashboard shows RED for macro-carry-trade-signal card. (Evidence: describe dashboard state in handoff.)

**Commit subject pattern (injection commit):**
```
test(macro-indicators): P2-D1 — deliberate bug injection for G10 AI-fixability proof
```

---

### P2-D2 — AI Agent Fixes Injected Bug (≤2 Cycles G10 Proof)

**Owner: dev-macro-indicators**
**Blocked by:** P2-D1 DONE (bug injected + dashboard RED)

**The injected bug:** wrong threshold in `macro_carry_trade_signal.go` (> 5.0 instead of > 2.5).

**Dev agent task:** Diagnose from dashboard RED, fix the threshold, verify sandbox green, verify dashboard green — all within ≤2 dispatch cycles.

**Cycle counting:** QA counts from the moment P2-D1 completion signal is received to the moment sandbox exits 0 again. Each time dev-macro-indicators agent is dispatched for a fix attempt = 1 cycle. Target: ≤2 cycles (≤ baseline 1.3 cycles from bug-inventory).

**AC-1:** `go run ./cmd/sandbox -tier=all -scenario=all` exits 0 after fix.

**AC-2:** Dashboard shows GREEN for macro-carry-trade-signal card after fix.

**AC-3:** Cycle count ≤ 2 (QA records in G10 evidence doc). If cycle count = 1: G10 EXCEEDS baseline. If cycle count = 2: G10 MEETS baseline. If cycle count > 2: G10 FAILS — PM escalates.

**AC-4:** G12 DoD gate: sandbox all-tier green before dev declares DONE.

**Commit subject pattern:**
```
fix(macro-indicators): P2-D2 — restore carry-trade-signal threshold (G10 AI-fixability proof)
```

---

### P2-E1 — Regression Alarm Proof (G11 — 2 Trials Coupling-Proven)

**Owner: qa + dev-macro-indicators**
**Blocked by:** P2-D2 DONE (G10 completed — agent demonstrated fixability)

**Background:** G11 requires coupling-proven outcome-(a): fix bug A, scenario B (coupled to A's input shape) flips red, AI fixes B before declaring done. Two trials = PASS (TA cycle-17 rubric).

**Scenario pair design (QA authors):**
- Pair 1: macro-carry-trade-signal (just fixed in P2-D2) + macro-yield-spread-signal (shared input: depositRate). Mutation: change depositRate in yield-spread golden scenario to an impossibly high value (e.g., 99.0). Both carry-trade (via macro-signals module) and yield-spread cards should turn RED.
- Pair 2: macro-investment-clock + macro-signals module scenario. Mutation: change indicator name in module golden scenario to unknown value. Both primitive and module cards flip RED.

**Trial 1:**
1. QA applies Pair 1 mutation.
2. Sandbox exits non-zero (≥2 FAILs — carry + yield both RED).
3. dev-macro-indicators sees ≥2 RED cards — must fix BOTH before declaring DONE.
4. Dev fixes root cause (bad depositRate in scenario) — sandbox exits 0, all GREEN.
5. QA confirms coupling-proven: the single mutation caused ≥2 card failures, single-edit fix repaired both.

**Trial 2:** Same pattern with Pair 2.

**AC-1 (Trial 1):** Mutation causes ≥2 FAIL in sandbox. Evidence: paste exit code + FAIL list.

**AC-2 (Trial 1):** dev-macro-indicators repairs BOTH RED cards in single fix (not iterating one at a time). Sandbox exits 0 after fix. Dashboard all GREEN.

**AC-3 (Trial 2):** Same evidence for Pair 2 mutation + fix.

**AC-4:** QA writes G11 evidence to `docs/handoffs/TASK_P2-E1-macro.md`. G11 ready to flip YES. Includes "coupling-proven outcome-(a)" verdict per TA cycle-17 rubric.

---

## Sequencing Diagram

```
P2-B1 (R-3 MCP HTTP rewire — STARTS IMMEDIATELY)
  ↓
P2-A1 (.golangci.yml Fence rules)
  ↓
P2-A2 (CI job + violation proof + macro-pre-ci tag)
  ↓
P2-B2 (macro-pre-delete tag + git mv TS → _deprecated/)
  ↓
P2-B3 [qa] (G5 terminal verification)
  ↓
P2-X1 (5 remaining primitives)
  ↓
P2-X2 (module expansion — all 6 primitives wired)
  ↓
P2-X3 (snapshot + carry + yield handlers implemented)
  ↓
P2-G1 [qa] (G1 + G2 + G3 terminal verification)
  ↓
P2-F1 [qa] (G8 honest-red proof)
  ↓
P2-C1 [po] (G9 Playwright Path B)
  ↓
P2-D1 [qa] (macro-pre-inject tag + bug injection)
  ↓
P2-D2 [dev-macro-indicators] (fix injected bug ≤2 cycles — G10)
  ↓
P2-E1 [qa + dev-macro-indicators] (regression alarm 2 trials — G11)
  ↓
→ Phase 3 (PO §4.5 atomic close — all 12 terminal)
```

**Critical path:** All tasks are on the critical path (WIP=1, sequential).

---

## Goal → Task Coverage Matrix

| G-goal | Tasks | Terminal grade after task |
|--------|-------|--------------------------|
| G1 (primitives ≥5 + scenarios) | P2-X1 (impl) + P2-G1 (qa) | YES after P2-G1 |
| G2 (module composes via ports) | P2-X2 (impl) + P2-G1 (qa) | YES after P2-G1 |
| G3 (clean composition root) | P2-X3 (impl) + P2-G1 (qa) | YES after P2-G1 |
| G4 (architecture fence) | P2-A1 + P2-A2 | YES after P2-A2 |
| G5 (TS deleted + HTTP rewire) | P2-B1 + P2-B2 + P2-B3 | YES after P2-B3 |
| G6 (dashboard 3 panels) | Phase 1 P1-E1 (DONE) | YES — no Phase 2 task needed |
| G7 (edit-JSON-rerun + zero creds) | Phase 1 P1-E2 (DONE) | YES — no Phase 2 task needed |
| G8 (honest red/green) | P2-F1 | YES after P2-F1 |
| G9 (trust contract — Playwright) | P2-C1 | YES after P2-C1 |
| G10 (AI fixes bug ≤2 cycles) | P2-D1 + P2-D2 | YES after P2-D2 (if ≤2 cycles) |
| G11 (regression alarm bell) | P2-E1 | YES after P2-E1 |
| G12 (dev flow streak 3/3) | EARNED (Phase 1) | Pending §4.5 PO flip at 12/12 |

**Note on G6/G7:** Phase 1 delivered P1-E1 (dashboard stub, 3 panels) and P1-E2 (edit-rerun + env audit). Both were QA-verified GREEN. No Phase 2 task required — G6 and G7 will flip YES at P2-G1 when QA confirms the dashboard is still operational with real primitive data loaded.

---

## Phase 2 Exit Gate

Phase 2 is complete when all 14 tasks have DONE signals and QA verdicts. PM confirms:

| Criterion | Measurement |
|---|---|
| All 11 non-G12 goals terminal (YES/NO/PARTIAL) | pilot-status-macro-indicators.json goals[] — all 11 non-G12 are non-TBD |
| Sandbox all-tier green | `go run ./cmd/sandbox -tier=all -scenario=all` exits 0 |
| G12 streak still holding | 3/3 from Phase 1 + any Phase 2 dev tasks all sandbox-green before DONE |
| Anchor 1776df8e intact | `git log --oneline --ancestry-path 1776df8e..HEAD | tail -1` returns non-empty |

On all 4 criteria met → PM writes Phase 2 close signal → PO performs §4.5 atomic close (Phase 3).

---

## Open Questions for PM

**OQ-7 — P2-B1 Go stub vs real implementation**
P2-B1 adds Go handler stubs for `/carry-trade-signal`, `/yield-spread-signal`, `/macro-calendar`. The stubs may return static JSON until P2-X1 lands real primitives. PM must decide whether P2-X3 or P2-X1 is the task that upgrades these stubs. This plan assigns the upgrade to P2-X3 for carry/yield (real primitives from P2-X1 available) and treats calendar as a pure-Go function (no primitive needed). PM confirms at P2-B1 dispatch.

**OQ-8 — Scraper sidecar ownership in Phase 2**
Brownfield §9 Option A: TS scrapers stay in place as a sidecar service providing live data to the Go server. Phase 2 P2-X3 may need to call the TS scrapers via HTTP to populate the snapshot endpoint. PM decides whether dev-macro-indicators also ports one scraper to Go in Phase 2 or defers all scraper porting to post-pilot.

**OQ-9 — G6/G7 explicit re-verification**
This plan treats G6/G7 as already DONE (Phase 1 P1-E1/E2). PM may want QA to re-verify G6 and G7 at P2-G1 time (when real primitive data populates the dashboard) to confirm the dashboard still renders correctly with 6 primitive cards instead of 1. Recommend: yes — add G6/G7 check to P2-G1 AC list.

**OQ-10 — macro-calendar Go implementation**
`get_macro_calendar` calls `getMacroCalendar()` — a static computed schedule (no live data). The Go service `/macro-calendar` handler can reimplement this in Go. PM confirms whether P2-B1 handler stub returns static fixture JSON (simplest) or whether dev-macro-indicators ports the full calendar logic to Go in P2-B1 (clean but larger scope). Recommendation: static fixture in P2-B1, port logic in P2-X3.
