# po-fda9-groom-ready.jq
# Idempotent groom of FDA-9 (apps/rag-service) to READY.
# Defect (raw-verified 2026-06-13): infrastructure/repositories.py:282
#   `distance = float(row.get("_distance") or row.get("_relevance_score") or 0.0)`
#   -> when relevance signal ABSENT, default 0.0 -> similarity_scorer (1/(1+d)) yields
#      1.0 = fabricated PERFECT match (fail-OPEN). Sibling module.py:102 defaults to
#      1.0 distance (fail-SAFE, low similarity) -> opposite direction.
# Generic fix bar: align repositories.py to fail-SAFE for ALL rows/queries
#   (sentinel large distance OR fail-loud when signal absent) — no per-row/per-query
#   hardcode, no test-widen-to-mask. Pure Python module change -> test_only / no_rebuild.
# Usage: jq -f scripts/po-fda9-groom-ready.jq -e orch-state.json > tmp && [ -s tmp ] && mv tmp orch-state.json
#
# Pin metadata via --arg now (UTC ISO).
.task_board.backlog |= (map(
  if .id == "FDA-9" then
    . + {
      status: "READY",
      owner: "dev-rag-service",
      priority: "P3",
      size: "S",
      groomed_at: $now,
      groomed_by: "po",
      test_only: true,
      no_rebuild: true,
      files: [
        "apps/rag-service/infrastructure/repositories.py",
        "apps/rag-service/domain/module/retrieval/module.py",
        "apps/rag-service/__tests__/unit/test_domain_services.py"
      ],
      defect_site: "apps/rag-service/infrastructure/repositories.py:282 — float(row.get(\"_distance\") or row.get(\"_relevance_score\") or 0.0)",
      sibling_ref: "apps/rag-service/domain/module/retrieval/module.py:102 — float(result.get(\"distance\", 1.0)) (fail-SAFE)",
      acceptance_criteria: [
        "AC1 (root fix, GENERIC): when neither _distance nor _relevance_score is present on a LanceDB row, repositories.py MUST NOT default to 0.0 (which fabricates similarity=1.0 perfect match). Default to a fail-SAFE sentinel (large distance -> low similarity) OR fail-loud — consistent across ALL rows/queries, no per-row or per-query special-casing.",
        "AC2 (alignment): direction MUST match sibling module.py:102 fail-safe semantics (absent signal -> LOW similarity, never perfect). Document the chosen sentinel/raise in a code comment citing both call sites.",
        "AC3 (no-mask): do NOT widen a test threshold or skip to make this pass; do NOT hardcode a specific distance value tied to one fixture. Fix the default-resolution logic itself.",
        "AC4 (legit-zero preserved): a genuine _distance == 0.0 (true identical-vector match) MUST still yield similarity 1.0 — the `or` short-circuit currently mis-coalesces a real 0.0 into the fallback chain; resolution MUST distinguish ABSENT key from present-0.0.",
        "AC5 (test, fail-loud): add a unit test in test_domain_services.py proving (a) absent _distance -> low similarity (not 1.0), (b) present _distance==0.0 -> similarity 1.0 preserved. Tests are self-confirming (assert the served similarity, not the internal default).",
        "AC6 (suite, no-cached-pass): full rag-service unit suite green run from a clean (no-cached) invocation — pytest with cache disabled (e.g. -p no:cacheprovider) — pure Python change, test_only=true, no_rebuild=true (no container rebuild needed)."
      ],
      ready_note: ("READY by po " + $now + " — raw-verified defect at repositories.py:282 (similarity formula 1/(1+d), d=0.0 -> 1.0 fabricated). Generic fail-safe alignment to module.py:102. test_only/no_rebuild. FAKE-DATA-AUDIT arc; last-ship correctness/silent-fabrication class.")
    }
  else . end
))
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| .task_board.head = { note: "FDA-9 (rag-service _distance fail-open fabricated-similarity) groomed READY; mcp-server zone untouched (frozen behind EVIDENCE-ACCUM gate)" }
