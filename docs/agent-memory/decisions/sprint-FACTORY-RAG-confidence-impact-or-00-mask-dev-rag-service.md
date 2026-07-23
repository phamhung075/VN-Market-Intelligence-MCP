# Decision Journal — FACTORY-RAG-confidence-impact-or-00-mask

**Agent:** dev-rag-service
**Task ID:** FACTORY-RAG-confidence-impact-or-00-mask
**Timestamp:** 2026-07-24T00:00Z (see commit for exact `date -u`)

## Investigation (source-first, no fabrication)

`grep -n "or 0\.0" apps/rag-service/infrastructure/repositories.py` confirmed the mask still lived at
`LanceDBVectorStore._dedup_and_trim` (`infrastructure/repositories.py:369-370`, pre-fix):

```python
confidence=float(row.get("confidence") or 0.0),
impact_score=float(row.get("impact_score") or 0.0),
```

Same function already carries a prior fix + large warning comment for the sibling `_distance` field
(FDA-9, see `__tests__/unit/test_domain_services.py::TestFDA9DistanceResolution`) — that fix replaced
`row.get("_distance") or row.get("_relevance_score") or 0.0` with an absent-key-aware `if/elif/else`
chain, because `_distance`'s fail-safe default (1.0) differs from the coalesced value (0.0), so the two
diverge for a real `_distance == 0.0`. The `confidence`/`impact_score` instance is the same anti-pattern
family but was never converted.

`domain/models.py` confirms `SearchResult.confidence: float = 0.0` and `SearchResult.impact_score: float
= 0.0` — both fields are legitimately allowed to be `0.0` (a real low-confidence / zero-impact score),
distinct from an absent/`None` raw value on older rows. `domain/services.py` only propagates
`confidence`/`impact_score` through `apply_temporal_decay` (copied field-for-field into the re-ranked
`SearchResult`); neither field feeds the sort key (`recency_score`, driven by `distance` only) or the
dedup key (`title`+`summary` only) — so no ranking/ordering math reads these fields directly, only
API/display consumers downstream.

**Empirical nuance (verified, not assumed):** because the SearchResult/domain default for both fields is
already `0.0` — identical to the value `or 0.0` coalesces away — `row.get(k) or 0.0` and
`row.get(k) if row.get(k) is not None else 0.0` are mathematically equivalent for every possible raw
input here (missing key → 0.0 either way; explicit `0.0`/`0` → 0.0 either way; any truthy value →
unchanged either way). Confirmed by `git stash` on `infrastructure/repositories.py` only (fix removed)
and re-running the 5 new regression tests against the pre-fix code: **all 5 still passed** — i.e. this
specific pair of fields was not numerically corrupting output today, unlike the `_distance` sibling
(whose fail-safe default of 1.0 genuinely diverges from a masked `0.0`).

## Decision

Fixed anyway, per task instruction and to remove the anti-pattern this task named explicitly: replaced
both `or 0.0` truthiness masks in `_dedup_and_trim` with an explicit `is not None` guard, matching the
established sibling convention in the same function:

```python
_confidence_raw = row.get("confidence")
_impact_score_raw = row.get("impact_score")
confidence = float(_confidence_raw) if _confidence_raw is not None else 0.0
impact_score = float(_impact_score_raw) if _impact_score_raw is not None else 0.0
...
confidence=confidence,
impact_score=impact_score,
```

## What Considered

1. **Leave as-is (NO_CHANGE_NEEDED), since the two expressions are provably equivalent given the current
   0.0 defaults:** REJECTED — the code still literally contained the named anti-pattern class at the
   exact call site named in the task; equivalence is default-value-dependent (would silently regress if
   either field's default ever changed from 0.0, e.g. to a NEUTRAL non-zero default), and leaving a
   known truthiness mask in place contradicts the sibling `_distance` convention already established
   with an explicit warning comment 15 lines above it in the same function.
2. **Change SearchResult/domain default away from 0.0 (e.g. to a sentinel) to make the two expressions
   diverge and "prove" the bug:** REJECTED — out of scope; the task asked to fix the mask, not redesign
   default-value semantics for the domain model, and no evidence downstream requires a different default.
3. **Explicit None-guard, minimal diff, keep 0.0 default (chosen):** SELECTED — matches task instructions
   verbatim, matches the sibling `_distance` pattern in the same function, zero behavior change today,
   defensive against a future default-value change.

## Why This Change

- Removes the `x or 0.0` truthiness-mask anti-pattern from the two remaining fields in
  `_dedup_and_trim` that still had it, completing the same-family fix already applied to `_distance`
  (FDA-9).
- No output/ranking/dedup behavior change today (see Verification) — reported honestly rather than
  claiming a corruption was "caught," since the fallback and masked-away value are numerically identical
  for these two fields under the current domain-model defaults.

## Verification

- Baseline (pre-fix): `cd apps/rag-service && python3 -m pytest __tests__/unit/test_domain_services.py -q`
  → 25 passed.
- Added `TestConfidenceImpactScoreNoneGuard` (5 tests) to
  `apps/rag-service/__tests__/unit/test_domain_services.py`: explicit `0.0` confidence preserved,
  explicit `0.0` impact_score preserved, both keys absent → defaults to `0.0`, both keys explicitly
  `None` → defaults to `0.0`, dedup/ordering unaffected across two distinct rows both carrying `0.0`
  scores.
- Post-fix: `python3 -m pytest __tests__/unit/test_domain_services.py -q` → **30 passed**.
- Full service suite: `python3 -m pytest -q` (apps/rag-service) → **165 passed**, 0 failed.
- Self-confirming check (required by no-fabrication constraint): `git stash` on
  `infrastructure/repositories.py` only (reverting to the pre-fix `or 0.0` code, tests kept), re-ran the
  5 new tests → **all 5 still passed** against the old code. Documented in "Investigation" above — this
  proves the fix is a genuine anti-pattern removal but was not an active numeric-corruption bug for these
  two specific fields (unlike the `_distance` sibling, where an equivalent stash-diff would flip 2 of the
  4 FDA-9 tests to FAIL because 1.0 ≠ 0.0).
- `python3 -m mypy infrastructure/repositories.py --ignore-missing-imports`: 15 pre-existing errors,
  identical before/after diff (confirmed via the same stash-compare) — zero new errors introduced.
- G12 sandbox gate: `python -m sandbox --tier=primitive --service=rag-service --scenario=all` → 16/16
  PASS, 0 FAIL. `python -m sandbox --tier=module --service=rag-service --scenario=all` → 2/2 PASS, 0
  FAIL.
- Env audit: `env | grep -E 'DB_|API_KEY|SECRET|TOKEN|PASSWORD|LANCEDB|HF_|HUGGINGFACE'` returned only
  `CTX_ADVISOR_BYTES_PER_TOKEN`, `CTX_ADVISOR_MAX_TOKENS`, `CTX_ADVISOR_OVERHEAD_TOKENS` — benign
  numeric context-window config from the Claude Code host process (substring match on "TOKEN"), not
  rag-service credentials. No `DB_*`/`API_KEY`/`SECRET`/`PASSWORD`/`LANCEDB_*`/`HF_TOKEN`/`HUGGINGFACE_*`
  present.
- Fence check: `grep -rn "application\|infrastructure\|interface" apps/rag-service/domain/primitive/` and
  `grep -rn "infrastructure" apps/rag-service/application/` both return only docstring/comment mentions
  (no actual imports) — Fence-A/Fence-B clean, unaffected by this change (only
  `infrastructure/repositories.py` was touched).

## Deferred / Not Closed Here

None — single-function, zero-scope-creep fix. Board flip to `review[]` / `status=REVIEW` /
`next_agent=qa` is the closeout for this task; QA should independently re-run the self-confirming
stash-compare if it wants to verify the "no active corruption today" claim above.
