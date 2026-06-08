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
