# Decision Journal — Sprint CI-RED-RECONCILE · architect

**Sprint goal:** Diagnose CI bun-test 639-failure root cause; produce fix plan for dev-mcp-server
**Agent:** architect
**Started:** 2026-06-08T20:00Z

---

### STEP arch-S1 · architect · 2026-06-08T20:30Z

**task-id:** CI-TEST-ISOLATION-SPIKE
**what-done:** Full root-cause diagnosis of CI job 80171150187 (639 fail, 33 skip). Analyzed CI log, local isolated test runs, sbv.ts implementation, macroTools.ts refactor, bunfig.toml, and 200-run CI history.
**what-considered:**
- (a) Single systemic cascade from shared bootstrap / global beforeAll / DB-init / bunfig preload — rejected: many tests pass in same run (>350 pass including DV-FU6F-B3, Task 1241, Task 242, etc.), bimodal timing rules out single-point failure
- (b) Inverted assertions — rejected: assertion errors show diverse patterns (null != non-null, count=0 != 1, string mismatch, array mismatch) across unrelated domains
- (c) Three independent failure classes — CHOSEN: Class A (injectable seam removed from macroTools + sbv module constant), Class B (code-not-implemented RED tests), Class C (network isolation). Evidence: 1ms failures = pure assertion (no I/O), 5000ms failures = AbortError (network), test-specific errors (wrong string content) = implementation divergence
**why-decision:** Local isolated runs confirm: 028-sbv-rates.test.ts passes 14/14 alone but fails in CI full suite → CI-specific contamination. 1423f-deposit-rate-display.test.ts fails 0/3 both locally AND in CI → implementation divergence (macroTools HTTP proxy ignores injectable params). 1288/1345a all fail at 5055ms → network timeout. These three patterns are mechanically distinct.
**why-change:** PO's original task note described the residual as "~network/timer/DB-integration isolation" — this was partially correct (Class C exists) but significantly underestimated the scope. Class A (injectable seam removal) and Class B (TDD RED as spec) account for the majority of the 639 failures.

**artefacts:**
- `docs/architecture-briefs/2026-06-08-ci-bun-test-mass-failure.md`
- `docs/agent-memory/notebooks/architect.md` (session appended)

**signals-out:** `brief_complete` → PO (CI-BUN-TEST-MULTI-CLASS-FIX, three fix batches, dev-mcp-server zone)

---

### STEP arch-S2 (DJ-GATE-1) · architect · 2026-06-08T21:35Z

**task-id:** SPIKE-CI-COVERAGE-OFF-MECHANISM
**what-done:** Recurring-bug design decision for CI coverage suppression. Ran empirical dry-runs on bun 1.3.13 (local, matches CI `.tool-versions`). Produced impl-ready spec: bunfig.toml `coverage=false`, ci.yml bare `bun test`, `scripts/test-coverage.sh` local-dev recovery, `package.json` `test:cov` script. All 4 files already applied to working tree.
**what-considered:**
- A1 — `coverage=false` in bunfig.toml, bare `bun test` on CI: CHOSEN. Verified: no coverage table, clean exit. Local dev recovery via `scripts/test-coverage.sh` (trap-based rename+restore): verified coverage table produced.
- A2 — separate CI-only bunfig via `-c` or `BUN_CONFIG_FILE`: DEAD. Verified locally: neither flag overrides `[test] coverage` while default `bunfig.toml` exists in CWD. Would repeat the prior mistakes.
- A3 — fix coverage OOM at bun runtime level: REJECTED. OOM is inherent to full-suite coverage on a large codebase with ubuntu-latest runners (2GB). No bun 1.3.13 workaround available without forking the runner or capping coverage scope (fragile).
**why-decision:** A1 is the only mechanism proven on bun 1.3.13 to suppress the coverage table without a parse error. Both prior attempts (assume-flag-exists + `--coverage=false`) violated the HARD GATE by shipping unverified mechanisms. A1 is mechanically sound: `coverage=false` in bunfig is a Bun-documented config key that suppresses the table unconditionally.
**dry-run-proof:**
- `bun --version` → `1.3.13` (matches CI .tool-versions)
- `bun test src/__tests__/003-env-config.test.ts src/__tests__/002-db-schema.test.ts` with `coverage=false` → `42 pass / 0 fail / Ran 42 tests across 2 files.` — NO coverage table
- `bun test --coverage` same files → NO coverage table (flag silently ignored when bunfig=false; PO matrix confirmed)
- `bash scripts/test-coverage.sh same-files` → coverage table produced, bunfig.toml restored on exit

**artefacts:**
- `docs/architecture-briefs/2026-06-08-ci-coverage-off-mechanism.md`
- `apps/mcp-server/bunfig.toml` (CHANGED — coverage=false)
- `.github/workflows/ci.yml` (CHANGED — bare bun test)
- `apps/mcp-server/package.json` (CHANGED — test:cov script)
- `scripts/test-coverage.sh` (NEW)

**signals-out:** impl spec returned directly to router for dev-mcp-server dispatch (tight loop per PO directive)

---

### STEP arch-S3 (DJ-GATE-1) · architect · 2026-06-08T23:02Z

**task-id:** CI-TEST-SCHEMA-FIXTURE-SPIKE
**what-done:** Full brownfield inventory of 1033 test files, mapping 3 failure classes (E1/E2/E3) from CI run 27171666087. Designed two-fixture-contract model + 4-phase rollout plan. Produced dev-actionable spec per failure class with exact enumeration commands.
**what-considered:**
- Option 1: Targeted injection (reverted 9454baad approach) — REJECTED. 176 files with inline DDL are self-contained by design; any injection that adds canonical tables collides (E1) or creates NOT NULL violations (E3) in tests not designed for full schema.
- Option 2: Full `initDatabase()` injection everywhere — REJECTED. Same E1/E3 risk plus view compile risk (v_chart_timeseries references period_quarter; tests with narrow financial_reports DDL would break on VIEW creation).
- Option 3 (CHOSEN): Two-contract model — Contract A (full canonical via initDatabase) for integration tests; Contract B (explicit inline DDL, IF NOT EXISTS, complete columns) for unit tests. Per-failure-class additive column fixes. No injection sweep.
**why-decision:** The 9454baad failure pattern proves injection is structurally incompatible with heterogeneous inline DDL. The only safe path is: (a) fix inline DDLs to be complete (add missing columns) and idempotent (IF NOT EXISTS), and (b) add production-side fallback guards for migration-added columns (data_env pattern). This avoids touching the 494 pure-singleton files and the 300 isolated-inline-only files that currently pass.
**why-change:** Prior brief (CI-TEST-ISOLATION-SPIKE) identified B2 (data_env) as the primary schema class. This spike reveals 5 sub-classes from the mechanized injection regression, requiring a more granular per-class fix plan and an explicit two-contract architectural boundary.
**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-test-schema-fixture-spike.md`

---

### STEP arch-S4 (DJ-GATE-1) · architect · 2026-06-09T04:00Z

**task-id:** FU-SCHEMA-DRIFT-P5
**sprint:** CI-RED-RECONCILE
**mode:** spike (120m timebox)

**what-done:** Diagnosed full-suite singleton pollution mechanism for residual 629 CI failures
(agent_signals 37, sbv_rates_history 19, positions 19, commodity_prices_history 19,
commodity_prices 16, imf_indicators 3). Corrected the wrong Phase 4 isolation-audit premise.
Chose fix architecture option (b) — self-healing `getDb()`. Updated brief with Phase 4 REVISED
addendum. Produced bounded single-file PM decompose recommendation.

**what-considered:**

- **Premise correction trigger:** FU-SCHEMA-DRIFT-P4 empirically ran 44+ pure-singleton files
  in per-file isolation. ALL 44 pass in isolation (rc=0). Only `1972-vndirect-ohlcv-null-coercion.test.ts`
  (daily_ohlcv) failed in isolation — P4 already fixed it. Therefore Phase 4's original
  prescription ("run in isolation; add initDatabase() to those that fail") would find NOTHING
  to fix for the residual 629 classes. Phase 4 premise is wrong.

- **Pollution mechanism identified:**
  1. `bun test 1.3.13` = single-process sequential (no `--parallel`; confirmed via `bunfig.toml`,
     `ci.yml`, `bun test --help` output).
  2. Module-level `_db: Database | null = null` in `schema.ts` shared across ALL 1033 files.
  3. "Singleton killer" pattern: Contract-A files with `closeDb()` in `afterAll` nullify `_db`.
     Named files: `084-tool-market.test.ts`, `089-tool-macro.test.ts`,
     `1527-schema-slices.test.ts`, `182-portfolio-risk.test.ts`.
  4. Production modules call `getDb()` directly (non-injectable): `macroStatsStore.ts::getCommodityStats()`
     (line 36), `macroStatsStore.ts::getSbvStats()` (line 118), `positionTools.ts` lines 218/260/299.
  5. These modules have `try { getDb(); db.query(...) } catch { logger.warn(...); return []; }` guards.
     The "no such table" error is caught silently; test assertion sees `[]` instead of populated data.
  6. In per-file isolation: test was written for empty-state behavior → passes.
     In full suite: test was written assuming prior-in-suite `initDatabase()` had populated the singleton → fails.

- **Fix options evaluated:**
  - (a) Global `beforeEach` reset in `setup.ts`: `initDatabase()` is async; 11k calls; migration overhead. REJECTED.
  - (b) Self-healing `getDb()`: synchronous slice inits on fresh `:memory:` branch. CHOSEN.
  - (c) `--parallel` run-order isolation: full process model change; unknown blast radius; OOM risk. REJECTED.
  - (d) Migrate ~45 affected pure-singleton files to Contract A: async `initDatabase()` in `beforeEach`
    incompatibility + 9454baad mechanized-sweep lesson (cost +219, reverted). REJECTED.

**why-decision:**
Option (b) is the only approach with zero blast radius and bounded scope. Individual
`initXxxTables(db)` functions are all synchronous — `getDb()` stays synchronous. Contract-B
tests never call `getDb()` so they are unaffected. Contract-A tests double-init (idempotent
`CREATE TABLE IF NOT EXISTS`) — harmless. Production server behavior unchanged (server still
calls `initDatabase()` at boot; self-heal is an additive no-op on top). `initFinancialReportsTables()`
is excluded from the self-heal due to RISK-2 (view compilation risk) and is NOT in the
629-failure classes. Bounded file set: **exactly 1 file** (`schema.ts`, 1 function, `getDb()`).

**why-change:** None from spike brief direction; finding was the wrong premise in Phase 4.

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-test-schema-fixture-spike.md` (addendum: Phase 4 REVISED section)
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (this entry)

**pm-decompose recommendation:** Single task `FIX-SCHEMA-DRIFT-P5-SELFHEAL`, zone=apps/mcp-server/,
timebox=30m, owner=dev-mcp-server, exactly 1 file (`schema.ts`), verification gate: native
`bun test` fail+errors < 629 (native-to-native comparison only; marker method over-counts ~2×).

---

### STEP arch-S5 (DJ-GATE-1) · architect · 2026-06-09T05:45Z

**task-id:** FU-SCHEMA-DRIFT-P6
**sprint:** CI-RED-RECONCILE
**mode:** spike (120m timebox)

**what-done:** Full audit of all 9 standalone slice DDLs for `created_at` column drift.
Built complete column-presence table (64 tables across 9 slices). Identified root cause
of P5 `created_at ×3` regression. Chose direction (b). Produced 3-file dev-ready plan.

**what-considered:**
- **Hypothesis (task spec):** ≥1 slice DDL omits `created_at` on table consuming code queries → IF NOT EXISTS no-op trap → column missing → error. DISPROVED: all tables queried for `created_at` have it defined in their slice DDL. No column-level drift found.
- **Actual P5 regression cause:** Self-heal creates tables with `TEXT NOT NULL` (no DEFAULT) on `agent_feedback`, `signal_quality_audit`, `rag_analyses`. Contract-B tests that previously created these tables with looser inline DDL (WITH default or omitting the column) hit NOT NULL on INSERT when self-heal's stricter DDL wins the create race on fresh `:memory:` DB.
- **Option (a) self-heal-with-RECONCILED-DDL:** Add DEFAULT to 3 slice tables + keep self-heal. REJECTED: production footgun (repeated side effects from `initMarketDataTables` DELETE on `market_prices` firing on every `afterEach closeDb`); still doesn't fix 182-portfolio-risk's Contract-B violation pattern.
- **Option (b) Contract-A killers reinit CHOSEN:** Modify 3 `afterAll(() => closeDb())` in 084-tool-market, 089-tool-macro, 1527-schema-slices to `afterAll(async () => { closeDb(); await initDatabase(); })`. Test-files only. Uses full `initDatabase()` (not partial 9-slice self-heal), so includes `initFinancialReportsTables` — no RISK-2 exclusion needed.

**why-decision:** Option (b) zero production-code risk; uses canonical `initDatabase()` (full schema, idempotent); the 3 files are the only afterAll-closeDb killers; self-heal footgun avoids re-introducing P5 DELETE side-effect on every test.

**why-change:** P5 hypothesis (drift in slice DDL) DISPROVED empirically. Root cause is Contract boundary violation + self-heal side-effects, not DDL column omission.

---

### STEP arch-S6 (DJ-GATE-1) · architect · 2026-06-09T03:12Z

**task-id:** FU-SCHEMA-DRIFT-P7
**sprint:** CI-RED-RECONCILE
**mode:** spike (120m timebox), 5th touch CI-test-schema surface

**what-done:** Full brownfield audit revealing P7 premise is INCORRECT. Python-based analysis
(comment-stripping) of all 1033 test files mapped: (a) all 16 residual tables confirmed PRESENT
in canonical initDatabase() — no DDL missing; (b) 293 partial-setup files with inline DDL but
no initDatabase() call; (c) exactly 7 files with closeDb() but no initDatabase() calls;
(d) run-order mapping proving 7 files at positions [53]/[77]/[236]/[574]/[638]/[751]/[814]
destroy singleton progressively; (e) 180 pure-singleton files at [815]–[1032] all get empty
:memory: DB after destroyer [814].

**what-considered:**
- **P7 task directive (add DDL to canonical initDatabase()):** Full brownfield audit shows all 16 residual tables ARE already in canonical initDatabase() slices. DDL additions would be no-ops. This direction cannot reduce failures. REJECTED.
- **P5 approach (self-heal in getDb()):** Empirically disproved (+6 worse). Side-effect footgun confirmed. REJECTED.
- **P6 approach (afterAll reinit in 3 killer files):** Partially correct direction but incomplete — fixed [508] (1527) but missed destroyers at [574], [638], [751], [814]. Zero improvement because downstream destroyers survived.
- **CORRECT DIRECTION: 7 close-no-init files need afterAll(closeDb+initDatabase):** Identified via Python analysis: grep-c missed block-comment false positives (102-job-news-poll had initDatabase only in a JSDoc comment, not actual call). 7 files confirmed as only files calling closeDb() with zero actual initDatabase() calls. Adding afterAll reinit to all 7 eliminates all singleton-destruction events after run [814].

**why-decision:** Only direction that addresses the ACTUAL mechanism (singleton destruction by
7 specific files). Zero production code changes. Uses full canonical initDatabase() (all slices,
IF NOT EXISTS = safe). Extends the P6 direction (which was correct in kind but incomplete in scope).

**why-change:** P7 premise (tables missing from initDatabase) DISPROVED by full slice audit.
Root cause is singleton destruction by 7 close-no-init files, not schema incompleteness.
Expected impact: 85-95% reduction (629 → <50 native fail+error).

---

### STEP arch-S7 (DJ-GATE-1) · architect · 2026-06-09T03:50Z

**task-id:** FU-SCHEMA-DRIFT-P8
**what-done:** Chose direction (a): reconcile 3 NO-DEFAULT created_at DDL entries + re-apply P5 self-heal in getDb() + add preload await initDatabase() to setup.ts. Produced per-table DDL map with owning modules verified. Wrote brief to docs/architecture-briefs/2026-06-09-fu-schema-drift-p8-spike.md.
**what-considered:**
- Direction (b) global preload: bunfig.toml preload runs once; cannot auto-reinit after every closeDb() without ESM monkey-patching (fragile). Any auto-reinit hook in preload = mechanically identical to P5 (self-heal in getDb()). Direction (b) is not viable as a distinct mechanism.
- Direction (a) reconcile+reapply-P5: P5 mechanism proven to heal 4 classes empirically. The +6 regression was ONLY from 3 tables with `TEXT NOT NULL` without DEFAULT (rag_analyses, agent_feedback, signal_quality_audit). Reconciling those 3 eliminates the regression. Re-applying P5 preserves the 4-class heal.
- Adding preload await initDatabase() in setup.ts: covers files before any closeDb() call; self-heal covers files after closeDb() on _db=null path. Together they cover all consuming-file patterns.
**why-decision:** Direction (b) is not viable as a distinct global mechanism. Direction (a) is the only approach with a proven heal track record (P5 healed 4 classes) and a bounded, verifiable DDL fix. DDL drift pinpointed to exactly 3 lines across 2 slice files.
**why-change:** P7 disproved per-file lever. P8 pivot to production-layer self-heal (direction a) with DDL prerequisites satisfied.

---

### STEP arch-S8 · architect · 2026-06-09T05:46Z

**task-id:** RE-PROFILE-CI-241-RESIDUAL
**what-done:** Pulled bun job 80254121788 log (job sha 91afe344), extracted 241 unique fails (1 spurious CI log fragment excluded), grouped into 9 fresh clusters superseding 629-era taxonomy. Wrote brief to docs/architecture-briefs/2026-06-09-ci-241-residual-taxonomy.md.
**what-considered:**
- Direct mapping from test-description patterns + error messages (TypeError/expect) to root cause per cluster.
- C2: functions ARE implemented; root cause is require() CJS/ESM interop in test (not missing impl).
- C3: "Received: undefined" on DB row = singleton pollution for signal_outcomes (not logic bug).
- C1 recurring-bug guard triggered: macroTools.ts seam removal is second major CI event in this module.
**why-decision:** Cluster by error signature + production-risk not by file proximity. Singleton pollution (C3) ranks above Kinh Dich diacritics (C4) on absolute count; C4 ranks first on pure score because prod-risk=LOW. First attack = C3 (43 tests, test-only isolation fix).
**why-change:** 629-era estimate of ~159 C3 ASSERTION/LOGIC is now split across C1/C3/C4/C7/C8/C9 because Clusters 1+2 unmasked previously-crash-hidden tests.

---

### STEP arch-S10 (DJ-GATE-1) · architect · 2026-06-09T10:00Z

**task-id:** SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY
**sprint:** CI-RED-RECONCILE
**what-done:** Full read of victim test files (028/025/1423a/1487/ddd-1b), production modules (sbv.ts, yahooFinance.ts, ragHttpClient.ts), contaminator files (083/123), and call-chain (runImpactChain.ts, analysis.ts). Confirmed exact mechanism for null-in-CI. Evaluated three candidate patterns. Produced per-file application plan. Projected fail drop.
**what-considered:**
- **(a) per-test beforeEach/afterEach mock+restore:** REJECTED. Bun 1.3.13 `mock.restore()` does not reliably restore fully-synthetic stubs. Any test abort between beforeEach and afterEach leaks contamination. Empirically already failed in C5 attempt. Fragile.
- **(b) DI seam at call-site (httpClient param):** CHOSEN. Both `fetchSbvRates` and `fetchYahooFinancePrices` ALREADY have optional `httpClient?` injection. Victim tests (028/025/1423a/1487) already use this seam correctly. The problem is ONLY that 083/123 file-top mock.module() replaces the entire function in ESM cache — making the injected mock irrelevant. Fix = remove file-top stubs from 083/123, use existing DI seams in `runImpactChain` for their specific needs.
- **(c) skipIf no-network:** REJECTED. Tests are NOT network tests; they inject mock clients and pass in local isolation. Skipping = hiding a confirmed contamination bug. Wrong resolution.
**why-decision:** The DI seam is the cleanest and most deterministic approach because: (1) the production code already has the seam, (2) the victim tests already USE the seam correctly, (3) the only broken component is the ESM cache replacement installed by 083/123 which is both unnecessary (since DI seams exist) and demonstrably leaking (empirically falsified in 22470e44). Removing file-top mock.module() from 083/123 is the minimal change. `ddd-1b` is already correct (per-test globalThis.fetch save-and-restore) and needs no change.
**why-change:** C5 dev attempted to cure contamination by adding MORE mock.module() (the re-registration in ddd-1b). This reproduced the disease at a new call site. The correct insight is that mock.module() is the contamination vector itself — not the cure. The cure is DI injection at call-site, which already exists in the production functions.
**projected-drop:** 135 → ~113 native fail+error (22 victim fails cleared: 028=9, 025=7, 1423a=3, 1487=3)
**artefacts:**
- `docs/architecture-briefs/2026-06-09-spike-ci-c5-contam-safe-restrategy.md`

---

### STEP arch-S11 (DJ-GATE-1) · architect · 2026-06-09T12:00Z

**task-id:** FIX-CI-1423E-PREEXISTING-CLUSTER
**sprint:** CI-RED-RECONCILE
**what-done:** Triage of 22-failure 1423e cluster. Ran both test files locally. Traced git history
of `carryTools.ts` and `1423e.test.ts`. Confirmed `1423e-macro-calendar.test.ts` (23/23 pass) is
the canonical domain-service test. Classified `1423e.test.ts` (9 fail / 13 total) as TEST-OBSOLETE.
Produced brief at `docs/architecture-briefs/2026-06-09-ci-1423e-preexisting-cluster.md`.
**what-considered:**
- TEST-STALE/REWRITE: considered whether the HTTP-proxy interface layer could be tested with fetch
  mocking. REJECTED: `_testReferenceDate` seam is gone from prod schema forever; any new MCP-layer
  test would need full fetch mock (different test strategy); existing domain tests already cover all
  calendar logic — an HTTP-proxy test adds nothing and requires a live or mocked microservice.
- PROD-BROKEN / FIX: considered whether `get_macro_calendar` is broken. REJECTED: tool correctly
  proxies HTTP, returns honest unavailable error in CI (no service running). Prod behavior is correct.
- TEST-OBSOLETE / REMOVE: CHOSEN. `_testReferenceDate` never existed in post-rewire carryTools.ts.
  Tests assert on domain-level MacroCalendarResult shape but tool returns HTTP-proxied JSON. Test
  was written for 2026-04-29 architecture; that architecture was superseded 2026-05-23.
**why-decision:** The test file's entire strategy (seed via `_testReferenceDate` → assert domain-
level MacroCalendarResult) depends on the tool calling the domain function directly. That call was
removed in commit `98df0f43` (P2-B1 rewire). No fallback exists. REMOVE is the only action aligned
with the /goal clause "obsolete tests must be REMOVED."
**why-change:** No change from /goal directive; escalation condition (2+ CI commits in module) met
but does not change the REMOVE verdict — escalation note added to brief for po backlog.

---

### STEP arch-S9 (DJ-GATE-1) · architect · 2026-06-09T06:30Z

**task-id:** SPIKE-CI-C1-MACRO-INJECT-SEAM
**what-done:** Audited macroTools.ts git history (git log --follow + git show 98df0f43), read current production registerMacroTools(), read all 5 affected test files, inspected Go MacroSnapshotResponse DTO. Determined verdict (A+B partition), assessed production severity, produced ordered fix plan with injection strategy reference.
**what-considered:**
- (A) Intentional seam removal — tests need new injection strategy matching HTTP proxy: CHOSEN for ~40 tests
- (B) Accidental regression of section headers — sections were NOT moved to Go service: CHOSEN for ~31 tests (format change is intentional, Go emits JSON not text sections; tests must be updated)
- (C) Mixed — VERIFIED: all 71 are covered by A+B; no split needed beyond sub-task classification
**why-decision:** Commit 98df0f43 (2026-05-23) is unambiguously intentional — commit message explicitly states "4 macro tools → port 5004", removes domain imports, replaces with HTTP proxy. The section headers (`[Commodity Prices]` etc.) were NEVER added to the Go service; the production format is now `{source_tier, text: JSON, fetchedAt}`. All 71 failures are ultimately caused by tests written against the OLD TS-only implementation that no longer exists. 1881a test already demonstrates the correct new injection pattern (globalThis.fetch mock) and passes.
**why-change:** No prior SPIKE had investigated C1 at this depth. 629-era taxonomy noted seam removal but deferred investigation. Recurring-bug policy triggered correct escalation — the seam migration pattern was never enforced.
**artefacts:**
- `docs/architecture-briefs/2026-06-09-spike-ci-c1-macro-inject-seam.md`
