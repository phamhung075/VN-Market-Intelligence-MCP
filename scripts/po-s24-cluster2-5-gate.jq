# po-S24: CI-CLUSTER2-5-GATE-91afe344 PASSED — close Cluster-2 + Cluster-5, rebaseline 346->241, open RE-PROFILE.
# Atomic single-pass transform over orch-state.json (v3 SSOT).
# Owned paths: orch-state.json (+ the po decision journal, edited separately).
# Pointer doc: docs/agents/po/flow/main.md (decision-journal + commit-mutex sections).
#
# Args: $ts (UTC ISO-8601 stamp).
# - Flip FIX-CI-DATA-SYMLINK-ENOENT (Cluster 2) TODO->DONE.
# - Flip FIX-CI-DEAD-REUTERS-TESTS (Cluster 5) TODO->DONE.
# - Each: single status key, +closed_at +done_at +done_by +actual_result.
# - Append RE-PROFILE-CI-241-RESIDUAL (architect SPIKE, TODO, high) carrying the 241 absolute.

(.task_board.active_sprints[24].tasks) |= (
  map(
    if .id == "FIX-CI-DATA-SYMLINK-ENOENT" then
      .status = "DONE"
      | .closed_at = $ts
      | .done_at = $ts
      | .done_by = "po"
      | .actual_result = "PASS (bundled with Cluster-5 in one dev commit a5150685): joint native fail+error 346 -> 241 (-105, -30%) at sha 91afe344 (run 27185729719, bun job 80254121788: 11534 pass / 42 skip / 241 fail / 0 errors / Ran 11817). Cluster-2 symlink-heal in setup.ts (lstatSync+isSymbolicLink+unlinkSync broken-symlink guard, then mkdirSync recursive) cleared ~103 fails (beat the ~91 taxonomy estimate; +15 tests now execute that previously crashed on ENOENT). Code retained + pushed by router (4bbdce2e->91afe344). 241 SUPERSEDES 346."
    elif .id == "FIX-CI-DEAD-REUTERS-TESTS" then
      .status = "DONE"
      | .closed_at = $ts
      | .done_at = $ts
      | .done_by = "po"
      | .actual_result = "PASS (bundled with Cluster-2 in dev commit a5150685): the 2 native errors -> 0 (ERRORS now ZERO for the first time this sprint). Deletion of the two _deprecated/ reuters test files (importing deleted ../infrastructure/fetchers/reuters.js) cleared the 2 eval-time errors. Joint with Cluster-2: native fail+error 346 -> 241 at sha 91afe344 (run 27185729719, job 80254121788). All remaining 241 are pure fail (0 errors)."
    else . end
  )
  + [
    {
      "id": "RE-PROFILE-CI-241-RESIDUAL",
      "type": "SPIKE",
      "owner": "architect",
      "status": "TODO",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "mode": "spike",
      "timebox": 120,
      "depends": ["FIX-CI-DATA-SYMLINK-ENOENT", "FIX-CI-DEAD-REUTERS-TESTS"],
      "labels": ["ci-red-reconcile", "re-profile", "taxonomy", "no-prod-code"],
      "title": "RE-PROFILE the 241 native residual fails into a FRESH cluster breakdown that SUPERSEDES the 629-era taxonomy. Cluster-1 (mock-contam) and Cluster-2 (symlink-ENOENT) each UNMASKED hidden truth, so the old per-cluster estimates (Cluster-3 ASSERTION/LOGIC ~159, Cluster-4 UNDEFINED-FN getMarketMessageDigest ~21) are STALE. Group the 241 fails (from `gh run view --job=80254121788 --log`, sha 91afe344) by error signature; rank buckets by (size x low-prod-risk). Cluster-6 schema-drift stays PARKED — do NOT reopen.",
      "baseline_pass": "241 native fail+error absolute (241 fail + 0 err / Ran 11817, sha 91afe344, run 27185729719, bun job 80254121788 — SUPERSEDES the 346/2acb7192 and the 629/e442cf11 absolutes; ERRORS now ZERO)",
      "gate": "deliverable: a fresh-cluster-breakdown brief in docs/architecture-briefs/ that groups all 241 native fails by error signature and ranks buckets by (size x low-prod-risk); NO code change; gate = taxonomy delivered. Drives the next ROI-ranked attack FIX (native fail+error must DROP vs the 241 absolute).",
      "created_at": $ts,
      "created_by": "po",
      "note": "[po S24 DJ-GATE-1 \($ts)] Opened on CI-CLUSTER2-5-GATE-91afe344 PASS (346->241, errors->0). Re-profile is mandatory BEFORE swinging at the next bucket: the 241 residual composition has SHIFTED vs the 629-era taxonomy — two clusters unmasked previously-crashed tests, so Cluster-3/4 estimates are computed against a now-superseded absolute. Deliverable supersedes docs/architecture-briefs/2026-06-09-ci-629-failure-taxonomy.md. Cluster-6 schema-drift (FU-SCHEMA-DRIFT-P5..P8 / P8-IMPL) stays PARKED per po-S21 PATH-B — do NOT reopen. owner architect (no-code root-cause taxonomy = SPIKE pattern). zone apps/mcp-server/ (where the bun-test corpus lives). WIP<=2: architect lane consumes no dev WIP."
    }
  ]
)
