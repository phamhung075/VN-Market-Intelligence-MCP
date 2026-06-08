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
