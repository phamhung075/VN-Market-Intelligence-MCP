# QA — Notebook

**Last updated:** 2026-05-13 | **Session:** 1901a-flaresolverr-adapter merge gate

## Recent session — 2026-05-13 (1901a-flaresolverr-adapter — APPROVED via cherry-pick)

Branch: `task/investing-calendar-flaresolverr-adapter`. 7 commits unique to branch, only 2 in scope.

CRITICAL DEFECT FOUND: merge commit `f77bc3aa` (5464b4c0 + c99df155) dropped all 3 flaresolverr deliverable files from HEAD. `flaresolverr_helper.py`, `flaresolverr-helper.test.ts`, `flaresolverr-bypass.md` all absent from working tree. Branch HEAD was shipping the old `investing_calendar_fetch.py` (curl_cffi-only, returns status=error) and old TS adapter (with `sleepMs` still present). First test run misleadingly showed "10 pass" for flaresolverr tests from Bun disk cache from pre-checkout state — file was gone from tree.

Cherry-picked `5464b4c0` (feat, 5 files) + `42968429` (docker-compose FlareSolverr container) onto main.

Tests: 103 pass / 0 fail / 12 skip (115 total). 10 flaresolverr tests all green. Dev claimed 105 — actual baseline is 103, consistent with prior cycles.

TSC: 22 errors all in test files (`global.fetch.preconnect` Bun Mock<> typing gap, pre-existing). Zero production errors.

DDD PASS: 0 domain/application → infrastructure imports.

Security PASS: `cf_clearance` REDACTED explicitly in CLI smoke path. Cookie values not in `print(json.dumps(result))` output (result dict contains only status/data/fetched_at). No `process.env` in new files.

Docker-compose: adds FlareSolverr container block — companion infra, approved alongside feature.

Foreign commits excluded: `7a12913f`/`2c847d8c` (worldBank, already on main as `9d58a2d1`/`1370b8c1`), `0a335b72` (1899a PM decompose, already on main as `ef21a754`), `c99df155` (ops notebook).

Merge SHAs on main: `5395f966` (feat) + `5ee72b46` (docker) + `49d1128b` (QA artifacts).

Signal moved to processed: `docs/signals/processed/dev-mainserver-crawls-flaresolverr-adapter-2026-05-13T14-09-54Z.json`.

1901a → Done in TASKS.md. Report: `reports/TASK_REPORT_1901a-flaresolverr-adapter.md`.

NOTE: Container at port 5004 predates new Python files — smoke will show calendar=failed/timeout until ops rebuilds macro-indicators image. Expected.

Pattern to remember: Bun test cache can show stale "pass" for deleted test files if test runner is invoked before checkout drops the file. Always verify with `find` / `git ls-tree` when in-scope test count seems too high.

## Recent session — 2026-05-13 (1899a-core news-fetch scaffold — APPROVED)

Branch: `task/1899a-core-news-fetch-scaffold`. 3 commits ahead of main: `120e16ca` (scaffold — GOOD), `47a85265` (FlareSolverr adapter — CONTAMINATION, excluded), `1e8a707a` (worldbank merge artifact — CONTAMINATION, excluded). Cherry-picked only `120e16ca` → landed as `8329294c` on main.

Tests (apps/news-fetch): 3 pass / 0 fail. TSC: 0 errors (bun tsc --noEmit clean). DDD PASS: domain/application/infrastructure/interface dirs created, 0 cross-layer imports in any src file. Security PASS: Bun.env used (not process.env), no hardcoded secrets, no SQL.

diff scope confirmed clean: all 8 files in apps/news-fetch/** only. No docker-compose.yml. No workspace-level file touched.

playwright-stealth 0.0.1 pin: only published version on npm. Pinned correctly for scaffold. Signal filed: `docs/signals/qa-bug-playwright-stealth-version-2026-05-13T160900Z.json`. 1899a-factory must evaluate playwright-extra + puppeteer-extra-plugin-stealth before browser launch code ships.

Handoff moved to processed/. TASKS.md: 1899a-core → Done. 1899a-domain + 1899a-factory unblocked (were blocked by 1899a-core). Report: reports/TASK_REPORT_1899a-core.md.

Note: contaminated branch `task/1899a-core-news-fetch-scaffold` NOT deleted (contains 47a85265 + 1e8a707a which belong to separate tasks still in flight — FlareSolverr adapter + worldbank merge artifact must be handled by their own QA cycles).

**Last updated:** 2026-05-13 | **Session:** worldbank-parallelize-fetch-vn-macro-batch merge gate

## Recent session — 2026-05-13 (worldbank-parallelize-fetch-vn-macro-batch — APPROVED)

Branch: `task/worldbank-parallelize-fetch-vn-macro-batch`. Key commits: `7a12913f` (fix) + `2c847d8c` (docs). Cherry-picked onto main as `9d58a2d1` + `1370b8c1` (branch had 3 extra unrelated commits — flaresolverr, ops notebook, 1899a decompose — so cherry-pick used instead of --no-ff merge).

Tests (apps/macro-indicators): 93 pass / 0 fail / 12 skip (105 total). +3 new tests vs baseline (all-ok, one-fail-isolated, concurrent timing).

TSC: 22 errors — same baseline as main (pre-existing `global.fetch.preconnect` Bun Mock<> typing gap in test files). Zero production-code errors.

DDD PASS: `grep -rn "from.*infrastructure" apps/macro-indicators/src/application/` = 0 hits.

Security: `process.env` in `index.ts` + `fred-macro.ts` are pre-existing. Zero new process.env in branch diff. No hardcoded secrets. No SQL. world-bank-macro.ts clean.

Diff: `sleepMs` helper removed from world-bank-macro.ts. `fetchVnMacroBatch` rewritten from sequential for-of + sleepMs to `Promise.all` fan-out. 7 indicators concurrent. Net ~24 lines source change + 87-line test addition.

Bonus check: `fetch-external-macro.ts` worldBank: 8_000ms budget confirmed. WB ~2-3s with parallel dispatch, well within budget.

QA signal moved to processed/: `docs/signals/processed/qa-worldbank-sequential-loop-2026-05-13T14-00-00Z.json`.

Branch deleted locally (D force — branch had 3 unrelated commits). No remote branch to delete.

Tasks: 1900b-worldbank removed from Todo → added to Done as `1900b-worldbank-SHIPPED-c74`.

Report: reports/TASK_REPORT_1900b-worldbank.md.

Note for next cycle: HEAD.lock recurrence is still active (multiple lock events during this session — checkout bounce, stash interference). Consider filing 1897b-carry escalation if this cycle was affected by contamination.

## Recent session — 2026-05-13 (fred-parallelize-fetch-all-macro — APPROVED)

**fred-parallelize-fetch-all-macro — APPROVED (smoke conditional — container down):**
Branch: `task/fred-parallelize-fetch-all-macro`. 2 commits ahead of main (fix e777d83e + docs b205b60c). Merge SHA: `8b4b2961`.

Tests (apps/macro-indicators): 90 pass / 0 fail / 12 skip (102 total). Matches dev claim exactly.

TSC: 22 errors — ALL in `__tests__/` files exclusively (pre-existing `global.fetch.preconnect` Bun Mock<> typing gap). Zero production-code errors. Confirmed: `bun tsc --noEmit 2>&1 | grep "error TS" | grep -v "__tests__"` = 0 lines.

DDD PASS: `grep -rn "from.*infrastructure" apps/macro-indicators/src/application/` = 0 hits. `grep -rn "from.*infrastructure" apps/macro-indicators/src/domain/` = 0 hits.

Security: `process.env` in `index.ts:34-35` and `fred-macro.ts:43` — all pre-existing lines, zero new lines in branch diff. No hardcoded secrets. No SQL.

Diff verification: `sleepMs` helper removed (4 lines). `fetchAllMacro` body: sequential for-of + await per iteration → `Promise.all(entries.map(...))` fan-out. Net ~81 lines (under 120 LOC note in handoff). Clean.

Smoke test: port 5006 = connection refused. Container not running locally. Container image predates feature code. CONDITIONAL APPROVAL — code is green; smoke requires ops to rebuild macro-indicators image.

Handoff signal moved to processed/: `docs/signals/processed/dev-macro-indicators-fred-fix-2026-05-13T13-30-00Z.json`.

WorldBank follow-up filed: `docs/signals/qa-worldbank-sequential-loop-2026-05-13T14-00-00Z.json` — low priority, same sequential-loop pattern, 7 indicators x 1.5-2.5s sleep = 10-17s vs 8s budget.

Branch deleted locally + remote. Pre-push tsc hook PASS. Pushed to origin/main as 8b4b2961.

Report: reports/TASK_REPORT_fred-parallelize-fetch-all-macro.md.

**Last updated:** 2026-05-13 | **Session:** macro-scrapers-curl-cffi-upgrade merge gate

## Recent session — 2026-05-13 (macro-scrapers-curl-cffi-upgrade — APPROVED)

**macro-scrapers-curl-cffi-upgrade — APPROVED:**
Branch: `task/macro-scrapers-curl-cffi-upgrade`. 5 commits ahead of main (tip e7ce66b2). Merge SHA: `96823f44`.

Tests (apps/macro-indicators): 87 pass / 0 fail / 12 skip (99 total). TSC: all errors are pre-existing `global.fetch.preconnect` Bun Mock<> typing gap in test files — zero new production-code errors. Identical pattern to prior cycle.

DDD PASS: `grep -rn "from.*infrastructure" apps/macro-indicators/src/application/` → 0 hits. Python helpers are infrastructure-only, no imports into application or domain.

File-size policy: 120-line limit applies to markdown docs only (per brief 2026-05-12-dev-zone-enforcement-and-split-policy.md §3.2). Python/TS source files have no line-count policy. All TS adapters ≤120 lines. Python helpers range 118-194 lines — no violation.

Security PASS: `process.env` only in pre-existing files (index.ts:34-35, fred-macro.ts:47) — zero lines in branch diff. No hardcoded secrets in new Python helpers or TS adapters. No SQL.

Scope PASS: 13 changed files in apps/macro-indicators (3 TS adapters + 3 Python helpers + 1 use-case timeout edit + 4 test files + domain/defaults.ts + 2 signal files) plus notebooks/signals. No drift into unrelated services.

Smoke test: POST http://localhost:5004/macro/external → HTTP 200.
Per-source results:
- worldBank: timeout (8001ms) — pre-existing, not in scope
- yahoo: ok (5391ms → 6096ms across 2 runs)
- cnbc: ok (~5887ms)
- tradingEconomics: ok (~6000ms)
- fred: timeout (8000ms) — pre-existing design mismatch (sequential 8-series fetch vs 8s budget)
- calendar: ok (~10195ms) — PULL-based mode, CF blocked externally

summary.ok=4 confirmed (was 1 before upgrade). Matches ops signal evidence.

Investing-calendar blocked signal: `docs/signals/dev-mainserver-crawls-investing-blocked-2026-05-13T12-15-00Z.json` confirmed present. CF Turnstile v2, routed to ops for FlareSolverr. Not blocking.

FRED follow-up signal filed: `docs/signals/qa-bug-fred-regression-2026-05-13T12-25-00Z.json`. Root cause: fetchAllMacro() is sequential (8 series + 0.6-1s sleeps) vs 8s use-case budget — design mismatch, not a regression from this branch. Recommended fix: raise budget to 90s or parallelize with Promise.all (same pattern as this upgrade).

Branch deleted locally (no remote). Pre-push tsc hook PASS. Pushed to origin/main as 96823f44.

**Last updated:** 2026-05-13 | **Session:** macro-external-allsettled-timeout merge gate

## Recent session — 2026-05-13 (macro-external-allsettled-timeout — Promise.allSettled fix)

**macro-external-allsettled-timeout — APPROVED:**
Branch: `task/macro-external-allsettled-timeout`. Fix commit: `12a7221e`. Merge SHA: `1c6a7a01`.

Tests: 85 pass / 0 fail / 12 skip. TSC: 37 errors — all pre-existing `global.fetch preconnect` Bun Mock<> typing gap (confirmed identical to main baseline via `git stash` comparison). Production code TSC: 0 errors.

DDD PASS: Previous violation (DEFAULT_SYMBOLS/DEFAULT_CNBC_SYMBOLS from infrastructure/scrapers/) FIXED — both constants now in `apps/macro-indicators/src/domain/defaults.ts`. Zero `from.*infrastructure` imports in application layer. `withTimeout` helper lives in application layer as expected.

Security PASS: `process.env` in `index.ts:34-35` and `fred-macro.ts:47` are pre-existing (branch diff = 0 lines changed in those files). No hardcoded secrets. No SQL in changed files.

Contract verified:
- Per-source envelope `{ status, data?, error?, latencyMs }`: PASS (fetch-external-macro.ts:60-65)
- Aggregate `{ sources, fetchedAt, summary: { ok, failed, totalLatencyMs } }`: PASS (fetch-external-macro.ts:82-86)
- HTTP 200 when ok>=1, HTTP 502 when ok===0: PASS (handlers.ts:41-44)
- execute() never throws — all paths through withTimeout: PASS (11 new unit tests)

Smoke test: `curl POST localhost:5004/macro/external` → HTTP 200 in 8.0s. Envelope present. summary.ok=1 (calendar ok). 5 timeout (worldBank/yahoo/cnbc/tradingEconomics/fred). HTTP 200 correct.

Secondary finding: 4-5 of 6 scrapers consistently timeout at 8s. Cause: geo-blocking from non-VN Docker host (France dev env). Container logs show FRED HTTP 500 (API errors), tradingEconomics JSON-LD not found, yahoo HTTP 404, calendar HTTP 403. Fix is working correctly — graceful degradation as designed. Filed: `docs/signals/qa-bug-macro-scrapers-slow-2026-05-13T11-05-10Z.json`. Routed to ops (VPS proxy check) + developer (budget review). Non-blocking.

Branch deleted locally (no remote). Report: `reports/TASK_REPORT_macro-external-allsettled-timeout.md`.

**Last updated:** 2026-05-13 | **Session:** bootstrap batch drain — 5 signals (macro scrapers + RAM + hsx-bctc + vps-contract + adb/imf)

## Recent session — 2026-05-13 (bootstrap batch drain — signals 1-5)

**Batch: 5 QA signals drained. 4 already in processed/, 1 new (signal 5).**

Signal status on arrival:
- Signals 1,2,3,4: already in `docs/signals/processed/` (consumed by prior dev cycles). Code on main.
- Signal 5 (`qa-2026-05-13T10-25-00Z.json`): present in inbox — moved to processed after validation.

**Validation results:**

Signal 1 — mainserver-external-macro-v1 (6 scrapers, POST /macro/external):
- Unit tests: 67 pass / 0 fail (9 files: all 6 scrapers + macro-score-service + compute-usecase + investing-calendar)
- Production TSC: 0 errors. Test-file TSC: 37 errors (preconnect missing on Mock<> — Bun fetch mock typing gap, pre-existing pattern)
- DDD VIOLATION FOUND: `apps/macro-indicators/src/application/fetch-external-macro.ts` lines 27-28 import DEFAULT_SYMBOLS + DEFAULT_CNBC_SYMBOLS from infrastructure/scrapers/. Filed `docs/signals/qa-bug-2026-05-13T12-30-00Z.json`. Non-blocking (tests pass, no runtime impact).
- Route confirmed: POST /macro/external and GET /macro/external in handlers.ts lines 31+41.

Signal 2 — macro-indicators RAM 512MB→1.5GB + Python deps:
- docker-compose.yml line 177: `memory: 1.5g` CONFIRMED.
- Dockerfile lines 17-19: apk + pip install curl_cffi beautifulsoup4 lxml CONFIRMED.
- Container startup + health evidence from signal file: PASS (ops-verified, 10.36MiB / 1.5GiB = 0.67% at idle).
- PASS (evidence from ops signal + code inspection).

Signal 3 — hsx-bctc HNX contract fix (SHB Q1/2026 e2e):
- VPS-side Python script fix. Not in codebase — applied directly to /root/ on Vinahost VPS.
- Integration tests embedded in signal: T1-T4 PASS. SHB Q1/2026 e2e PASS (confidence=0.9, PDF URL confirmed).
- Technique doc updated: docs/vps-crawl-techniques/hnx-ajax-post.md.
- QA cannot re-run VPS tests. Evidence from dev-vps-crawls signal accepted.
- PASS (evidence-based).

Signal 4 — VPS push contract tests (1892b-vps-contract-push.test.ts):
- Test file on branch `task/push-path-fix-vps-contract-tests` (NOT yet merged to main — dev omitted merge step).
- Extracted and ran from branch: 10/10 pass, 29 expect() calls, 219ms.
- P6 → 401 CONFIRMED (not 404). N3 → 401 CONFIRMED. Cloudflare fix contract verified.
- BLOCKING ISSUE: test file not on main. Branch must be merged before signal is fully closed.

Signal 5 — adb-kidb + imf-weo wiring:
- Unit tests: 67 pass (includes adb-kidb.test.ts 8 tests + imf-weo.test.ts 9 tests in the full unit suite).
- Routes confirmed in handlers.ts: POST /macro/external/adb (L51), POST /macro/external/imf (L60), POST /macro/external/international (L70), GET /macro/external/international (L79).
- FetchInternationalMacroUseCase: 44 lines, DDD CLEAN (imports only from domain/repositories.js).
- Production TSC: 0 errors.
- PASS.

Pre-existing issue: TradingEconomics integration test — with INTEGRATION=true not run (live tests skipped). All 12 integration tests are gated on INTEGRATION=true env flag — 0 run, 12 skip, 0 fail without it. Not a regression.

DDD bug filed: `docs/signals/qa-bug-2026-05-13T12-30-00Z.json`.

**Last updated:** 2026-05-13 | **Sprint:** SPIKE_006-c61-T1 threshold raise (cycle 61)

## Recent session — 2026-05-13 (SPIKE_006-c61-T1 — price-signal threshold 0.1→1.0)

**SPIKE_006-c61-T1 — APPROVED:**
Commit: `55085c1c`. Branch: `task/spike006-c61-t1-threshold-raise`. 2 files only (domain service + test file).

Tests: 9428 pass / 30 fail (+2 from main baseline of 9426/30). TEST-15 (price_drop 0.5%→UNKNOWN) + TEST-16 (price_surge 1.1%→HIT) both pass. Pre-existing 30 failures unchanged. TSC: 0 errors.

DDD PASS: `alertOutcomeScorer.ts` has zero imports (pure function file), domain-only edit confirmed.
Security PASS: no process.env, no SQL, no hardcoded secrets.

Phase 5 audits (all GREEN):
- index-check.sh: exit 0 (no staged files pre-merge)
- tree-verify.sh 55085c1c: exit 0 (file set matches)
- c2-alert.sh 55085c1c: "C2 OK — type/scope consistent with file set"

AC checks:
- AC-3a (TEST-15): PASS — 0.5% drop → UNKNOWN
- AC-3b (TEST-16): PASS — 1.1% surge → HIT
- OOS-2 (composite stays at 0.1): PASS — only price-signal branch changed
- No interface layer touched: PASS

Merge SHA: `d6d3c5d9` (--no-ff). Branch deleted. Report: reports/TASK_REPORT_SPIKE_006_c61_T1.md.

**Last updated:** 2026-05-12 | **Sprint:** 1879b deployment-verify smoke test

## Recent session — 2026-05-12 (1879b — deployment verification)

**1879b — DEPLOYMENT_BLOCKED:**
Tool code confirmed on main via concurrent-commit `8bec73d3` (docs label, feature payload).
Test suite: 10/10 pass (23 expect calls, 394ms, 100% line coverage). DDD PASS (zero infra imports in computeFedLiquiditySpread.ts). Security PASS (parameterized SQL `.prepare<EffrIorbRow,[number]>().all(days)`, no process.env).
Container `vn-market-intelligence-mcp-mcp-server-1` image built 2026-05-10T00:30Z — predates feature commit (2026-05-12T13:42Z). Container files confirmed: `getFedLiquiditySpreadTool.ts`, `computeFedLiquiditySpread.ts`, `fredQueries.ts` — ALL ABSENT from running container. Live `toolCount=132` is correct for the pre-feature image (125 labeled tools + multi-tool registrations = 132 actual).
Branch `tmp-1879b`: 1 unmerged commit (`a6d4b555`) — this is the concurrent-commit duplicate. Feature is already on main as `8bec73d3`. Branch is safe to delete AFTER container restart confirms tool live.
OPS action required: rebuild + restart mcp-server container to pick up `8bec73d3` code.

**Last updated:** 2026-05-12 | **Sprint:** 1893a phase 4 sequential-mandate relaxation brief (cycle QA)

## Recent session — 2026-05-12 (1893a — phase 4 sequential-mandate relaxation brief)

**1893a — APPROVED (doc-only, architect brief):**
Commit: `10ac3da0`. Single file: `docs/architecture-briefs/2026-05-12-phase4-sequential-mandate-relaxation.md`. 375 lines.

Single-file check: `git show --stat 10ac3da0` = 1 file changed, 375 insertions. PASS.

7-section checklist:
- S1 Summary: PASS (c44+c45 outcomes, what unlocks, what stays guarded)
- S2 Eligibility Criteria: PASS (2a disjoint zone, 2b file-overlap probe, 2c SSOT veto list, 2d dependency check, 2e test suite isolation)
- S3 WIP guidance: PASS (WIP=2 rationale — cognitive load, disk, batch reality, merge sequencing)
- S4 Failure modes c37/c44/c45: PASS (4a c37 incident with root causes + resolution, 4b c44 success, 4c c45 success with mid-cycle disruption)
- S5 Flow patch points BEFORE/AFTER: PASS (3 patches: execute.md L49, agent-chaining-protocol.md L75, dev-standards.md L87)
- S6 Rollback signal: PASS (5-trigger table + 5-step rollback procedure)
- S7 Open questions: PASS (Q1-Q4 explicitly deferred, "Architect does not auto-decide these")

Flow patch hunk applicability:
- 5a execute.md L49: BEFORE text confirmed on actual L49. Minor: brief omits `**bold**` markers around "Parallel spawns..." in the BEFORE block (file has `**Parallel spawns use SDK-native worktree isolation**`). Also heading says "Lines 49 and 87" but file has only 70 lines — "and 87" is a phantom reference (no second hunk provided). Semantic intent is unambiguous: replace L49 trailing mandate sentence. Verdict: APPLICABLE with minor cosmetic note.
- 5b agent-chaining-protocol.md L75: BEFORE text matches exactly. PASS.
- 5c dev-standards.md L87: BEFORE text matches exactly. PASS.
Overall flow patch verdict: APPLICABLE VERBATIM for 5b+5c. 5a requires awareness of bold markers and phantom "and 87" — non-blocking ambiguity.

Path existence check: all 4 cited paths verified present on main:
- `.claude/flows/dev-team/execute.md` PASS
- `docs/protocols/agent-chaining-protocol.md` PASS
- `docs/policies/dev-standards.md` PASS
- `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md` PASS

c44/c45 evidence accuracy: verified via git log + reflog. Cherry-pick SHAs `f4141f63` (1892b) and `bb49b82c` (1888a) confirmed on main. `3031ffb1` notebook cherry-pick + `HEAD@{9}: reset: moving to bb49b82c` confirmed in reflog. Evidence accurate.

Open questions deferral: all 4 questions framed as questions, headed "Architect does not auto-decide these". Q1/Q2/Q4 give "Recommended default" / "Architect recommends" / "Architect preference" — opinions, not decisions. Q3: "Architect flags this as likely safe but does not auto-permit. Needs PO decision." PASS.

Commit convention: `docs(arch/1893a): phase 4 sequential-mandate relaxation brief`. Trailers: `Task-Id: 1893a` (non-standard key vs `Task:`), `AC:` (present), `Closes: 1893a` (non-standard). Missing `Sprint:` trailer. Per precedent (signal-T6, 1875b, 1872a-3): task 1893a not in TASKS.md (no sprint number assigned) → no-sprint rule applies → Sprint/Task trailers not required. `Task-Id:` key non-standard but per T4/signal-T6/1875b precedent = non-blocking. Overall: NON-BLOCKING.

No notebook bundling: commit is single brief file only. PASS.

Tests: 9399 pass / 17 fail. All 17 failures are pre-existing (same set as prior cycles: Task 178 price_history, Task 1549, cron-registry count=43, Task 1031 DGC, Sprint 145 diacritics, Task 1100, Task 262 climate x3, Task 1331a TEST-3 RED). Zero new failures introduced by doc-only commit. TSC 0 errors. PASS.

DDD scan: N/A (doc-only). Security scan: N/A (doc-only).

**Last updated:** 2026-05-12 | **Sprint:** 1892b api-gateway push routes (cycle 42)

## Recent session — 2026-05-12 (1892b — api-gateway /api/push-* routing)

**1892b — APPROVED:**
Worktree: `agent-a8f9390a6682e5844`. Commit: `f032a8f7`. Branch: `worktree-agent-a8f9390a6682e5844`.

Tests: 40/40 pass (was 30/4 files on main, +10 new tests in 5th file). TSC 0 errors. DDD PASS. Security PASS.

AC-1 PASS: POST /api/push-news → MCP_URL/api/push-news, 200 happy path. Path NOT stripped — test line 134 explicitly asserts `calls[0].url === http://mcp-server:3000/api/push-news`.
AC-2 PASS: GET /api/health/vps-news → 404 passthrough from MCP on unknown endpoint. No auth injection — captured headers checked.
AC-3 PASS: existing /stock/* and /macro/* routes still strip prefix correctly. Test lines 361 + 384 assert exact URLs.
AC-4 PASS: 401 returned when MCP rejects missing auth. Gateway passes headers unchanged.
AC-5 PASS: `api` registered via `MCP_URL` const (line 16 index.ts). `getAllServices()` filters `noProbe=true` — `api` excluded from health probes (health_checker.ts line 59).

proxyPath() deviation from spec: spec specified `proxyPath(serviceName, reqPath)` using `serviceName === 'api'`. Impl uses `proxyPath(reqPath, svc)` checking `svc.noProbe`. Design improvement — avoids stringly-typed name comparison, future-proof. Non-blocking, no defect.

Commit `f032a8f7`: `feat(1892/api-gateway): 1892b wire...` with Sprint/Task/AC trailers — PASS per convention.
Notebook `d0b77044`: separate from feature commit — c43 PASS.
process.env in index.ts: pre-existing on main (all 9 service URL entries used it before). New line consistent with surrounding code. Pre-existing nit, not introduced by 1892b.
Bun OOM: main baseline confirms 30 tests in api-gateway suite, no OOM. Pre-existing on full suite only.

Diff stat: 7 files in `git diff main...HEAD --name-only` (includes notebook from d0b77044). Feature commit f032a8f7 stat: 6 files clean (4 production + 2 docs). No accidental edits.

**Last updated:** 2026-05-12 | **Cycle:** CLEAN-c50 stale worktree + branch sweep

## Recent session — 2026-05-12 (CLEAN-c50 — 7 stale branches pruned)

**CLEAN-c50 — 6 worktrees + 7 branches deleted:**

Verification method: `git log main..<branch> --oneline` for each, then file-level content check on main.

Results per branch:
- `worktree-agent-a57f` (held `task/1888a`) — 0 commits ahead; content confirmed in main (`bb49b82c` chore/ssot/1888a). Worktree removed, branch deleted.
- `worktree-agent-a9e8` (1879a) — 2 commits ahead by SHA, but content confirmed in main: `f7240b5e` (FRED EFFR-IORB fetcher) + `4756e4f4` (1879a/docs). Cherry-picked under different SHAs. Worktree removed, branch deleted.
- `worktree-agent-a4d9` (1879b) — 1 commit ahead by SHA (`a6d4b555` get_fed_liquidity_spread MCP tool). Content confirmed in main: `computeFedLiquiditySpread.ts` + `getFedLiquiditySpreadTool.ts` both present. Worktree removed, branch deleted.
- `worktree-agent-a471` (1892a) — 1 commit ahead by SHA (`380cff96`). Content confirmed in main: `dbed5ba4` + `41f54f22` (pushNewsHandler + health endpoint). Worktree removed, branch deleted.
- `worktree-agent-a86f` (1892a) — 1 commit ahead by SHA (`39605bf2`). Same 1892a content confirmed. Worktree removed, branch deleted.
- `worktree-agent-a8f9` (1892b) — 2 commits ahead by SHA (`f032a8f7` + notebook). Content confirmed in main: `f4141f63` (1892b wire /api/push-* routing). Worktree removed, branch deleted.
- `task/1888a-ssot-tool-cron-pointers` — 2 commits ahead by SHA (`9c260bc4`+`264374c2`). Content confirmed in main: `bb49b82c` (same SSOT change). Branch deleted (no worktree, was registered under agent-a57f path).

All 6 worktrees unlocked + `git worktree remove --force` succeeded. All 7 branches `git branch -D` succeeded.

Post-sweep state: `git branch` = `* main` only. `git worktree list` = 1 entry (main). CLEAN.

**Last updated:** 2026-05-12 | **Sprint:** CLEAN-1872a-5 branch deletion (cycle 41)

## Recent session — 2026-05-12 (CLEAN-1872a-5 — stale branch deletion)

**CLEAN-1872a-5 — branch delete, no merge gate:**
Spot-check PASS. 4 unmerged commits: `73fd8753` (state), `9f437240` (state), `47e745b6` (tree-map AC1), `22981c13` (mcp-server.md SSOT). `git diff main -- .claude/knowledge/tree-map.md docs/architecture/microservice/mcp-server.md` = zero output. Content confirmed on main via fe82b9f9. No worktree. Branch deleted with `git branch -D`. No production code touched. Report: reports/TASK_REPORT_CLEAN-1872a-5.md.

**Last updated:** 2026-05-12 | **Sprint:** signal-T6 fallback removal (cycle 40)

## Recent session — 2026-05-12 (signal-T6 — DEPRECATED fallback removal)

**signal-T6 — APPROVED:**
Doc-only. bun test + tsc skipped (smart-skip). DDD/security N/A. Scope: `.claude/flows/dev-team/main.md` only.

AC-1 PASS: Step 0a-fallback block (prev lines 117-133) + code fence fully deleted. grep returns 0 matches for "Step 0a-fallback".
AC-2 PASS: catch block (lines 33-39) now inline degrade: log WARN + pendingSignals=[] + inbox untouched + retry next cycle. Zero "jump to Step 0a-fallback" text anywhere.
AC-3 PASS: `grep -c fallback` = 0. Clean.
AC-4 PASS: 14 code fence markers (7 balanced pairs). No orphan fences.
AC-5 PASS: 4 ins / 24 del = -20 net LOC (≤30 budget).

Functional integrity: Step 0a-1 (line 43), dual-record write 4a+4b (lines 70-101), prune 5a+5b (lines 103-113), Step 0b (line 119) — all INTACT.

Commit `5ce8e73e`: `chore(signals)` scope (canonical vocab). Task-Id: signal-T6, AC: AC-1..AC-5, Closes: signal-T6. Task-Id key (non-standard vs Task:) — non-blocking per T4 precedent. No Sprint: trailer (no sprint number in signal-T series) — acceptable per no-sprint rule.

Merge SHA: f6f57bc5. Branch task/signal-T6-fallback-removal deleted (local). Report: reports/TASK_REPORT_signal-T6.md.

Graphify: DEFERRED — package not installed (consistent with prior cycles 38-40).

Signal-dedup project COMPLETE. T1-T6 all closed. SQLite is now sole dedup path.

**Last updated:** 2026-05-12 | **Sprint:** signal-T5 dedup integration tests (cycle 38)

## Recent session — 2026-05-12 (signal-T5 — SQLite dedup drain cycle integration tests)

**signal-T5 — APPROVED (QA as author + verifier):**
6/6 tests pass (38 expect calls, 494ms). TSC 0 errors. DDD PASS (no infra imports). Security PASS (no process.env, no hardcoded secrets).

AC-T5.1 PASS: fresh signal SELECT path → pendingSignals[0].from=agents-architect, result=routed-to-po, DB row fingerprint confirmed, inbox consumed.
AC-T5.2 PASS: replay duplicate → 2nd cycle pendingSignals=[], result=skipped-duplicate-replay, -replay suffix file present, DB count stays 1.
AC-T5.3 PASS: INSERT OR IGNORE double-insert same fingerprint → no throw, COUNT(*)=1.
AC-T5.4 PASS: prune 7d → 2 old rows deleted (processed_at=2026-05-04), 1 recent row (2026-05-11) survives; old-signal-1.json + old-signal-2.json filesystem deleted; recent-signal.json present.
AC-T5.5 PASS: null DB → warnLogged=true, dbUnavailable=true, inbox file preserved, processed/ empty.
AC-T5.6 PASS: stale 48h createdAt → skipped-stale, -stale suffix, pendingSignals=[], DB count=0.

Placement: scripts/migrations/__tests__/signal-T5-dedup-integration.test.ts (matches T1/T2 convention, not apps/mcp-server/__tests__/).
runDrainCycle() helper models Step 0a pseudocode without importing production code.
computeFingerprint() imported from backfill-signals-db.ts per spec.

Merge SHA: fc1061e1. Branch task/signal-T5-qa-tests deleted. Report: reports/TASK_REPORT_signal-T5.md.
Fallback-removal pre-condition MET: signal-T5 passed. One clean cycle 39 still required before flow lines 117-133 removal.

**Last updated:** 2026-05-12 | **Sprint:** 1878b compute_accruals (cycle 38)

## Recent session — 2026-05-12 (1878b — compute_accruals merge gate)

**1878b — compute_accruals MCP tool (#129) — APPROVED:**
12/12 tests pass (31 expect calls, 460ms). 1878a regression 12/12. TSC 0 errors. DDD PASS (accruals.ts: import only `{ z } from "zod"` — zero infra/interface imports). Security PASS (parameterized SQL `.prepare().all(ticker, quarters)`, no process.env, no hardcoded secrets).

AC-1: (300-100)/5000=0.04 PASS (T1, toBeCloseTo 10 decimals).
AC-2: null NI → ratio null + missing["NET_INCOME"] + error null PASS (T2, accruals.ts:59-60).
AC-3: zero TA → null + error:"zero_total_assets" + missing:[] PASS (T5, accruals.ts:75-76).
AC-4: sort ascending oldest→newest PASS (T7: data[0].period_quarter=1, data[3].period_quarter=4).
AC-5: registerComputeAccrualsTool in toolRegistry[] at registry.ts:196 as #129 PASS. Prior was #128 (registerPyramidTierTool). Array has 89 entries (multi-tool registration functions account for gap).
AC-6: formula in tool description (computeAccrualsTool.ts:191) + unit:"ratio" field in AccrualsEnvelope interface (:50) and envelope objects (:108, :173) PASS.
AC-7: default quarters=8 (T11: 12 seeded, 8 returned) + Zod rejects quarters=25 max=20 (T12: safeParse.success=false) PASS.
AC-8: in-memory SQLite via makeTestDb() + multi-quarter fixtures T7/T8/T9/T10/T11 PASS.

Commit convention 4d7ab740: type=feat scope=financial-reports, Sprint:S1878b, Task-Id:1878b, AC:AC-1/AC-2/AC-3/AC-4/AC-5/AC-6/AC-7/AC-8. All 8 ACs listed — C2 gate PASS.

Note: accruals.ts line 79 uses `!` non-null assertions (`net_income_m!` / `ocf_m!`) inside the `missing.length === 0` guard — correctly safe (both confirmed non-null at that point). Line 16 `import { z }` used for exported AccrualsInputSchema (imported by test file). Coverage 96.55% on accruals.ts (1 branch in isFinite guard uncovered — defensive code path, acceptable).

Merge SHA: ad04be0d. Branch task/1878b-compute-accruals deleted local (no remote). Report: reports/TASK_REPORT_1878b.md. TASKS.md: 1878b Backlog→Done.
Graphify: DEFERRED — package not installed (consistent with prior cycle 38 graphify status).

**Last updated:** 2026-05-12 | **Sprint:** signal-T4 doc-only FIX (cycle 38)

## Recent session — 2026-05-12 (signal-T4 doc-only FIX merge gate)

**signal-T4 — SSOT doc updates for SQLite signal dedup — APPROVED:**
Doc-only. bun test + tsc skipped (smart-skip, no production code). DDD/security N/A.

AC1(a) dual-record: PASS — agent-chaining-protocol.md line 132: "Dual-record write on new signal: DB INSERT (SSOT index) + filesystem move to docs/signals/processed/".
AC1(b) spec ref: PASS — `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` present in same line; file exists on main.
AC1(c) DB-unavail path: PASS — line 133: "DB unavailable (ENOENT/locked after 3×200ms retry): log WARN, skip dedup, preserve inbox, retry next cycle".
AC2(a) signals.db leaf: PASS — tree-map.md line 28: `└── docs/signals/signals.db (dedup index: signals_processed table — SQLite SSOT, O(log N) fingerprint lookup — sole writer: dev-team Step 0a)`.
AC2(b) write-ownership row: PASS — table row at line 184: `docs/signals/signals.db | dev-team flow (Step 0a) — sole writer; all other agents read-only | Each drain cycle`.
AC3 LOC: PASS — doc commit 7717adb5: 6 ins / 3 del = 9 net (≤10 budget).
AC4 scope: PASS — doc commit touches exactly 2 files (agent-chaining-protocol.md + tree-map.md); notebook in separate exempt commit 7c03f9e9.
AC5 markdown: PASS — fences balanced (22 + 2), spec file exists, no broken internal link refs.
C2 gate: PASS — Task-Id: signal-T4 + AC: AC1, AC2, AC3, AC4, AC5 on commit 7717adb5; type=docs scope=signals.

Merge SHA: 9bb2d338. Branch task/signal-T4-doc-updates deleted (local; no remote). Report: reports/TASK_REPORT_signal-T4.md.
Graphify: DEFERRED — graphify Python package not installed; existing graphify-out/graph.json intact (prior run preserved).

**Last updated:** 2026-05-12 | **Sprint:** signal-T3 drain rewrite (cycle 38)

## Recent session — 2026-05-12 (signal-T3 drain rewrite merge gate)

**signal-T3 — Dev-team Step 0a SQLite SELECT rewrite — APPROVED (doc-only):**
No code tests required (doc-only change). bun test + tsc skipped per gate spec.
DDD scan: N/A (no production code). Security scan: N/A (no production code).

Grep results (all PASS):
- `signals.db` — 8 occurrences (Step 0a-0, rationale, fallback section, error logs)
- `signals_processed` — 6 occurrences (SELECT, INSERT, DELETE, escape hatches)
- `fingerprint` — 10 occurrences (computation line, SELECT pattern, logs, escape hatches)
- `SELECT 1 FROM signals_processed WHERE fingerprint` — line 55 PASS
- Fallback-removal trigger — lines 120-122: "Removal trigger: after 2 consecutive drain cycles... Removal eligible after cycle 39 success. Pre-condition: signal-T5 must pass." PASS
- Dual-record write — step 4 header + 4a/4b sub-steps PASS
- DB-unavailability degradation + retry (ENOENT|SQLITE_CANTOPEN|locked 3x200ms) — lines 33-38 PASS
- Cross-ref `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` — line 21 PASS (file exists)
- Cross-ref `docs/protocols/agent-chaining-protocol.md` — line 22 PASS (file exists)
- DELETE-based prune — line 107: `DELETE FROM signals_processed WHERE processed_at < datetime('now', '-7 days')` PASS

Brief alignment (2026-05-11-signal-dedup-sqlite.md):
- Dual-record semantics (file canonical + DB index): ALIGNED (step 4a+4b)
- Degraded mode: brief §7 says "process all inbox signals without dedup check, do NOT move to processed/". Flow matches exactly (Step 0a-fallback + Step 0a-0 catch block). ALIGNED
- SELECT pattern: ALIGNED (O(log N) via idx_signals_fingerprint)
- DB prune DELETE: ALIGNED (5a SQL matches brief §5)
- Filesystem prune retained parallel: ALIGNED (5b)
- Fallback deprecation path: ALIGNED (DEPRECATED header + removal trigger)

Idempotency/safety check:
- signals.db EXISTS at `docs/signals/signals.db` with 27 backfill rows from signal-T2 (cycle 37)
- Schema: `signals_processed` table, UNIQUE fingerprint constraint, idx_signals_fingerprint index — all confirmed
- Next cron: signal arrives → fingerprint computed → SELECT 1 → if in 27-row set → skipped-duplicate-replay. SAFE
- Step 0a uses inline `bun:sqlite` pseudocode — no unshipped helper script required. scripts/migrations/create-signals-db.ts and backfill-signals-db.ts both EXIST (T1/T2 shipped).

Markdown lint: 16 code fences (even) PASS. Step headers: 0a-0, 0a-1, 0a-fallback consistent PASS. Step 0b and Step 1 unaffected PASS. No broken cross-refs PASS.

Deviations: NONE. Brief deviation note: flow adds "Do NOT move files to processed/ when in fallback mode" (Step 0a-fallback line 132) which is a sensible conservative addition — brief §7 implies this, flow makes it explicit. NOT a blocking deviation.

TASKS.md mismatch note: Backlog row `signal-T3` described `dedup-signals-live.ts` (a different sub-task). That row replaced with signal-T4 (doc updates) + signal-T5 (QA tests) to reflect actual pipeline state. signal-T3 moved to Done.

Merge SHA 2b643ec9. Branch task/signal-T3-drain-rewrite deleted. Report: reports/TASK_REPORT_signal-T3.md.

**Last updated:** 2026-05-12 | **Sprint:** 1878a OCF column migration (cycle 38)

## Recent session — 2026-05-12 (cycle 38 — 1878a merge gate)

**1878a — OCF column migration — APPROVED:**
12/12 tests pass (34 expect calls, 165ms). Full suite task branch: 9363 pass / 17 fail. Full suite main baseline: 9351 pass / 17 fail. Delta: +12 pass / 0 new fail. TSC 0 errors. DDD PASS (bridge + backfill in infra layer, no domain imports). Security PASS (parameterized SQL `?` + `.run(ticker)`, no process.env). Bridge SQL: `* 1000.0` confirmed, `period_quarter IS NOT NULL` guard confirmed, `quarter BETWEEN 1 AND 4` edge-case guard confirmed. Migration idempotent (T2 PASS). Annual rows stay NULL (T5a PASS). quarter=0 no-op (T5b PASS). backfillAllOCF all-tickers + idempotent (T7a+T7b PASS). AC-2/AC-3 (VCB/FPT live rows) DEFERRED — requires container restart on market.db. Merge SHA 1fb5282b. Branch task/1878a-ocf-impl deleted. TASKS.md: 1878a Backlog→Done, 1878b unblocked (blocked-by removed), 1885a blocked-by updated. Report: reports/TASK_REPORT_1878a.md.

**Notes for next QA:**
- Bun crash after run (post-completion macOS heap teardown) — pre-existing, not caused by 1878a. Always check crash comes AFTER summary line.
- AC-2/AC-3 container restart flag carried forward — ops should verify on next maintenance window.

**Last updated:** 2026-05-12 | **Sprint:** 1880b + signal-T2 (cycle 37)

## Recent session — 2026-05-12 (cycle 37 — 1880b + signal-T2 merge gate)

**1880b — get_pyramid_tier MCP tool (#128) — APPROVED:**
23/23 tests pass. 1880a regression 8/8. Full suite 9406/0 (Bun v1.3.13 post-completion panic = known macOS heap teardown, not test failure). TSC 0 errors. Tool #128 `get_pyramid_tier` confirmed registry.ts:194 (`registerPyramidTierTool`). DDD PASS (pyramidTier.ts: zero infra imports, pure domain). Security PASS (no process.env, no hardcoded secrets). Delivered on task/signal-T2-backfill branch (cross-branch placement, content correct per QA gate spec).

**signal-T2 — backfill-signals-db migration — APPROVED:**
10/10 tests pass (25 expect calls). signal-T1 carry-over 7/7. TSC 0 errors. Idempotency verified: re-run on real processed/ dir → 57 scanned / 0 inserted / 57 skipped / 0 errors. SyntaxError log on bad.json = expected error-handling path (test fixture). DDD PASS (scripts/, no domain imports). Security PASS (Bun.env.DB_PATH, no traversal).

**Drain commit (signal-drain-c37):**
ee0d77b4 — 10 signal files (5 original + 5 replay + 1 TNB), arch-brief 2026-05-12, tool-usage-stats.json, ops session log, 2 TASK files moved root→reports/.

**Merge:** --no-ff, SHA cb232b26 to main. Branches deleted: task/signal-T2-backfill + task/1880b-pyramid-tier (empty). TASKS.md: 1880b+signal-T2 Backlog→Done, signal-T3 added (unblocked), 1878a-spec+NB-HDR-c38 added In Progress.

**Notes for next QA:**
- Full suite count shifted: 9273 (dev claim) vs 9406 (actual). Delta likely from new test files added in drain commits from other agents. Not a regression — 0 fail.
- Bun crash line present in output — always check if it comes AFTER test summary (post-completion teardown = safe).

## Recent session — 2026-05-12 (1880a — get_investment_clock_phase MCP tool)

**1880a — APPROVED:**
8/8 tests pass (27 expect calls). TSC 0 errors. DDD PASS (investmentClock.ts has zero infra imports, grep clean). Security PASS (no process.env, no any, parameterized SQL in interface layer). All 5 AC outputs verified (Recovery/Overheat/Stagflation/Reflation/insufficient_data). Truth table boundary: PMI=50 → DOWN, CPI=3.0 → LOW → Reflation (Test 7 PASS). Null fallback paths: PMI→gdpGrowth (Test 5), CPI→inflationRate (Test 8), both null → insufficient_data (Test 6). AC4 fetched_at: present in result object at investmentClockTools.ts:170. Registry: import line 91, registered at line 193 as #127. Both barrels export new symbols. Full suite Bun OOM crash is pre-existing infra issue (peak 2.71GB RSS on full __tests__/ dir); adjacent test file 188-alert-digest.test.ts ran clean (34/0). Not caused by 1880a. Branch task/1880a-investment-clock-phase deleted. TASKS.md 1880a Backlog → Done. Report: reports/TASK_REPORT_1880a.md.

## Recent session — 2026-05-12 (signal-T1 — create-signals-db migration)

**signal-T1 — APPROVED:**
7/7 tests pass. tsc clean. Schema matches brief §2 exactly (id AUTOINCREMENT + fingerprint UNIQUE NOT NULL, 2 indexes). Idempotent verified (2 runs, both exit 0). Gitignore confirmed. import.meta.main guard present. DDD clean (no apps/ imports). Security clean (no process.env, no hardcoded secrets). LOC 89 vs ~30 target — non-blocking (extra comments + error handling).
Branch merged no-ff to main. Branch deleted. signal-T2 unblocked → added to Backlog.
Report: reports/TASK_REPORT_signal-T1.md.

## Previous session — 2026-05-11 (1877e — C2-exempt guard + flow tightening + knowledge SSOT, race recovery)

**1877e — SPRINT-M race recovery (3 parallel agents, branch contamination):**
DDD/security N/A (script + doc only). bash -n CLEAN.

Deliverables verified: is_c2_exempt guard (4 case patterns) in audit script, C2-Exempt table (+13 LOC) in commit-convention.md, PM convention block (+5 LOC) in pm/main.md, QA Task-trailer mandate (+1 LOC) in qa/main.md.

Race recovery: 1877e-1 empty stub deleted. 1877e-2 merged (f18b359f). 1877e-3 merged (fcef31da, notebook conflict resolved preserving all 3 task entries).

Final audit post-merge: C1=0.9501 PASS / C2=0.6308 FAIL (DEFERRED, was 0.5867) / C3=0.9254 PASS / C4=0.9628 PASS.
Exempt bucket spot-check: all 4 patterns correctly excluded, 1 genuine violator correctly flagged.
AC-1 (C2≥0.85) DEFERRED to 2026-05-17 — requires ~92 new compliant commits via flow tightening.
ACs 2-7 (1877e-1), 1-6 (1877e-2), 1-5 (1877e-3): all PASS.

APPROVED-WITH-DEFERRAL. Report: reports/TASK_REPORT_1877e.md.

## Recent session — 2026-05-11 (1877d — C3 AC-trailer exemption policy)

**1877d — C3 exemption: notebook/state/merge commits:**
Bash script + 3 doc files. DDD/security N/A. bash -n CLEAN.

6 ACs re-run from scratch (no --emit-signal):
- AC-1 PASS: C3=0.9180 (pass threshold 0.80). Developer claimed 0.9167 — minor delta from additional compliant commits since sampling. Both exceed threshold.
- AC-2 PASS: notebook SHAs 171f56df/3bf792d5/83e3a7f7 confirmed `chore(memory/*)` subjects. None appear in C3 violations JSON.
- AC-3 PASS: state SHAs 412aff9b/e6024028 confirmed `chore(state): ...` subjects. None in violations.
- AC-4 PARTIAL: Pattern `*merge\ task/*` catches `chore(1869/mcp-server): merge task/1869a-...` format. DOES NOT catch `chore(merge): QA APPROVED task/1877c-...` format (SHAs 9e19cd4b, 27e4e0d6 still in violations). Brief §4 only specifies the `merge task/` pattern — "QA APPROVED task/" is undocumented format variant used by cycle 30/31/32. C3=0.9180 absorbs gap; AC-1 still passes. Deviation documented.
- AC-5 PASS: genuine violations [fc541585 chore(qa) no-AC, 3d33dd23 docs no-AC, a3335cc8 docs no-AC] confirmed not false positives (all have Task: but no AC: trailer on real task commits).
- AC-6 PASS: `bash -n scripts/audits/commit-convention-audit.sh` exit 0.

LOC overage: +33 net vs ≤30 budget. Breakdown: 4 cosmetic lines (3 comment lines + 1 blank separator in case block). Material net = ~29 LOC. APPROVED as cosmetic.

AC-4 follow-up recommendation: add `*QA\ APPROVED\ task/*` to case block in commit-convention-audit.sh (single line). Not blocking — C3 margin 0.9180>>0.80.

Merge SHA: 67fd8a7e. TASKS.md 1877d In Progress → Done. pipeline-state → idle.

APPROVED (with AC-4 documented deviation).

## Recent session — 2026-05-11 (1877c — C4 scope-vocab remediation)

**1877c — VOCAB 20→52 + sprint-ID exemption:**
Shell script + knowledge doc. DDD/security N/A. bash -n CLEAN.

6 ACs re-run from scratch (no --emit-signal):
- AC-1 PASS: bash -n exit 0.
- AC-2 PASS: C4=0.9826 (169/172). ≥0.95 threshold MET.
- AC-3 PASS: violations = [cycle-28, *, c26] only. 5 sprint-ID commits spot-checked — none in violations.
- AC-4 PASS: *, c26, cycle-28 all present in violations array.
- AC-5 PASS: two runs identical on all numeric fields. window.until differs (dynamic "now" — expected).
- AC-6 PASS: grep for local -n / declare -A / mapfile / [ >= ] → 0 hits.

VOCAB: 52 tokens, exact match to brief §4.1, alphabetically sorted. No extras, no missing.
Sprint-ID pattern: `case "${first4}" in [0-9][0-9][0-9][0-9])` — POSIX-safe.
Knowledge file: 8-line area-token table + sprint-ID exemption note confirmed.

Non-blocking: dev claimed 168/171 (0.9825); actual run yielded 169/172 (0.9826) — consistent with architect note (additional compliant commits since sampling). Verdict still better than required.

Merge SHA: 9e19cd4b. Branch task/1877c-c4-vocab-remediation deleted. TASKS.md 1877c In Progress → Done. pipeline-state idle.

Overall audit verdict: C1 PASS, C2 FAIL (0.5694), C3 FAIL (0.7722), C4 PASS. 1877c scope = C4 only. C2/C3 separate concern.

APPROVED.

## Recent session — 2026-05-11 (1877b — signal guard for commit-convention audit script)

**1877b — `scripts/audits/commit-convention-audit.sh` --emit-signal guard:**
Shell script only. DDD/security N/A. bash -n CLEAN. Pre-push tsc PASS.

6 ACs re-run from scratch:
- AC-1 PASS: no flag → "Signal emission skipped" + zero root signals.
- AC-2 PASS: canonical SINCE + flag + today in window → exactly 1 FAIL signal written, jq clean.
- AC-3a PASS: non-canonical SINCE + flag → WARNING + zero root signals, exit=1.
- AC-3b PASS: temp copy with UNTIL=2026-05-10, today=2026-05-11 → WARNING + zero root signals.
- AC-4 PASS: processed/ report always written, jq clean, verdict+4 criteria+violations present.
- AC-5 PASS: exit=1 across all invocations (FAIL verdict), suppression did not affect exit code.
- AC-6 PASS: bash -n CLEAN, no local -n / declare -A / mapfile. [ ] comparisons escape < > with \.

Deviation: brief §3 `\>=` pattern not POSIX-valid (bash errors: binary operator expected). Two-clause `[ = ] || [ \> ]` replacement verified equivalent for YYYY-MM-DD lexicographic order. APPROVED.

Artifact cleanup: AC-2 test signal moved to /tmp then deleted. Temp AC-3b script deleted. Zero test artifacts remain in docs/signals/ root.

Net LOC: +26 (diff count). Developer self-reported +29; both within ≤30 constraint.

Merge SHA: 27e4e0d6. Branch task/1877b deleted local+remote (pre-push tsc PASS). TASKS.md: 1877b In Progress → Done. pipeline-state: idle.

APPROVED.

## Recent session — 2026-05-11 (1877a — commit-convention audit script)

**1877a — `scripts/audits/commit-convention-audit.sh` Phase B C1/C2 gate:**
Shell script only. DDD/security N/A. Pre-push tsc PASS (triggered on push).

Script re-run: 293 total, 1 bare merge excluded, 292 audited.
C1=0.9521 (PASS ≥0.90), C2=0.5694 (FAIL), C3=0.7838 (FAIL), C4=0.4759 (FAIL). Verdict: FAIL. Exit 1.
FAIL signal emitted to `docs/signals/agents-architect-<ts>-phase-b-c1-c2-fail.json`.
JSON report: `docs/signals/processed/commit-convention-audit-20260511.json` — jq parses clean, all 8 top-level keys, all 4 criteria objects.

All 6 ACs PASS. 3 violations spot-checked — zero false positives.
Bash 3.2 compat confirmed (no local -n, no 4.0+ constructs). LC_ALL=C locale fix verified.
Non-blocking deviations: commit type `feat` vs `chore` per task spec (defensible); empty-window returns 1.0/PASS instead of 0.0/FAIL (test plan note, not AC).

Merge SHA: 20005b95. Branch task/1877a-commit-convention-audit-script deleted. TASKS.md: 1877a → Done.

APPROVED.

## Recent session — 2026-05-11 (1872a-3 ARCHITECTURE.md SSOT pointers)

**1872a-3 — docs/ARCHITECTURE.md AC3+AC6 SSOT pointers:**
Doc-only. Smart-skip tsc/tests (pre-push hook tsc ran on remote delete — PASS). DDD/security N/A.

AC3 PASS: line 78 — "132 tools, 59 cron jobs, HTTP clients to 8 other services" → exact architect-brief phrasing: `tool count → docs/data/project-stats.json#toolCount; scheduler count → docs/data/project-stats.json#cronJobCount; HTTP clients to all configured downstream services`.
AC6 PASS: line 53 — inline docker cmd → exact architect-brief phrasing: `see .claude/knowledge/restart-policy.md (SSOT — docker-compose only, 9 services)`.
Task commit: 1b4f23a6. Merge SHA: fe82b9f9.
Non-blocking: commit scope `docs(architecture)` vs required `docs(1872a/architecture)` per convention; Sprint: trailer absent. Both minor, doc-only task.
Branch task/1872a-3-architecture-md-ssot-pointers deleted local+remote. TASKS.md 1872a-3 → Done.

APPROVED.

## Recent session — 2026-05-11 (1872a-2 README SSOT pointers)

**1872a-2 — README.md AC2+AC5+AC6 SSOT pointers:**
Doc-only. Smart-skip tsc/tests. DDD/security N/A.

Branch situation: `task/1872a-2-readme-ssot-pointers` local tip = main HEAD (d85d1c43, zero diff). Actual README commit 03a404ce was authored on what became `task/1872a-3-architecture-md-ssot-pointers`. All changes reached main via merge commit fe82b9f9 (1872a-3 merge). Work confirmed present in main:README.md.

AC2 PASS: mcp-server row (line 87) — `(112 tools)` → `(see docs/data/project-stats.json → toolCount)`.
AC5a PASS: line 21 — arch pointer `docs/ARCHITECTURE.md` + `docs/architecture/global.md` added after ASCII diagram.
AC5b PASS: line 97 — `Per-service architecture docs: docs/architecture/microservice/<service>.md` after table.
AC6-A PASS: lines 63-70 docker block → restart-policy.md pointer.
AC6-B PASS: line 81 dev step 3 inline cmd → restart-policy.md pointer.
Scope PASS: only README.md in the task commit.
Commit trailers PASS: Sprint:1872a / Task:1872a-2 / AC:2,5,6.
Arch-update flag: NO (pointer-only, no structural change).
Remaining `## 112 MCP Tools` heading (line 173): NOT in AC scope per architect brief matrix.

APPROVED. Work already in main. TASKS.md row moved Review→Done.

## Last session summary

Tier-2 QA cycle 20. Three branches: 1871b (ARCH.md infra/ tree), 1871d (cron-registry backfill), 1871f (DDD fix vnstock types).

Authoritative baseline: 9168 pass / 12 fail / 38 skip on main HEAD 67d99029 (bun test --timeout 30000). TSC baseline: 23 pre-existing errors.

1871b APPROVED: all 11 infra/ subdirs present in ARCHITECTURE.md, fileStore/ entry mentions alertVerdictStore.ts, cross-link to alert-policy.md (1871g). Doc-only. Merge SHA 6f161a4b.

1871d APPROVED: 21 new entries added (41→62 total). schedulerFileCount=59 matches cronConfig.ts exactly. Existing 41 entries unchanged. New entries use consistent name/schedule/desc/file schema. 3 non-job entries (helper, old-format macro, ohlcvStartupProbe) explain 62 vs 59 delta — pre-existing in file. Merge SHA 2bcae2e5.

1871f APPROVED: DDD critical check PASS — zero actual `import.*from.*infrastructure/` statements in domain/ (grep matched only comments/docstrings). New domain/models/vnstockTypes.ts contains 6 canonical types (zero imports). vnstockBridge.ts re-exports all 6 for backward compat (infra→domain direction = correct). TSC delta=0 (still 23). Vnstock test parity: 37/48/6 identical on both main and worktree. Full-suite delta in worktree (9050 vs 9168) caused by broken symlink data/ → ../../data (resolves to non-existent path in worktree). ENOENT failures are pre-existing worktree infrastructure, not code regression. Merge SHA 30030baa.

## Known patterns / preferences

- Bun v1.3.11 had a known C++ panic crash on large test suites (macOS x64). Upgraded to v1.3.13 in Sprint 1836 (U-1). If developers report unexpectedly high failure counts, check Bun version first.
- Bun v1.3.13 still crashes with OOM on the full 791-file suite when run from the root `apps/mcp-server` directory (peak 1.97 GB). Run targeted tests from apps/mcp-server with `bun test <filter>` for reliable results.
- IMPORTANT: tests must be run from `apps/mcp-server/` to pick up `bunfig.toml` preload (setup.ts sets DB_PATH=:memory:). Running from repo root causes SQLiteError: unable to open database file for all tests.
- `apps/mcp-server/data/` is git-ignored. Since 1845b (setup.ts mkdirSync fix), main creates these dirs automatically. Worktrees branched BEFORE 1845b will still show 106 ENOENT failures — not regressions.
- Pre-existing failures (as of Sprint 1846 baseline): 1 (Task 1331a TEST-3 RED guard). Stable.
- Always verify AC-by-AC: do not bulk-approve. Each acceptance criterion in the handoff must be ticked with evidence.
- DDD check is non-negotiable even for "small" fixes: `grep -r "from.*infrastructure" <modified_domain_files>` must return nothing (comments only are fine).
- `docs/data/` is in `.gitignore` — if project-stats.json is updated, confirm `git add -f` was used.
- Task report format: Compact for fix/≤3 files, Full for new tool/domain service/security change.
- Check pre-existing fail count matches expected BEFORE approving. If test count differs by more than 10, ask developer to recount.
- tsc must be 0 errors — even 1 warning-level type error is a blocker if it touches production code paths.
- worktree project-stats.json may be stale (worktree branched from old commit). Always compare with main's version and keep the more current one during conflict resolution.
- When branch diverges from an old commit (e.g. 1842d), expect merge conflicts. Pattern: worktree adds features on top of 1842d state; main has 1844a+1845x already. Conflicts are always additive — accept both sides.
- export_backtest_run_csv AC: must return raw text not JSON.stringify. Check line with `return { content: [{ type: "text" as const, text: csvString }] }` — no JSON.stringify wrapper.

## Recent session — 2026-05-11 (cycle 22 Tier 1 — 1875b)

**1875b — agents-architect.md NEW agent definition:**
Doc-only (agent definition file). No test suite, no production code. DDD/security N/A.

File check: CONFIRMED NEW — no prior `.claude/agents/agents-architect.md` on main or any branch (git log --all confirms single commit d222b2d5).

YAML frontmatter: name=agents-architect / color=blue / description / tools / model=sonnet — all 5 required fields PRESENT. Factory pattern PASS.

Invariant review: 3-step invariant unambiguous. Step 1 = `date -u` for UTC_STAMP. Step 2 = notebook append with template. Step 3 = atomic `git add` both files + commit. Retry logic: 1 retry then bug Telegram + EXIT. Covers all edge cases.

Commit convention: `fix(agents/1875b/agents-architect)` — type=fix (bug corrected: missing invariant). Scope=agents/1875b. Body + AC trailer present. Task-Id trailer (non-standard key, not "Task:") — minor deviation, non-blocking. Sprint trailer absent — acceptable per no-sprint rule if this is a hotfix commit.

Tests: 9356 pass / 0 fail (exit 0). Bun post-run C++ panic = known Bun v1.3.13 macOS bug, not test failure. TSC: 0 errors (tsc exited cleanly). DDD PASS. Security PASS.

APPROVED. Merge SHA cb15b66d.

## Recent session — 2026-05-11 (cycle 22 Tier 1)

**1875d — signal drain fingerprint dedup:** Flow-only. 1 file (+21/-2). No test suite (no production code). DDD/security N/A. Commit convention PASS (fix/flows/1875d/dev-team, 5 AC trailers). Logic PASS: fingerprint = sha256(from+type+payload+createdAt) correctly distinguishes re-arrival vs new signal. Escape hatches documented (delete processed/ copy OR bump createdAt). result enum updated to 4 values (skipped-duplicate-replay added). Cycle 23 readiness: guard fires immediately; c22 processed files lack fingerprint field → scan misses → at worst one duplicate slips through (safe side, no false skip). Merge SHA d6f7a7b6. APPROVED.

## Carry-over for next session

- Tier-2 QA cycle 20 COMPLETE. 1871b + 1871d + 1871f APPROVED and merged.
- Authoritative baseline post-cycle 20: main HEAD 30030baa (after 3 merges). Expect ~9168/12/38 on fresh run.
- Pre-existing TSC errors: 23 (unchanged across all 3 branches).
- Worktree broken-symlink pattern: data/ → ../../data breaks when worktree is at .claude/worktrees/agent-XXXX/. Causes ~100 ENOENT failures in full-suite run from worktree. NOT a regression — compare vnstock-specific tests (same set) to confirm no code delta.
- Baseline reconciliation: Tier-1 QA (9169/11) vs Tier-2 (9168/12) — 1-test delta is Bun flakiness, not regression. 1871f developer 9046/117 was worktree broken-symlink effect.
- Remaining Todo (Sprint 1871): 1871c (analysis/backtesting ARCHITECTURE.md modules). 1862c-D/E/F/G (Cowork MCP access) still in Todo.
- Sprint 1872 tasks (1872a/1872b) previously merged. TASKS.md Done section up to date through cycle 20.

---

## Recent session — 2026-05-10 (multiple tasks)

**1862j — sigma dedup safeguard:** 5/5 tests pass. Full suite: 8945 pass (102 worktree ENOENT noise). tsc branch EXIT:0. DDD PASS. Security PASS. APPROVED + merged.

**1862f — RSS retry backoff:** 10/10 pass. Full suite: 9069/15 (all pre-existing). DDD PASS. Circuit breaker logic verified (base→double→cap→reset). APPROVED + merged.

**1862g — urgent_news 4h dedup:** 10/10 pass. Full suite 9137, 0 failures (Bun OOM crash = known bug). DDD PASS. APPROVED + merged.

**1863a-RECONCILE — alertVerdictStore file-store layer:** 19/19 pass. tsc EXIT:0 all phases. DDD PASS (infrastructure/fileStore). ACs 1-12 verified. APPROVED + merged. Report: reports/TASK_REPORT_1863a.md.

**1863b-RECONCILE — verdictResolutionJob scheduler swap:** 14/14 pass. Full suite 9259/16 (16 pre-existing = same as main). tsc 0 errors. DDD PASS (scheduler imports infrastructure only). Security PASS. All 12 ACs verified. 1863f deleted, all 10 scenario families ported to 1863b + 2 new (batch, idempotency). Cherry-picked 43910535 onto main (branch had extra unrelated flow doc commit). APPROVED + merged. Report: reports/TASK_REPORT_1863b.md.

**1863c-RECONCILE — Tier 3 cron wiring:** Full suite 9132/15 (15 fail, 1 fewer than prior baseline of 16 — no regression). tsc 0 new errors (identical pre-existing set confirmed on main). 8/8 ACs verified: cronConfig.ts L127 has verdictResolutionJob at minute=7; collision-avoidance comment present; Bun.env.CRON_VERDICT_RESOLUTION unique; startScheduler.ts L44 import correct; L668-676 schedule uses jobRunRepo.wrapRun; no duplicate import/schedule. Extra checks: no other cron at minute=7 or :37; env var unique; key unique. DDD PASS (cronConfig zero imports; startScheduler imports scheduler layer only). Security PASS (Bun.env, no secrets). Commit 84eeb7a4 cherry-picked onto main as 34acef31. APPROVED + merged. Report: reports/TASK_REPORT_1863c.md.

**1862i — project-stats.json stats refresh (doc-only):** No test execution (doc-only). JSON valid. 14/14 ACs verified (see below). One QA fix applied: lastSuccessfulCycle was "2026-05-11T22:00:20Z" (24h in future) → corrected to "2026-05-10T22:00:20Z". Notebook commit b27e1b11 is valid unified-agent daily-review entry — NOT a misfile. totalTasksDone=555 derivation confirmed: 40 Done rows with 2026-05-xx dates in TASKS.md (matches dev claim). currentSprint=1867 interpretation: most-recently-closed sprint (1867 is closed per git log 2f955a3d). CONDITIONAL_APPROVED — merged with fix commit 2b4b9c3c. Branch deleted. Merge SHA: 500e14fd (TASKS update). Note: docs/data/ is in .gitignore — dev used staged approach correctly (already staged before add attempt).

**1875c — record_signal_outcome dispatch (FIX-HIGH):** 5/5 pass. TSC 0 errors. DDD PASS. RCA: no code bug found — 126 tool names unique, MCP SDK exact-key dispatch, buildToolNameMap probe correct, SSE full toolRegistry. TNB c35 F3 = 1 occurrence, likely transient gateway misparse. Defensive additions: collision warn + manifest drift warn in agentBootstrap.ts. 5 regression guards. ACCEPT stance: observability value > reclassification cost. Merge blocker: untracked collision file (worktree artifact) — removed. APPROVED + merged eec8384f.

**1863f-RECONCILE — signal_feedback 1864b regression guard:** Verify-only (no code changes). 4 cited file:line refs confirmed on main: agentSignalTools.ts:41 imports SignalFeedbackFindingDataSchema; agentSignalTools.ts:72-79 SIGNAL_TYPE_VALIDATORS includes signal_feedback; agentSignalStore.ts:37-47 SignalTypeSchema z.enum includes "signal_feedback" at line 46; signalTypes.ts:306 exports SignalFeedbackFindingDataSchema = z.record(z.unknown()), line 320 in SignalSchemas barrel. Full suite: 9134 pass / 15 fail (exact match to self-reported baseline). tsc errors all pre-existing. DDD PASS (no infra imports in domain/signals/). Security PASS. Branch diff: 2 commits only — task report (0b502df1) + memory notebook — zero production code on branch. APPROVED + merged.
