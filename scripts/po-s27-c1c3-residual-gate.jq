# po-S27 — CI-C1C3-RESIDUAL-GATE-a43dff49 adjudication (single atomic jq pass).
# 1) Flip FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS + FIX-CI-C3-RESIDUAL-DB-DESTROYERS REVIEW->DONE (DONE-as-scoped).
# 2) Flip SPIKE-CI-C4-KINH-DICH-DIACRITICS BACKLOG->TODO (architect ruling (a): PROD-TOUCHING, ISOLATED push) + 160 baseline.
# 3) Rebaseline sprint ci_absolute 172->160 everywhere (172 SUPERSEDED).
# 4) Record /goal refinement (REMOVE-if-obsolete) into the long-tail triage policy field.
# No new tasks. Cluster-6 schema-drift untouched (PARKED). Preserves _schema=v3 _ssot=true.
# Pointer: docs/agents/po/flow/main.md (decision-journal + commit-mutex sub-flows).

def TS: "2026-06-09T08:05:00Z";

# --- locate the CI-RED-RECONCILE sprint by id ---
(.task_board.active_sprints[] | select(.id=="CI-RED-RECONCILE")) |= (

  # (1a) C1-residual REVIEW -> DONE (DONE-as-scoped)
  (.tasks[] | select(.id=="FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS")) |= (
    .status = "DONE"
    | .closed_at = TS
    | .done_at = TS
    | .done_by = "po-S27"
    | .resolution = "DONE-as-scoped"
    | .actual_result = "PASS — VERIFICATION GATE MET (CI-C1C3-RESIDUAL-GATE-a43dff49, joint gate with C3, push ->a43dff49 = one CI run 27191715572, bun job 80273289808): native fail+error 172 -> 160 (-12), errors stay 0 (11615 pass / 42 skip / 160 fail / Ran 11817 across 1037 files). DONE-AS-SCOPED: category-wide SUPERSET scope — all NAMED C1 fetcher test files fixed or already-green. Of the 9 C1-scoped files, 5 (028/025/1423a/1487/1833l) were ALREADY GREEN (order-dependent/transient, cleared by the Cluster-1 mock-contam fix upstream); the 4 genuinely-broken (country key VN-vs-vietnam SLA, getText() JSON-envelope .split, stale cron '0 6 * * *', unmocked getMacroExternal FRED timeout + A-3 .resolves) were fixed. Dev commit a43dff49 TEST/META-ONLY (8 .test.ts + 4 meta, ZERO production src — router git show --name-only guard clean). The -12 (not -62) reflects the C1 '42' tally being a category SUPERSET mostly absorbed by the upstream Cluster-1 fix. Residual same-pattern files OUT of named scope -> long-tail re-profile, NOT reopened. CI conclusion stays 'failure' (160 != 0) — EXPECTED, CI RED until 0. 172 SUPERSEDED by 160."
  )

  # (1b) C3-residual REVIEW -> DONE (DONE-as-scoped)
  | (.tasks[] | select(.id=="FIX-CI-C3-RESIDUAL-DB-DESTROYERS")) |= (
      .status = "DONE"
      | .closed_at = TS
      | .done_at = TS
      | .done_by = "po-S27"
      | .resolution = "DONE-as-scoped"
      | .actual_result = "PASS — VERIFICATION GATE MET (CI-C1C3-RESIDUAL-GATE-a43dff49, joint gate with C1, push ->a43dff49 = one CI run 27191715572, bun job 80273289808): native fail+error 172 -> 160 (-12), errors stay 0. DONE-AS-SCOPED: category-wide SUPERSET scope — all 4 NAMED C3 destroyer files fixed test-only: FK constraint signal_outcomes->agent_signals blocked DELETE FROM agent_signals -> FK-safe delete order (1295d); InMemoryTransport never closed -> beforeEach connect() stall -> added afterEach client/server teardown (1124/1129/1173). Dev commit a43dff49 TEST/META-ONLY (ZERO production src). Residual same-pattern destroyers OUT of named scope (P7 destroyers, C9-victim cluster) -> long-tail re-profile, NOT reopened. 172 SUPERSEDED by 160."
    )

  # (2) C4 spike BACKLOG -> TODO; architect ruling (a) PROD-TOUCHING isolated push; 160 baseline; REMOVE-if-obsolete lens
  | (.tasks[] | select(.id=="SPIKE-CI-C4-KINH-DICH-DIACRITICS")) |= (
      .status = "TODO"
      | .owner = "dev-mcp-server"
      | .type = "FIX"
      | .prod_touching = true
      | .isolated_push = true
      | .updated_at = TS
      | .updated_by = "po-S27"
      | .baseline_pass = "160 native fail+error absolute (160 fail + 0 err / Ran 11817, sha a43dff49, run 27191715572, bun job 80273289808 — SUPERSEDES 172/7bea53d0)"
      | .gate = "PROD-TOUCHING — MUST be an ISOLATED push (separate commit + separate CI run + careful verify; do NOT bundle with test-only fixes). Per architect ruling (a) in docs/architecture-briefs/2026-06-09-ci-172-residual-filescope.md: update PROD UTF-8 Vietnamese diacritics strings in kinhDichTools.ts + leadershipTools.ts + formatAccuracyReport, and add the missing explain_hexagram output sections (Hào từ / Tượng truyện / 6 hào lines) via QUE_DATA local library (Path A — zero Go service change). 1414/1416 TDD-RED specs + 285 are the source of truth (~25 fails -> 0). Then native fail+error must DROP vs the NEW 160 absolute (sha a43dff49, run 27191715572, job 80273289808). GOAL-REFINEMENT (/goal 2026-06-09): classify each touched test REWRITE (prod exists, test stale) vs REMOVE (prod gone, test obsolete) — DELETE obsolete tests, do NOT patch."
      | .note = "Architect micro-SPIKE delivered ruling (a) (prod-emits-diacritics) — now a dispatchable FIX. PROD code change in kinhDichTools.ts/leadershipTools.ts/formatAccuracyReport, so this round MUST be isolated (its own push + CI run, careful verify) per the test-only-vs-prod separation. Path A: QUE_DATA local formatting, no Go service / no new HTTP. Apply REMOVE-if-obsolete lens (deleted seams / removed reuters / pre-98df0f43 macro headers / stale cron schedules -> DELETE the test, do not rewrite to pass)."
    )

  # (3) rebaseline ci_absolute 172 -> 160
  | .ci_absolute = {
      "native_fail": 160,
      "native_errors": 0,
      "fail_plus_error": 160,
      "tests": 11817,
      "pass": 11615,
      "skip": 42,
      "sha": "a43dff49",
      "run_id": "27191715572",
      "bun_job_id": "80273289808",
      "supersedes": "172 (sha 7bea53d0, run 27189745293, job 80266839417) — SUPERSEDED",
      "delta_vs_prior": "-12 (C1+C3 residuals; category SUPERSET mostly pre-absorbed by upstream Cluster-1 fix; net -12 not -62)",
      "updated_at": TS,
      "updated_by": "po-S27"
    }

  # (4) long-tail triage policy: REMOVE-if-obsolete clause (/goal refinement)
  | .long_tail_triage_policy = {
      "goal": "ci/di all passe on GitHub, test update (remove if obsolete) — /goal refined 2026-06-09T07:5xZ",
      "classify_each_residual_bucket": "REWRITE (prod still exists, test stale -> rewrite test to match) vs REMOVE (prod gone/superseded, test obsolete -> DELETE the test, do NOT patch)",
      "remove_examples": "removed test seams, deleted reuters.js, pre-98df0f43 macro section-header format, stale cron schedules",
      "applies_to": "C4 and all remaining ~160 long-tail rounds; re-profile residual against taxonomy with the REMOVE-if-obsolete lens",
      "absolute": "160 (sha a43dff49, run 27191715572, job 80273289808)",
      "updated_by": "po-S27",
      "updated_at": TS
    }
  | ._updated_by = "po-S27"
)
