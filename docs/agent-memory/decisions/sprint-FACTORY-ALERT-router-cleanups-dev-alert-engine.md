# Decision Journal — Sprint FACTORY-ALERT-router-cleanups · dev-alert-engine

**Sprint goal:** FACTORY-MAINTAINABILITY-2026-06 — four small router/sqlite cleanups (dead interface, real /health port, domain severity rule, strings.Contains).
**Agent:** dev-alert-engine
**Started:** 2026-07-24T14:21:06Z

---

### STEP dev-alert-engine-S1 · dev-alert-engine · 2026-07-24T14:21:06Z
**task-id:** FACTORY-ALERT-router-cleanups
**what-done:** (1) Deleted orphaned `UseCaseExecutor` interface (router.go) — grep of `apps/alert-engine/**/*.go` confirmed zero references beyond its own decl. (2) Threaded `port int` through `NewRouter(uc, port)` → `handleHealth(port)`; `cmd/server/main.go` now passes `cfg.Port` instead of hardcoded `5006`. (3) Replaced inline `validSeverities` map with `domain.AlertSeverity(body.Severity).IsValid()`, 400 message text untouched. (4) Replaced hand-rolled `containsStr`/`findSubstr` with `strings.Contains`; hoisted `outcomeLookbackDays=90`/`defaultPendingLimit=100` to named consts in sqlite.go.
**what-considered:**
- Item 3 equivalence: read `domain.AlertSeverity.IsValid()` (models.go:16-22) — switch accepts exactly `{low,medium,high,critical}`, identical set+casing to the inline map. No discrepancy found → safe swap, no case-fold needed.
- Item 4 equivalence: read `containsStr`/`findSubstr` (old sqlite.go:112-123) — plain `s[i:i+len(sub)] == sub` loop, no `ToLower`/case-fold anywhere → confirmed CASE-SENSITIVE, exact match to `strings.Contains` semantics. Direct swap, no fold wrapper needed.
- Item 2: only 1 production caller (`cmd/server/main.go`) plus 2 test call-sites (`router_test.go`); added `testPort=5006` const in tests to keep prior implicit behaviour, and added `TestHealth_ReflectsConfiguredPort` (custom port 6123) as a regression lock for the intended correction — proves port is threaded, not hardcoded.
**why-decision:** Both set-equality proofs (item 3, item 4) passed with zero discrepancy, so swaps proceeded per the DoD's "verify first" gate rather than being blocked/escalated.
**why-change:** No change from plan. Added one extra regression test (`TestHealth_ReflectsConfiguredPort`) beyond the 4 listed items to lock in the intentional /health port-correction behaviour — proportionate, not scope creep (same file, same AC-2 concern).

### STEP dev-alert-engine-S2 · dev-alert-engine · 2026-07-24T14:24:00Z
**task-id:** FACTORY-ALERT-router-cleanups
**what-done:** Updated `docs/architecture/microservice/alert-engine/api-reference.md` GET /health section — noted `port` now reflects live `cfg.Port` (env `PORT`, default 5006), not hardcoded.
**what-considered:**
- Run `/graphify docs --update --no-viz` per doc-review Step 4 vs skip — attempted; failed structurally (`error: no LLM API key found` — GEMINI/ANTHROPIC/OPENAI/etc keys all absent in this shell env; log at scratchpad/graphify.log).
- Block task on graphify vs proceed — proceeded: doc change is a single-line clarification to an existing section (no new file, no new concept), and the tool is structurally unavailable (missing API key), not a task-solvable gap.
**why-decision:** Structural tool-unavailability (no API key) is not a code/task defect — matches prior "limitation=structural" pattern; blocking a P2/S/low-risk cleanup on an unrelated infra gap is disproportionate.
**why-change:** doc-review's graphify step deferred (not skipped silently — logged here) pending API key provisioning; flagged in notebook Zone health line.
