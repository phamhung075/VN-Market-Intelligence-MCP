# po-S25: CI-C3-C1-GATE-1d83a5ff PASSED (partial) — native fail 241->193 (-48,-20%), errors stay 0.
# Atomic single-pass transform over orch-state.json (v3 SSOT).
# Owned paths: orch-state.json (+ po decision journal + po notebook + archived signal, edited separately).
# Pointer doc: docs/agents/po/flow/main.md (decision-journal + commit-mutex sections).
#
# Args: $ts (UTC ISO-8601 stamp).
# 1. Flip FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES (active_sprints[24].tasks) REVIEW->DONE (DONE-as-scoped: 1945b clean).
# 2. Flip FIX-CI-C1-MACRO-INJECT-SEAM-TESTS (task_board.in_progress) REVIEW->DONE (DONE-as-scoped: 5 named files clean).
# 3. Append to CI-RED-RECONCILE sprint tasks:
#    - FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE (TODO, dev-mcp-server, high, ~21) carrying NEW 193 baseline.
#    - FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS (backlog stub, needs architect file-scope confirm, ~37).
#    - FIX-CI-C3-RESIDUAL-DB-DESTROYERS (backlog stub, needs architect file-scope confirm, ~23).
#    - SPIKE-CI-C4-KINH-DICH-DIACRITICS (architect SPIKE stub, prod-vs-test decision, ~14).
# 4. Append to top-level backlog: VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE (non-CI, independent of /goal ci/cd pass).
# 5. Rebaseline sprint-level: stamp NEW ABSOLUTE 193 into CI-RED-RECONCILE sprint.ci_absolute + evidence note.
# WIP discipline: only the C2 task is TODO (dispatchable); residual/spike/cowork are backlog/stub — not in_progress.

# --- (1) C3 in CI-RED-RECONCILE sprint tasks + append the 4 CI follow-ons ---
(.task_board.active_sprints[24].tasks) |= (
  map(
    if .id == "FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES" then
      .status = "DONE"
      | .closed_at = $ts
      | .done_at = $ts
      | .done_by = "po"
      | .actual_result = "PASS-AS-SCOPED (CI-C3-C1-GATE-1d83a5ff, bundled with C1 in push f95c79be->1d83a5ff = one CI run 27188621595, bun job 80263220946): native fail 241 -> 193 (-48, -20%), errors stay 0. C3's named file 1945b-accuracy-digest-handler.test.ts is now CLEAN in CI (its ZERO_STRUCT mock-contamination fail signatures are gone). Test-file-only, zero prod code (router raw-verified C3 commit 82947da3 = only 1945b test + docs). DONE-AS-SCOPED: residual DB-singleton destroyers (Task 1124/1129/1295d, ~23) are NEW files beyond 1945b -> tracked in FIX-CI-C3-RESIDUAL-DB-DESTROYERS, NOT a re-open of this task. 193 SUPERSEDES the 241 absolute."
    else . end
  )
  + [
    {
      "id": "FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "status": "TODO",
      "size": "S",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "high",
      "sprint": "CI-RED-RECONCILE",
      "depends": ["FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES", "FIX-CI-C1-MACRO-INJECT-SEAM-TESTS"],
      "labels": ["ci-red-reconcile", "cjs-esm-interop", "test-isolation", "no-prod-code"],
      "title": "C2 getMarketMessageDigest require() interop (~21 native fails, Task 1168, attack rank 1 / cleanest next win): rewrite the Task 1168 test files' require() CJS interop -> ESM `import` for getMarketMessageDigest + batchReviewMarketMessages. Both functions ARE implemented in marketMessageStore.ts (lines 239/349); under Bun the require() named exports return undefined. TEST-FILE-ONLY, zero prod code, architect-diagnosed, NO whack-a-mole.",
      "baseline_pass": "193 native fail+error absolute (193 fail + 0 err / Ran 11817, sha 1d83a5ff, run 27188621595, bun job 80263220946 — SUPERSEDES the 241/91afe344 absolute)",
      "gate": "native fail+error must DROP vs the NEW 193 absolute (same native-summary method: `gh run view --job=<new> --log` -> '... pass / 42 skip / N fail / Ran 11817'); test-file-only (zero prod code). Targeted local: Task 1168 getMarketMessageDigest + batchReviewMarketMessages suites green.",
      "created_at": $ts,
      "created_by": "po",
      "note": "[po S25 DJ-GATE-1 \($ts)] OPENED from CI-C3-C1-GATE-1d83a5ff as the ROI-ranked next attack (cleanest, no whack-a-mole). Root cause per architect 241-residual taxonomy: Task 1168 tests use require() to import getMarketMessageDigest/batchReviewMarketMessages; Bun returns named exports undefined through CJS interop -> calls throw -> ~21 fails. Both fns implemented in marketMessageStore.ts:239/349 (prod is correct). Fix = swap require() for ESM import in the test files. TEST-ONLY. status=TODO = dispatch trigger (owner dev-mcp-server). WIP<=2 honored: only TODO task; consumes one dev slot when dispatched."
    },
    {
      "id": "FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "status": "BACKLOG",
      "size": "M",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "medium",
      "sprint": "CI-RED-RECONCILE",
      "depends": ["FIX-CI-C1-MACRO-INJECT-SEAM-TESTS"],
      "labels": ["ci-red-reconcile", "macro-inject-seam", "needs-architect-filescope", "test-isolation"],
      "title": "C1 RESIDUAL macro-fetcher tests (~37 native fails): SAME macro-inject-seam pattern as FIX-CI-C1-MACRO-INJECT-SEAM-TESTS but in NEW files beyond the 5-file plan — Task 028 SBV Macro Fetcher, Task 025 Yahoo Commodity Fetcher, 1423e get_macro_calendar, 239a, 1423a, 1487. Migrate dead _testSbvClient/_testCommodityClient/_testDinhGiaInputs seams -> globalThis.fetch mock + assertion update to the {source_tier,text:JSON,fetchedAt} envelope. TEST-FILE-ONLY (production format change was intentional per SPIKE-CI-C1).",
      "gate": "BLOCKED on architect SHORT file-scope confirmation: enumerate the EXACT residual fetcher test files + verify all are pure test-rewrite (no prod regression hidden). Then native fail+error must DROP vs the 193 absolute (sha 1d83a5ff). Do NOT dispatch to dev blind.",
      "needs": "architect file-scope confirmation before dev",
      "created_at": $ts,
      "created_by": "po",
      "note": "[po S25 DJ-GATE-1 \($ts)] BACKLOG STUB. Under-scoped residual surfaced by the C1 gate: the architect's C1=71 cluster was a SUPERSET — the 5-file dev task cleared the named tool/format files; these FETCHER-level files share the seam pattern but were NOT in scope. recurring-bug-escalation discipline: requires a short architect file-scope confirm (exact files + prod-regression ruling) BEFORE dev impl — do NOT mechanize a seam sweep. NOT in_progress (WIP<=2)."
    },
    {
      "id": "FIX-CI-C3-RESIDUAL-DB-DESTROYERS",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "status": "BACKLOG",
      "size": "S",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "medium",
      "sprint": "CI-RED-RECONCILE",
      "depends": ["FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES"],
      "labels": ["ci-red-reconcile", "db-singleton", "needs-architect-filescope", "test-isolation"],
      "title": "C3 RESIDUAL DB-singleton destroyers (~23 native fails): MORE singleton destroyer files beyond 1945b — Task 1124 evidence tools (Phase B+C), Task 1129 get_calibration_report, 1295d E2E Signal Flow. Same pattern as FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES: a test wipes/resets the shared DB singleton, polluting downstream files under Bun's cross-file run order. TEST-FILE-ONLY (zero prod code).",
      "gate": "BLOCKED on architect SHORT file-scope confirmation: enumerate the EXACT destroyer files + the downstream files they pollute (Bun run-order). Then native fail+error must DROP vs the 193 absolute (sha 1d83a5ff). Do NOT dispatch to dev blind.",
      "needs": "architect file-scope confirmation before dev",
      "created_at": $ts,
      "created_by": "po",
      "note": "[po S25 DJ-GATE-1 \($ts)] BACKLOG STUB. Under-scoped residual surfaced by the C3 gate: the architect's C3=43 cluster was a SUPERSET — the 1945b dev task cleared its named destroyer; these other destroyers (1124/1129/1295d) remain. Requires a short architect file-scope confirm (exact destroyer->victim map) BEFORE dev impl — do NOT mechanize. Schema-drift cluster (Cluster-6 / FU-SCHEMA-DRIFT-*) stays PARKED, distinct from this singleton-destroyer class. NOT in_progress (WIP<=2)."
    },
    {
      "id": "SPIKE-CI-C4-KINH-DICH-DIACRITICS",
      "type": "SPIKE",
      "owner": "architect",
      "status": "BACKLOG",
      "size": "S",
      "zone": "apps/mcp-server/",
      "priority": "medium",
      "mode": "spike",
      "timebox": 60,
      "sprint": "CI-RED-RECONCILE",
      "depends": ["RE-PROFILE-CI-241-RESIDUAL"],
      "labels": ["ci-red-reconcile", "kinh-dich", "prod-vs-test-decision", "spike"],
      "question": "Should the LIVE Kinh Dich tool (kinhDichTools.ts, Task 285/1414) emit Vietnamese diacritics ('Quẻ') in its prod output, or is an ASCII fallback acceptable? The decision determines whether the ~14 C4 fails are fixed by changing the PROD strings (diacritics) or by updating the TEST assertions (accept ASCII).",
      "title": "C4 KINH-DICH diacritics (~14 native fails, Task 285 + 1414): the tests assert Vietnamese diacritics but kinhDichTools.ts emits an ASCII fallback (or vice-versa). This touches PROD strings, so a prod-vs-test decision is required BEFORE any dev fix — do NOT route C4 to dev blind. Architect micro-SPIKE: rule prod-emits-diacritics OR ascii-acceptable, then the resulting FIX (prod string change or test-assertion update) drops fail vs the 193 absolute.",
      "gate": "deliverable: a one-line ruling (diacritics-in-prod vs ascii-acceptable) + the resulting dev scope (prod vs test); NO code change in the spike. Drives the C4 FIX.",
      "created_at": $ts,
      "created_by": "po",
      "note": "[po S25 DJ-GATE-1 \($ts)] SPIKE STUB. C4 is the only residual cluster that touches PROD strings (kinhDichTools.ts), so unlike C2/C1-residual/C3-residual it CANNOT be a blind test rewrite — wrong call would either ship ASCII to a Vietnamese-output product or churn tests. Architect ruling required first (timebox 60m). User-facing reference: Kinh Dich logic + Vietnamese-output-only policy. NOT in_progress (WIP<=2)."
    }
  ]
)

# --- (2) C1 in task_board.in_progress REVIEW->DONE ---
| (.task_board.in_progress) |= map(
    if .id == "FIX-CI-C1-MACRO-INJECT-SEAM-TESTS" then
      .status = "DONE"
      | .closed_at = $ts
      | .done_at = $ts
      | .done_by = "po"
      | .updated_at = $ts
      | .actual_result = "PASS-AS-SCOPED (CI-C3-C1-GATE-1d83a5ff, bundled with C3 in push f95c79be->1d83a5ff = one CI run 27188621595, bun job 80263220946): native fail 241 -> 193 (-48, -20%), errors stay 0. C1's 5 named files (089-tool-macro, 1423d-thien-thoi-snapshot, 1423f-deposit-rate-display, 1570c-dinh-gia-snapshot, 1903a-dispatch-regression) are now CLEAN in CI. Test-file-only, zero prod code (router raw-verified C1 commit 1d83a5ff = only 5 __tests__ macro files + notebook + orch; ZERO src/interface|infrastructure|domain). DONE-AS-SCOPED: residual macro-FETCHER tests (Task 028/025/1423e/239a/1423a/1487, ~37) are NEW files beyond the 5-file plan -> tracked in FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS, NOT a re-open of this task. 193 SUPERSEDES the 241 absolute."
    else . end
  )

# --- (5) Rebaseline sprint-level: stamp NEW ABSOLUTE 193 onto CI-RED-RECONCILE sprint ---
| (.task_board.active_sprints[24]) |= (
    .ci_absolute = {
      "native_fail": 193,
      "native_errors": 0,
      "fail_plus_error": 193,
      "tests": 11817,
      "pass": 11582,
      "skip": 42,
      "sha": "1d83a5ff",
      "run_id": "27188621595",
      "bun_job_id": "80263220946",
      "supersedes": "241 (sha 91afe344, run 27185729719, job 80254121788)",
      "delta_vs_prior": "-48 (-20%)",
      "updated_at": $ts,
      "updated_by": "po-S25"
    }
    | ._updated_by = "po-S25"
  )

# --- (4) Non-CI cowork-envelope verify task -> top-level backlog ---
| (.task_board.backlog) |= ([
    {
      "id": "VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE",
      "type": "FIX",
      "owner": "cowork-team",
      "status": "BACKLOG",
      "size": "S",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "sprint": "BACKLOG",
      "labels": ["cowork", "macro-snapshot", "envelope-parse", "market-channel-risk", "non-ci"],
      "title": "VERIFY cowork-team parses the get_macro_snapshot {source_tier, text:JSON-string, fetchedAt} envelope correctly (NOT raw JSON to MARKET channel). Live since commit 98df0f43 (2026-05-23, ~17 days): get_macro_snapshot returns a JSON envelope instead of human-readable sections. Cowork/chef agents that parse the inner `text` as formatted prose may be rendering raw JSON to the MARKET channel. Verify the cowork flow JSON-parses inner `text` before formatting; fix if raw JSON leaks.",
      "gate": "raw-verify a live get_macro_snapshot call returns the {source_tier,text,fetchedAt} envelope, then confirm cowork-team flow parses inner text (no raw JSON in any MARKET-channel message). If leaking -> fix the parse + Vietnamese-prose formatting.",
      "created_at": $ts,
      "created_by": "po",
      "note": "[po S25 DJ-GATE-1 \($ts)] OPENED from CI-C3-C1-GATE separate_non_ci_flag. INDEPENDENT of /goal ci/cd pass — this is a LIVE PRODUCTION behavior risk, not a CI item. Architect's C1 SPIKE found get_macro_snapshot switched to a JSON envelope at 98df0f43 (2026-05-23); downstream cowork/chef prose-parsers may render raw JSON to MARKET. Vietnamese-output-only + plain-VN policy applies. owner cowork-team. NOT in_progress (WIP<=2)."
    }
  ] + .)
