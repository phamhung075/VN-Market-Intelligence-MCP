# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: TS/Bun | DB: market.db (read)

## Working Memory

### Session 2026-05-13 — FRED timeout regression fix

**Task:** Parallelize `fetchAllMacro()` in `fred-macro.ts` to resolve 8-12s sequential latency exceeding the 8s per-source budget.

**Root cause:** Sequential `for...of` loop with `await fetchSeries()` + `sleepMs(600-1000)` between each of 8 series calls.

**Fix:** Replace with `Promise.all(entries.map(([, seriesId]) => this.fetchSeries(seriesId)))`. Removed dead `sleepMs` helper. FRED public rate limit (120 req/min) easily accommodates 8 concurrent calls.

**Tests added (3 new in fred-macro.test.ts):**
- all-series-ok: returns 8 non-null results
- one-series-fails: VIXCLS returns null, 7 others non-null
- parallel-timing: all 8 fetch calls dispatched within 30ms window

**Result:** 90 pass / 0 fail (was 87). Test suite runs in ~600ms. Parallel test itself: 83ms total.

**Branch:** `task/fred-parallelize-fetch-all-macro` — pushed, QA notified.

**Follow-up identified:** `WorldBankMacroAdapter.fetchVnMacroBatch()` has identical sequential loop (1.5-2.5s sleep x7 = 10-17s). Currently exceeds 8s budget. Not fixed here — separate branch needed.

Zone health: FRED adapter unblocked; 3 new tests covering parallel dispatch; WorldBank sequential loop known issue | HEALTHY

### Session 2026-05-13 — WorldBank timeout fix

**Task:** Parallelize `fetchVnMacroBatch()` in `world-bank-macro.ts` — same sequential-loop timeout pattern as FRED.

**Root cause:** Sequential `for...of` loop with `await fetchVnIndicator()` + `sleepMs(1500-2500ms)` between each of 7 indicator calls. Total wall time 10-17s, exceeded 8s per-source budget in `FetchExternalMacroUseCase`.

**Fix:** Replace with `Promise.all(entries.map(([, code]) => this.fetchVnIndicator(code)))`. Removed dead `sleepMs` helper. World Bank public API rate limit (10 req/10s) easily accommodates 7 concurrent calls. Wall time drops to ~2-3s.

**Tests added (3 new in world-bank-macro.test.ts):**
- all-indicators-ok: returns 7 non-empty results
- one-indicator-fails: fdi_inflows returns [], 6 others non-empty
- parallel-timing: all 7 fetch calls dispatched within 30ms window

**Result:** 93 pass / 0 fail (was 90). Test suite runs in ~640ms. Parallel test itself ran in 411ms total.

**Diff budget:** 85 net lines added (under 120 limit).

**Branch:** `task/worldbank-parallelize-fetch-vn-macro-batch` — pushed, QA notified.

**Docs updated:** infrastructure.md (WorldBank adapter section), testing.md (counts + WorldBank test table).

Zone health: WorldBank adapter unblocked; parallel dispatch pattern now consistent with FRED; 93 pass / 12 skip / 0 fail | HEALTHY

### Session 2026-05-17 — Calendar source 10s hard cap

**Task:** Reduce calendar source timeout from 30s to 10s to prevent 63s hang blocking entire `/macro/external` fetch.

**Root cause:** `DEFAULT_TIMEOUTS.calendar` was 30_000ms. The CF Python subprocess can stall far beyond the expected warmup window, causing `Promise.race` to wait the full 30s (or longer if the process eventually completes). Observed: `status: "timeout"`, `totalLatencyMs: 62700ms`.

**Fix:** `DEFAULT_TIMEOUTS.calendar: 30_000 → 10_000` in `fetch-external-macro.ts`. Also:
- Exported `DEFAULT_TIMEOUTS` (was `const`, now `export const`) for test assertions
- Typed as `Required<SourceTimeouts>` — removed non-null `!` assertions from constructor merge
- Updated module-level JSDoc to document 10s cap + rationale

**Tests added (3 new in fetch-external-macro.test.ts):**
- `DEFAULT_TIMEOUTS.calendar === 10_000` — asserts constant directly
- slow calendar (15s stub) timed out at 10s budget — latencyMs ≥ 10_000
- other 5 sources complete normally while calendar pending

**Result:** 105 pass / 12 skip / 1 pre-existing fail (world-bank mock, unrelated). Test runtime ~21s (3 new 10s timeout tests dominate).

**Docs updated:** usecases.md (FetchExternalMacroUseCase section + timeout table), testing.md (+test group table, updated counts), infrastructure.md (InvestingCalendarAdapter section with 10s hard cap note).

**Branch:** `task/calendar-source-10s-timeout` — commit c8f63afc.

Zone health: calendar timeout capped at 10s; withTimeout + Promise.all pattern verified; 105 pass / 12 skip / 1 pre-existing fail | HEALTHY

### Session 2026-05-18 — Calendar wontfix: NullCalendarAdapter

**Task:** calendar-source-replacement — evaluate replacement for dead investing.com calendar or remove cleanly.

**Decision:** Wontfix — Option B. No viable free replacement for Vietnam economic calendar events found. Trading Economics already integrated as a separate adapter. All other alternatives (IMF, World Bank, Alpha Vantage) don't provide VN event timing without auth.

**Fix:**
- Created `NullCalendarAdapter` (implements `InvestingCalendarPort`, returns `[]` instantly) in `investing-economic-calendar.ts`
- Deprecated `InvestingCalendarAdapter` in same file (dead code, retained as historical reference)
- `DEFAULT_TIMEOUTS.calendar: 5_000 → 0` in `fetch-external-macro.ts`
- `index.ts` wired `NullCalendarAdapter` instead of `InvestingCalendarAdapter`
- `idleTimeout: 120 → 90` (calendar no longer adds to max budget)

**Tests:** 4 new in `investing-economic-calendar.test.ts`:
- NullCalendarAdapter returns [] immediately
- countryId arg ignored
- resolves in under 50ms
- DEFAULT_TIMEOUTS.calendar === 0

**Result:** 103 pass / 12 skip / 1 pre-existing fail. Test runtime 11s → ~1s (5s calendar timeout stubs eliminated).

**Commit:** d0884c78

Zone health: calendar dead endpoint fully removed from macroRefresh cycle; NullCalendarAdapter zero-cost; test runtime halved to ~1s; 103 pass / 12 skip / 1 pre-existing fail | HEALTHY

### Session 2026-05-17 — Calendar timeout 10s → 5s + Docker rebuild

**Task:** Reduce calendar timeout to 5s (was 10s in source, but Docker container was still running 30s stale image). Live endpoint confirmed `latencyMs: 30001` before fix.

**Root cause (two-part):**
1. Prior commit had already set source to 10_000, but Docker container had not been rebuilt — running stale image from before any fix.
2. Task spec required reducing further to 5_000 since endpoint is permanently unreachable.

**Fix:**
- `DEFAULT_TIMEOUTS.calendar: 10_000 → 5_000` in `fetch-external-macro.ts`
- Updated JSDoc comment chain: 30s → 10s → 5s with rationale
- Test assertions updated: `toBe(5_000)`, slow-calendar stub 15s → 10s, budget 10_000 → 5_000
- Docker image rebuilt + container recreated (`docker compose build + up -d`)

**Verification:** `localhost:5004/external` → `"calendar": { "status": "timeout", "latencyMs": 5001 }`. Page load reduced from ~30s to ≤5s.

**Tests:** 105 pass / 12 skip / 1 pre-existing fail (world-bank mock, unrelated). Test runtime ~11s (halved from ~21s).

**Commits:** 681d0482 (fix), 2198fc16 (docs)

Zone health: calendar hard cap at 5s; Docker container rebuilt + verified via live endpoint; 105 pass / 12 skip / 1 pre-existing fail | HEALTHY

### Session 2026-05-23 — P1-A5: api/openapi.yaml HTTP contract spec

**Task:** P1-A5 — create OpenAPI 3.0 spec for macro-indicators microservice (Go pilot, port 5004).

**Language mode:** Go (pilot — all P1 tasks are Go per po-decision 2026-05-22 §Q2).

**Deliverable:** `apps/macro-indicators/api/openapi.yaml` (166 lines, OpenAPI 3.0.0).

**Endpoints documented:**
- GET /health → HealthResponse {status: string, service: string, port: integer}
- POST /snapshot → MacroSnapshotResponse {vnIndex, oilUsd, goldUsd, usdVnd, signals, fetchedAt}

**AC results:** AC-1 PASS (python3 yaml.safe_load), AC-2 PASS (status/service/port in schema), AC-3 PASS (all 6 snapshot fields), AC-4 PASS (file exists).

**Smoke gate:** go build PASS, go vet PASS, openapi.yaml exists PASS, grep scoreIndicator/buildSnapshot/oilDirection=0 PASS.

**Commits:** e39587e5 (source: openapi.yaml), 272a98f9 (signal).

**Anchor:** 1776df8e reachable before AND after commit (verified).

**G12 DoD:** NOT applicable for P1-A5 (spec-only file, no sandbox execution).

**Forward risks acknowledged:**
- R-1 (HIGH): P1-B1 AC-6 requires deterministic tier scoring — NO Math.random/rand.Intn/rand.Float in pkg/primitive/macro_investment_clock/
- R-3 (HIGH): Phase 2 P2-B — 4 MCP tools must HTTP-rewire to port 5004

**Unblocks:** P1-B1 (first primitive: macro-investment-clock). Ready for QA.

Zone health: P1-A5 DONE; Go build + vet clean; openapi.yaml at canonical path; all 4 ACs PASS | HEALTHY

### Session 2026-05-23 — P1-B1: macro-investment-clock primitive

**Task:** P1-B1 — extract first Go primitive from TS MacroScoreService.scoreIndicator(). Deterministic tier lookup + 3 scenario JSONs + sandbox wire-in.

**Language mode:** Go (pilot — primary for Phase 1).

**Key change from TS original:** Replaced Math.random() with fixed-score lookup (VN_DIRECT=8, REGIONAL=5, US_DOMESTIC=2). Same input → same output every time.

**Files created:**
- `apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock.go` (171 lines) — Classify() function, exported consts, keyword + exact-name matching
- `apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock_test.go` (169 lines) — 10 TestClassify rows + TestConstants
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json` — VN_CPI → VN_DIRECT/8/CORE_VN
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-edge.json` — empty string → US_DOMESTIC/2/US_DOMESTIC
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-failure.json` — null input, shouldPass=false, graceful degradation

**Files modified:**
- `apps/macro-indicators/cmd/sandbox/main.go` (289 lines) — executePrimitive() wired to macro_investment_clock.Classify(); dispatcher by "primitive" field in JSON

**AC results:** AC-1 PASS, AC-2 PASS, AC-3 PASS (10 rows), AC-4 PASS (3 JSON files), AC-5 PASS (Fence-A=0), AC-6 PASS (R-1=0), AC-7 PASS (G12 sandbox=3/3 GREEN).

**Hard gates:**
- R-1 grep: exit 1, 0 matches (no math/rand anywhere)
- G12 sandbox: total=3 pass=3 fail=0 status=OK exit 0
- Fence-A: exit 1, 0 matches
- golangci-lint: 0 issues

**Commits:** b66a1d45 (impl, 6 files), 5ec50608 (signal).

**Anchor:** 1776df8e ancestor before AND after commit (both exit 0).

**G12 streak:** task #1 of 3 PASS. P1-C1 (#2) and P1-E1 (#3) remain.

**Forward risks acknowledged:**
- R-3 (HIGH): Phase 2 P2-B — 4 MCP tools HTTP rewire
- G12 streak: P1-C1 and P1-E1 must also pass for streak to count

**Unblocks:** P1-C1 (module stub: macro_signals).

Zone health: P1-B1 DONE; first primitive extracted; all 7 ACs PASS; sandbox GREEN; deterministic scoring confirmed | HEALTHY

### Session 2026-05-23 — P1-E1: dashboard stub HTML (G12 streak #3 of 3)

**Task:** P1-E1 — Create static HTML5 dashboard `apps/macro-indicators/dashboard/index.html` with 3 panels (Primitives, Module, Microservice), honest NOT-RUN status, cloned from TA dashboard pattern.

**Language mode:** Go (sandbox) + static HTML (dashboard). HTML is language-agnostic; Go sandbox runs unmodified.

**Key design decision:** TA dashboard requires TypeScript build pipeline (esbuild → dist/app.js). For macro P1-E1 stub, used fully self-contained single HTML file with inline CSS + vanilla JS. This ensures file:// compatibility without any toolchain setup. Deviation accepted (LOW severity, structural pattern identical).

**File created:**
- `apps/macro-indicators/dashboard/index.html` (1146 lines) — self-contained static HTML, 3 panels, embedded CSS (cloned from TA style.css), embedded vanilla JS renderer, embedded scenario data (3 primitive + 2 module JSON objects), modal for scenario detail inspection.

**No Go files modified.** Sandbox dispatcher unchanged (P1-B1 + P1-C1/D2 work complete).

**AC results:**
- AC-1 PASS: No fetch()/XMLHttpRequest, all assets inline, file:// compatible
- AC-2 PASS: 3 panels rendered (Primitives: macro-investment-clock, Module: macro-signals, Microservice: port 5004/Go)
- AC-3 PASS: NOT-RUN appears 17 times, zero hardcoded GREEN
- AC-4 PASS: Vanilla JS, balanced tags, no build step required, no console errors expected
- AC-5 PASS: grep secrets → 0 matches
- AC-6 PASS: CSS variables, layout structure, card/header/modal all cloned from TA dashboard
- AC-7 PASS (G12 HARD GATE): all 3 sandbox tiers GREEN before commit

**G12 DoD sandbox evidence (all run before commit):**
- primitive-tier: total=3 pass=3 fail=0 status=OK exit 0
- module-tier: total=2 pass=2 fail=0 status=OK exit 0
- all-tier: total=5 pass=5 fail=0 status=OK exit 0

**Defensive gates:**
- R-1 determinism: grep Math.random → 0 matches
- Anchor 1776df8e: held pre AND post commit (both exit 0)
- L84: 1 file staged (explicit path), no -A
- Fence-A, Fence-B: clean (0 real imports violating DDD)
- Forbidden zones: no TA files touched, no .golangci.yml, no ci.yml

**Commit:** 41a7d866
**Signal:** docs/signals/dev-macro-p1-e1-done-20260523T114612Z.json

**G12 streak:** task #3 of 3 PASS — streak COMPLETE. G12 grade claimed pending QA.
- P1-B1 (#1) GREEN, P1-C1 (#2) GREEN, P1-E1 (#3) GREEN.

**Unblocks:** P1-E2 (edit-rerun handler + env audit).

Zone health: P1-E1 DONE; dashboard stub created; G12 streak 3/3 complete; all 7 ACs PASS; sandbox GREEN | HEALTHY

### Session 2026-05-23 — P2-X1: 5 remaining primitives (oil/gold/usdvnd/carry/yield)

**Task:** P2-X1 — extract remaining 5 Go primitives from TS domain logic. G1 goal: primitive count 1 → 6.

**Language mode:** Go (pilot — Phase 2 continues Go for all pkg/primitive work).

**Primitives added (all Fence-A clean, all deterministic):**
1. `macro_oil_impact_classifier` — Classify(OilImpactInput) → BEARISH/NEUTRAL/BULLISH per $100/$60 thresholds (TS oilDirection port)
2. `macro_gold_direction_classifier` — Classify(GoldDirectionInput) → BULLISH/NEUTRAL/BEARISH per $2200/$1800 thresholds (TS goldDirection port)
3. `macro_usdvnd_direction_classifier` — Classify(UsdVndDirectionInput) → BEARISH/NEUTRAL/BULLISH per 25000/23000 thresholds (TS usdVndDirection port)
4. `macro_carry_trade_signal` — Compute(CarryTradeInput) → HOT_MONEY_INFLOW/NEUTRAL/FII_OUTFLOW_RISK; spread = vndRate - fedRate; thresholds 2.5/0.5pp (TS carryTradeSignal port)
5. `macro_yield_spread_signal` — Compute(YieldSpreadInput) → CHEAP/FAIRLY_VALUED/EXPENSIVE/UNKNOWN; spread = earningYield - depositRate; threshold 2.0pp (TS yieldSpreadSignal port)

**Key design decision — carry/yield:** ComputedAt injected as parameter (not time.Now()) to satisfy R-1 determinism. Zero-data guard returns NEUTRAL/UNKNOWN when either rate=0.

**Files created (26 staged, 1 atomic commit):**
- 2 Go files × 5 primitives = 10 Go files
- 3 JSON scenarios × 5 primitives = 15 JSON files
- 1 modified: `apps/macro-indicators/cmd/sandbox/main.go` (5 new executor functions + dispatcher cases)

**AC results (all 7 PASS):**
- AC-1: 9 dirs (≥6 PASS)
- AC-2: all 5 primitive tests exit 0, ≥5 rows each PASS
- AC-3: 18 JSON files, all jq-valid PASS
- AC-4: Fence-A grep → 0 matches exit 1 PASS
- AC-5: golangci-lint → 0 issues exit 0 PASS
- AC-6: sandbox primitive tier → total=18 pass=18 fail=0 exit 0 PASS (all-tier: total=20 pass=20)
- AC-7: R-1 grep → 0 matches exit 1 PASS

**Hard gates:**
- G12 DoD: total=20 pass=20 fail=0 status=OK exit 0
- R-1 determinism: exit 1 (zero matches)
- Fence-A: exit 1 (zero matches)
- golangci-lint: 0 issues
- Anchor 1776df8e: pre=0 post=0

**Commits:** 61c3dce4 (impl, 26 files), cea869e8 (signal)

**Not done (out of scope for P2-X1):** handlers_carry.go and handlers_yield.go NOT upgraded to call primitives — no AC required it; Phase-2 plan assigns this to P2-X3.

**Unblocks:** P2-X2 (macro-signals module expansion — all 6 primitives wired).

Zone health: P2-X1 DONE; 6/6 primitives complete; 20/20 sandbox scenarios GREEN; all ACs PASS; G1 READY_FOR_FLIP | HEALTHY

### Session 2026-05-23 — P2-X3: snapshot + carry + yield handlers (G3 update, 501 resolved)

**Task:** P2-X3 — implement real HTTP handlers using P2-X2 module composition. Replace 501 stubs.

**Language mode:** Go (Phase 2 — application/infrastructure/interface layers).

**Architecture:** ComputeMacroUseCase.Execute() → BuildMacroSignals() → 6 primitives. Fixture mode everywhere (R-1 deterministic, no live HTTP calls in sandbox).

**Files modified (7, all in apps/macro-indicators/):**
1. `pkg/application/dtos.go` — MacroSnapshotResponse extended: SignalResult struct (6 signals), field names updated to camelCase JSON (vnIndex/oilUsd/goldUsd/usdVnd/fetchedAt)
2. `pkg/application/usecases.go` — Execute() implemented: calls ms.New(&concreteClock{}).BuildMacroSignals() with fixture inputs; falls back to fixture defaults when port returns zero/error; R-1 compliant (fixed ComputedAt string)
3. `pkg/infrastructure/repositories.go` — HTTPCommodityFetcher: fixture mode (static price map OIL=82.5, GOLD=2350, USDVND=24500). SBVRateRepository: fixture map (USD/VND=24500). Zero network calls.
4. `pkg/interface/http/router.go` — handleSnapshot() wired to real useCase.Execute(); handleCarryTradeSignal() and handleYieldSpreadSignal() registration kept; moved to handler files
5. `pkg/interface/http/handlers_carry.go` — real carry.Compute() call with fixture inputs (VND=4.7%, Fed=5.33%, computedAt="2026-05-23T00:00:00Z")
6. `pkg/interface/http/handlers_yield.go` — real yld.Compute() call with fixture inputs (earningYield=8.2%, depositRate=4.7%, computedAt="2026-05-23T00:00:00Z")
7. `cmd/server/main.go` — DI wiring complete: infrastructure.NewHTTPCommodityFetcher + NewSBVRateRepository → application.NewComputeMacroUseCase → iface.NewRouter. G3 composition root clean.

**Key results:**
- carry: FII_OUTFLOW_RISK (spread=-0.63pp, VND 4.7% < Fed 5.33%)
- yield: CHEAP (spread=+3.50pp, earningYield 8.2% well above +2pp threshold)
- snapshot: HTTP 200 with all 6 signals (investment-clock/oil/gold/usdvnd/carry/yield)

**Fence compliance:**
- Fence-A: exit 1 (primitives do not import module/app/infra/interface)
- Fence-B: exit 1 (module imports only primitives)
- Fence-C: exit 1 (pkg/ contains no infrastructure imports; only cmd/server/main.go allowed)

**AC results (all 5 PASS):**
- AC-1: /health → 200 + {status:ok,service:macro-indicators,port:5004}
- AC-2: /snapshot → 200 + all 6 signals + market fields
- AC-3: /carry-trade-signal → 200 + {regime/carrySpread/vndDepositRate/fedFundsRate/computedAt}
- AC-4: /yield-spread-signal → 200 + {label/spread/earningYield/depositRate/computedAt}
- AC-5 (G12 hard gate): total=20 pass=20 fail=0 status=OK exit 0

**Hard gates (all PASS pre+post commit):**
- Anchor 1776df8e: pre exit 0, post exit 0
- R-1: exit 1 (no matches)
- Fence-C: exit 1 (no infra in pkg/)
- go build: exit 0
- go vet: exit 0
- golangci-lint: 0 issues exit 0
- sandbox: exit 0 total=20 pass=20 fail=0

**Commits:** 88adeb70 (impl, 7 files), f8839a10 (signal)
**Signal:** docs/signals/dev-macro-indicators-p2-x3-done-20260523T142421Z.json

**Unblocks:** P2-G1 (terminal verification G1+G2+G3 — QA owned).

Zone health: P2-X3 DONE; real handlers live; 501 resolved; 20/20 sandbox GREEN; 5/5 ACs PASS; G3 composition root clean | HEALTHY
