# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

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

**G6:** dashboard renders file:// PASS
**G8:** honest red/green from sandbox PASS
**G12:** 30/30 GREEN PASS

---

### 2026-05-23 — P2-B3 Remove TODO:migrate comments (cycle-26 — confirmed no-op)

**Task:** P2-B3 — Remove all "TODO: migrate" comments from mcp-server + technical-analysis.

**Status:** DONE — no-op confirmed (no commit needed)

**AC-1:** `grep -r 'TODO.*migrat' apps/mcp-server/src/ apps/technical-analysis/ --include='*.ts' --include='*.go'` → 0 results. PASS.

**AC-2:** No logic changes — no source changes at all. PASS.

**AC-3:** bun test (from apps/mcp-server): 9382 pass / 283 fail / 35 skip / 9700 total — delta vs P2-B2 baseline = 0. go test ./...: 7 packages ok, exit 0. PASS.

**Sandbox 30/30 GREEN** (25 primitive + 5 module) — G12 DoD PASS.

**Confirmation:** PO pre-dispatch finding correct. P2-B0 inventory §E had already documented zero TODO:migrate patterns. This was always a confirmatory no-op.

**Done signal:** `docs/signals/dev-ta-p2-b3-done-20260523T085446Z.json`

**Next:** P2-B4 (integration test verification — owned by qa).
