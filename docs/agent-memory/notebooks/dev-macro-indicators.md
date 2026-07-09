# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

---

## Session 2026-07-09 round 2 (FACTORY-MACRO-split-repositories — 905L god-file split, live-deployed → ops)

**Task:** BOUNDED-1 idle-capacity pickup. Split `pkg/infrastructure/repositories.go` (905L, 6 adapters) into per-adapter files; factor the repeated "open ro → defer Close → fetch" shape into a shared `openReadOnly` helper.

**Split:** repositories_fixture.go (110L, HTTPCommodityFetcher+SBVRateRepository) / repositories_market_index.go (159L, SQLiteMarketIndexRepository) / repositories_commodity.go (283L, SQLiteCommodityRepository+SQLiteCommodityHistoryRepository) / repositories_sbv_rate.go (141L, SBVRateSQLiteAdapter) / repositories_carry_yield.go (335L, CarryYieldInputsSQLiteAdapter + shared `openReadOnly`). Matches spec's own 5-file naming exactly (6 adapters → 5 files because the 2 fixture stubs share one file and the 2 commodity adapters share one file). 4/5 files >120L — size-justification headers added.

**DRY refactor:** `openReadOnly` promoted from a private `CarryYieldInputsSQLiteAdapter` method to a package-level `openReadOnly(dbPath string) (*sql.DB, error)` function, reused by all 5 live SQLite adapters — eliminates 5x duplicated `sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", ...))` inline blocks. Used `sed` line-range extraction from the original file (not retyped) to guarantee every `//nolint:nilerr`, staleness bound, and query string transferred byte-for-byte; only the sql.Open boilerplate was hand-edited to call the shared helper.

**Parity verification (beyond `go test`):** Built a throwaway harness (`cmd/verify_repos_tmp`, never committed) seeding a real fixture SQLite DB and calling the actual constructors + all 9 port methods through the real `DB_PATH` env wiring — this specifically exercises the refactored `openReadOnly` path that unit tests (which inject `*sql.DB` directly) don't touch. Ran post-split, `git stash`'d to pre-split tree, ran again: VN-Index/prev-session, commodity current/prev, SBV rate, deposit rate, Fed funds rate+source-date, earning yield all byte-identical (only diff was the harness's own wall-clock seed timestamp between runs). `go build`/`go vet`/`go test`/`golangci-lint` all GREEN, 0 issues.

**Docker routing:** Confirmed via grep — `cmd/server/main.go` imports `pkg/infrastructure` and constructs all 6 adapter types from this file; `Dockerfile` builds `./cmd/server/`. This IS the live-deployed macro-indicators service (unlike the sibling `cmd/sandbox` split above). Routed `next_agent: ops` for the standard Docker Microservice Code-Change Close Gate (rebuild/health/SHA-gate/curl) — did NOT rebuild/deploy myself.

**Commit:** c3962350d (6 files, +1026/-905). Decision journal: STEP dev-macro-indicators-S4.
Zone health: HEALTHY (build/vet/test/lint all green, served values verified byte-identical pre/post-split) | FACTORY-MACRO-split-repositories → REVIEW (next_agent: ops)

---

## Session 2026-07-09 (FACTORY-MACRO-split-sandbox — 831L god-file split + 6-comparator collapse)

**Task:** BOUNDED-1 idle-capacity pickup. Split `cmd/sandbox/main.go` (831L, no header) into 4 files; collapse the 6 structurally-identical `executeMacroXxx` comparators into one helper; add dispatch-logic test coverage (zero pre-existing).

**Split:** main.go (103L, flags+loop) / discovery.go (86L, Scenario+findRepoRoot+discoverScenarios) / primitives.go (366L, 6 primitive shapes+executors+dispatcher+`compareFields` helper) / module.go (250L, macro_signals shapes+concreteClock+2 executors+2 dispatchers). primitives.go/module.go >120L — size-justification headers added (6-primitive / 2-scenario-shape cohesion, shared same-package helper). Collapsed all 8 diff-builders (6 primitive + module's batch-loop + build) into `compareFields(label, []fieldDiff)`; `formatVal` preserves original `%q`/`%v` formatting so FAIL "reason" text is byte-identical pre/post-split.

**Root-cause fix mid-task:** `apps/macro-indicators/.gitignore`'s unanchored `sandbox` pattern (meant for the compiled binary) also matched the `cmd/sandbox/` directory — silently excluded all 4 new files from git. Anchored to `/sandbox`.

**Parity verification (not just `go test`):** Used `git stash` to get a clean pre-split tree, ran the sandbox binary directly before AND after against the full 20-scenario fixture suite + 2 deliberately-forced-mismatch probes (primitive-tier + module-tier). All 3 runs byte-identical (msg/scenario/reason, timestamps excluded) incl. exit codes (0 for PASS, 1 for both forced-FAIL). `go build`/`go vet`/`go test`/`golangci-lint` all GREEN. Net production LOC delta only -26L (831→805, comparator bodies shrank ~360L→~150L, offset by 4x file-header + duplicated-import split overhead) — short of the router's "~-400L expected" a-priori estimate; flagged explicitly, not silently under-delivered (all actual DoD bullets met).

**Docker routing:** `rebuild_required: true` was flagged but `Dockerfile` only builds `./cmd/server/` — `cmd/sandbox` is a standalone CLI tool never compiled into the deployed image. Routed `next_agent: qa` directly, no ops/Close Gate.

**Commit:** 60c9a880a (6 files, +865/-735). Decision journal: STEP dev-macro-indicators-S3.
Zone health: HEALTHY (Go service unaffected, sandbox parity confirmed) | FACTORY-MACRO-split-sandbox → REVIEW (next_agent: qa)

---

## Session 2026-06-15 (FIX-NSO-TRADE-VALUE-SCALE — column/unit/total-row misparse fix)

**Task:** Fix implausible `get_vn_trade_balance` values: import 212000mn, export 74000mn, balance -138000mn.

**RECON findings (excelize.GetRows probe on cached NSO Excel 646KB 2026-06):**
- Old parser read `col2` (Lượng/quantity in nghìn tấn) as the monetary value. For "Hạt điều" row (col0 blank, col2=74 nghìn tấn cashews), excelize formatted as "74" → ParseVNNumber → 74 → ×1000 = 74000 M USD (the wrong export value).
- Actual column layout: col3=monthly Trị giá (M USD), col6=YTD Trị giá (M USD), col9=YoY% (std float)
- Total row label = "TỔNG TRỊ GIÁ" in col0 (NOT blank col0 as assumed)
- Unit = Triệu USD (already M USD) — the ×1000 multiplication was wrong
- YoY% column uses standard decimal float "118.0" (NOT VN format) — ParseVNNumber("118.0") strips period → "1180" (wrong); fix uses strconv.ParseFloat
- HS rows: label in col1 (sub-label), after "MẶT HÀNG CHỦ YẾU" section header
- "MẶT HÀNG CHỦ YẾU" header row has only 1 col in GetRows → must check BEFORE minTradeCols guard

**Files modified (2):**
- `pkg/infrastructure/parsers_vmt_trade.go` — New column constants, total row by "TỔNG TRỊ GIÁ", plausibility guard
- `pkg/infrastructure/parsers_vmt_trade_test.go` — Corrected anchors, makeTradeRow helper, 3 plausibility guard tests (14 tests total GREEN)

**Commit:** 7a3da0df | Zone health: trade parser fully operational | HEALTHY

---

## Session 2026-06-21 (DSI-MACRO-PHANTOM-STALE-GUARD — DSI-INV-1 staleness gate)

**Task:** Fix phantom stale macro values (WTI=95.5, dow_jones=23750) served as current via tracked_indicators 48h window in buildMacroSection (mcp-server domain).

**Key decisions:**
- Tightened tracked_indicators freshness from 48h to 4h in `buildMacroSection` (domain/services/marketContextBuilder.ts).
- R-2 SQLite datetime string comparison trap: ISO-8601 'T' separator sorts after SQLite space separator. Fixed via epoch-seconds: `(strftime('%s','now') - strftime('%s', extracted_at)) < 14400`.
- Added `listTrackedIndicatorsFromDb(db)` to commodityTracker.ts — DB-injectable variant with `isStale` boolean.

**Tests:** 6 new (GUARD-1..6 all GREEN) + 13426 existing suite pass / 0 regression.
**Commit:** 3280d82a | Zone health: DSI-INV-1 staleness gate operational | HEALTHY

---

## Session 2026-06-27 (VMT-3a-MACRO-INDICATORS-PMI — BLOCKED assessment)

**Task:** Ship S&P Global VN Manufacturing PMI + MA3 in POST /macro-indicators handler.

**Assessment result: BLOCKED**

**Source probe (pmi.spglobal.com via VPS 125.212.251.27:3128):**
- List page `https://www.pmi.spglobal.com/Public/Release/PressReleases?language=en` → 87725B HTML, accessible via VPS. Shows ONLY current month (June 2026) releases — 167 items, all Jun 01 2026. No historical archive via URL params (?year=2026&month=05 returns same 87725B).
- Detail pages `https://www.pmi.spglobal.com/Public/Home/PressRelease/{uuid}` → HTTP 202 + 0 bytes (async page generation requiring JavaScript). Direct + VPS both return 202. Initial probe got PDF (CDN cache hit, NOT reproducible — subsequent attempts return 202).
- No PMI time series in any market.db table. `macro_indicators.manufacturing_pmi` is UPSERT scalar (single row per country, no history). `tracked_indicators` has zero PMI rows.

**Hard blockers:**
1. Detail pages require JavaScript async execution — Go HTTP client (direct or VPS) cannot satisfy; always 202 + 0B
2. List page shows current month ONLY — prior month UUIDs not discoverable (needed for MA3 lookback)
3. MA3 needs 3 monthly prints — no in-zone historical source satisfies this
4. No free unauthenticated S&P Global PMI API exists

**Dependency needed:** Flaresolverr/headless-browser for pmi.spglobal.com detail pages OR paid S&P Global API key; PLUS ops fetch-recon for 2-month backfill of prior UUIDs.

**No code written, no files modified, no tests, no commit (BLOCKED — assessment only).**

Zone health: 6 active endpoints healthy (IIP/trade/BOP/CPI/liquidity/snapshot); VMT-3a requires external dependency before implementation | HEALTHY

---

## Session 2026-06-29 (P0-3-OMO-CURVE — OMO short-rate curve + liquidity stress)

**Task:** Extend `get_vn_liquidity_state` additively: parse SBV OMO per-tenor winning-rate + member-ratio columns, derive implied short-rate by tenor, net_injection_5d, liquidity-stress label.

**Key decisions:**
- OMO parser (`parsers_vmt_sbv_interbank_omo.go`): col[1] members X/Y + col[3] winning rate now parsed per row. Added `parseTenorDays`, `parseOMORate`, `parseMembersXY` helpers. VN decimal comma normalization ("4,75" → 4.75). Zero-rate rows excluded from implied rates.
- Domain service (`services_vmt_omo.go`): `ComputeImpliedShortRates` buckets 7/14/28d + cross-tenor avg. `DeriveStressResult` strict boundaries (`< -20000` DRAIN, `> +20000` EASY, exactly ±20000 → NEUTRAL). Score nil when daysInWindow < 5.
- Persistence: `sbv_omo_daily` in `macro_indicators.db` (MACRO_DB_PATH env). ON CONFLICT(auction_date) DO UPDATE — idempotent (NFR-P03-3). DD/MM/YYYY → YYYYMMDD `substr` trick for correct SQLite ordering.
- `OMODailyRepository` interface in application (Fence-B). `SQLiteOMODailyRepository` in infrastructure (Fence-C via main.go only).
- `LiquidityStateResponse` additive: `OMOCurve *OMOCurveDTO` (omitempty). Safe-degrade: nil repo → `computeOMOCurveNoPersist` (rate data without DB).

**New files (8):**
- `pkg/domain/models_vmt_omo.go`, `pkg/domain/services_vmt_omo.go`, `pkg/domain/services_vmt_omo_test.go`
- `pkg/application/dtos_vmt_omo.go`, `pkg/application/usecases_vmt_omo_persist.go`
- `pkg/infrastructure/repository_vmt_omo_daily.go`, `pkg/infrastructure/repository_vmt_omo_daily_test.go`
- `pkg/infrastructure/parsers_vmt_sbv_interbank_omo_p03_test.go`

**Test results:** 11 suites GREEN. G12 sandbox: primitive 18/18, module 2/2 PASS. Fences A/B/C PASS. go vet clean.
**Commits:** cd8cfcc2 (impl) + c17e9f70 (orch REVIEW)
Zone health: HEALTHY | P0-3-OMO-CURVE → REVIEW

---

## Session 2026-07-08 (FACTORY-MACRO-delete-dead-ts-tree — BLOCKED, no deletion)

**Task:** Router-verified precheck said `src/_deprecated/` and `src/infrastructure/scrapers/` are "only referenced by each other" — delete both plus package.json/tsconfig.json/bun.lock/node_modules wholesale (pure-Go service).

**Independent re-verify (mandatory before delete) found a live importer the precheck missed:**
- `src/_deprecated/` — clean, zero external importers (3 Go files reference it only in doc comments, not imports).
- `src/infrastructure/scrapers/` — 9 files OUTSIDE both subtrees import it with resolvable paths: `__tests__/unit/scrapers/*.test.ts` (8) + `__tests__/integration/scrapers/external-macro-live.test.ts` (1), e.g. `import { AdbKidbAdapter } from '../../../src/infrastructure/scrapers/adb-kidb.js'`.
- Confirmed these test files never execute anywhere (CI `.github/workflows/ci.yml` runs Go-lint only for macro-indicators; Dockerfile has zero bun step) — dead in practice, but a live static import nonetheless, and outside the task's own file-deletion list.

**Action per task's explicit STOP clause:** zero files deleted. Board row `FACTORY-MACRO-delete-dead-ts-tree` moved to `task_board.review[]` status=BLOCKED, next_agent=po (scope decision: fold `__tests__/**/scrapers` cleanup into this task or split to a follow-up). `.head` updated in the same orch-apply transform. Decision journal: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-macro-indicators.md` STEP dev-macro-indicators-S1.

**No code changed, no commit of app code** (only board/journal/notebook docs committed).
Zone health: HEALTHY (Go service unaffected) | FACTORY-MACRO-delete-dead-ts-tree → BLOCKED (awaiting po scope call)

---

## Session 2026-07-08 round 2 (FACTORY-MACRO-delete-dead-ts-tree — po FOLD-IN, deletion executed)

**Task:** po expanded scope (STEP po-S2, whole-repo grep zero-external-importer) to fold the entire `__tests__/` tree into the same deletion, plus `docs/architecture/microservice/macro-indicators/testing.md` Go-only reconciliation.

**Independent re-verify (mandatory, whole-repo scope this time) before touching anything:** re-ran grep myself, did not trust po's report alone — confirmed zero live code importer of `_deprecated/`, `infrastructure/scrapers/`, `__tests__/`, or the toolchain files outside the deletion set. 2 residual hits are stale doc-comments (not imports) pre-dating this task: `apps/mcp-server/src/infrastructure/microservices/clients.ts` (JSDoc pointing at an already-nonexistent `src/application/dtos.ts`) and `macro_investment_clock.go` (comment pointing at `src/domain/services.ts`, a path that never had `_deprecated/` in it — pre-existing typo, not one of po's counted 3).

**Deleted:** `src/_deprecated/`, `src/infrastructure/scrapers/`, whole `__tests__/`, `package.json`, `tsconfig.json`, `bun.lock` (git rm), `node_modules/` (untracked/gitignored, `rm -rf`, 32M).

**Also did (po's flagged optional trivial residue):** updated 3 `pkg/primitive/*.go` provenance doc-comments + `scripts/discover-adb-xhr.py` off the deleted `_deprecated/domain/services.ts` / `scrapers/adb-kidb.ts` paths (comment-only, zero behavior change).

**Verification before flip (all green):** `go build ./...`, `go vet ./...`, `golangci-lint run` (0 issues), `go test ./...` (33 files / 8 pkgs / 288 top-level tests / 543 incl. subtests, 0 fail — real counts from `go test -v`, written into rewritten `testing.md`). Fence-A/B/C checked via real `go list -f '{{.Imports}}'` import graph (the raw-grep heuristic in flow/main.md false-positives on English prose like "no cross-layer imports" — noted, not a regression). G12 sandbox: primitive 18/18 PASS, module 2/2 PASS. Env credential audit clean. `docker build` of the Go image clean (verify-only, image removed after, no `up -d` — `rebuild_required: false`, no deploy). `pnpm -r list` clean after `package.json` removal drops macro-indicators out of the workspace.

**Left out of scope (flagged, not touched):** `docs/architecture/microservice/macro-indicators/infrastructure.md` still describes the deleted TS scraper adapters — but it was already 100% describing dead pre-Go-migration code before this task (one cited path, `src/infrastructure/repositories.ts`, never existed on disk even before deletion); po's DoD named `testing.md` only. Recommend a follow-up backlog item for po/architect to rewrite `infrastructure.md`/`domain-model.md`/`usecases.md`/`api-reference.md` against the real Go `pkg/` implementation. Also left untouched per explicit router instruction: stale `bun test` refs in `docs/agents/dev-macro-indicators/init.md:35` and `flow/main.md:43` (agent-father's job, not mine).

**Commit:** 39be5019a (46 files, +110/-5532). Decision journal: STEP dev-macro-indicators-S2. History preserved at git tag `macro-pre-delete` (created round 1).

Zone health: HEALTHY (Go service unchanged, RAW metric path untouched) | FACTORY-MACRO-delete-dead-ts-tree → REVIEW (next_agent: qa)
