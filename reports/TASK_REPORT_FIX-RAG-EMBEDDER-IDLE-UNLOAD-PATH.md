## Task Report FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH
changed: apps/rag-service/infrastructure/embedder.py, apps/rag-service/app_factory.py, apps/rag-service/infrastructure/config.py, apps/rag-service/__tests__/unit/test_embedder_idle_unload.py (new), docs/architecture/microservice/rag-service/infrastructure.md
commit: 0308514f5 (direct-commit, no branch — dev-team Review-Lane QA-Drain, verify-committed mode)
tests: 175 pass / 0 fail (163 baseline + 12 new, `test_embedder_idle_unload.py`) | mypy: 20 pre-existing errors, byte-identical set pre/post (isolated worktree diff, 0 new) | ddd/security greps: clean | mock-guard: PASS | sandbox: primitive 16/16, module 2/2 (both exit 0)
verdict: APPROVED, DONE_VERIFIED

### Notes
- Dependency `OPS-RAG-SERVICE-REBUILD-STALE-IMAGE-PREDATES-IDLE-UNLOAD-FIX` independently re-confirmed `DONE_VERIFIED`: running container image `sha256:12a7bc89...` created 2026-08-08T08:10:53Z, postdates fix commit (2026-08-06T16:33:53Z), `RestartCount=0` — code genuinely executing in production.
- AC-3 (idle-unload actually fires) already adjudicated Branch B by a peer QA cycle on the OPS row per `po_ac3_adjudication_20260808T0820Z`: unload log line confirmed present in production logs, dip magnitude short of full reclamation. Per PO's ruling this makes THIS row's code correct — the residual allocator page-return gap is owned by a new sibling row `FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS` (backlog), not returned here.
- CI size-lint debt this commit introduced (`app_factory.py`/`embedder.py` over baseline) already closed by 2 separate `DONE_VERIFIED` rows (`99ed7c8b0`, `b85b524f1`, comment-only justification headers, landed 2026-08-07) — confirmed both files absent from the current `size-lint-justification.sh --check` offender list.
- Docker Microservice Code-Change Close Gate: already satisfied by the OPS rebuild row (image rebuilt + SHA-verified before this verdict) — no second rebuild performed per PO's explicit hard constraint against re-rebuilding.
- Board: moved `task_board.qa[]` → `task_board.done_verified[]` via `orch-apply.sh` (conservation OK, task_total 755→755, signal_total 245→245). `status_note` (QA Review Record) appended to the row (no handoff file — direct-commit verify path).
