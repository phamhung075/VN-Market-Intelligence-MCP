---
title: "Pilot Charter — macro-indicators microservice refactor (Factory v2)"
date: "2026-05-23"
author: "po"
status: "ACTIVE"
pilot: "macro-indicators"
deadline_sprints: 6
deadline_iso: "2026-07-04"
version: "2.0"
parent_factory_close: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (v1.0, CLOSED 2026-05-23 verdict=scale)"
closure_signal_parent: "docs/signals/po-brief-closed-20260523T091910Z.json"
language: "Go"
language_lock_source: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md §Q2 — user verdict generalizes to macro-indicators"
lessons_carryover: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/01-lessons-from-ta-pilot.md"
---

# Pilot Charter — `macro-indicators` Microservice Refactor (Factory v2)

**Binding contract for the second three-tier architecture pilot. Inherits the 12-G-goal factory pattern proven on `technical-analysis` (closed 2026-05-23, verdict=`scale`).**

**Scope:** `apps/macro-indicators` only. No other microservice is in scope during this pilot.

---

## Why This Pilot Exists

The `technical-analysis` pilot proved that the three-tier architecture (primitives → modules → microservices) plus dashboard trust layer plus AI-fixability proof works (12/12 G-goals YES, decisionMatrix verdict=`scale` 2026-05-23). The charter §Decision Matrix outcome rule says:

> "3 YES → scale to next microservice. Recommended target: `macro-indicators` (clean domain, macro-core primitive candidates already identified in `02-target-state.md`)."

This pilot is the **second iteration of the factory**. Its purpose is two-fold:

1. **Prove the factory pattern scales.** If the 12-G-goal contract works a second time without modification (beyond per-service goal calibration), the pattern is ready to roll out to remaining microservices.
2. **Burn in the lessons from the first pilot.** The TA pilot surfaced 7 propagatable lessons (see `01-lessons-from-ta-pilot.md`). They are baked into this charter v1 — no Amendments expected on day 1.

**Pilot gate:** if all 12 goals pass the decision matrix → scale to next microservice. See §Decision Matrix.

---

## Language Lock (Day 0)

**Implementation language is Go.** Locked at charter creation; not subject to mid-pilot pivot.

**Authority:** User verdict 2026-05-22 (verbatim "B" on the language-pivot evaluation). PO decision doc `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` §Q2 explicitly generalizes that verdict to macro-indicators: *"Macro-indicators stays in Go scope. Go is now the implementation language for that fractal as well — no separate brief required, this decision generalizes."*

**TA pilot lesson burned in:** the TA pilot lost 6 commits and ~3 days to a mid-Phase-1 language pivot (TS→Go). That pivot is impossible here because the language is locked Day 0 by carry-over user verdict.

**Current state:** `apps/macro-indicators/` is currently TypeScript (~830 LOC across 8 source files + 8 scrapers + tests). The pilot will rewrite the domain + module + composition root in Go, while keeping the existing TS scrapers OR rewriting them in Go (Phase 1 task plan decides — see `07-phases.md`).

---

## Kickoff Prerequisites

All of the following must be true before Phase 0 work begins on this pilot:

1. Parent factory CLOSED — `docs/data/pilot-status.json` shows `status=DONE` for `technical-analysis` pilot (verified 2026-05-23T09:19:10Z, closure signal `docs/signals/po-brief-closed-20260523T091910Z.json`).
2. Brief master doc CLOSED — `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` status line reads `CLOSED 2026-05-23` (verified this cycle).
3. Lessons doc authored — `01-lessons-from-ta-pilot.md` exists and is referenced from charter §Charter Inherited Lessons.
4. Pilot status SSOT created — `docs/data/pilot-status-macro-indicators.json` exists with all 12 goals = `TBD` + decisionMatrix all `TBD` + status `ACTIVE` (Phase 0 deliverable; PO authors at charter creation per §4.5 SSOT-from-Day-0 carry-over rule).
5. `apps/macro-indicators/` brownfield scan complete — verify which DDD layers are already clean vs need rewiring (Phase 0 deliverable; architect or system-auditor owns).
6. Bug-inventory entry — `docs/data/bug-inventory.json` has ≥1 macro-indicators bug recorded (for G10 baseline). If none exist, baselineCycleCount falls back to system-wide 4-6 per parent charter §Baseline Metric Capture.

---

## Anti-Scope-Creep Clause

**This pilot covers `macro-indicators` only.** The following are forbidden while the pilot is active:

- Extracting primitives for any other bounded context (alerts, news, portfolio, sector, etc.)
- Rebuilding modules for any other bounded context
- Rewiring composition roots for any service other than `apps/macro-indicators/`
- Adding goals to this charter mid-pilot
- Touching the closed `technical-analysis` artefacts (pilot-status.json TA section is FROZEN historical record)

The pilot is a controlled experiment, not a rolling refactor. Creep invalidates the measurement.

**If a compelling opportunity arises in another module during the pilot:** PM creates a backlog task tagged `post-pilot-2`. It does not start until the 12-goal review is complete.

---

## Hard Deadline

**6 sprints from kickoff.** Kickoff date = 2026-05-23 (charter creation date). **Sprint-6 hard deadline = 2026-07-04.**

No silent extension. At sprint 6 end, PO calls the decision matrix regardless of goal state. If goals are incomplete, the pilot is assessed on what was achieved, not on what was planned.

**Mechanically enforced via TA-pilot lesson:** Status enum is strictly `ACTIVE | DONE | FAILED` per parent charter §Status Tracking. NO operational labels (e.g., `PHASE-2`, `WAITING-USER`) are valid terminal values. If a user-gated goal (G9) stays unresolved past hard deadline, status auto-flips to `FAILED` and PO calls matrix on whatever state exists (G9 → PARTIAL, Trust dimension evaluated on G8 alone).

---

## Security Clause

The sandbox process (used in G7 and throughout Track B) **MUST have zero DB credentials and zero external API keys** at all times. This is not optional.

Enforcement:
- G7 verification includes an env audit: run the sandbox process and confirm `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD|FRED_API_KEY"` returns empty in the sandbox process environment.
- Macro-specific addition: `FRED_API_KEY` (used by `fred-macro.ts` scraper) MUST NOT leak into the sandbox. Sandbox runs against scenario JSON fixtures, NOT live FRED API.
- If any credential leaks into the sandbox env, G7 is blocked — it does not pass.
- This clause applies to all scenario JSON execution paths, not just the explicit G7 check.

Rationale: same as parent charter — sandbox is pure-function (JSON in → trace JSON out). Any credential in that environment destroys the security and reproducibility guarantee.

---

## 12 Completion Goals

All 12 goals are inherited from the parent charter verbatim, with macro-specific calibration on G1, G2, G3, G5, G10, G11, G12. Track structure (A=Trust Foundation, B=Dashboard, C=AI-Fixability) is unchanged.

### Track A — Trust Foundation

---

**G1. Primitives ship with scenarios**

**5-7 macro primitives extracted to Go**, each with ≥3 scenario JSON files (happy + edge + failure). All scenarios pass.

**Recommended candidate list (architect refines in Phase 0):**
1. `macro-investment-clock` — classify macro regime phase (currently `domain/services.ts` MacroScoreService.scoreIndicator)
2. `macro-fed-liquidity-spread` — Fed/SBV liquidity spread compute
3. `macro-carry-trade-signal` — VND carry spread signal
4. `macro-yield-spread-signal` — yield spread compute
5. `macro-ism-regime-signal` — ISM reading → regime
6. `macro-pyramid-tier` — pyramid tier classification
7. `macro-oil-impact-classifier` — oil price direction (BEARISH/BULLISH/NEUTRAL based on VN cost-pressure thresholds)
8. `macro-gold-direction-classifier` — gold price direction
9. `macro-usdvnd-direction-classifier` — USD/VND direction

**Calibration vs TA pilot:** TA had 5 primitives (RSI, MACD, BB, MA, detect-cross). Macro has more candidates but several overlap (3 direction classifiers can share a primitive shape). Architect selects the 5-7 highest-leverage candidates in Phase 0.

Verification method: Run `cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all`. All scenario files execute without error. QA counts scenario files: minimum 3 per primitive × 5 primitives = 15 files. QA checks ≥1 file is a failure scenario.

Owner agent: `dev-macro-indicators` (NEW agent — Phase 0 deliverable: `agent-father` creates `.claude/agents/dev-macro-indicators.md` + `.claude/flows/dev-macro-indicators/main.md` cloning the dev-technical-analysis pattern with G12 DoD Gate baked in)

---

**G2. Module composes primitives via ports**

`apps/macro-indicators/pkg/module/macro_indicators/` exists. Imports primitives via interface, never reaches into other modules. Has its own multi-primitive scenarios.

**Calibration:** TA had 1 module (`technical-analysis`). Macro may split into `macro-core` (FX, FRED, base rates, snapshot) + `macro-signals` (carry, yield, ISM, investment clock) per parent brief `02-target-state.md` line 107-108. Architect decides Phase 0 whether to pilot one or both modules (recommendation: pilot ONE module — `macro-signals` — and defer `macro-core` to post-pilot; this matches TA's single-module scope).

Verification method: QA runs `grep -rn "from.*pkg/module/" apps/macro-indicators/pkg/module/macro_indicators/` — must return 0 results (no cross-module imports). QA runs the module-level sandbox and verifies ≥1 multi-primitive scenario (e.g., investment-clock + fed-liquidity-spread + ism-regime in one story).

Owner agent: `dev-macro-indicators`

---

**G3. Microservice has clean composition root**

`apps/macro-indicators/cmd/server/main.go` wires module + adapters. No business logic in composition root. HTTP interface contract documented (OpenAPI YAML).

Verification method: QA reads `cmd/server/main.go` — must contain only: import statements, interface wiring (DI bindings), and server startup. No `if` conditions on data values, no calculations, no domain logic. QA checks `apps/macro-indicators/pkg/interface/http/` contains an HTTP contract document (OpenAPI YAML or equivalent). QA runs `grep -rn "scoreIndicator\|buildSnapshot\|oilDirection" apps/macro-indicators/cmd/server/main.go` — must return 0.

Owner agent: `dev-macro-indicators`

---

**G4. Architecture fence enforced (offline depguard evidence)**

**Lesson burned in from TA pilot:** the original G4 specified "CI fails on violation" — but the whole-project CI is dominated by 283 pre-existing TS test failures unrelated to the pilot. That made CI-green-as-evidence noisy and forced a mid-pilot Amendment 1 to scope down to "offline `.golangci.yml` config freeze + deliberate-violation depguard evidence on the pilot service zone only".

**Macro-indicators G4 spec (calibrated v2):**

`apps/macro-indicators/.golangci.yml` exists, contains depguard rules for Fence-A (primitive must not import application layer), Fence-B (module must not import infrastructure layer), Fence-C (composition root must not import domain logic). CI green-on-pilot-zone OR offline-evidence: `cd apps/macro-indicators && golangci-lint run` exits 0; deliberate Fence-A violation (1 import in pkg/primitive/ to pkg/application/) reproduces depguard exit non-zero with "Fence-A" in output; violation reverted, never committed.

**Acceptance evidence (carried over from TA P2-A4 verbatim):**
- AC-4a: workflow file in `.github/workflows/ci.yml` includes `golangci-lint` job scoped `working-directory: apps/macro-indicators` (or offline-only proof if CI billing block persists)
- AC-4b: deliberate violation reproduces exit non-zero AND violation reverted AND `git status` clean AND violation NEVER committed
- AC-4c: `.golangci.yml` freeze anchor — `git log --oneline apps/macro-indicators/.golangci.yml` shows freeze commit as most recent commit on that file at G4 close

**Owner agent:** `dev-macro-indicators` (fence implementation) + `qa` (violation proof). NO need for architect Amendment — spec is final at charter v1.

---

**G5. Old TS macro-indicators code deleted (or rewired to Go service)**

**Calibration vs TA:** TA had `apps/mcp-server/src/.../technical-analysis/` to delete + HTTP rewire. Macro has `apps/macro-indicators/src/` (TS) which is the service itself, not a domain leak in mcp-server. So G5 here is:

- **G5a:** `apps/macro-indicators/src/` (TS) moved to `apps/macro-indicators/src/_deprecated/` after Go rewrite ships
- **G5b:** All MCP tool handlers in `apps/mcp-server/src/interface/mcp/tools/macro/` that currently call macro-indicators TS service (via HTTP or direct import) verified routed via HTTP to new Go service on port 5004
- **G5c:** Zero "TODO: migrate" comments in macro-indicators codebase

Verification method: QA runs `find apps/macro-indicators/src -path "*_deprecated*" -prune -o -type f -name "*.ts" -print` — must return 0 results (all TS moved to _deprecated). QA runs `grep -r "TODO.*migrat" apps/macro-indicators/ apps/mcp-server/src/interface/mcp/tools/macro/ --include='*.ts' --include='*.go'` — must return 0. QA verifies MCP tool `get_macro_snapshot` (and any other macro tools) returns valid response via HTTP to Go service.

**Tag-anchor discipline (lesson from TA):** Pre-delete tag `macro-pre-delete` MUST be created at the commit BEFORE the `git mv` to `_deprecated/`. No retag, no force, no push.

Owner agent: `dev-macro-indicators`

---

### Track B — Dashboard Trust Layer

---

**G6. Three-level dashboard renders from JSON traces**

`apps/macro-indicators/dashboard/index.html` exists. Three panels visible: Primitives (5-7), Module (1, or 2 if pilot covers both `macro-core` + `macro-signals`), Microservice (1). All open from one HTML index. file:// works (no server).

Owner agent: `dev-macro-indicators`

---

**G7. Edit-JSON-and-rerun works**

User edits scenario JSON, refreshes dashboard, sees new result. ZERO DB credentials in sandbox process. ZERO external API keys (including FRED_API_KEY — see §Security Clause).

Owner agent: `dev-macro-indicators`

---

**G8. Red/green status is honest**

Dashboard shows red when scenario fails (proven by 1 deliberate broken primitive). No false greens (QA runs 5 known-bad scenarios).

**TA carry-over evidence pattern:** Test A = corrupted scenario (status=red, diff captured) + Test B = golden scenario (status=green, diff=null). Both proven before G8 grades YES.

Owner agent: `qa` (verification) + `dev-macro-indicators` (dashboard honesty implementation)

---

**G9. Dashboard is the trust contract — short-circuit via PO Playwright (Day-0 escape hatch)**

**Lesson burned in from TA pilot:** Original G9 required synchronous user verbal confirmation. The TA pilot got blocked on async-user-wait for cycles 15-18 before user delegated verification to PO via Playwright headless chromium (cycle-19, 2026-05-23T06:34:55Z, decision doc `docs/po-decisions/2026-05-23-g9-user-confirmation.md`). That short-circuit is now the default G9 path for macro-indicators.

**Macro-indicators G9 spec (calibrated v2):**

G9 PASS = ONE of the following two paths satisfied:

- **Path A (synchronous user verbal confirm — preferred if user available):** At pilot review, user is shown only the dashboard. User answers YES to "Can you tell from this dashboard whether macro signals are working correctly?" PO records verbal YES in `docs/po-decisions/<date>-g9-macro-user-confirmation.md`.
- **Path B (PO Playwright short-circuit — default if user defers):** User issues directive delegating verification to PO. PO runs Playwright + chromium-headless-shell against `file://apps/macro-indicators/dashboard/index.html` (TCC-staged via Terminal.app per L87). Acceptance: ZERO console errors, ZERO pageerrors, ZERO requestfailed, all primitives + module + microservice cards rendered, NOT-RUN status honestly displayed. PO records verdict in decision doc. Verdict has SAME WEIGHT as user verbal confirm per cycle-19 precedent.

**Either path satisfies G9.** No need to wait synchronously for user reply that may never come.

Owner agent: `po` (pilot review facilitation + Playwright verification)

---

### Track C — AI-Fixability Proof

---

**G10. AI agent fixes a primitive bug without looping**

QA injects 1 deliberate bug. `dev-macro-indicators` agent fixes in ≤2 cycles (was 4-6 baseline). Dashboard turns green.

**Baseline source:** `docs/data/bug-inventory.json.baselineCycleCount` (TA pilot recorded 1.5; macro should record its own baseline at Phase 0 — falls back to TA's 1.5 or system-wide 4-6 if no macro-specific bugs in inventory).

**Bug-injection spec lesson:** Use the same off-by-one / wrong-divisor / wrong-multiplier injection pattern proven on TA (variant A from `p2-d-bug-injection-spec.md`). Calibrate to a macro primitive (e.g., wrong window in carry-trade signal compute).

Owner agent: `dev-macro-indicators` (fix) + `qa` (injection + cycle count)

---

**G11. Regression alarm bell works**

AI fixes bug A, breaks scenario B → dashboard flips B red → AI forced to fix B before "done".

**TA pilot lesson:** Two trials of coupling-proven outcome-(a) was sufficient evidence to grade G11=YES (cycle-17 PO decision). Macro G11 inherits same grading rubric — coupling-proven via dashboard rendering N coupled REDs from one mutation, single-edit fix repairs all N, counts as alarm-mechanism-functional.

Owner agent: `dev-macro-indicators` (flow rule compliance) + `qa` (scenario pair design)

---

**G12. Dev-* agent flow requires dashboard-green before "done"**

`.claude/flows/dev-macro-indicators/main.md` updated with hard rule. 3 consecutive tasks verified following rule.

**TA carry-over:** The G12 DoD Gate rule lives in TA's flow (commit `cc7578f1` 2026-05-23). For macro, `agent-father` clones the TA dev-flow when creating `dev-macro-indicators` flow at Phase 0; the DoD Gate is included from Day 0 (no separate flow-edit task needed).

Owner agent: `agent-father` (flow rule cloning) + `qa` (3-task verification — uses macro-indicators' first 3 Phase 1 dev tasks as the streak)

---

## Charter Inherited Lessons (from TA pilot close 2026-05-23)

Seven lessons from the TA factory cycle are baked into THIS charter v1 — no Amendment-1-style retrofit expected.

| # | Lesson source | TA pain | Macro-charter v1 fix |
|---|---|---|---|
| L1 | TA cycle-1 to cycle-2 language pivot (6 reverted commits) | TS scaffold landed before user verdict; pivot to Go cost 3-4 days | Charter §Language Lock — Go from Day 0, no pivot possible |
| L2 | TA G4 Amendment 1 (architect 10aceb0c) | Whole-project CI noisy from unrelated TS failures; original "CI green" evidence unusable | Charter §G4 — offline depguard evidence OR pilot-scoped CI; acceptance criteria explicit at v1 |
| L3 | TA Q5 closure-checklist-audit (architect, status enum violation) | `PHASE-2` operational label allowed silent escape from charter status machine | Charter §Hard Deadline — status enum strictly `ACTIVE \| DONE \| FAILED`; auto-FAILED on G9-blocked deadline pass |
| L4 | TA Q6 closure-checklist-audit (architect, matrix authorship undefined) | decisionMatrix could be set by wrong agent; no atomic-with-12/12-terminal rule until §4.5 retrofitted | Charter §4.5 carry-over and SSOT-from-Day-0 — PO-only authorship; populate ONLY after 12/12 terminal in atomic commit |
| L5 | TA Q7 closure-checklist-audit (architect, pre-revert tags missing) | Only `p2-b-pre-delete` tagged; `pre-ci` + `pre-inject` retrofitted as recommendation | Charter §G4 + §G5 + §G10 require pre-* tags from Day 0 in handoff specs (`macro-pre-delete`, `macro-pre-ci`, `macro-pre-inject`) |
| L6 | TA G9 cycle-19 user-delegation precedent | Synchronous user verbal confirm blocked pilot for cycles 15-18 | Charter §G9 — Path B (PO Playwright short-circuit) is Day-0 default, equal weight to Path A |
| L7 | TA cycle-26+ SSOT discipline (one active dispatch per task; L84 explicit-file staging; no force/no push/local-only commits; anchor-hold across chain) | Discovered mid-pilot; cycle-19 cleanup retroactively enforced | Charter §Constraints (below) lists them as binding from Day 0 |

Full lessons doc: `01-lessons-from-ta-pilot.md`.

---

## Constraints (binding from Day 0 — TA carry-over)

These constraints held throughout TA cycle 19→28 and carry over verbatim:

- **L84 explicit-file staging** — `git add <path>` per file. NEVER `git add -A` or `git add .`. Skill: `.claude/skills/explicit-file-staging` (TA pilot adoption).
- **No `--force`, no `--no-verify`, no `--no-gpg-sign`** — ever. If a hook fails, fix the issue and create a NEW commit.
- **No `git push` of source/CI changes** — local-only commits. User owns push permissions due to CI billing block. Charter respects that boundary.
- **All work on `main`** — NO branches per project convention (CLAUDE.md "NO branches — all work stays on `main`").
- **SSOT: one active dispatch per task** — no shadow dispatches, no orphaned signals. Adopted from TA cycle-19 cleanup policy.
- **Anchor discipline** — once a commit becomes the "frozen anchor" for a contract (e.g., `.golangci.yml` freeze), no retag, no rewrite, no push. New commits chain forward only.
- **Charter §4.5 matrix-authorship rule** — `decisionMatrix.{speed,trust,scale}` populates ONLY by PO, ONLY after 12/12 G-goals reach terminal grade, ONLY in atomic commit with last G-goal flip + verdict signature.
- **Notebook + signal hygiene** — PO notebook overwritten end of every cycle (≤200 lines, ≤50 line target per cycle-end). Signals follow `{agent}-{ISO}.json` naming contract.

---

## Decision Matrix

Identical to parent charter §Decision Matrix, applied mechanically by PO after 12/12 terminal:

| Question | YES criteria | NO criteria |
|---|---|---|
| **Speed** — fewer fix loops vs baseline? | G10 confirmed ≤2 cycles vs baseline AND G11 regression alarm triggered at least once (proving it works) | G10 not met OR regression alarm never fired |
| **Trust** — user can verify pilot quality from dashboard alone? | G9 confirmed (Path A user verbal YES OR Path B PO Playwright VERDICT PASS) AND G8 red/green honesty proven | G9 not confirmed by either path OR G8 false-green found |
| **Scale** — worth doing for next microservice? | All 12 goals YES AND both tracks A+B delivered within 6 sprints | ≥2 goals still NO at deadline OR pilot overran 6 sprints |

**Outcome:**

- **3 YES** → scale to next microservice. Recommended target (post-macro): `news-fetch` or `stock-price` (architect to recommend at macro close based on bounded-context cleanness).
- **2 YES** → re-scope (max 2 additional sprints; do not start next microservice until 3 YES).
- **0-1 YES** → STOP factory. Fall back to MVR. Architect writes MVR brief within 1 sprint.

**Pilot review meeting:** PO schedules within 1 sprint of all 12 goals reaching terminal state.

---

## Status Tracking

Pilot goal state tracked in `docs/data/pilot-status-macro-indicators.json` (NEW file — separate from `pilot-status.json` which is FROZEN historical record for TA pilot). Schema identical to TA's pilot-status.json.

**Valid goal states:** `TBD | IN-PROGRESS | YES | NO | PARTIAL | DEFER`
**Valid top-level status values:** `ACTIVE | DONE | FAILED` (per L3 — NO operational labels allowed)
**Valid phase status values:** `OPEN | CLOSED | ARCHIVED`

Pilot is DONE when all 12 goals are YES and decisionMatrix is complete (matches parent charter §Status Tracking exactly).

---

## Phase Skeleton

Detailed phase plan in `07-phases.md` (PO-authored skeleton; architect expands at Phase 0 dispatch).

| Phase | Goal | Duration | Owner |
|---|---|---|---|
| **Phase 0** | Baseline + agent/flow creation + pilot-status.json + bug-inventory entry + brownfield scan | 1 sprint | architect + system-auditor + agent-father |
| **Phase 1** | Pilot Go scaffold: cmd/server/main.go + first primitive (`macro-investment-clock`) extracted to L3+ + sandbox green | 2-3 sprints | dev-macro-indicators |
| **Phase 2** | Remaining primitives + module + composition root + dashboard + G1-G12 chain | 2-3 sprints | dev-macro-indicators + qa + po |
| **Phase 3** | Closure: 12/12 terminal + decisionMatrix populated + brief CLOSES | atomic | po |

**Total:** 6 sprints (charter hard deadline 2026-07-04).

---

## Amendments

(None at v1 — lessons baked in. Future amendments require PO sign-off + signal trail per cycle-23 architect Amendment 1 precedent.)
