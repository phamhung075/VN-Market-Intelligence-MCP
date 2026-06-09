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

### STEP arch-S12 (DJ-GATE-1) · architect · 2026-06-09T12:30Z

**task-id:** FIX-CI-C1134-RESIDUAL-TRIAGE
**sprint:** CI-RED-RECONCILE
**what-done:** Prod-vs-test triage of the 12-fail Task 1134 cluster (get_foreign_flow MCP tool,
`1134-get-foreign-flow-tool.test.ts`). Read prod handler (foreignFlowTools.ts), domain service
(foreignFlowAnalyzer.ts), git log for both files, CI signals, prior briefs (C1124 + 1423e patterns),
sibling tests (1518, MSG-1). Produced verdict brief at
`docs/architecture-briefs/2026-06-09-ci-c1134-foreign-flow-triage.md`.

**verdict:** REWRITE (1124-transport-hang signature)

**what-considered:**
- **(a) 1423e-deleted-seam (REMOVE-obsolete):** Checked whether prod tool was rewired to HTTP proxy
  and `_testFallback`/`db?` injection seam deleted. REJECTED: foreignFlowTools.ts has never been
  rewired to HTTP. git log shows 4 commits; none is an HTTP-proxy migration. `_testFallback:
  z.string().optional()` and `db?` injection arg are both present and live. No seam was deleted.
- **(b) FIX (prod broken):** Checked whether prod logic/contract is wrong. REJECTED: handler
  correctly implements zero-detection guard, insufficient-data guard, Zod validation, JSON envelope,
  and `daily_ohlcv` query on injected-db path. Assertions in test are semantically compatible with
  prod output (JSON envelope contains the expected strings). No prod defect.
- **(c) REWRITE (1124-transport-hang — CHOSEN):** InMemoryTransport + Client.callTool() stalls in
  CI (Bun 1.3.13 / Ubuntu-latest single-process sequential). 1134 test has NO `afterEach` to close
  client (worse than 1124 which at least had C3 fix). 6 `it()` × 2 native failures = 12. Fix =
  `_registeredTools` direct handler invocation (same cure proven in C1124, now CI-green at 0 fails).

**why-decision:** The 1124 cure (InMemoryTransport → `_registeredTools`) was proven CI-green by
sha 802a4d1b (ci_absolute dropped 91 → 79, Task 1124 = 24 → 0). The 1134 test uses the identical
stalling pattern with the same prod tool that already accepts a `db?` injection arg. No new seam
is needed — the handler is already DI-ready. The `_registeredTools` template requires zero
`mock.module()` calls (pure SQLite import chain). C5-cure ABSOLUTE: no new file-top mock.module().

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c1134-foreign-flow-triage.md`
- `docs/data/orch/orch-state.json` (FIX-CI-C1134-RESIDUAL-TRIAGE TODO → REVIEW)

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

---

### STEP arch-S14 (DJ-GATE-1) · architect · 2026-06-09T13:15Z

**task-id:** FIX-CI-C7-ASSERTION-LOGIC
**sprint:** CI-RED-RECONCILE
**mode:** prod-vs-test triage (verdict only; no fix written; no board flip)

**what-done:** Full prod-vs-test triage of the dominant 10-fail Task 1328e cluster
(`1328e-conviction-display.test.ts`, describe "notifyTelegramAlert conviction routing").
Read prod `notifyTelegramAlert` implementation (telegram.ts:549), severity gate (lines 553–555),
conviction-block emission (lines 564–569), multi-chunk split (splitMessage() line 141,
TELEGRAM_MAX_LENGTH=4096 line 135), fetchFn injection chain (lines 186, 587–590).
Read test file: all 12 it() blocks, DI injection pattern (makeCaptureFetch → options.fetchFn).
Read contaminator: 047-bctc-orchestrator.test.ts mock.module() (line 17) stub exports.
Ran empirical two-file test to confirm exact SyntaxError. Checked run-order positions [24] vs
[306]. Scanned all 287 files between positions [24]–[306] for telegram mock.module restore calls.
Checked git log for telegram.ts staleness. Confirmed 1792 fails in isolation (independent root
cause). Confirmed 1352a contamination fail (1 of 2 cured by same fix).

**verdict:** TEST-HARNESS/MOCK CONTAMINATION (classification c)

**what-considered:**
- **(a) PROD CORRECT, TEST STALE:** REJECTED. git log shows no change to severity gate or
  conviction-block format since `ba865ca8`. All 5 failing assertions match current prod behavior.
  1328e passes 12/12 in isolation. Not stale.
- **(b) PROD BROKEN:** REJECTED. Prod severity gate (`high`/`critical` only → coreSend,
  `medium`/`low` → return false) is correct and unchanged. Conviction block emission on
  `options.conviction` truthy is correct. fetchFn plumbing is correct. No prod defect.
- **(c) TEST-HARNESS/MOCK CONTAMINATION — CHOSEN:** `047-bctc-orchestrator.test.ts` (position
  [24]) installs a `mock.module("../infrastructure/notifiers/telegram.js", ...)` stub that omits
  `notifyTelegramAlert` and `formatConvictionBlock`. No restore in 047's `afterAll`. Bun 1.3.13
  ESM registry is process-global. When `1328e` (position [306]) loads, its static import of
  `{ notifyTelegramAlert }` produces `SyntaxError: Export named 'notifyTelegramAlert' not found`.
  Empirically confirmed: two-file run produces exact SyntaxError. Isolated run: 12/0 pass.

**why-decision:** The ~1ms failure latency (vs ~5003ms transport-hang) is a module-load-time
SyntaxError — fires before any test assertion. No transport stall. No assertion mismatch.
The contamination pattern is the same mechanism documented in `1485-telegram-mock-isolation.test.ts`
("mock.module() is process-global in Bun"). The cure is bounded to 1 file (047) with zero
changes to 1328e. C5-CURE ABSOLUTE: no new file-top mock.module() in 1328e. Fix = add missing
exports to 047's stub + add teardown afterAll that restores real implementations via frozen-real
pattern (established precedent: 1352a teardown describe).

**1792 scope:** EXCLUDED. Fails in isolation (independent root cause — bugMessages stays empty;
bctc_signal_debounce DB setup issue). Needs separate triage.

**1352a scope:** PARTIAL. 1 of 2 CI fails cured by 047 fix (SyntaxError: `notifyTelegramDocument`
not found). 1 of 2 CI fails is independent (A-1: `Expected: 1, Received: 2`). Separate triage
needed for A-1.

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c1328e-conviction-routing-triage.md`
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (this entry)

---

### STEP arch-S13 (DJ-GATE-1) · architect · 2026-06-09T00:00Z

**task-id:** FIX-CI-C1129-RESIDUAL-TRIAGE
**sprint:** CI-RED-RECONCILE
**mode:** prod-vs-test triage (verdict only; no fix written; no board flip)

**what-done:** Full prod-vs-test triage of the 10-fail C1129 cluster (get_calibration_report MCP
tool, `1129-calibration-tools.test.ts`). Read prod handler (`calibrationTools.ts:276`), git log
for the file, store layer (`calibrationSnapshotStore.ts`), schema DDL (`schema-system.ts:213`),
victim test file, and proven sibling template (`1134-get-foreign-flow-tool.test.ts`).
Produced verdict brief at `docs/architecture-briefs/2026-06-09-ci-c1129-calibration-triage.md`.

**verdict:** REWRITE (1124-transport-hang signature)

**what-considered:**
- **(a) 1124-transport-hang (REWRITE — CHOSEN):** 5 it() × ~5003ms = uniform 5000ms timeout
  fingerprint. Test uses `InMemoryTransport.createLinkedPair() + Client.callTool()` which stalls
  on Bun 1.3.13/Ubuntu CI. afterEach `client?.close()` also stalls → ×2 native failures = 10.
  Cure = `_registeredTools` direct-handler invocation (proven CI-green: 1117, 1124, 1134).
- **(b) 1423e-deleted-seam (REMOVE-obsolete):** REJECTED. `registerCalibrationTools` at line 276
  has `db?: Database` injection arg — LIVE and NEVER removed. No HTTP proxy migration in git log
  for this file. `98df0f43` macro-rewire did NOT touch calibrationTools.ts. No deleted seam exists.
- **(c) genuine prod bug:** REJECTED. Handler logic is correct for all 5 AC paths. Pure SQLite,
  no HTTP dependency. Uniform 5003ms timeout disproves instant-fail / prod-error signature.

**why-decision:** The db-injection DI seam is live (`calibrationTools.ts:276–280`). Prod is pure
SQLite (no fetch, no HTTP proxy, no port reference). The 5003ms uniform timeout is the
canonical transport-hang fingerprint. The `_registeredTools` template from 1134 (commit 8916675a)
applies directly with zero new `mock.module()`. No Zod-bypass adaptation is needed for any of the
5 ACs (`date: z.string().optional()` with no `.default()` — undefined maps identically on both
direct and protocol paths).

**why-change:** None from the 1124/1134 triage precedent; this cluster is a straight repeat of
the identical root cause with the same cure path already proven CI-green.

**zod-bypass-risk:** NONE. All 5 ACs use `date` as `z.string().optional()` (no coerce, no
default). AC-5/AC-extra/AC-6 omit `date` (receives `undefined` on direct path = same as protocol
path). AC-7/AC-7b pass explicit string values (no transformation). Zero AC adaptation needed.

**preconditions-verified:**
- `registerCalibrationTools(server, db?: Database)` at line 276 — db-injection arg PRESENT
- Prod is pure SQLite — NO HTTP proxy — CONFIRMED (no fetch/port/proxy in file)
- `insertCalibrationSnapshot(db, input)` exported from calibrationSnapshotStore.ts:156 — CONFIRMED
- No `mock.module()` in victim test — CONFIRMED
- `calibration_snapshots` DDL in schema-system.ts:213 (IF NOT EXISTS, 12 cols) — CONFIRMED

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c1129-calibration-triage.md`

---

### STEP arch-S15 (DJ-GATE-1) · architect · 2026-06-09T13:55Z

**task-id:** FIX-CI-C1328E-RETRIAGE (gate-fail 7f1f48b3)
**sprint:** CI-RED-RECONCILE
**mode:** prod-vs-test re-triage (full-CI evidence; prior C5-cure disproven for 1328e)

**what-done:** Re-triaged Task 1328e after arch-S14 C5-cure (047 afterAll + extended stub, commit
e57494d3) failed to flip 1328e on full-CI ordering (10 fail → 10 fail, job 80334814093). Read CI
log for job 80334814093, confirmed failure mode CHANGED from SyntaxError to `Expected: false,
Received: { ok: true }`. Identified `{ ok: true }` as exclusive fingerprint of `1485-telegram-
mock-isolation.test.ts` stub. Traced capture-poisoning: 1485 (pos 89, no afterAll restore) runs
before 047 (pos 315); 047's top-level import captures 1485 stub as `_realNotifyTelegramAlert`;
047's afterAll reinstalls the stub as "restored" real; contamination persists to pos 941 (1328e).
Confirmed 235-telegram-send-merge (pos 775) also fails as corroborating victim. Ran local multi-
file probes confirming Bun 1.3.13 re-sorts specified files internally — CI log is the authoritative
ordered evidence. Confirmed prod telegram.ts L549-595 unchanged — C7/REWRITE/REMOVE do not apply.
Produced brief at `docs/architecture-briefs/2026-06-09-ci-c1328e-retriage-arch-s15.md`.

**verdict:** SECOND-CONTAMINATOR — `1485-telegram-mock-isolation.test.ts`

**root cause mechanism:**
1. 1485 (pos 89): installs `notifyTelegramAlert: async () => ({ ok: true })` in it() bodies.
   NO afterAll restore → stub persists in ESM registry.
2. 047 (pos 315): top-level static import captures 1485 stub as `_realNotifyTelegramAlert`.
   `_frozenNotifyTelegramAlert = async () => ({ ok: true })` (wrong).
3. 047 afterAll: "restores" with `_frozenNotifyTelegramAlert` = 1485 stub. Registry stays wrong.
4. All files after pos 315 (including 1328e at pos 941) get stub not real function.

**fix spec:**
- File: `apps/mcp-server/src/__tests__/1485-telegram-mock-isolation.test.ts`
- Change: Add `afterAll` to bun:test import + file-bottom afterAll restore using `_realMod1485`
  (the cache-busted real module already available at file top).
- C5-ABSOLUTE: existing `mock.module()` inside it() blocks are NOT changed.
- NO change to 1328e, NO change to 047.

**collateral expected:**
- 1328e: 10→0 fail
- 235 (pos 775, same root cause): 3→0 fail
- 1352a: 2→1 fail (1485-sourced contam cured; A-1 independent remains)

**what-considered:**
- **(a) SECOND-CONTAMINATOR (CHOSEN):** 1485 fingerprint `{ ok: true }` confirmed in CI log;
  capture-poisoning chain via 047 proven; CI file order verified.
- **(b) C7 genuine assertion-logic:** prod L549-595 intact, real function returns boolean not
  `{ ok: true }`, all 5 assertions correct. REJECTED.
- **(c) 1356a as contaminator:** local 1356a+1328e = 20 pass/0 fail. REJECTED.

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c1328e-retriage-arch-s15.md`

---

### STEP arch-S18 (DJ-GATE-1) · architect · 2026-06-09T16:10Z

**task-id:** FIX-CI-C1173-TRIAGE
**sprint:** CI-RED-RECONCILE
**mode:** prod-vs-test triage (verdict only; no fix written; no board flip)

**what-done:** Full prod-vs-test triage of the 6-fail Task 1173 cluster
(`1173-calibration-label-integration.test.ts`, AC-4 + AC-5 describe blocks).
Pulled raw CI log for job 80358657573 (run 27216305674, sha c017289d) via
`gh run view --job=80358657573 --log`. Extracted all `Task 1173` lines.
Deduplicated 6 log-occurrences → 3 unique failing tests (runtime + summary dump =
2 occurrences each). Read full test file (681 lines). Read prod `calibrationTools.ts`
(377 lines) to verify `handleGetLabelAccuracyReport` export and `get_label_accuracy_report`
tool registration. Verified CI file order: 1129 (immediately preceding, all pass via
`_registeredTools`) → 1173 (3 fail). Confirmed contamination definitively excluded.
Produced brief at `docs/architecture-briefs/2026-06-09-ci-c1173-triage.md`.

**verdict:** GENUINE — REWRITE (transport-hang, NOT contamination)

**unique failing tests (3):**
1. AC-4: `tool output contains header with since_days value` — 5005ms timeout
2. AC-5: `returns Vietnamese empty-state message when no reviewed rows` — 5000ms timeout
3. AC-5: `empty-state message reflects the actual since_days value passed` — 5003ms timeout
All carry `^ a beforeEach/afterEach hook timed out for this test.` fingerprint.

**what-considered:**
- **(a) CONTAMINATION:** REJECTED. Zero `mock.module()` in 1173. Failures are 5000ms
  transport-hangs not instant SyntaxErrors. No telegram stub chain touches this file.
  Files immediately preceding 1173 in CI (1392, 1117, 1129) install no stub for
  any module imported by AC-4/AC-5. Contamination definitively excluded.
- **(b) PROD BROKEN / FIX PROD:** REJECTED. `handleGetLabelAccuracyReport` (line 235)
  is correctly exported. `get_label_accuracy_report` tool (lines 352–375) correctly
  delegates to it. All AC-4/AC-5 assertion strings match prod format exactly. No
  prod defect.
- **(c) TEST OBSOLETE / REMOVE:** REJECTED. `handleGetLabelAccuracyReport` and the
  tool registration are live in prod. No sibling test covers this specific
  MCP-layer path. Removal would drop the only coverage of AC-4 and AC-5 output format.
- **(d) REWRITE (transport-hang — CHOSEN):** InMemoryTransport + `Client.callTool()`
  stalls on Bun 1.3.13 / Ubuntu-latest. `afterEach(client?.close())` itself stalls
  because the transport is hung. Pattern confirmed identical to 1124 (24 fails → 0,
  802a4d1b), 1129 (all pass in this very run via `_registeredTools`), 1134 (0 fails,
  8916675a). Fix = call `handleGetLabelAccuracyReport(getDb(), since_days)` directly
  in AC-4 and AC-5 describe blocks. Function is already exported from calibrationTools.ts.
  Zod-bypass risk: none (explicit integer args; no coercion difference).

**why-decision:** The `handleGetLabelAccuracyReport` function is directly exported
from `calibrationTools.ts` (line 235), providing a seam cleaner than `_registeredTools`
for the AC-4/AC-5 output-format assertions. The transport-hang is the SOLE failure
mechanism (8 of 11 tests in the same file pass at 46–53ms using non-transport paths).
The `_registeredTools` template from 1129 is proven CI-green in the same CI run that
shows 1173's failures. REWRITE scope: AC-4 and AC-5 describe blocks only (1 file,
0 production changes, 0 new mock.module() calls).

**full-CI ordered evidence:** CI job 80358657573 ##[group] timestamps show
1129 at 15:18:37 (all pass) → 1173 at 15:18:44 (8 pass, 3 fail). No contaminator
in the files between them. 2-file local repro NOT used (false-positive risk per
arch-S14/S15/S16 precedent).

**projected delta:** Task 1173: 6 fail-log-lines → 0 (3 unique tests × 2 occurrences
each cured). No downstream collateral expected.

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c1173-triage.md`
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (this entry)

---

### STEP arch-S17 (DJ-GATE-1) · architect · 2026-06-09T14:56Z

**task-id:** FIX-CI-C235-RESIDUAL-TRIAGE
**what-done:** Re-triage Task 235 residual (4 fail log-lines after 1792 afterAll cure, run 27214052876 / job 80350659632 / sha 09dce373). Pulled raw CI log for job 80350659632 via `gh run view --job=80350659632 --log`. Extracted full `##[group]` file-order timestamps. Read FIX-1290, 1352a, 047, 235, 1792 source files. Verified stub fingerprint.

**findings:**
- The 4 fail log-lines for Task 235 = 2 unique failing tests × 2 log occurrences each (runtime + bun final summary dump). Not 4 independent test failures.
- Surviving 2 failing tests: `channel='market' sends to MARKET channel and returns success` (line 102: capturedUrls.length Expected 1, Received 0) and `channel='market' with no token returns failure gracefully` (line 150: Expected false, Received true).
- `channel='bug' sends to BUG channel` is NOW PASSING (1792 afterAll cure worked for sendTelegramBug).
- Stub fingerprint on `sendTelegramMarket`: ignores fetchFn (capturedUrls stays 0) and ignores TELEGRAM_BOT_TOKEN (returns true not false). Exactly matches FIX-1290's stub.
- CI file order confirmed: FIX-1290 (14:42:17) runs AFTER 1792's afterAll restore, BEFORE 235 (14:43:58). FIX-1290 re-poisons `sendTelegramMarket` with no afterAll restore. 1352a+047 then freeze FIX-1290's stub as their "frozen real" and re-install it in their own afterAll teardowns.
- Prod telegram.ts sendTelegramMarket (L265) verified correct. REWRITE/REMOVE/FIX-PROD all excluded.

**verdict:** (a) FOURTH CONTAMINATOR — `FIX-1290-briefing-no-stale.test.ts`, file-top mock.module L21, stub `sendTelegramMarket: async (text) => { marketMessages.push(text); return true; }`, NO afterAll restore.

**what-considered:**
- (a) FOURTH-CONTAMINATOR (CHOSEN): CI file order + stub fingerprint match exactly. 1792 afterAll cure removed sendTelegramBug leak (channel='bug' now passes) while sendTelegramMarket still poisoned by FIX-1290. Full-CI file-order evidence (##[group] timestamps) is authoritative.
- (b) REWRITE: excluded. Prod sendTelegramMarket behavior (fetchFn injection, false on no-token) exactly matches test assertions.
- (c) REMOVE: excluded. Test is valid; no superseding coverage.
**why-decision:** Only FIX-1290 runs between 1792's afterAll (which now restores real module) and 235, stubs sendTelegramMarket, and has no afterAll restore. The stub fingerprint (ignores fetchFn, returns true regardless of token) is the exclusive signature of FIX-1290 lines 21-30.

**systemic note:** Four telegram mock.module contaminators confirmed (1485, 1792, FIX-1290, plus 047 as secondary propagator). Repo-wide afterAll-restore sweep queued to PO as `FIX-CI-TELEGRAM-STUB-AFTERALL-SWEEP` — more efficient than one-victim-at-a-time.

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c235-residual-triage.md`

---

### STEP arch-S19 (DJ-GATE-1) · architect · 2026-06-09T17:00Z (TUESDAY)

**task-id:** FIX-CI-C1839b-TRIAGE
**sprint:** CI-RED-RECONCILE
**mode:** prod-vs-test triage (verdict only; no fix written; no board flip)

**what-done:** Full prod-vs-test triage of the 4-marker (2 unique test) Task 1839b cluster
(`1839b-notebook-protocol.test.ts`, AC-3 + AC-4). Pulled raw CI failure lines from job
80365846275 (`gh run view --job=80365846275 --log | grep "Task 1839b"`). Ran single-file
local repro confirming exact same failures. Read full test file (53 lines). Read current
state of `docs/agent-memory/notebooks/` directory. Read current `developer.md` (54 lines,
5198 bytes). Traced git history to introduction commit `6acf45d7` (2026-05-03) to confirm
original GREEN state. Traced `422c0ff9` as the commit introducing `market-watcher.md.bak`.
Confirmed NB-PRUNE-1 as the cycle that replaced scaffold sections in developer.md with
real session entries. Produced brief at
`docs/architecture-briefs/2026-06-09-ci-c1839b-notebook-protocol-triage.md`.

**verdict:** REWRITE-STALE (both failing tests)

**unique failing tests (2):**
1. AC-3: `notebook files are .md format (gitkeep excluded)` — 1ms genuine assertion
   failure. `expect("market-watcher.md.bak").toMatch(/\.md$/)` fails. Root cause:
   `.bak` file committed in `422c0ff9` after test introduction; test excludes only
   `.gitkeep`, not `.bak` artifacts.
2. AC-4: `developer.md notebook has required sections` — 1ms genuine assertion failure.
   `expect(content).toContain("Last session summary")` and `toContain("Known patterns")`
   both fail. Root cause: notebook-write/prune cycle (NB-PRUNE-1 + session appends)
   replaced scaffold placeholder sections with real session entries (`## Session ...`
   format). Test was anchored to initial scaffold structure no longer present.

**raw-fail fingerprint:** 1ms assertion failure (no SyntaxError, no ~5000ms timeout).
Neither contamination nor transport-hang. Both are genuine-assertion-no-timeout.

**what-considered:**
- **(a) CONTAMINATION (SyntaxError / wrong-value from leaked mock.module):** REJECTED.
  Zero `mock.module()` in this test file. Failures at 1ms with direct string/regex
  assertion. No telegram or other stub chain touches `fs.readdirSync` or `fs.readFileSync`.
- **(b) TRANSPORT-HANG (~5000ms):** REJECTED. Both failures at 1ms. No MCP
  InMemoryTransport or Client.callTool() in this test file.
- **(c) REWRITE-STALE (CHOSEN):** Both tests assert file-system state that was true
  at introduction but has legitimately evolved. Prod notebooks directory and developer.md
  are correct; test assumptions are stale.
- **(d) REMOVE-OBSOLETE:** REJECTED. The underlying intent of AC-3 (notebooks are .md
  files) and AC-4 (developer.md is a substantive notebook) remains valid. Tests should
  be updated, not removed.
- **(e) FIX-PROD:** REJECTED. No production defect. The `.bak` file is a legitimate
  artifact; developer.md has real content (5198 bytes, 6 real sessions).

**why-decision:** No contamination pattern. No transport-hang pattern. Timestamps from
`6acf45d7` commit confirm both ACs were green on introduction; subsequent commits
(`422c0ff9` for .bak, NB-PRUNE-1+sessions for developer.md) are the divergence sources.
The fix is narrowly scoped: extend AC-3 filter to exclude `.bak`; update AC-4 to assert
invariants that survive the session-log format (presence of `## ` heading + non-trivial
content length).

**fix spec (1 file, 2 it() blocks):**
- AC-3: extend filter to `f !== ".gitkeep" && !f.endsWith(".bak")`
- AC-4: replace `toContain("Last session summary")` + `toContain("Known patterns")`
  with `toMatch(/^## /m)` + `content.length > 200`

**projected delta:** Task 1839b: 4 log-markers (2 unique tests × 2 occurrences each) → 0.
No downstream collateral expected (AC-1, AC-2, AC-5 untouched and green).

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c1839b-notebook-protocol-triage.md`
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (this entry)

---

### STEP arch-S20 (DJ-GATE-1) · architect · 2026-06-09T17:00Z (TUESDAY)

**task-id:** TRIAGE-CI-C1282a-DATA-FRESHNESS-PROD-VS-TEST
**sprint:** CI-RED-RECONCILE
**mode:** prod-vs-test triage (verdict only; no fix written; no board flip)

**what-done:** Full prod-vs-test triage of the 2-unique-fail Task 1282a cluster
(`system-data-freshness.test.ts`, TC-1 + TC-2). Ran single-file local repro confirming
exact same failures (6 pass / 2 fail, ~1ms genuine assertion). Read full test file and
prod implementation (`dataFreshnessTools.ts` + `freshnessSlaChecker.ts`). Traced
`getSlaThreshold` dynamic logic for `MARKET_HOURS_ONLY_SOURCES`. Computed actual threshold
at run-time (2026-06-09T16:42Z): 493 min vs test-data age of 12 min. Produced brief at
`docs/architecture-briefs/2026-06-09-ci-c1282a-data-freshness-triage.md`.

**verdict:** REWRITE-STALE (both TC-1 and TC-2)

**unique failing tests (2):**
1. TC-1: `detects HIGH breach on stale price data (age > threshold)` — 28ms genuine assertion.
   `expect(result.hasBreach).toBe(true)` fails; received `false`.
   Root cause: test assumes static 10-min threshold; prod uses dynamic off-hours threshold
   (minutesSinceLastWindowEnd + 30 ≈ 493 min at run time). 12 min < 493 min → no breach.
2. TC-2: `detects CRITICAL breach when age > 1.5× threshold` — 3ms genuine assertion.
   `expect(result.hasBreach).toBe(true)` fails; received `false`.
   Root cause: identical to TC-1 (same DB setup, same dynamic threshold).
   The CRITICAL assertion is inside a conditional `if (criticalBreach)` block — only
   the `hasBreach` assertion fires.

**raw-fail fingerprint:** 1–28ms genuine assertion (no SyntaxError, no ~5000ms timeout).
Neither contamination nor transport-hang. Both are genuine-assertion-no-timeout.

**what-considered:**
- **(a) CONTAMINATION (SyntaxError / wrong-value from leaked mock.module):** REJECTED.
  Zero `mock.module()` in this test file. Failures at ~1ms with direct property assertion.
  No telegram or other stub chain touches `detectDataFreshnessBreach` import path.
- **(b) TRANSPORT-HANG (~5000ms):** REJECTED. Both failures at 1–28ms. No MCP
  InMemoryTransport or Client.callTool() in this test file. Pure domain+interface call.
- **(c) FIX-PROD (prod broken):** REJECTED. The `MARKET_HOURS_ONLY_SOURCES` dynamic
  threshold is intentional design (FIX-SLA-WEEKEND-AWARE sprint). Price data that is
  12 minutes old at 16:42 UTC is not stale — the VPS push loop only runs during
  02:00–08:59 UTC. Prod is correct.
- **(d) REMOVE-OBSOLETE:** REJECTED. The underlying intent of TC-1/TC-2 (HIGH/CRITICAL
  breach detection for `price` signal) remains valid. The `detectDataFreshnessBreach`
  function exists in prod. No superseding sibling covers this exact path. Removal would
  drop coverage.
- **(e) REWRITE-STALE (CHOSEN):** Both tests were written during the Task 1282a RED phase
  assuming a static 10-min price threshold. Comments in TC-1 and TC-2 explicitly state
  "price threshold is 10 minutes" — this was true at write time, before
  `MARKET_HOURS_ONLY_SOURCES` dynamic logic was introduced. The fix requires:
  (1) adding an optional `now?: Date` param to `detectDataFreshnessBreach` for
  test-time determinism; (2) passing a frozen market-hours timestamp
  (`2026-06-09T04:00:00Z`) in TC-1 through TC-4 calls.

**why-decision:** Dynamic off-hours threshold is the correct domain contract and is
independently verified by the freshnessSlaChecker.ts unit tests. The test comment
"price threshold is 10 minutes" is a direct fossil of pre-MARKET_HOURS_ONLY_SOURCES
assumptions. Adding `now?` injection is the minimal additive fix with zero behavior
change for production callers (they omit the param and get `new Date()` as before).

**fix spec (2 files):**
- `apps/mcp-server/src/interface/mcp/tools/system/dataFreshnessTools.ts` line 79:
  add `now?: Date` to signature; line 87: replace `const now = new Date()` with
  `const now_: Date = now ?? new Date()`.
- `apps/mcp-server/src/__tests__/system-data-freshness.test.ts` TC-1/TC-2:
  add `frozenNow = new Date("2026-06-09T04:00:00Z")`; pass as third arg to
  `detectDataFreshnessBreach(db, undefined, frozenNow)`.

**projected delta:** 57 → 55 (−2). No collateral expected.

**coverage-retention:** TC-1/TC-2 intent fully retained post-rewrite. TC-3 through TC-8
untouched (already passing). No protecting sibling needed (REWRITE, not REMOVE).

**recommended-next-task:** FIX-CI-C1282a-DATA-FRESHNESS-REWRITE, type=BUG-FIX/MAINTENANCE,
owner=dev-mcp-server, 2 files, timebox ~20m.

**artefacts:**
- `docs/architecture-briefs/2026-06-09-ci-c1282a-data-freshness-triage.md`
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (this entry)

---

### STEP arch-S21 (DJ-GATE-1) · architect · 2026-06-09T18:00Z (TUESDAY)

**task-id:** SPIKE-TESTING-CI-ARCHITECTURE-RETHINK
**sprint:** CI-RED-RECONCILE
**mode:** spike (180m timebox), deep analysis + architectural rethink

**what-done:** Ran isolation probe on all 30+ failing test files (single-file bun test per file).
Bucketed into CONTAMINATION (passes alone) vs GENUINE (fails alone). Analyzed CI test architecture
options A/B/C. Chose recommended architecture. Produced batch remediation plan by failure class.
Wrote probe script scripts/ci-isolation-probe.sh. Updated dev-standards.md with pointer.

**what-considered:**
- Isolation-probe reveals: 4 CONTAMINATION files (13%), 26 GENUINE files (87%). Probe disproves
  the assumption that contamination dominates — GENUINE assertions against changed prod/config
  are the primary driver of the 55 remaining fails.
- Option A (sharding): 36% ceiling (only fixes contamination bucket). Does not address 87% GENUINE.
- Option B (mock.module-restore guard): zero cost, prevents regression, mechanical enforcement
  via meta-test. Recommended as Phase 1.
- Option C (retire gating apparatus): conditional on 0-fail — defer to Phase 4.
- CHOSEN: Option B first + class-based genuine-fix batches + Option A as follow-on optimization.

**why-decision:** The 55 CI fails are predominantly (87%) genuine test-vs-prod divergence, not
architectural contamination. Sharding optimizes the wrong problem first. The fastest path to
CI GREEN is: (1) remove/convert 4 DV tests; (2) rewrite 3 transport-hang files; (3) fix 3 mock-
stub-leak contaminators; (4) add now-seam for market-hours-gate; (5) update 6 config-drift
assertions; (6) triage 14 assertion-logic files. Projected trajectory: 55 → 0 across 6 batches.

**why-change:** Prior loop (per-cluster triage) optimized 21% of failing tests (Task NNNN naming).
Full isolation probe reveals 79% untracked. Architecture rethink replaces per-cluster with
per-class batch dispatch — more efficient.

**artefacts:**
- `docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md`
- `scripts/ci-isolation-probe.sh` (NEW — reusable isolation probe)
- `docs/policies/dev-standards.md` (pointer added)
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (this entry)

---

### STEP arch-S22 (DJ-GATE-1) · architect · 2026-06-09T18:30Z (TUESDAY)

**task-id:** BATCH0-CI-C-DV-DELIBERATE-VIOLATION-CLEANUP
**sprint:** CI-RED-RECONCILE
**mode:** TRIAGE CONFIRM (read-only + decision journal + dev spec; no apps/ edits)
**dispatch_seq:** 0
**projected_delta:** -4 (55 → 51)

---

#### Per-file triage table

| File | Claim | Live evidence | Verdict | Protecting sibling | Dev edit spec |
|---|---|---|---|---|---|
| `1331a-single-writer-guard.test.ts` TEST-2 | Cross-zone require() to nonexistent alert-engine path | `require("../../../alert-engine/src/infrastructure/config")` resolves to `apps/alert-engine/src/infrastructure/config`. `apps/alert-engine/` is a Go service (go.mod, cmd/, pkg/ only) — NO `src/` directory, NO TypeScript infrastructure layer. Bun confirms: `ResolveMessage: Cannot find module '../../../alert-engine/src/infrastructure/config'`. TEST-1 passes (3/4 pass in isolation). | CONFIRMED — REMOVE TEST-2 | TEST-1 ("TEST-1 (structural): two writers to same file cause SQLITE_BUSY") — in-zone, uses bun:sqlite directly, retains the single-writer-lock detectable-BUSY guarantee fully within mcp-server zone | Remove exactly 1 it() block: lines 47–59 in the file. Exact block: `it("TEST-2 (RED): alert-engine ServiceConfig must have ownDbPath !== market.db", () => { ... })` from `it(` at line 47 through the closing `});` at line 59. No other it() touched. |
| `DWF-is-trading-day.test.ts` (DWF-DEV-MCP-1) AC-P0-3-6 | Deliberate-violation control — test intentionally asserts wrong value to prove calendar is not a stub | File lines 95–106: comment block explicitly states "This test MUST go RED", "INTENTIONALLY WRONG", "If this test PASSES, the calendar is a stub". Assertion: `expect(result.is_trading_day).toBe(true)` on 2025-01-27 (known Tết holiday). `isVnTradingDay("2025-01-27")` returns `{ is_trading_day: false, ... }` — confirmed by live run (1 fail, 12 pass). This IS a genuine DV with explicit DV marker in source. | CONFIRMED — GENUINE DV. Verdict: CONVERT to Bun `.test.failing()` / `.fails()` wrapper (turns red-as-expected into green-passes). Do NOT remove — the DV intent (proving the calendar is not a stub) has long-term value as an executable specification. | The 12 passing tests in the same file (AC-P0-3-1 through Edge cases + getTodayVnDate) collectively retain full trading-day boundary coverage. Specifically AC-P0-3-1 (holiday=false), AC-P0-3-3 (weekend=false), and the corrected AC-P0-3-2 (Monday=true) retain the three-boundary guarantee. | Wrap the single failing it() block: change `it("AC-P0-3-6 DV: asserting holiday 2025-01-27 returns is_trading_day=true — MUST FAIL (proves calendar is not a stub)", () => { ... })` at line 99 to `it.failing("AC-P0-3-6 DV: asserting holiday 2025-01-27 returns is_trading_day=true — MUST FAIL (proves calendar is not a stub)", () => { ... })`. Exact change: replace `it(` at line 99 column 3 with `it.failing(`. No other lines touched. Bun 1.3.13 supports `it.failing()` (documented in bun:test). |
| `DWF-coordination-phase2.test.ts` DV-P2-4 | Stale DV assertion | PARTIAL CONTRADICTION WITH BRIEF — see detailed finding below. 3 tests fail in isolation (30 pass / 3 fail confirmed by live run). The failing tests: (1) "GREEN: flow file contains explicit ttl_seconds: 180 on per-work-item claims" line 291 — `expect(content).toContain("ttl_seconds: 180")` fails; (2) "RED (deliberate-violation): flow file missing ttl_seconds:180" line 300 — also fails on the same final `expect(content).toContain("ttl_seconds: 180")` at line 315; (3) "Step 0b: leader lock claim must have ttl_seconds: 1800" line 355 — `expect(content).toContain("ttl_seconds: 1800")` fails. Root cause: NB-COWORK-MAIN-SPLIT refactor (2026-06-03) extracted per-work-item claim logic from `main.md` into `slot-claim.md` (ttl_seconds: 180 confirmed present at line 41) and leader-lock logic into `leader-lock.md` (ttl_seconds: 1800 confirmed present at line 27). The `FLOW_FILE` constant in the test still points to `main.md` which is now a thin dispatcher (111L) with zero inline ttl_seconds values. | SEE CONTRADICTION NOTE BELOW | GREEN protecting siblings: tests 1 and 3 in DV-P2-4 (after path correction) retain the R1/AC-P2-5-3 flow-contract coverage; the 30 passing tests in the file retain all coordination-phase2 behavior guarantees | SEE DEV EDIT SPEC BELOW |

---

#### CONTRADICTION FOUND — DV-P2-4

The arch brief (Section 3, C-DV) states: "One is a deliberate-violation that fails because the prod file DOES contain ttl_seconds:180 (i.e., prod is correct and the DV is stale)."

**Live evidence contradicts this framing.** The failing mechanism for ALL THREE tests is identical: `main.md` does not contain `ttl_seconds: 180` or `ttl_seconds: 1800`. The DV test (test 2) fails for the SAME reason as the two "green" tests — not because "prod IS correct and the DV is stale" in the sense of a positive assertion. All three fail because the FLOW_FILE path is stale (points to `main.md` post-split, not to the sub-flow files).

**Classification correction:**
- Test 2 (the DV) is NOT "obsolete because prod file contains the value." It is CONFIG-DRIFT (wrong file path after NB-COWORK-MAIN-SPLIT).
- Tests 1 and 3 are NOT "genuine GREEN tests that fail because values are absent from the flow." The values ARE present in the flow — in `slot-claim.md` and `leader-lock.md`.
- All 3 are CONFIG-DRIFT with the same root cause: `FLOW_FILE` points to the wrong file after the main.md split.

**Revised verdict for DV-P2-4:**
- REMOVE test 2 (the DV `it("RED (deliberate-violation): flow file missing ttl_seconds:180...")`) — its assertion logic (`expect(content).toContain("ttl_seconds: 180")`) duplicates test 1's final assert, and the DV framing (proving the literal is PRESENT by asserting absence would fail) is vestigial once the FLOW_FILE is corrected. The DV adds no safety once test 1 is correct.
- REWRITE tests 1 and 3 — do NOT remove. Correct the `FLOW_FILE` constant (or add a second constant for `leader-lock.md`) so they point to the sub-flow files that actually contain the asserted values. These retain the R1/AC-P2-5-3 flow-contract coverage and will go GREEN after path correction.

**Projected delta impact:** The brief claims -4 from 3 DV files. With this correction:
- 1331a TEST-2: -1 (remove)
- DWF-is-trading-day AC-P0-3-6: .fails() wrapper → 0 fail (passes-as-expected)
- DWF-coordination-phase2 DV-P2-4: REMOVE test 2 (-1), REWRITE tests 1+3 to correct path (-2 more when path fixed)
- Total: still -4 fails cleared, but mechanism differs for DV-P2-4 (REWRITE tests 1+3 to correct sub-flow paths; only REMOVE test 2)

---

#### Dev edit spec — DWF-coordination-phase2.test.ts (DV-P2-4)

**Files touched (1):** `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts`

**Edit 1 — REMOVE the DV it() block (test 2 in DV-P2-4):**
Remove the it() block at lines 300–316:
```
  it("RED (deliberate-violation): flow file missing ttl_seconds:180 on per-work-item claims would fail this test", () => {
    const content = readFileSync(FLOW_FILE, "utf-8");
    ...
    expect(content).toContain("ttl_seconds: 180"); // RED if removed
  });
```
Exact removal: lines 300–316 inclusive (the entire `it("RED (deliberate-violation)..."` block through its closing `});`).

**Edit 2 — REWRITE test 1 (GREEN: ttl_seconds:180) to read slot-claim.md:**
Change `const FLOW_FILE = resolve(import.meta.dir, "../../../../docs/agents/cowork-team/flow/main.md")` at line 287 to split into two constants:
```typescript
const FLOW_FILE = resolve(import.meta.dir, "../../../../docs/agents/cowork-team/flow/main.md");
const SLOT_CLAIM_FILE = resolve(import.meta.dir, "../../../../docs/agents/cowork-team/flow/slot-claim.md");
const LEADER_LOCK_FILE = resolve(import.meta.dir, "../../../../docs/agents/cowork-team/flow/leader-lock.md");
```
Then update test 1 ("GREEN: flow file contains explicit ttl_seconds: 180") to use `readFileSync(SLOT_CLAIM_FILE)` instead of `readFileSync(FLOW_FILE)`.

**Edit 3 — REWRITE test 3 ("Step 0b: leader lock claim must have ttl_seconds: 1800") to read leader-lock.md:**
Update the test at lines 355–368 to use `readFileSync(LEADER_LOCK_FILE)` instead of `readFileSync(FLOW_FILE)`.

**Edit 4 — No change to remaining tests in DV-P2-4:** "R1 additional", "R3 additional" tests use conditional `step46Match` with early `if` guard — they will silently skip (no assertion fired) when `main.md` has no Step 4.6 section. These are acceptable no-ops but should be noted as candidates for follow-up C-CD cleanup.

**Protecting siblings retained:**
- Test 1 (after path fix to slot-claim.md): retains R1 enforcement that per-work-item claims use explicit ttl_seconds:180
- Test 3 (after path fix to leader-lock.md): retains AC-P2-5-3 enforcement that leader lock uses explicit ttl_seconds:1800
- All 30 other passing tests in DWF-coordination-phase2.test.ts: coordination-phase2 DB behavior fully covered

---

**what-done:** Live-read 3 target files. Confirmed claims by empirical test runs. Found 1 partial contradiction in brief framing for DV-P2-4 (not a blocking contradiction — verdict direction unchanged, but root cause and dev edit differ from brief). Produced exact dev edit spec per file with line anchors.

**what-considered:**
- (a) DV-P2-4 test 2 as "DV that fails because prod DOES have ttl_seconds:180": CONTRADICTED. Live run shows all 3 DV-P2-4 failures are CONFIG-DRIFT (wrong file path). The DV assertion and both green assertions fail identically on absent literal in main.md.
- (b) DV-P2-4 tests 1+3 as tests to REMOVE: REJECTED. These document live R1/AC-P2-5-3 contracts that are correctly enforced in prod. They should be REWRITTEN (path fix) not removed.
- (c) DWF-is-trading-day AC-P0-3-6 as REMOVE vs .fails(): CHOSE .fails(). The DV intent (proves calendar is not a stub) is valuable as an executable specification. .fails() turns it green-as-expected with zero coverage loss vs removal.
- (d) 1331a TEST-2 as REMOVE: CONFIRMED. Go service has no TypeScript infrastructure layer; path can never resolve. TEST-3 and TEST-4 are RED but NOT in scope for this batch (brief cure_recipe names TEST-2 only; TEST-3/TEST-4 are separate C-DV instances not listed in BATCH0).

**why-decision:** Brief claim CONFIRMED for (a) 1331a TEST-2 and (b) DWF-is-trading-day DV. Partial contradiction for DV-P2-4 — root cause is CONFIG-DRIFT not "stale DV assertion" as framed; revised verdict is remove DV test only, rewrite the 2 green tests with correct sub-flow file paths.

**note on TEST-3 / TEST-4 in 1331a:** TEST-3 (STOCK_PRICE_DB_PATH undefined) and TEST-4 (`../infrastructure/db/writerGuard.js` — which DOES exist at HEAD) are NOT in the cure_recipe for BATCH0. TEST-4 actually resolves now (`writerGuard.ts` confirmed present). TEST-3 is an env-var assertion. These are SEPARATE C-DV instances — out of scope for this triage. Dev must NOT touch them.

**artefacts:**
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (this entry, arch-S22)
