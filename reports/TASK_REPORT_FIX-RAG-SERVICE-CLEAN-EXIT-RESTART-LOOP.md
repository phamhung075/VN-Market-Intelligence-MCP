## Task Report FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP
changed: [apps/rag-service/infrastructure/repositories.py, apps/rag-service/__tests__/unit/test_lancedb_compaction.py, docs/architecture/microservice/rag-service/infrastructure.md, docs/architecture/microservice/rag-service/testing.md]
tests: 175 pass / 0 fail (full pytest suite; test_lancedb_compaction.py 6/6 incl. new AC1/AC2) | mypy --strict repositories.py: 14 errors (unchanged, 0 new — confirmed before/after) | ddd: PASS | security: PASS
verdict: APPROVED — direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`)

### Verification method
Direct-commit verify (no branch, already on `main`). Row carried no top-level `commit`/`files` field — derived commit `22232ad2b` from the row's own dated note `dev_rag_service_implementation_20260805T1117Z`.
- `git merge-base --is-ancestor 22232ad2b main`: confirmed on main ancestry.
- `git show --stat 22232ad2b`: touches exactly the 4 files claimed; `Task:`/`AC:` trailers verbatim match this id + AC1/AC2/AC5.
- `git log 22232ad2b..HEAD -- repositories.py`: empty — no later drift, live file is genuinely the fix.
- Re-ran REAL (not trusted from PO/dev prose): `pytest apps/rag-service/__tests__/unit/test_lancedb_compaction.py -v` → 6/6 pass, including:
  - AC1: real injected `table.optimize` `RuntimeError` → `self._insert_count` resets to 0 exactly once (via `finally:`), next insert does not immediately re-fire `compact()`.
  - AC2: two concurrent `insert()` coroutines both crossing `_COMPACT_EVERY` (via `asyncio.gather`) → exactly 1 real `table.optimize()` call (asyncio.Lock serialization confirmed).
  - AC5 covered by pre-existing `test_compact_failure_is_nonfatal` — insert still succeeds when compaction fails.
- Full suite: `pytest` → 175 passed / 0 failed (superset of dev's claimed 163 — later unrelated rows added tests since; zero regressions).
- `mypy --strict apps/rag-service/infrastructure/repositories.py` → 14 errors. Independently re-checked BEFORE the fix (`git show 22232ad2b^:...` restored temporarily, mypy re-run, file restored) → also 14 errors — confirmed 0 NEW errors, not just trusted from dev's "14->14" claim.
- `bash scripts/audits/mock-guard.sh --files apps/rag-service/infrastructure/repositories.py` → PASS, exit 0.
- `grep -n "process.env"` / secrets/password/token grep on touched files → clean (one comment hit on FTS "tokens/postings" — not a credential).
- Import direction: `infrastructure/repositories.py` imports only `domain.models`/`domain.repositories` — correct DDD direction, no domain→infra/application leak.
- Docs sync (`infrastructure.md`, `testing.md`) read against current live code — accurate, no stale contract.

### Non-blocking corroboration (host-only, no `docker exec` per row's explicit constraint)
`docker inspect`/`docker stats`/`docker logs --since 6h`: RestartCount=0 since StartedAt 2026-08-08T08:11:45Z (~10h45m uptime), zero "compaction failed" / zero "Retryable commit conflict" lines in the 6h window; 871 `POST /index` / 9 compaction attempts ≈ 96.8 inserts/attempt (pre-fix baseline was 55). Not used as the judgment basis — `po_deploy_verified_for_qa_20260806T1245` explicitly scopes this QA pass to AC1/AC2/AC5 (code correctness) only; AC3/AC4 (host-side ratio) and AC6 (residual restart-loop, explicitly disclaimed by the row's own AC6 — belongs to `FU-RAG-DEPLOY-MEMORY`) were already adjudicated by PO/router across 6 prior notes on this row and are out of scope here.

### Board
`task_board.qa[]` → `task_board.done_verified[]`, `status: QA -> DONE_VERIFIED`, `commit_sha` backfilled → `22232ad2b`, `verification.raw_probe` attached (RC-VERIF gate — row not on the frozen grandfather allowlist). Applied via `jq` + `scripts/orch-apply.sh` (conservation OK: task_total 753→753, signal_total 31→31, signal_row_identity=clean). Verification text appended to the row's own dated field `qa_verify_committed_20260808T1900Z` (no `status_note` field on this row — new dated field, matching this row's own established multi-contributor convention).
