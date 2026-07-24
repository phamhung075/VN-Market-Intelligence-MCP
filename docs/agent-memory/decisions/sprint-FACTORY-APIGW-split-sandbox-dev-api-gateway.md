# Decision Journal — FACTORY-APIGW-split-sandbox

**Agent:** dev-api-gateway
**Task ID:** FACTORY-APIGW-split-sandbox
**Timestamp:** 2026-07-24T11:53Z

## Decision

Split `apps/api-gateway/cmd/sandbox/main.go` (744L, largest file in zone) into 5 sibling
`package main` files per the seams named in the DoD:
- `discover.go` (188L, size-justification header) — `Scenario` type, `findRepoRoot`,
  `findServiceRoot`, `discoverScenarios`, `scenarioEnvelope`/`peekEnvelope`, `isIntentionalFixture`.
- `trace.go` (53L, no header needed) — `TraceResult` type + `writeTrace`.
- `exec_primitive.go` (193L, size-justification header) — the 3 primitive scenario shapes +
  their executors + the new `buildPrimitiveTrace` dedup helper + `executePrimitive` dispatcher.
- `exec_module.go` (240L, size-justification header) — the new `sandboxService` named type +
  `sandboxPorts` + `moduleRouteStoryScenario` + `executeGatewayModule` + `executeModule` dispatcher.
- `main.go` (119L, under 120L cap) — flags, tier loop, summary only (entry point).

Named-refactor dedup (both DoD-required):
1. `sandboxService struct{targetURL, noProbe, preservePath}` replaces the anonymous
   `struct{targetURL string; noProbe bool; preservePath bool}` literal that was declared 3x
   (map-value type in `sandboxPorts`, the empty-map literal type, and the populate-literal type)
   — single source of truth for the shape, zero method/field semantics changed.
2. `buildPrimitiveTrace(scenario, primitive, verdict, fieldName, actual, expectedField string,
   inputs, expected interface{}, actualOut map[string]string) TraceResult` replaces the
   compare-tail (`status/errMsg` computation + `TraceResult{...}` literal) duplicated verbatim
   across `executeOverallStatusComputer`/`executeProxyPathResolver`/`executeRouteServiceMatcher`.
   Each caller now passes its one field name + value pair; the doc-only early-return branch in
   `executeRouteServiceMatcher` (route-service-matcher only) was left untouched since it is a
   distinct code path, not part of the repeated tail.

## What Considered

1. **Put `scenarioEnvelope`/`peekEnvelope`/`isIntentionalFixture` in `trace.go` instead of
   `discover.go`:** REJECTED — these functions classify *which primitive/module a scenario
   targets and whether it's an intentional-failure fixture*, which both `executePrimitive` and
   `executeModule` consult before building a trace; that's a discovery/dispatch concern, not a
   trace-persistence concern. Keeping `trace.go` to just `TraceResult`+`writeTrace` also let it
   land under 120L with no justification header needed.
2. **6 files, one per primitive/concern, to force everything under 120L:** REJECTED — DoD names
   exactly 5 files by seam; `exec_primitive.go`/`exec_module.go`/`discover.go` exceed 120L but
   each is one cohesive concern (dispatcher references all executors by name in the same file;
   `sandboxPorts`+`executeGatewayModule` share the diff-comparison state). Convention checked via
   `grep -rn size-justification apps/*/cmd/sandbox/*.go` (kinh-dich-service precedent, same
   FACTORY-*-split-sandbox pattern) — honest headers over artificial fragmentation is the
   established norm.
3. **`buildPrimitiveTrace` taking the whole scenario struct instead of unpacked scalar args:**
   REJECTED — the 3 scenario structs (`oscScenario`/`pprScenario`/`rsmScenario`) have different
   shapes; a shared interface would need reflection or field-name string matching, adding
   complexity the current 9-arg-but-flat signature avoids. Assertion semantics unchanged either way.

## Why This Change

- No API/behavior/routing/config change — verified empirically, not just by code inspection (see
  Verification: all 15 sandbox trace outputs byte-identical pre/post split except `run_at`).
- No fence config change needed: `.golangci.yml` fence-a/b are path-scoped to `pkg/primitive/**`
  and `pkg/module/**` (not `cmd/sandbox/**`); fence-c already excludes only `cmd/server/main.go`
  and `*_test.go` (applies equally to all 5 sandbox siblings) and none of the new files import
  `pkg/infrastructure` — confirmed via `golangci-lint run ./...` → 0 issues, no fence extension
  required (unlike the macro-indicators split precedent referenced in the task brief).
- `rebuild_required: true` but USER-GATED per task brief — code-only landed; no docker rebuild
  performed; rebuild-verify marked PENDING-USER-GATED.

## Verification

- `go build ./...` — exit 0
- `go vet ./...` — exit 0
- `gofmt -l cmd/sandbox/` — empty (all 5 files pre-formatted)
- `golangci-lint run ./...` — 0 issues (before AND after split — no fence violation, no new lint debt)
- `go test -count=1 ./...` — 10/10 packages PASS (unchanged from pre-split baseline)
- G12 sandbox primitive tier: 14/14 PASS (identical to pre-split baseline count)
- G12 sandbox module tier: 1/1 PASS (identical to pre-split baseline count)
- G12 sandbox all-tier: 15/15 PASS
- Behavior-equivalence proof: captured all 15 `sandbox/traces/*.json` outputs before the split,
  re-ran after the split, diffed every file with `run_at` stripped — 0 differences (byte-identical
  status/actual/expected/error for every scenario, both primitive and module tier).
- NBSP/encoding-drift check: `LC_ALL=C grep -nP '[^\x00-\x7F]'` on all 5 new/changed files —
  only pre-existing em-dash/arrow characters inside `//` comments (same as source), zero
  non-ASCII bytes inside code/string-literal regions; explicit U+00A0 byte-sequence grep — 0 hits.
- Comment-stripped code-line diff (orig monolith vs reassembled split, sorted, comments/blank
  lines removed): every diff line traces to an *intentional* dedup line (the 3x repeated
  `TraceResult{...}` tail collapsed to `buildPrimitiveTrace(...)`, the 3x anonymous struct
  collapsed to `sandboxService{}`) or expected per-file import/package boilerplate — no
  unexplained line.
- Credential scan: `grep -rniE 'token|secret|api_key|password' cmd/sandbox/` — empty (clean).
- Zero-credentials env check: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` — only an
  unrelated ambient `CTX_ADVISOR_*` token-counting var (bytes-per-token/max-tokens config,
  not a secret), no DB/API-key/password/auth-token present.
- git status confirms only the 4 new `.go` files + `main.go` diff staged for this task; the
  15 `sandbox/traces/*.json` files that pick up a fresh `run_at` on every sandbox run were
  reverted via `git checkout` (pre-existing run-to-run noise, out of this task's scope).
