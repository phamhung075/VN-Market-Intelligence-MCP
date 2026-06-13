## Task Report FDA-9
date: 2026-06-13
changed: [apps/rag-service/infrastructure/repositories.py:280-296, apps/rag-service/__tests__/unit/test_domain_services.py:282-413]
tests: 156 pass / 0 fail (full suite uncached) | targeted FDA9: 4 pass / 0 fail | tsc: N/A (Python zone) | ddd: PASS | security: PASS (Smart-Skip: test_only=true)
verdict: APPROVED

### QA Raw Verification

G1 SCOPE PASS: git show --stat 418c4812 = 2 files only — apps/rag-service/__tests__/unit/test_domain_services.py (+138L) + apps/rag-service/infrastructure/repositories.py (+21 -4L). No schema, no container, no Dockerfile, no compose.

G2 TARGETED PASS (own run):
  python3 -m pytest __tests__/unit/test_domain_services.py -k FDA9 -p no:cacheprovider -q
  → 4 passed, 21 deselected in 0.12s

G3 FULL SUITE PASS (own run):
  python3 -m pytest -p no:cacheprovider -q
  → 156 passed in 6.38s

G4 AC1 ROOT FIX PASS: repositories.py:291-296 — explicit `if "_distance" in row and row["_distance"] is not None` → distance=float; elif `_relevance_score` in row and not None → distance=float; else distance=1.0. Absent signal → distance=1.0 → similarity_scorer returns 1/(1+1)=0.5 (low/neutral). NOT 0.0 → NOT fabricated 1.0.

G5 AC2 ALIGNMENT PASS: sibling module.py:102 raw-read — `float(result.get("distance", 1.0))`. Both default to distance=1.0 fail-safe. In-code comment cites both call sites.

G6 AC3 NO-MASK PASS: similarity_scorer.score() formula (1/(1+d)) untouched. No test threshold widened. No fixture hardcode. Assertions check served similarity values.

G7 AC4 LEGIT-ZERO PASS: test_distance_zero_preserved_as_identical_vector_match — row with _distance=0.0 → results[0].distance=0.0 → similarity=1.0. Old `or` coalesce would have silently discarded 0.0.

G8 AC5 SELF-CONFIRMING PASS: 4 tests in TestFDA9DistanceResolution:
  (a) test_absent_distance_key_yields_fail_safe_low_similarity — distance=1.0, sim=0.5
  (b) test_distance_zero_preserved_as_identical_vector_match — distance=0.0, sim=1.0
  (c) test_only_relevance_score_resolves_correctly — distance=0.3 used, sim≈0.769
  (d) test_distance_takes_priority_over_relevance_score — distance=0.2 wins over _relevance_score=0.9

G9 PACKAGE-SWEEP SANITY PASS: confidence/impact_score `or 0.0` at repositories.py:314-315 are metadata fields on SearchResult. similarity_scorer.score() takes a single float `distance` argument only. confidence/impact_score never passed to similarity_scorer — different class (SQL-NULL guards on optional metadata, semantically correct 0.0 default).

BCTC eval: N/A (rag-service zone, no report_id).
DJ: sprint-FAKE-DATA-AUDIT-qa.md § qa-FDA9-S1.
