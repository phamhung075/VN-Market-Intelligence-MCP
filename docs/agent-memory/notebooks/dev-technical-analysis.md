# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-06-14 — ALLZERO-OHLCV-FETCH — chart-sliver/BB-fan data fix

**Task:** ALLZERO-OHLCV-FETCH (zone apps/mcp-server/) — fix all-zero OHLCV rows poisoning BB window and chart Y-domain

**Status:** REVIEW — commit 9088c052

**Root cause:** Non-trading-day gap rows (0/0/0/0) in daily_ohlcv. Two sources:
- Failed bulk fetch 2026-05-30: 103 tickers stamped with zeros (not skipped).
- DPI-4 foreign-flow stub rows: `ohlcvForeignFlowStore` inserts open/high/low/close=0 placeholders that outlast the OHLCV write for some tickers (DAG, BCG etc.)
- A zero inside the 20-period BB window: stdev detonates to ±35k, chart Y-axis anchors to 0.
- Also VCB 2026-06-01 close=62.2 (thousand-VND, should be 62200) survived CONTAM-2..7.

**Fix (TDD RED→GREEN, 5 AC tests):**
1. `priceHistoryTools.ts` — added `AND close > 0` to `get_price_history` SQL. Immediate read-side guard for chart + BB + alerts.
2. `allzeroOhlcvBackfill.ts` (new) — `purgeAllZeroRows(db)`: DELETE all 0/0/0/0 rows; `normalizeResidualContam(db)`: whole-row ×1000 for close<100 contaminated rows.
3. `ALLZERO-OHLCV-FETCH.test.ts` (new) — 5 ACs covering zero exclusion, Min stat, DPI-4 stub exclusion, normalize fix.

**Live migration:** 116 all-zero rows purged, 28346 thousand-VND rows re-normalized. Container rebuilt.

**Probe (live):** SHB zero_rows=0 Min=13,550 BB=0.88% | VCB zero_rows=0 Min=59,900 BB=1.92% (2026-06-01 close=62200) | FPT zero_rows=0 Min=70,000 BB=2.14%. All BB widths well under 15%.

**Lessons:** DPI-4 stub rows are by design (DDD race fix); the read-side `close>0` guard is the correct surgical fix. The taOhlcvBackfill already heals stubs on next cycle (detects corrupt_cnt>0 for low=0). Generic fix — no per-ticker hardcode.

---

### 2026-06-08 — FIX-TA-GOLANGCI-CONFIG-V2 — migrate .golangci.yml to v2 schema

**Task:** FIX-TA-GOLANGCI-CONFIG-V2 (Sprint CI-RED-RECONCILE)

**Status:** REVIEW — commit d73c7a40. VERIFICATION GATE: GREEN ci.yml after subsequent push.

**Root cause:** `apps/technical-analysis/.golangci.yml` was the only one of 6 service configs still using the v1 schema after the FIX-CI-LINT-STACK migration bumped golangci-lint-action to v7 (golangci-lint v2.0.2). golangci-lint v2 rejects any config without top-level `version: "2"` with exit 3 — config parse crash, not lint violations.

**v1 → v2 changes applied:**
1. Added `version: "2"` top-level.
2. `run.go: "1.22"` removed (v2 dropped this key); replaced with `run.timeout: 120s`.
3. `linters.disable-all: true` → `linters.default: none`.
4. Top-level `linters-settings:` → `linters.settings:` nested under `linters:`.
5. Removed `Main:` allow-list depguard rule (v2 sibling pattern; deny-list fences preserved intact).

**Local verify:** `golangci-lint run` exits 1 (lint running, real violation surfaced), NOT 3 (config crash). The exit-1 violation (`cmd/sandbox/main.go:44` Fence-C) is pre-existing debt tracked as FIX-TA-SANDBOX-DEPGUARD.

**DJ-GATE-1:** `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-dev-technical-analysis.md`

**Files changed:** `apps/technical-analysis/.golangci.yml`

---

### 2026-05-24 — dash-check.mjs — AI-readable dashboard health report

**Task:** Create `dashboard/dash-check.mjs` — machine-parseable health script for AI/CI.

**Status:** DONE — commit fd55ef8d

**Key design:**
- One DASH-CHECK-RESULT JSON line + exit code (PASS/WARN/FAIL). Complements verify-render.mjs (strict gate), does not replace it.
- Data-driven verdict: no hardcoded totals; reads live DOM (dots, group-status, count chips, category chips, console.error, pageerror, NOT RUN / not wired text).
- FAIL: any red dot > 0, JS/page errors, or any invalid/legacy category chip label ("golden"/"edge"/"failure").
- WARN: pending/NOT-RUN present but no FAIL (exit 0).
- PASS: all green, valid labels, no errors (exit 0).
- Security: env audit at startup aborts on any DB/API-key env var; file:// only.
- Playwright resolver reused exactly from verify-render.mjs (TA-local first, frontend fallback with warn).

**Run result:** exit 0 — `DASH-CHECK-RESULT: {"service":"technical-analysis","dotsGreen":33,"dotsRed":0,"dotsPending":0,"jsErrors":0,"pageErrors":0,"categoryChips":{"Valid Input":18,"Edge Case":8,"Bad Input -> Error":7},"badLabels":[],"verdict":"PASS"}`

**Note:** Concurrent-agent git index race caused kinh-dich file to appear in same commit. Fixed via cleanup commit 04a16b9f (kinh-dich file removed from tracking; file preserved on disk for its zone agent).

**Files changed:** `dashboard/dash-check.mjs` (new)

---

### 2026-05-24 — Category chip relabel (display-layer only)

**Task:** Relabel scenario category chips so non-technical readers don't mistake passing negative-tests for failing tests.

**Status:** DONE — commit 5b11bc89

**Approach:** Display-label mapping at render layer only. JSON SSOT `category` field (golden/edge/failure) unchanged.

**What was done:**
- `dashboard/app.ts`: Added `CATEGORY_LABELS` lookup map (`golden→"Valid Input"`, `edge→"Edge Case"`, `failure→"Bad Input → Error"`). Updated `catLabel()` to use the map. Applies at all 4 chip render sites: primitives panel, module panel, service panel, modal cat badge.
- `dashboard/index.html`: Updated legend block to show new chip text ("Valid Input" / "Edge Case" / "Bad Input → Error"). Added clarifying note "(test PASSES)" next to Bad Input entry.

**Render gate (build.sh + verify-render.mjs):** PASS — 33 dot-green (L1:25 + L2:5 + L3:3), 0 dot-red, 0 dot-pending, all groups PASSED, 0 JS errors.

**Smoke:** go test ./...: all packages ok. go vet: 0. bun test: 24/24.

**Files changed (2):** dashboard/app.ts, dashboard/index.html (dist/ is gitignored).

---

### 2026-05-24 — Level 3 service tier wired (httptest.NewServer baked verdicts)

**Task:** Wire Level 3 microservice to real baked verdicts — httptest.NewServer in-process runner, fix stale text, extend render gate.

**Status:** DONE — commit a9061db6

**Approach chosen:** httptest.NewServer (option a) — in-process, hermetic, no port binding, no creds, no running DB.

**What was done:**
- `pkg/interface/http/router.go`: handleIndicators wired to decode JSON body, validate, call useCase.Execute
- `pkg/application/dtos.go`: ComputeTARequest gains `Closes []float64` for credential-free pure-compute path
- `pkg/application/usecases.go`: Execute uses TACalculator.Calculate(closes, period) directly when closes provided
- `cmd/sandbox/main.go`: -tier=service mode — httptest.NewServer; runServiceScenario fires GET/POST, asserts responses
- 3 new service scenarios: health-ok, indicators-happy-path, indicators-bad-request
- `dashboard/build.sh`: bakes service scenarios
- `dashboard/app.ts`: renderServicePanel with real scenario cards; SERVICE_SCENARIOS + applyBuildVerdicts
- `dashboard/index.html`: Level 3 chip row; all stale text fixed; __SERVICE_DATA__ embedded inline
- `dashboard/verify-render.mjs`: asserts "3 passed" service chip, 33 dots, "not wired yet" check

**Env audit:** `forbidden_matches:` empty — zero DB credentials. CGO_ENABLED=0 confirmed.

**Build:** 33 passed / 0 failed. verify-render: PASS — 33 dot-green (L1:25 + L2:5 + L3:3), 0 errors.

**G8 honest-red proof:** Injected health-ok=red → chip "2 passed / 1 failed", FAILED group, exit 1. Reverted → PASS.

**Smoke:** go test ./...: ok all packages. go vet: 0. bun test: 24/24. tsc: 0 errors. build.sh: full PASS.

---

### 2026-05-24 — Headless render gate (verify-render.mjs + build.sh wiring)

**Task:** Add browser-render verification gate for TA Scenario Trust Dashboard (G8 honest red/green for the gate itself).

**Status:** DONE

**What was done:**
- Created `dashboard/verify-render.mjs` (Node ESM). Launches headless Chromium via playwright-core, loads `file://...index.html`, reads live rendered DOM: count chips, `.group-status` labels, dot classes. Asserts 30 dot-green / 0 dot-red / 0 dot-pending / 0 JS errors / no NOT RUN text. Writes screenshot to `dashboard/dist/render-check.png`. Resolves repo root from `import.meta.url` — no hardcoded paths. Exits 0 on pass, non-zero with clear message on fail.
- Added `playwright-core ^1.60.0` as devDependency of TA package (`bun add -d playwright-core`). Resolves locally from `apps/technical-analysis/node_modules/playwright-core` (zone-clean, no cross-app boundary reach). Falls back to frontend with warning if missing.
- Wired as final gate in `dashboard/build.sh`: after bake step, runs `node dashboard/verify-render.mjs`. Build fails if gate exits non-zero.

**Pass evidence (build.sh run):**
- Bake: 30 passed / 0 failed
- verify-render: Primitives chip "25 passed / 0 failed", Module "5 passed / 0 failed", 5/5 groups PASSED, 30 dot-green, 0 dot-red, 0 dot-pending, 0 JS errors — PASS exit 0

**Deliberate-break fail evidence (G8 honest red/green proof):**
- Injected `"bb-expansion": "red"` into scenario-results.js manually
- verify-render: Primitives chip "24 passed / 1 failed", Group statuses includes "FAILED", 29 dot-green / 1 dot-red
- FAIL exit 1: `Expected primitives chip "25 passed", got "24 passed"` — gate is honest
- Reverted to green state

**Smoke:**
- `go test ./...` → 7 packages ok, exit 0
- `go vet ./...` → exit 0
- `bun tsc --project dashboard/tsconfig.dashboard.json --noEmit` → 0 errors
- `bun test` → 24 pass / 0 fail
- `build.sh` (full end-to-end including render gate) → exit 0

**Files changed (3):** dashboard/verify-render.mjs (new), dashboard/build.sh (gate wired), package.json + bun.lock (playwright-core devDep)

---

### 2026-05-24 — Dashboard bake-verdicts (auto-green/red on open)

**Task:** Make dashboard show real pass/fail verdicts without manual paste or server.

**Status:** DONE — commit db63e6eb

**What was done:**
- Extended `dashboard/build.sh` with a bake step: runs `CGO_ENABLED=0 go run ./cmd/sandbox` over all 30 scenarios (25 primitive + 5 module), captures `status` from each JSON result, writes `dashboard/dist/scenario-results.js` (sets `window.__SCENARIO_RESULTS__`).
- Added `applyBuildVerdicts()` to `dashboard/app.ts`: reads `window.__SCENARIO_RESULTS__`, applies `status: "green"|"red"` to each scenario in PRIMITIVES/MODULE_SCENARIOS before render.
- Added `<script src="dist/scenario-results.js"></script>` to `dashboard/index.html` (before `dist/app.js`).
- Manual paste-back path (rerun-handler.js) preserved unchanged.

**Env audit:** `forbidden_matches:` empty — zero DB credentials in sandbox env. PASS.

**Build result:** 30 passed / 0 failed. scenario-results.js: 34 lines, all "green".

**Smoke:**
- `go test ./...` → 7 packages ok, exit 0
- `go vet ./...` → exit 0
- `bun tsc --project dashboard/tsconfig.dashboard.json --noEmit` → 0 errors
- `bun test` → 24 pass / 0 fail
- `build.sh` → 30 passed / 0 failed

**Files changed (3):** dashboard/build.sh, dashboard/app.ts, dashboard/index.html

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]
