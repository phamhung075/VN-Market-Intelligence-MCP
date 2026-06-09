# po-S26 — CI-C2-GATE-7bea53d0 adjudication (single atomic jq pass).
# 1) Flip FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE REVIEW->DONE (+closed_at/done_at/done_by/actual_result).
# 2) Rebaseline sprint ci_absolute 193->172 everywhere (193 SUPERSEDED).
# No new tasks. Cluster-6 schema-drift untouched (PARKED). Preserves _schema=v3 _ssot=true.
# Pointer: docs/agents/po/flow/main.md (decision-journal + commit-mutex sub-flows).

def TS: "2026-06-09T07:18:45Z";

# --- locate the CI-RED-RECONCILE sprint by id ---
(.task_board.active_sprints[] | select(.id=="CI-RED-RECONCILE")) |= (

  # (1) C2 task REVIEW -> DONE
  (.tasks[] | select(.id=="FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE")) |= (
    .status = "DONE"
    | .closed_at = TS
    | .done_at = TS
    | .done_by = "po-S26"
    | .actual_result = "PASS — VERIFICATION GATE MET (CI-C2-GATE-7bea53d0, push ->7bea53d0 = one CI run 27189745293, bun job 80266839417): native fail 193 -> 172 (-21, EXACTLY the projected ~21), errors stay 0 (11603 pass / 42 skip / 172 fail / Ran 11817 across 1037 files). Clean architect-diagnosed test-only win — the require()->ESM import fix in the single Task-1168 file (1168-market-message-digest.test.ts, 31 local pass) cleared exactly its bucket, NO under-scope, NO whack-a-mole, NO masked truth (total tests 11817 unchanged). Router raw-verified commit 7bea53d0 TEST-ONLY (git show --name-only = ZERO non-test src paths) + pushed. CI conclusion stays 'failure' (172 != 0) — EXPECTED, CI RED until 0. 172 SUPERSEDES the 193 absolute."
  )

  # (2a) rebaseline residual/spike task gate references 193 -> 172 (193 SUPERSEDED)
  | (.tasks[] | select(.id=="FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS")) |= (
      .gate = "BLOCKED on architect SHORT file-scope confirmation: enumerate the EXACT residual fetcher test files + verify all are pure test-rewrite (no prod regression hidden). Then native fail+error must DROP vs the NEW 172 absolute (sha 7bea53d0, run 27189745293, job 80266839417 — SUPERSEDES 193/1d83a5ff). Do NOT dispatch to dev blind."
    )
  | (.tasks[] | select(.id=="FIX-CI-C3-RESIDUAL-DB-DESTROYERS")) |= (
      .gate = "BLOCKED on architect SHORT file-scope confirmation: enumerate the EXACT destroyer files + the downstream files they pollute (Bun run-order). Then native fail+error must DROP vs the NEW 172 absolute (sha 7bea53d0, run 27189745293, job 80266839417 — SUPERSEDES 193/1d83a5ff). Do NOT dispatch to dev blind."
    )
  | (.tasks[] | select(.id=="SPIKE-CI-C4-KINH-DICH-DIACRITICS")) |= (
      .title = "C4 KINH-DICH diacritics (~14 native fails, Task 285 + 1414): the tests assert Vietnamese diacritics but kinhDichTools.ts emits an ASCII fallback (or vice-versa). This touches PROD strings, so a prod-vs-test decision is required BEFORE any dev fix — do NOT route C4 to dev blind. Architect micro-SPIKE: rule prod-emits-diacritics OR ascii-acceptable, then the resulting FIX (prod string change or test-assertion update) drops fail vs the NEW 172 absolute (sha 7bea53d0 — SUPERSEDES 193)."
    )

  # (2b) rebaseline ci_absolute 193 -> 172
  | .ci_absolute = {
      "native_fail": 172,
      "native_errors": 0,
      "fail_plus_error": 172,
      "tests": 11817,
      "pass": 11603,
      "skip": 42,
      "sha": "7bea53d0",
      "run_id": "27189745293",
      "bun_job_id": "80266839417",
      "supersedes": "193 (sha 1d83a5ff, run 27188621595, job 80263220946) — SUPERSEDED",
      "delta_vs_prior": "-21 (EXACTLY projected; C2 single-file bucket landed precisely)",
      "updated_at": TS,
      "updated_by": "po-S26"
    }
  | ._updated_by = "po-S26"
)
