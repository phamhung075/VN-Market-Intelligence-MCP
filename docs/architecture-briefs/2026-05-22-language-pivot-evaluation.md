---
title: "Language Pivot Evaluation — technical-analysis pilot (TS vs Go)"
date: "2026-05-22"
author: "architect"
status: "PENDING-PO-DECISION"
pilot: "technical-analysis"
deadline: "2026-07-03"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
task_plan_ref: "docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan.md"
---

# Language Pivot Evaluation — `technical-analysis` Pilot

**Binding brief for PO sign-off. Do not modify charter, phase-1-task-plan, or pilot-status.json until PO decision is recorded.**

---

## Brownfield Scan Summary

Performed before recommendation. Read: pilot-charter.md (G1-G12, decision matrix), phase-1-task-plan.md (16 tasks), p0-4-composition-root-plan.md (§5.2), composition-root.ts (43L, pure wiring), calculate-rsi.ts (86L, Wilder's RSI, zero imports), 3 scenario JSON files (happy + edge + failure), go-migration-3-services.md (2026-05-14, phase 1 DONE, phases 2-3 unlocked).

**What is already landed (TS):**

| Commit | File | Size | Revertible in isolation? |
|--------|------|------|--------------------------|
| 16a04a00 | `apps/technical-analysis/composition-root.ts` | 43L, pure wiring | YES — 1 file delete |
| a22acdf3 | `apps/technical-analysis/package.json` | entry-point field | YES — 2-line revert |
| 3f522dc3 | `apps/technical-analysis/Dockerfile` | CMD + COPY | YES — 2-line revert |
| 241631af | `apps/technical-analysis/src/interface/openapi.yaml` | OpenAPI 3.0 YAML | YES — 1 file delete |
| 20ed83d5 | DELETE `apps/technical-analysis/src/index.ts` | 31L | YES — restore from git |
| 6248f3da | `packages/primitives/technical-analysis/calculate-rsi.ts` + test + 3 scenarios | 86L fn + 3 JSONs | YES — 4 files delete |

Total TS sunk cost: 6 commits, ~8 source files created/modified. Estimated revert time: 20-30 minutes of mechanical git work.

**Go context already established in the repo:**
- `apps/api-gateway/` — fully Go (module: `github.com/vn-market-intelligence/api-gateway`, go 1.22). Phase 1 DONE, production 2026-05-14.
- `apps/alert-engine/` — Go migration in progress (go.mod present, Phase 2 unlocked per 1912d brief).
- `apps/stock-price/` — Go migration in progress (go.mod present, Phase 3 unlocked).
- Go Docker pattern proven: `golang:1.22-alpine` + multi-stage, port contract unchanged.
- `apps/technical-analysis/` has NO go.mod. It is a pure Bun/TS service today. No native bindings (`bun:sqlite` is absent — TA does NOT hit SQLite directly; it holds a `readonly` DB handle but the P0-4 audit confirmed zero crash history from TA specifically).

**Critical discovery:** the 2026-05-14 Go migration brief explicitly lists `technical-analysis` as NOT in scope for Go migration — reason given: "No native deps. Pure TA math. Low crash risk." The crash driver for the Go migration was `bun:sqlite` teardown. TA's `bun:sqlite` use is readonly; it has not produced a SIGABRT. The original 2026-04-24 DDD plan said "Go for TA" but that plan was SUPERSEDED by the 2026-04-25 architecture migration and the subsequent language scoping in the 2026-05-14 brief, which explicitly re-categorized TA as low crash risk / TS-stay.

---

## 1. Executive Recommendation

**Option C — Finish the TA pilot in TS, apply Go preference to the next fractal microservice.**

The pilot's purpose is to prove the three-tier trust architecture (primitives → module → dashboard), not to prove a language. TS and Go are both compliant with every charter goal (G1-G12 are language-agnostic: they gate on scenario JSON pass/fail, dashboard red/green, and AI fix cycle count — none of which depend on the implementation language). Six tasks are already shipped, the scenario JSON format is fully portable, and the dashboard (P1-E) is HTML/JS consuming JSON traces — it works identically regardless of whether the sandbox runs `bun` or `go test`. Pivoting mid-bucket now costs 3-4 days of rework on a 6-week deadline with 10 remaining tasks still ahead; that schedule risk is not justified by a language preference on a service the 2026-05-14 brief already classified as "low crash risk, TS-stay." The user preference for Go is real and binding — it should land on the NEXT fractal subject (macro-indicators), where it can be applied greenfield from day one without rework cost, and where the Lego composability story is told cleanly in Go from the start.

---

## 2. Scoring Table

Criteria weights are equal (1-5 scale, 5 = best). Sum out of 25.

| Criterion | Option A (Mixed TS+Go) | Option B (Full Go rewrite) | Option C (Finish TS, Go next) | Option D (Swap to macro in Go) |
|-----------|----------------------|--------------------------|------------------------------|-------------------------------|
| **Schedule-fit** (deadline 2026-07-03, 6 weeks) | 2 — bridge adds 1-2w of TS-Go IPC design + testing on top of rewrite | 2 — 3-4d revert + full Go rewrite of P1-A+B1 before B2-B5 can progress; risk of cascading delay | 5 — zero rework; 10 tasks remain, all greenfield from here | 1 — full reset: revert 6 commits + new baseline metric capture for macro + restart charter clock |
| **Trust-layer integrity** (dashboard red/green, G9) | 1 — mixed composition root (TS shell calling Go subprocess) creates a seam the dashboard must paper over; honest red/green becomes ambiguous when the TS adapter masks a Go panic | 4 — pure Go service; dashboard and sandbox run `go test`/`go run` instead of `bun run`; same JSON trace format; slightly more complexity for dev-frontend to support both runners | 5 — sandbox is `bun run`; dashboard reads scenario JSON; no seam; G7 edit-rerun flow works today | 3 — Go greenfield on macro is clean, but TA pilot goals G1-G12 (especially G9-G11 which require a working pilot) would be abandoned or carried over, weakening the proof |
| **Charter-alignment** (G1-G12, pilot intent) | 2 — anti-scope-creep clause forbids mid-pilot structural changes; a TS-Go bridge is effectively a new adapter design mid-pilot | 3 — all 12 goals still achievable in Go; rework erases G3 progress (composition-root already green); G12 requires re-verifying all completed tasks | 5 — all 12 goals remain on track; no charter clause violated; pilot proves three-tier pattern as intended | 2 — charter is for TA only; swapping to macro abandons the existing proof baseline (G10 uses bug-inventory.json tuned to TA) |
| **Rework-hours** | 3 — ~2-3d: design TS-Go bridge, update Dockerfile to two processes, update composition-root adapter, test IPC | 2 — ~3-4d: revert 6 commits, scaffold Go module, rewrite composition-root.go + go.mod + Dockerfile, port RSI to Go, re-run all scenario JSON tests | 5 — zero rework hours; dev continues from P1-B2 immediately | 1 — revert 6 commits + full macro baseline capture (new bug-inventory entries) + Phase 0 brownfield scan for macro + new charter clock = ~1 sprint lost |
| **Scenario-JSON portability** | 3 — JSON format unchanged but sandbox runner changes for Go primitives (need Go runner script); TS primitives still use `bun run`; two runner paths | 5 — Go primitives consume identical JSON input/output; a thin `go run sandbox.go --scenario=file.json` runner replaces `bun run`; dashboard reads the same trace format | 5 — scenario JSON is language-agnostic by design; `bun run sandbox` unchanged; all 3 RSI scenarios already passing | 4 — JSON portability is fine for macro; RSI scenarios are abandoned (TA-specific) |
| **TOTAL** | **11 / 25** | **16 / 25** | **25 / 25** | **11 / 25** |
| **RANK** | 3rd (tied) | 2nd | **1st** | 3rd (tied) |

---

## 3. Risks Per Option

### Option A — Pivot mid-bucket (mixed TS + Go)

- **IPC seam destroys the Lego metaphor.** A composition root that forks a Go subprocess (or proxies via HTTP to an in-process Go server) is not a clean DDD layer — it is infrastructure leaking into the composition root. G3's charter verification grep would still pass, but the structural honesty the user is paying for is gone. The dashboard cannot honestly report "RSI is green" when the error path crosses a language boundary.
- **Two runtime environments in one Docker image.** The Dockerfile must install both Bun and a Go runtime (or pre-compiled Go binary). Image size doubles. Container start order becomes non-trivial. This contradicts the simplicity contract.
- **QA cannot verify G7 edit-rerun cleanly.** The edit-JSON-rerun flow depends on a single sandbox runner. With a mixed service, editing a Go primitive's scenario JSON triggers a Go rebuild step that the dashboard's JS subprocess spawner was not designed for. P1-E2 acceptance criteria break.

### Option B — Full Go rewrite

- **Six tasks already green become dead weight.** Reverting P1-A1..A5 and P1-B1 means composition-root.ts (43L, passing G3 QA gates) and calculate-rsi.ts (Wilder's RSI, all 3 scenarios passing) are discarded. G3 progress resets. The already-green G3 evidence in pilot-status.json becomes stale.
- **Go RSI implementation requires re-verification of the Wilder test vector.** The happy-path scenario JSON pins `RSI[0] = 71.794872` to 6 decimal places. A Go float64 implementation will produce the same result, but the verification burden falls on the developer who must prove bit-level equivalence — an extra QA cycle that did not exist in TS where the scenario was written alongside the implementation.
- **3-4 day rewrite on a 6-week clock is a 7-10% schedule burn for zero functional gain.** TA has no `bun:sqlite` crash risk (confirmed by 2026-05-14 brief). The sole motivation for this rewrite is user preference, which is a real constraint — but Option C satisfies that preference on the next service at zero cost.

### Option C — Finish pilot in TS, Go on next service

- **User Go preference is deferred, not satisfied.** If the user treats "I prefer Go" as a blocking requirement rather than a direction signal, Option C does not fully close the gap. PO must confirm whether "prefer Go if possible" means "at the next natural boundary" or "today, regardless of cost."
- **TS/Bun teardown risk remains for TA.** The 2026-05-14 brief rates TA crash risk as low (no synchronous `bun:sqlite` writes). If that assessment is wrong (e.g., TA gets a write adapter in a future phase), the service will need Go migration anyway. This is a deferred technical debt item, not an immediate blocker.
- **Pilot does not prove Go readiness for TA domain.** The charter's decision matrix asks "worth doing for next microservice?" — answered YES for a TS-TA pilot. The Go learning from macro-indicators will need to re-prove the Lego pattern in Go separately. Acceptable cost, but it is an additional pilot cycle if Go becomes the universal standard.

### Option D — Swap pilot to macro-indicators in Go

- **Charter anti-scope-creep clause is violated.** The charter explicitly forbids starting any other bounded context during the pilot. Swapping the pilot subject requires a charter amendment, which requires PO sign-off on a new charter version, which consumes at least 1 sprint.
- **All G10 baseline data becomes invalid.** `docs/data/bug-inventory.json` has `baselineCycleCount = 1.5` for TA-specific bugs. Macro-indicators have no TA bugs; a new baseline capture is required. This is a Phase 0 deliverable that was already spent — spending it again erodes the schedule.
- **Pilot churn is visible to the user.** Six commits are reverted with no functional output shipped. The user's primary pain point ("AI agents cannot fix bugs complete, they turn around multiple times") is not addressed — in fact, it is demonstrated: the team turned around.

---

## 4. Concrete Next Steps Under Option C

### What gets reverted
Nothing. All 6 commits stay on main.

### What gets written (remaining 10 tasks)
Execute the existing phase-1-task-plan.md task sequence without modification:

| Order | Task | Owner | Estimated wall-clock |
|-------|------|-------|---------------------|
| 1 | P1-B2 — extract `calculate-macd.ts` + 3 scenario JSONs | dev-technical-analysis | 1.5h |
| 2 | P1-B3 — extract `calculate-bollinger-bands.ts` + 3 scenarios | dev-technical-analysis | 1.5h |
| 3 | P1-B4 — extract `calculate-moving-average.ts` + 3 scenarios | dev-technical-analysis | 1.5h |
| 4 | P1-B5 — extract `detect-cross.ts` + 3 scenarios | dev-technical-analysis | 1.5h |
| 5 | P1-C1 — module barrel + composition | dev-technical-analysis | 1h |
| 6 | P1-D1 — 25 scenario JSON files (5 per primitive × 5 primitives) | dev-technical-analysis | 2h |
| 7 | P1-D2 — 5 multi-primitive module scenarios | dev-technical-analysis | 1h |
| 8 | P1-E1 — three-level dashboard HTML/CSS/JS | dev-frontend | 3h |
| 9 | P1-E2 — dashboard honest red/green + edit-rerun | dev-frontend | 1.5h |
| 10 | G4 / G5 — ESLint fence + old TA code deletion (Phase 2) | dev-technical-analysis | deferred per plan |

**Estimated completion:** ~15 hours of effort across 2 agents. With WIP=2 cap, achievable in 2-3 sprint weeks. Comfortably inside 2026-07-03 with 3 weeks of buffer for QA cycles (G8, G10, G11, G12).

### Who executes what
- **dev-technical-analysis:** P1-B2 through P1-D2. Dispatch immediately on PO decision.
- **dev-frontend:** P1-E1 and P1-E2. Dispatch after P1-C1 + P1-D2 complete (per dependency graph in task plan).
- **PO:** Record language decision in `docs/po-decisions/` (new file, parallel to existing `2026-05-22-phase-1-go-nogo-technical-analysis.md`). Tag the macro-indicators service as the Go-first pilot target in backlog.
- **Architect:** Author Go language design brief for macro-indicators after pilot decision matrix closes (estimated sprint 7, post-2026-07-03).

### ETA against 2026-07-03 deadline
- Week 1 (2026-05-22 to 2026-05-29): P1-B2..B5 complete (4 primitives, 12 scenario files)
- Week 2 (2026-05-29 to 2026-06-05): P1-C1 + P1-D1 + P1-D2 complete
- Week 3 (2026-06-05 to 2026-06-12): P1-E1 + P1-E2 complete; dashboard renders all panels
- Week 4-5 (2026-06-12 to 2026-06-26): QA cycles — G8 (honest red/green), G10 (AI fix ≤2 cycles), G11 (regression alarm), G12 (3 consecutive task verifications)
- Week 6 (2026-06-26 to 2026-07-03): Pilot review meeting; PO calls decision matrix; verdict recorded
- Buffer: 1 week. If any QA cycle fails and requires a fix loop, the buffer absorbs it.

---

## 5. Open Questions PO Must Weigh

1. **Is "prefer Go if possible" a direction or a hard requirement?** If it means "Go at any cost, including deadline risk," Option B is the correct choice despite the 3-4 day rewrite and schedule burn. If it means "Go as the default for new work going forward," Option C satisfies it at zero cost. This evaluation assumes the latter; PO must confirm.

2. **Is macro-indicators the correct Go pilot target?** The charter decision matrix §Outcome specifies "macro-indicators" as the recommended scale target if the TA pilot passes 3 YES. Macro has no native deps and a smaller existing surface area (confirmed by p0-4 and system audit). However, if PO prefers to prove Go on a different service (e.g., completing the alert-engine Go migration as Phase 2 of 1912b), the Go experience can land there instead — outside the TA pilot scope.

3. **Does the readonly `bun:sqlite` handle in TA need to be eliminated before Phase 2?** `apps/technical-analysis/composition-root.ts` opens `new Database(DB_PATH, { readonly: true, create: false })`. The 2026-05-14 brief rates this as low crash risk (readonly, no write path). If the assessment changes (e.g., a write adapter is added in Phase 2 when old TA code is deleted and MCP calls are re-routed), the service becomes a Go migration candidate then. PO should confirm whether Phase 2 scope includes adding write paths to TA.

---

## Appendix — Brownfield Evidence References

| Finding | Source |
|---------|--------|
| TA has no `bun:sqlite` write path (readonly only) | `apps/technical-analysis/src/infrastructure/repositories.ts` + P0-4 §1.3 |
| 2026-05-14 brief explicitly excludes TA from Go migration | `docs/architecture-briefs/2026-05-14-go-migration-3-services.md` §7 |
| Go proven in repo (api-gateway live, alert-engine + stock-price in progress) | `apps/api-gateway/go.mod`, `apps/alert-engine/go.mod`, `apps/stock-price/go.mod` |
| Scenario JSON is language-agnostic (JSON in / JSON out, runner-agnostic format) | `packages/primitives/technical-analysis/scenarios/calculate-rsi/happy-path.json` |
| composition-root.ts is pure wiring (43L, zero domain logic, G3 gates pass) | `apps/technical-analysis/composition-root.ts` |
| calculate-rsi.ts is pure function (86L, zero imports, Wilder verified) | `packages/primitives/technical-analysis/calculate-rsi.ts` |
| Charter anti-scope-creep clause blocks mid-pilot structural changes | `pilot-charter.md` §Anti-Scope-Creep Clause |
| 10 tasks remain ahead (B2-B5, C1, D1, D2, E1, E2 + deferred Phase 2) | `phase-1-task-plan.md` §Task Ledger |
