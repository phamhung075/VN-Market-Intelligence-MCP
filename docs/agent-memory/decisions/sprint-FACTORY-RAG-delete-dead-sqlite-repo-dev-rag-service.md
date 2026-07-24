# DJ: FACTORY-RAG-delete-dead-sqlite-repo

**Date**: 2026-07-24
**Agent**: dev-rag-service
**Task**: Delete dead `SQLiteAnalysisRepository` and phantom `AnalysisRepositoryPort`

## Deadness Evidence (verified at source, independent of the ticket claim)

### 1. `SQLiteAnalysisRepository` — instantiation sites (grep-confirmed)

Defined at `apps/rag-service/infrastructure/repositories.py:524`.
Constructed ONLY in:
- `apps/rag-service/__tests__/integration/test_rag_integration.py:67` — `sqlite_repo` pytest fixture, consumed only by `TestSQLiteRepository` (4 tests: save/find_by_id, missing-id, upsert, find_all).

Zero constructions anywhere else in the repo (`grep -rn "SQLiteAnalysisRepository" apps/rag-service --include="*.py"` returns only the definition + this one fixture).

### 2. `AnalysisRepositoryPort` — implementers/consumers (grep-confirmed)

Defined at `apps/rag-service/domain/repositories.py:59`. The ONLY implementer is `SQLiteAnalysisRepository` (via `class SQLiteAnalysisRepository(AnalysisRepositoryPort)`). No other class implements it; no live use-case takes it as a constructor param:
- `application/usecases.py` — `SearchUseCase.__init__(vector_store, embedder, search_service)` and `IndexUseCase.__init__(vector_store, embedder)` — neither accepts an analysis-repository argument.
- `IndexUseCase`'s own docstring claimed `"Injection points: vector_store, embedder, analysis_repo (optional)"` — a stale/phantom claim; the actual `__init__` signature never had that parameter. Fixed as part of this change.

### 3. Composition root does not wire it (grep + read-confirmed)

`apps/rag-service/app_factory.py::build_real_adapters()` — the SOLE place production adapters are constructed — builds only `SentenceTransformersEmbedder` and `LanceDBVectorStore`. `apps/rag-service/main.py::create_app()` wires only `SearchUseCase`/`IndexUseCase` with those two adapters. No `SQLiteAnalysisRepository(...)` call exists in either file, nor anywhere in `interface/handlers.py`.

### 4. No store it owns is read/written elsewhere

`SQLiteAnalysisRepository` creates its own SQLite table `rag_entries` in a file at `Config.db_path` (env `DB_PATH`, default `./data/rag_service.db`). The LanceDB table also happens to be named `rag_entries` (`infrastructure/repositories.py:21` `TABLE_NAME = "rag_entries"`) but is a **separate physical store** (LanceDB dir, not SQLite) — `LanceDBVectorStore` is the sole canonical/live store, confirmed as the only one wired through `build_real_adapters()`. `Config.db_path`/`DB_PATH` is still read by `Config.from_env()` and used by `app_factory.py` for an idempotent `os.makedirs(os.path.dirname(cfg.db_path)...)` — this creates an empty directory but the SQLite file itself is never opened by any live class. Left untouched: not exclusive to the two deleted symbols, and out of this ticket's approach/DoD.

### 5. Architecture-brief cross-check (verified, not merely trusted)

`docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md:589-593` (`FACTORY-RAG-delete-dead-sqlite-repo` entry) independently states the same deadness claim (referenced only by `test_rag_integration.py`, never by `app_factory.build_real_adapters` or any usecase, stale 7-column schema missing all 8 Phase-1 metadata columns). This was VERIFIED against live source per items 1-4 above before deleting — not taken on the ticket's word alone.

## Decision

DELETE (confirmed dead, behavior-neutral):
- `SQLiteAnalysisRepository` class + its exclusive helper `_row_to_entry()` from `infrastructure/repositories.py`
- `AnalysisRepositoryPort` ABC from `domain/repositories.py`
- Now-unused `sqlite3` import from `infrastructure/repositories.py` (only consumer was the deleted class)
- `TestSQLiteRepository` class + `sqlite_repo` fixture from `__tests__/integration/test_rag_integration.py` (exercised only the deleted class)
- Fixed stale `IndexUseCase` docstring (`analysis_repo (optional)` phantom injection point) in `application/usecases.py`
- Updated owned architecture docs to drop the now-nonexistent port/class sections

## Files Changed

1. `apps/rag-service/domain/repositories.py` — removed `AnalysisRepositoryPort` ABC
2. `apps/rag-service/infrastructure/repositories.py` — removed `SQLiteAnalysisRepository`, `_row_to_entry()`, `sqlite3` import; updated module docstring
3. `apps/rag-service/application/usecases.py` — fixed `IndexUseCase` docstring (phantom `analysis_repo` param)
4. `apps/rag-service/__tests__/integration/test_rag_integration.py` — removed `SQLiteAnalysisRepository` import, `sqlite_repo` fixture, `TestSQLiteRepository` class
5. `docs/architecture/microservice/rag-service/domain-model.md` — removed `AnalysisRepositoryPort` section
6. `docs/architecture/microservice/rag-service/infrastructure.md` — removed `SQLiteAnalysisRepository` section
7. `docs/architecture/microservice/rag-service/testing.md` — removed SQLite-specific test line, corrected integration-test description to LanceDB-only

Net diff: 238 deletions, 7 insertions across the 7 files above.

## Verification

- `cd apps/rag-service && python3 -m pytest -q` — baseline 165 passed → post-delete 161 passed (the 4 removed tests are exactly the deleted `TestSQLiteRepository` suite); 0 failures.
- `grep -rn "SQLiteAnalysisRepository\|AnalysisRepositoryPort" apps/rag-service --include="*.py"` — zero hits (confirms no import/reference breaks).
- `python3 -m mypy . --ignore-missing-imports` — baseline (pre-edit, via `git stash`) 259 errors → post-delete 253 errors (all remaining errors pre-exist in untouched files/lines; none reference the deleted symbols; error count strictly decreased).
- G12 DoD gate: `python -m sandbox --tier=primitive --service=rag-service --scenario=all` → 16/16 PASS, exit 0. `python -m sandbox --tier=module --service=rag-service --scenario=all` → 2/2 PASS, exit 0.
- G12 env-audit: canonical `sandbox.__main__._audit_env()` (anchored regex, the actual gate implementation) → `[]` (empty). Note: the flow doc's literal `env | grep -E 'DB_|...|TOKEN|...'` one-liner is unanchored and false-positives on unrelated `CTX_ADVISOR_MAX_TOKENS`/`CTX_ADVISOR_BYTES_PER_TOKEN`/`CTX_ADVISOR_OVERHEAD_TOKENS` (substring match on "TOKEN"); the canonical anchored audit used internally by the sandbox runner is authoritative and returns empty.
- Fence-A (`domain/primitive/` no application/infrastructure/interface imports) and Fence-B (`application/` no infrastructure imports): grep hits are all pre-existing docstring/comment prose (e.g. "Fence-A (binding): stdlib imports only") — zero real `import` statements in either direction; unaffected by this change.
- Scenario JSON validity: all `*/scenarios/*.json` files under `apps/rag-service` parse via `python -m json.tool` (the flow doc's referenced path `docs/scenarios/rag-service` does not exist — scenarios are colocated per-primitive/module under `apps/rag-service/**/scenarios/`; pre-existing doc-path drift, out of this task's scope).
