---
title: "Pilot Charter — stock-price microservice refactor (Factory v2 — fleet pilot 3)"
date: "2026-05-23"
author: "po"
status: "ACTIVE"
pilot: "stock-price"
fleet_pilot_number: 3
deadline_sprints: 6
deadline_iso: "2026-07-04"
version: "2.0"
parent_factory_close: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (v1.0, CLOSED 2026-05-23 verdict=scale)"
sibling_pilot_close: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md (v2.0, CLOSED 2026-05-23 verdict=scale)"
ratification: "docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md (Decision 1 — stock-price PROMOTED to pilot 3; Decision 5 step 3)"
schema_source: "docs/data/pilot-status-schema.json (SI-1 fleet schema v1.0, agent-father 2026-05-23T22:01:07Z)"
language: "Go"
language_lock_source: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md §Q2 — user 'B' verdict; Go is the implementation language for all Go microservice fractals; generalizes to stock-price (already Go)"
service_facts_source: "docs/data/system-map.json (jq, never hardcoded): port 5000, external_port 5010, zone apps/stock-price/, specialist dev-stock-price, runtime go1.22+cgo, keywords [price fallback, VPS bridge, quote agg, stock price]"
---

# Pilot Charter — `stock-price` Microservice Refactor (Factory v2 — fleet pilot 3)

**Binding contract for the THIRD factory pilot and the FIRST fleet-rollout pilot. Inherits the 12-G-goal factory pattern proven TWICE on `technical-analysis` (closed 2026-05-23, verdict=`scale`) and `macro-indicators` (closed 2026-05-23, verdict=`scale`).**

**Scope:** `apps/stock-price` only. No other microservice is in scope during this pilot.

---

## Why This Pilot Exists

Both prior factory pilots scored 12/12 with verdict=`scale`. The fleet-rollout ratification (`docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md`) **promoted stock-price ahead of kinh-dich** to be the first fleet pilot, for one reason: **it carries zero new-tooling risk.**

- stock-price is **Go** → the depguard fence (G4) is the SAME mechanism proven twice (TA + macro). No SI-3 (TS ESLint fence) dependency.
- This lets SI-3 (HIGH-RISK TS fence design) run in parallel without gating the program's forward motion.
- kinh-dich (TS, pilot 4) is gated on SI-3; stock-price is not.

This pilot's purpose:

1. **Open the fleet rollout with zero tooling risk.** Prove the per-service in-app factory model (the canonical pattern per ratification Decision 2) scales a THIRD time on a Go service with no new mechanisms.
2. **De-risk the program, not the tooling.** First fleet pilot must show progress immediately. Go = proven path.
3. **Burn in all carry-over lessons Day 0.** No Amendment-1-style retrofit expected (lessons L1-L7 baked, see §Charter Inherited Lessons).

**Pilot gate:** if all 12 goals pass the decision matrix → scale continues to pilot 4 (kinh-dich, once SI-3 lands). See §Decision Matrix.

---

## Language Lock (Day 0)

**Implementation language is Go.** Locked at charter creation; not subject to mid-pilot pivot.

**Authority:** User verdict 2026-05-22 ("B" on the language-pivot evaluation). PO decision doc `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md §Q2` makes Go the implementation language for all Go microservice fractals. stock-price is **already Go** (`runtime go1.22+cgo` per system-map) — there is no rewrite-from-TS step here (unlike macro). The lock simply forbids any mid-pilot pivot.

**Carry-over lesson L1:** the TA pilot lost 6 commits and ~3 days to a mid-Phase-1 language pivot. Impossible here — language locked Day 0 AND the service is natively Go.

**Current state (per architect SI-1 inventory `01-service-inventory.md` §4 + brownfield grep this charter):**
`apps/stock-price/` has all 4 DDD layers in `pkg/` (`domain/`, `application/`, `infrastructure/`, `interface/http/`) and `cmd/server/main.go`. It has **NO `pkg/primitive/`, NO `pkg/module/`, NO `cmd/sandbox/`, NO `dashboard/`** — RED verdict. The 3-tier price-fallback orchestration (`domain/services.go ResolvePriceService.FetchPrice`) and the Tier1/Tier2/Tier3 fetchers (`infrastructure/fetchers.go`) are the natural decomposition targets. dev-stock-price confirms exact primitive/module targets in Phase 0 (§Phase 0).

---

## Refactor Targets (recommended candidates — dev-stock-price confirms in Phase 0)

The factory decomposes **pure decision/transformation logic** into primitives and **composition/orchestration** into a module. I/O (HTTP fetch, SQLite read) stays in infrastructure and **must not leak into the fences** (see §CGO Boundary Clause — the stock-price analog of macro's FRED_API_KEY gate / alert-engine's Telegram-creds gate).

**Primitive candidates (pure, stdlib-only — Fence-A):**

| # | Primitive (proposed) | Pure logic extracted from | Why it is pure |
|---|---|---|---|
| 1 | `price-quote-normalizer` | shape of `domain.PriceQuote` build-up across Tier1/Tier2 fetchers (`infrastructure/fetchers.go`) | Maps a raw exchange payload field-set → canonical `PriceQuote` (price, volume, source, fetched_at). No network — input is a decoded struct/map, output is normalized. |
| 2 | `tier-fallback-selector` | the tier-walk decision in `domain.ResolvePriceService.FetchPrice` (`tierResult` selection) | Given an ordered list of tier results (each = quote OR error + staleness), decides which tier "wins" and whether the result is fresh/valid. Pure decision logic — the *fetching* is infra, the *selection* is pure. |
| 3 | `ohlcv-aggregator` | history shaping in `PriceHistoryUseCase` / `DailyOHLCV` | Aggregates/normalizes a list of raw daily rows → canonical `DailyOHLCV` series (open/high/low/close/volume per day). Pure transform over an in-memory slice. |
| 4 | `price-staleness-classifier` | freshness/validity checks implicit in tier selection | Given a quote's `fetched_at` + a "now" + threshold → FRESH / STALE / EXPIRED. Pure, deterministic. |
| 5 | `exchange-code-router` | HOSE/HNX/UPCOM routing implicit in fetchers | Maps a ticker → exchange + canonical request shape. Pure string/table logic. |

Target: **3-5 primitives** (architect/dev-stock-price pick the highest-leverage in Phase 0; macro shipped 6, TA 5 — 3-5 is the calibrated band for stock-price's thinner domain).

**Module candidate (Fence-B):**

- `pkg/module/price_resolution/` — composes the primitives via ports (DI). The 3-tier fallback STORY: walk tier results (fetched by infra, injected as a port), apply `tier-fallback-selector` + `price-staleness-classifier`, normalize via `price-quote-normalizer`, return a resolved quote. **The module owns the orchestration; the actual HTTP/SQLite fetching is an injected `TierFetcher` port (infra impl), never imported directly by the module.**

This is the single-module scope (matches TA's 1 module and macro's pilot-one-module discipline). A second module (e.g. `history_aggregation`) is **deferred to post-pilot** unless Phase 0 finds it trivial to fold in.

> **dev-stock-price Phase 0 confirmation required:** the candidates above are derived from a read-only grep of `domain/services.go` + `infrastructure/fetchers.go`. dev-stock-price MUST confirm or refine the exact primitive set + module name in the Phase 0 brownfield inventory before any code lands. The charter does not freeze the primitive names — only the decomposition principle (pure → primitive, orchestration → module, I/O → infra).

---

## CGO Boundary Clause (Phase-0 RISK — stock-price's hard gate)

**stock-price uses CGO sqlite (`mattn/go-sqlite3`) in `infrastructure/fetchers.go` (Tier3 cache + history repo) and `cmd/server/main.go`.** This is the stock-price analog of macro's `FRED_API_KEY` security gate and alert-engine's Telegram-creds gate.

**Hard rule:** CGO sqlite MUST NOT leak into the primitive (`pkg/primitive/`) or module (`pkg/module/`) fences.

- Primitives are **stdlib-only** (Fence-A) — they receive already-decoded data, never open a DB or import `mattn/go-sqlite3`.
- The module (Fence-B) composes primitives + a `TierFetcher` **port (interface)** — the CGO SQLite fetcher is an infra *implementation* of that port, injected by the composition root, never imported by the module.
- **The sandbox (`cmd/sandbox/`) MUST build and run the refactored primitives + module WITHOUT the CGO infra layer.** Scenario JSON fixtures stand in for tier-fetch results. The sandbox must compile and execute with `CGO_ENABLED=0` (pure-Go, no `mattn/go-sqlite3`), proving the primitive/module fences are genuinely free of the CGO boundary.

**Phase-0 RISK (dev-stock-price MUST confirm):** verify that the extracted primitives + module compile and the sandbox runs under `CGO_ENABLED=0`. If any extracted unit transitively pulls `mattn/go-sqlite3`, the decomposition is wrong (I/O leaked into a fence) and must be re-cut before Phase 1. **Flag this exactly as macro flagged R-1 (math/rand) at Phase 0** — it is the binding correctness gate for the fences.

**Why this matters for trust:** if the sandbox needed CGO + a real SQLite file, the "edit JSON and rerun" trust contract (G7) and the zero-credentials guarantee would be compromised. The whole point is pure-function reproducibility: JSON in → trace JSON out, no DB, no network, no CGO.

---

## Kickoff Prerequisites

All of the following must be true before Phase 0 work begins on this pilot:

1. Parent + sibling factories CLOSED — `pilot-status.json` (TA) status=DONE verdict=scale; `pilot-status-macro-indicators.json` status=DONE verdict=scale (both verified 2026-05-23). FROZEN historical records — do NOT mutate.
2. Fleet rollout RATIFIED — `docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md` status=DECIDED; stock-price is pilot 3 (Decision 1).
3. SI-1 fleet schema LANDED — `docs/data/pilot-status-schema.json` exists (agent-father, 2026-05-23T22:01:07Z). This charter's SSOT (`docs/data/pilot-status-stock-price.json`) is instantiated from it.
4. Pilot status SSOT created — `docs/data/pilot-status-stock-price.json` exists with all 12 goals = `TBD`, decisionMatrix all `TBD` (present-but-empty), status `ACTIVE`, phase `0`, language `Go` locked (this charter creation cycle; PO authors per §4.5 SSOT-from-Day-0 rule).
5. `apps/stock-price/` brownfield scan complete — confirm DDD layer state + exact primitive/module targets + CGO boundary (Phase 0 deliverable; architect or system-auditor owns; dev-stock-price confirms CGO-free sandbox feasibility).
6. Bug-inventory entry — `docs/data/bug-inventory.json` gets a `stock_price_baseline` block for G10 baseline. If no stock-price bugs exist in the 60d window, baselineCycleCount falls back to system-wide `1.5` (`bug-inventory.json.baselineCycleCount`).

---

## Anti-Scope-Creep Clause

**This pilot covers `apps/stock-price/` only.** Forbidden while the pilot is active:

- Extracting primitives for any other bounded context (kinh-dich, alerts, news, etc.)
- Rebuilding modules or rewiring composition roots for any service other than `apps/stock-price/`
- Touching DORMANT closed-pilot app source (`apps/technical-analysis/**`, `apps/macro-indicators/**`) — both are FROZEN
- Touching CLOSED pilot SSOTs (`pilot-status.json`, `pilot-status-macro-indicators.json`)
- Adding goals to this charter mid-pilot

The pilot is a controlled experiment, not a rolling refactor. Creep invalidates the measurement.

**If a compelling opportunity arises elsewhere during the pilot:** PM creates a backlog task tagged `post-pilot-3`. It does not start until the 12-goal review is complete. WIP=2 cap (per ratification Decision 1): stock-price + (later) kinh-dich are the only two ACTIVE charters — no pilot 5 charter opens until pilot 3 clears Phase 1.

---

## Hard Deadline

**6 sprints from kickoff.** Kickoff date = 2026-05-23 (charter creation date). **Sprint-6 hard deadline = 2026-07-04.**

No silent extension. At sprint 6 end, PO calls the decision matrix regardless of goal state.

**Mechanically enforced (L3):** Status enum is strictly `ACTIVE | DONE | FAILED`. NO operational labels (`PHASE-2`, `WAITING-USER`) are valid terminal values. If a user-gated goal (G9) stays unresolved past hard deadline, status auto-flips to `FAILED` and PO calls matrix on whatever state exists (G9 → PARTIAL, Trust evaluated on G8 alone). Default G9 path is PO Playwright (Path B, L6) — so async-user-wait should not block.

---

## Security / CGO Clause

The sandbox process (used in G7 and throughout Track B) **MUST have zero DB credentials, zero external API keys, AND zero CGO at all times.** Not optional.

Enforcement:
- G7 env audit: run the sandbox process and confirm `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty.
- **stock-price-specific addition (CGO gate):** the sandbox binary builds and runs under `CGO_ENABLED=0`. `go build -tags ''` of `./cmd/sandbox` with `CGO_ENABLED=0` exits 0, and `grep -rn "mattn/go-sqlite3" apps/stock-price/pkg/primitive apps/stock-price/pkg/module apps/stock-price/cmd/sandbox` returns 0. The sandbox runs against scenario JSON fixtures, NOT live VnDirect APIs and NOT a real SQLite DB.
- If any credential OR `mattn/go-sqlite3` import leaks into the sandbox/primitive/module path, G7 (and G4 Fence-B) is blocked — it does not pass.

Rationale: sandbox is pure-function (JSON in → trace JSON out). Any credential, network call, or CGO dependency in that environment destroys the security and reproducibility guarantee.

---

## 12 Completion Goals

All 12 goals are inherited verbatim from the proven v2 charter, with stock-price-specific calibration on G1, G2, G3, G5, G7, G10, G11, G12. Track structure (A=Trust Foundation, B=Dashboard, C=AI-Fixability) is unchanged.

### Track A — Trust Foundation

---

**G1. Primitives ship with scenarios**

**3-5 stock-price primitives extracted to Go** (`apps/stock-price/pkg/primitive/`), each with ≥3 scenario JSON files (golden/happy + edge + failure). All scenarios pass.

**Recommended candidate list (architect/dev-stock-price refine in Phase 0 — see §Refactor Targets):**
1. `price-quote-normalizer` — raw exchange payload → canonical PriceQuote
2. `tier-fallback-selector` — ordered tier results → winning tier + validity
3. `ohlcv-aggregator` — raw daily rows → canonical DailyOHLCV series
4. `price-staleness-classifier` — quote + now + threshold → FRESH/STALE/EXPIRED
5. `exchange-code-router` — ticker → exchange + canonical request shape

**Calibration vs prior pilots:** TA had 5 primitives, macro 6. stock-price's domain is thinner (data-fetch/aggregation) — 3-5 is the calibrated band. Architect selects the highest-leverage in Phase 0. **R-CGO gate binds (§CGO Boundary Clause):** every primitive must be stdlib-only, no `mattn/go-sqlite3`.

Verification method: `cd apps/stock-price && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all`. All scenario files execute without error. QA counts scenario files: minimum 3 per primitive × 3 primitives = 9 files minimum. QA checks ≥1 file is a failure scenario. QA confirms `grep -rn "mattn/go-sqlite3" pkg/primitive/` = 0.

Owner agent: `dev-stock-price`

---

**G2. Module composes primitives via ports**

`apps/stock-price/pkg/module/price_resolution/` exists. Imports primitives via interface; the tier-fetch I/O is an injected `TierFetcher` **port** (infra implements it), never reached into directly. Module never imports another module. Has its own multi-primitive scenarios (the 3-tier fallback STORY).

**Calibration:** ONE module (`price_resolution`) — matches TA's single-module scope and macro's pilot-one-module discipline. `history_aggregation` deferred to post-pilot unless trivial. **Fence-B + CGO gate:** module imports zero infrastructure and zero `mattn/go-sqlite3`.

Verification method: QA runs `grep -rn "pkg/module/" apps/stock-price/pkg/module/price_resolution/` → 0 cross-module imports. QA runs `grep -rn "mattn/go-sqlite3\|pkg/infrastructure" apps/stock-price/pkg/module/price_resolution/` → 0. QA runs the module sandbox under `CGO_ENABLED=0` and verifies ≥1 multi-primitive scenario (e.g., a tier-walk story: Tier1 stale → Tier2 fresh wins → normalized).

Owner agent: `dev-stock-price`

---

**G3. Microservice has clean composition root**

`apps/stock-price/cmd/server/main.go` wires module + adapters (the CGO SQLite fetcher is wired HERE as the infra impl of `TierFetcher`). No business logic in composition root. HTTP interface contract documented (OpenAPI YAML). **Port = 5000 (internal) / 5010 (external) per system-map.json — never hardcoded elsewhere.**

Verification method: QA reads `cmd/server/main.go` — only imports, DI wiring (including the CGO fetcher injection), and server startup. No `if` on data values, no calculations, no domain logic. QA checks `apps/stock-price/pkg/interface/http/` has an HTTP contract doc (OpenAPI YAML or equivalent). QA runs `grep -rn "FetchPrice\|tierResult\|normalize\|aggregate" apps/stock-price/cmd/server/main.go` → 0 (logic lives in module/primitives, not the root).

Owner agent: `dev-stock-price`

---

**G4. Architecture fence enforced (offline depguard evidence)**

**Lesson burned in (L2):** whole-project CI is noisy from unrelated pre-existing failures. G4 evidence is offline `.golangci.yml` freeze + deliberate-violation depguard proof on the pilot zone only. **Go service → depguard via golangci-lint. SAME mechanism proven on TA + macro. NO SI-3 (TS fence) dependency — stock-price is Go.**

**stock-price G4 spec (calibrated v2):**

`apps/stock-price/.golangci.yml` exists, contains depguard rules for:
- **Fence-A** — primitive (`pkg/primitive/`) must not import application, infrastructure, interface, OR `mattn/go-sqlite3` (stdlib-only).
- **Fence-B** — module (`pkg/module/`) must not import infrastructure OR `mattn/go-sqlite3` (composes via ports only).
- **Fence-C** — infrastructure (`mattn/go-sqlite3`, net/http VPS bridge clients) importable ONLY from `cmd/server/main.go` (composition root). Exclusions: `!**/cmd/server/main.go`, `!**/*_test.go`.

CI green-on-pilot-zone OR offline-evidence: `cd apps/stock-price && golangci-lint run` exits 0; deliberate Fence-A violation (1 import in `pkg/primitive/` reaching `mattn/go-sqlite3` or `pkg/infrastructure`) reproduces depguard exit non-zero with "Fence-A" in output; violation reverted, never committed.

**Acceptance evidence (carried over from TA P2-A4 / macro P2-A2 verbatim):**
- **AC-4a:** workflow file `.github/workflows/ci.yml` includes a `golangci-lint` job scoped `working-directory: apps/stock-price` (job name e.g. `stock-price-go-lint`) — OR offline-only proof if CI billing block persists.
- **AC-4b (deliberate-violation proof):** an intentional Fence-A violation (e.g. add `import "github.com/mattn/go-sqlite3"` or an `pkg/infrastructure` import to a primitive file) reproduces a non-zero golangci-lint exit with the fence name ("Fence-A") in output. The violation is then **reverted, `git status` is clean, and the violation is NEVER committed.** QA reproduces independently.
- **AC-4c:** `.golangci.yml` freeze anchor — `git log --oneline apps/stock-price/.golangci.yml` shows the freeze commit as the most recent commit on that file at G4 close.

**Pre-revert tag (L5):** `stock-price-pre-ci` MUST be created at the commit BEFORE the CI/violation work. No retag, no force, no push.

Owner agent: `dev-stock-price` (fence impl) + `qa` (violation proof). NO architect Amendment — spec is final at charter v1 (Go path, no SI-3).

---

**G5. Old stock-price domain leak deleted + HTTP rewire**

**Calibration vs prior pilots:** stock-price is its OWN Go service already (not a TS service to rewrite, and not a domain leak sitting inside mcp-server like TA's `technical-analysis` dir). So G5 here is:

- **G5a:** any pre-refactor stock-price logic that gets superseded by the new primitive/module decomposition is moved to `apps/stock-price/pkg/_deprecated/` (or deleted with a pre-delete tag) after the new module ships — NOT left as dead duplicate domain logic. (Phase 0 brownfield confirms whether the existing `domain/services.go`/`application/usecases.go` is fully replaced or partially retained.)
- **G5b:** any `apps/mcp-server/src/` tool handlers that consume stock-price data are verified routed via **HTTP to the Go service on port 5000** (external 5010), with zero direct domain imports. Phase 0 identifies the exact MCP handlers (candidates seen in brownfield: `market-data/priceHistoryTools.ts`, `market-data/tickerIntelligenceTools.ts`, `market-data/priceAlertTools.ts` — dev-stock-price confirms which actually reach into stock-price domain vs already-HTTP).
- **G5c:** zero `TODO.*migrat` comments in stock-price + the affected mcp-server tool dir.

Verification method: QA runs `grep -rn "TODO.*migrat" apps/stock-price/ apps/mcp-server/src/interface/mcp/tools/market-data/ --include='*.ts' --include='*.go'` → 0. QA confirms superseded logic moved to `_deprecated/` (or deleted under tag). QA verifies the relevant MCP price tool returns valid response via HTTP to the Go service.

**Tag-anchor discipline (L5):** Pre-delete tag `stock-price-pre-delete` MUST be created at the commit BEFORE any `git mv` to `_deprecated/`. No retag, no force, no push.

Owner agent: `dev-stock-price`

---

### Track B — Dashboard Trust Layer

---

**G6. Three-level dashboard renders from JSON traces (3-panel standard)**

`apps/stock-price/dashboard/index.html` exists. **Three panels visible (the 3-panel standard, SI-2 fleet-index trigger fires HERE — first fleet pilot to reach G6):**
1. **Primitives panel** — one card per extracted primitive (3-5)
2. **Module panel** — one card for `price_resolution`
3. **Microservice panel** — one card for the stock-price service composition

All open from one HTML index. **`file://` works with ZERO network calls and ZERO CGO** (renders from scenario trace JSON, no live VnDirect, no SQLite). No CDN, no build server required to view.

**SI-2 note:** stock-price is the FIRST fleet pilot to hit G6 → its dev (`dev-stock-price`) owns the SI-2 fleet dashboard index (`docs/dashboards/index.html`) creation at G6 time, per ratification Decision 3 (SI-2 owner corrected from kinh-dich to stock-price). This is a G6-triggered Phase 2 deliverable, NOT a Phase 0 item.

Owner agent: `dev-stock-price`

---

**G7. Edit-JSON-and-rerun works (zero credentials, zero CGO in sandbox)**

User edits a scenario JSON, refreshes the dashboard, sees the new result. **ZERO DB credentials, ZERO external API keys, ZERO `mattn/go-sqlite3` (CGO) in the sandbox process.** The rerun handler invokes the `CGO_ENABLED=0` sandbox binary against the edited fixtures.

Owner agent: `dev-stock-price`

---

**G8. Red/green status is honest (honest-red contract)**

Dashboard shows RED when a scenario fails (proven by 1 deliberate broken primitive). No false greens (QA runs known-bad scenarios).

**Carry-over evidence pattern (the honest-red contract):**
- **Test A** = deliberate corruption of a golden scenario (e.g. flip an expected price/tier in `tier-fallback-selector` golden) → dashboard renders RED, diff captured.
- **Test B** = known-good golden scenario → dashboard renders GREEN, diff = null.

Both proven before G8 grades YES. Pattern identical across all pilots — no false green tolerated.

Owner agent: `qa` (verification) + `dev-stock-price` (dashboard honesty impl)

---

**G9. Dashboard is the trust contract — short-circuit via PO Playwright (Day-0 default, L6)**

**Lesson burned in (L6):** synchronous user verbal confirm blocked the TA pilot for cycles 15-18. Path B (PO Playwright short-circuit) is the Day-0 DEFAULT, equal weight to Path A.

G9 PASS = ONE of:
- **Path A (synchronous user verbal — preferred if user available):** user shown only the dashboard, answers YES to "Can you tell from this dashboard whether stock-price resolution is working correctly?" PO records verbal YES in `docs/po-decisions/<date>-g9-stock-price-user-confirmation.md`.
- **Path B (PO Playwright short-circuit — DEFAULT if user defers):** user directive delegates verification to PO. PO runs Playwright + chromium-headless-shell against `file://apps/stock-price/dashboard/index.html` (TCC-staged via Terminal.app per L87). Acceptance: ZERO console errors, ZERO pageerrors, ZERO requestfailed, all primitive + module + microservice cards rendered, NOT-RUN status honestly displayed. PO records verdict in decision doc. SAME WEIGHT as user verbal per cycle-19 precedent.

**Either path satisfies G9.** No synchronous user wait required.

Owner agent: `po` (review facilitation + Playwright verification)

---

### Track C — AI-Fixability Proof

---

**G10. AI agent fixes a primitive bug without looping (≤2 cycles)**

QA injects 1 deliberate bug into a stock-price primitive. `dev-stock-price` fixes in ≤2 cycles (baseline was 4-6 system-wide). Dashboard turns green.

**Baseline source:** `docs/data/bug-inventory.json` — Phase 0 adds a `stock_price_baseline` block. If no stock-price bugs in the 60d window, falls back to system-wide `baselineCycleCount=1.5`.

**Bug-injection spec (L proven on TA + macro):** off-by-one / wrong-divisor / wrong-multiplier single-literal injection. Calibrate to a stock-price primitive (e.g. wrong staleness threshold in `price-staleness-classifier`, or a flipped comparison in `tier-fallback-selector`). The bug must be a SINGLE literal/operator change with a deterministic correct fix.

Owner agent: `dev-stock-price` (fix) + `qa` (injection + cycle count)

---

**G11. Regression alarm bell works**

AI fixes bug A, breaks scenario B → dashboard flips B RED → AI forced to fix B before "done".

**Grading rubric (TA cycle-17 / macro cycle-57 precedent — 2-trial coupling-proof):**
- **Trial-1** = the G10 primitive mutation + fix; verify ≥1 COUPLED scenario goes RED, single-edit fix repairs all coupled REDs.
- **Trial-2** = a DIFFERENT primitive mutation + fix; same coupling proof.
- Both showing outcome-(a) (coupled REDs from one mutation, single-edit fix repairs all) = PASS. Counts as alarm-mechanism-functional.

Owner agent: `dev-stock-price` (flow rule compliance) + `qa` (scenario pair design)

---

**G12. Dev-stock-price flow requires dashboard-green before "done" (3-task streak)**

`.claude/flows/dev-stock-price/main.md` updated with the hard DoD-Gate rule (sandbox-green-before-RETURN). 3 consecutive dev tasks verified following the rule.

**Carry-over (L from TA/macro):** the G12 DoD Gate rule lives in TA's flow (commit `cc7578f1`) and was cloned into macro's flow Day 0. For stock-price, `agent-father` updates/clones the `dev-stock-price` flow at Phase 0 to bake the DoD Gate from Day 0 (no separate flow-edit task). Streak = the first 3 Phase 1 dev tasks (first-primitive + module-stub + dashboard-stub bucket pattern).

**Status candidacy:** may be held as EARNED-PENDING per §4.5 once the streak completes; PO flips YES only at 12/12 terminal atomic close.

Owner agent: `agent-father` (flow rule baking) + `qa` (3-task verification, using stock-price's first 3 Phase 1 dev tasks)

---

## Phase 0 (exit gate)

**Owner:** architect + system-auditor + agent-father (+ dev-stock-price for CGO-feasibility confirmation).
**Duration:** 1 sprint.

Deliverables (per SI-1 schema `phase0.deliverables`):
1. `pilot_status_ssot` — `docs/data/pilot-status-stock-price.json` (DONE this charter cycle, PO).
2. `brownfield_inventory` — `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md`. MUST confirm: exact primitive set + module name; which existing `domain`/`application` logic is superseded vs retained (G5a scope); the exact MCP handlers that reach stock-price domain (G5b scope); **and the CGO-free sandbox feasibility (R-CGO gate) — confirm primitives + module + sandbox build & run under `CGO_ENABLED=0`.**
3. `bug_inventory_entry` — `docs/data/bug-inventory.json` `stock_price_baseline` block (baselineCycleCount; fallback 1.5).
4. `dev_agent_file` — `.claude/agents/dev-stock-price.md` updated/confirmed for factory mode (Go primary, G12 DoD constraint, CGO-boundary lazy-load). Already exists (v2026-05-14) — agent-father confirms factory-readiness.
5. `dev_agent_flow_file` — `.claude/flows/dev-stock-price/main.md` with G12 DoD Gate baked Day 0 + CGO/Fence-A/B/C + pre-revert tag protocol (`stock-price-pre-ci`, `stock-price-pre-delete`, `stock-price-pre-inject`).
6. `phase_1_task_plan` — `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` (atomic tasks, per-task AC, WIP=1, R-CGO gate baked into the first-primitive task AC exactly as macro baked R-1 into P1-B1).

**Exit gate:** all 6 deliverables landed + SSOT phase-0 fields populated + no code in `pkg/primitive`/`pkg/module` yet + architect verification signal.

---

## Charter Inherited Lessons (from TA close + macro close 2026-05-23)

| # | Lesson source | Prior pain | stock-price charter v1 fix |
|---|---|---|---|
| L1 | TA language pivot (6 reverted commits) | TS scaffold before user verdict; pivot cost 3-4 days | §Language Lock — Go Day 0, AND service is natively Go (no rewrite step) |
| L2 | TA G4 Amendment 1 | Whole-project CI noisy | §G4 — offline depguard evidence OR pilot-scoped CI; AC explicit at v1 |
| L3 | TA Q5 status-enum violation | `PHASE-2` label allowed silent escape | §Hard Deadline — enum strictly `ACTIVE\|DONE\|FAILED`; auto-FAILED on G9-blocked deadline |
| L4 | TA Q6 matrix authorship undefined | decisionMatrix set by wrong agent | §4.5 / §Constraints — PO-only, populate ONLY after 12/12 terminal in atomic commit |
| L5 | TA Q7 pre-revert tags missing | tags retrofitted | §G4 + §G5 + §G10 require pre-* tags Day 0 (`stock-price-pre-ci/-delete/-inject`) |
| L6 | TA G9 cycle-19 user-delegation | Synchronous confirm blocked pilot | §G9 — Path B PO Playwright Day-0 default, equal weight |
| L7 | TA cycle-26+ SSOT discipline | Discovered mid-pilot | §Constraints — L84 / no-force / local-only / anchor-hold Day 0 |
| L-CGO | NEW (stock-price-specific, analog of macro FRED gate + alert-engine Telegram gate) | n/a — proactive | §CGO Boundary Clause — `mattn/go-sqlite3` must not leak into primitive/module/sandbox; sandbox builds under `CGO_ENABLED=0`; Phase-0 R-CGO confirmation gate |

Full carry-over chain: macro `01-lessons-from-ta-pilot.md` + this charter §CGO Boundary Clause.

---

## Constraints (binding from Day 0)

- **L84 explicit-file staging** — `git add <path>` per file. NEVER `git add -A` or `git add .`.
- **No `--force`, no `--no-verify`, no `--no-gpg-sign`** — ever. Hook fails → fix + NEW commit.
- **No `git push` of source/CI changes** — local-only. User owns push (CI billing block).
- **All work on `main`** — NO branches (CLAUDE.md).
- **SSOT: one active dispatch per task** — no shadow dispatches, no orphaned signals.
- **Anchor discipline** — once a commit is the frozen anchor for a contract (`.golangci.yml` freeze, pre-revert tags), no retag, no rewrite, no push.
- **§4.5 matrix-authorship rule** — `decisionMatrix.{speed,trust,scale}` populates ONLY by PO, ONLY after 12/12 G-goals reach terminal grade, ONLY in atomic commit with the last G-goal flip + verdict signature. Block stays present-but-empty (`TBD`) the entire pilot until then.
- **DORMANT/CLOSED freeze** — do NOT touch `apps/technical-analysis/**`, `apps/macro-indicators/**` (dormant source), `pilot-status.json`, `pilot-status-macro-indicators.json` (closed SSOTs).
- **CGO boundary** — `mattn/go-sqlite3` only in infra, wired only from `cmd/server/main.go`; never in primitive/module/sandbox.
- **System facts via jq on `system-map.json`** — never hardcode port/zone/agent.
- **Notebook + signal hygiene** — PO notebook overwritten end of cycle (≤200 lines); signals `{agent}-{ISO}.json`.

---

## Decision Matrix (§4.5)

Applied MECHANICALLY by PO after 12/12 terminal. Block stays empty (`TBD`) until then.

| Question | YES criteria | NO criteria |
|---|---|---|
| **Speed** — fewer fix loops vs baseline? | G10 confirmed ≤2 cycles vs baseline AND G11 regression alarm fired (proving it works) | G10 not met OR alarm never fired |
| **Trust** — user can verify pilot quality from dashboard alone? | G9 confirmed (Path A verbal YES OR Path B Playwright PASS) AND G8 red/green honesty proven | G9 not confirmed by either path OR G8 false-green found |
| **Scale** — worth doing for next microservice? | All 12 goals YES AND both tracks A+B delivered within 6 sprints | ≥2 goals still NO at deadline OR overran 6 sprints |

**Derivation (mechanical, per SI-1 schema `_criteria_source`):** Speed = G10 ∧ G11. Trust = G9 (PASS, not PARTIAL) ∧ G8. Scale = all-12 YES ∧ sprintCount ≤ 6.

**Outcome:**
- **3 YES** → `scale` → continue fleet to pilot 4 (kinh-dich, gated on SI-3) per ratification Decision 1.
- **2 YES** → `rescope` (max 2 additional sprints; do not start pilot 4 until 3 YES).
- **0-1 YES** → `stop-MVR`. Architect writes MVR brief within 1 sprint.

**Pilot review meeting:** PO schedules within 1 sprint of all 12 goals reaching terminal state.

---

## Status Tracking

Pilot goal state tracked in `docs/data/pilot-status-stock-price.json` (NEW file, instantiated from SI-1 schema `docs/data/pilot-status-schema.json`). Separate from `pilot-status.json` (FROZEN TA) and `pilot-status-macro-indicators.json` (CLOSED macro) — both untouched.

**Valid goal states:** `TBD | IN-PROGRESS | YES | NO | PARTIAL | DEFER`
**Valid top-level status:** `ACTIVE | DONE | FAILED` (L3 — no operational labels)
**Valid phase status:** `OPEN | CLOSED` (phase0), `NOT-STARTED | ACTIVE | READY_FOR_CLOSE_GATE | APPROVED | ARCHIVED` (phase1), `NOT-STARTED | AWAITING-PLAN | OPEN | CLOSED` (phase2).

Pilot is DONE when all 12 goals are YES and decisionMatrix is terminal.

---

## Phase Skeleton

| Phase | Goal | Duration | Owner |
|---|---|---|---|
| **Phase 0** | Brownfield + CGO-feasibility confirm + agent/flow + pilot-status SSOT + bug-inventory entry + phase-1 task plan | 1 sprint | architect + system-auditor + agent-father (+ dev-stock-price CGO confirm) |
| **Phase 1** | Go scaffold: `cmd/sandbox` (CGO_ENABLED=0) + first primitive extracted + module stub + dashboard stub + sandbox green | 2-3 sprints | dev-stock-price |
| **Phase 2** | Remaining primitives + module wiring + composition root + `.golangci.yml` fence + dashboard + G5 rewire + SI-2 fleet index + G1-G12 chain | 2-3 sprints | dev-stock-price + qa + po |
| **Phase 3** | Closure: 12/12 terminal + decisionMatrix populated atomically + charter CLOSES | atomic | po |

**Total:** 6 sprints (hard deadline 2026-07-04).

---

## Amendments

(None at v1 — lessons L1-L7 + L-CGO baked in. Future amendments require PO sign-off + signal trail.)
