---
title: "Brownfield Inventory + Bug-Inventory Baseline — rag-service Pilot"
date: "2026-05-24"
author: "architect (cycle-71 phase-0 P0-RAG-1)"
pilot: "rag-service"
status: "READY"
zone: "apps/rag-service/"
deliverable: "PHASE0-D3 (brownfield_inventory) + PHASE0-D4 (bug_inventory_entry)"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-charter.md"
pilot_status_ref: "docs/data/pilot-status-rag-service.json"
---

# Brownfield Inventory — `rag-service`

**Zone:** `apps/rag-service/`
**Language:** Python (locked Day 0 per charter)
**Port:** 5002 (confirmed via system-map.json)
**DB:** `rag_service.db` (SQLite metadata) + LanceDB at `./data/lancedb`

---

## 1. File Inventory

```
apps/rag-service/
├── main.py                     ← composition root (FastAPI app factory)
├── pyproject.toml              ← build + pytest config; no import-linter yet (SI-4 gap)
├── requirements.txt
├── Dockerfile
├── domain/
│   ├── models.py               ← EmbeddingVector, AnalysisEntry, SearchResult (dataclasses)
│   ├── repositories.py         ← VectorStorePort, AnalysisRepositoryPort, EmbedderPort (ABC)
│   ├── services.py             ← SearchService + 3 pure functions (temporal decay pipeline)
│   └── errors.py               ← domain error hierarchy (RAGError, SearchError, IndexError…)
├── application/
│   ├── dtos.py                 ← SearchRequest/Response, IndexRequest/Response (dataclasses)
│   └── usecases.py             ← SearchUseCase, IndexUseCase + _build_embedding_text()
├── infrastructure/
│   ├── config.py               ← Config.from_env() (reads LANCEDB_PATH, DB_PATH, EMBEDDING_MODEL…)
│   ├── embedder.py             ← SentenceTransformersEmbedder (implements EmbedderPort)
│   └── repositories.py         ← LanceDBVectorStore + SQLiteAnalysisRepository
├── interface/
│   ├── handlers.py             ← FastAPI route handlers (thin: delegate to usecases)
│   └── serializers.py          ← Pydantic request/response schemas + .to_dto() adapters
└── __tests__/
    ├── unit/test_domain_services.py   ← 15 tests, pure function coverage
    ├── unit/test_search_usecase.py    ← 7 tests, AsyncMock ports
    └── integration/test_rag_integration.py ← 8 tests, FakeEmbedder + real LanceDB + SQLite
```

---

## 2. DDD Layer Cleanliness Scan

### Domain layer — CLEAN

`domain/models.py`: pure dataclasses. Zero imports from infrastructure or interface. `EmbeddingVector`, `AnalysisEntry`, `SearchResult` are correct value objects / entities.

`domain/repositories.py`: correct ABC port definitions (`VectorStorePort`, `AnalysisRepositoryPort`, `EmbedderPort`). Zero infra imports.

`domain/services.py`: all pure functions / classes. `compute_recency_score`, `apply_temporal_decay`, `filter_by_max_distance`, `SearchService.rank`. ZERO infra or interface imports. Imports only `domain.models.SearchResult` and stdlib (`math`, `datetime`). CLEAN.

`domain/errors.py`: error hierarchy only. No imports outside stdlib.

**Golden rule check:** `domain/` has ZERO imports from `infrastructure/` or `interface/`. PASS.

### Application layer — CLEAN

`application/dtos.py`: dataclasses only, no infra imports.

`application/usecases.py`: imports `domain.*` and `application.dtos` only. Ports injected via constructor. `_build_embedding_text()` is a pure helper inline function. CLEAN.

### Infrastructure layer — CLEAN

`infrastructure/config.py`: reads `os.environ`. No domain leaks.

`infrastructure/embedder.py`: imports `domain.models`, `domain.repositories` (correct — implements the port). Uses sentence-transformers inside `_load_model()` via late import (isolation pattern). CLEAN.

`infrastructure/repositories.py`: imports `domain.models` and `domain.repositories` (correct implementation). Uses `lancedb`, `sqlite3`, `json`, `re` — all infrastructure concerns. No application or interface imports. CLEAN.

### Interface layer — CLEAN

`interface/handlers.py`: imports `application.usecases` and `interface.serializers` only. FastAPI router. No direct domain or infra access. CLEAN.

`interface/serializers.py` (not read in full but visible from handlers): Pydantic schemas + `.to_dto()` adapters. Correct interface-layer position.

### Composition root (`main.py`) — CLEAN but watch line count

`main.py` is 113 lines. Wires config → infra adapters → domain service → use cases → FastAPI routes. Has a single `create_app()` factory pattern (excellent). G3 calibration targets `≤80 lines` after Phase 2 rewire — current 113L means Phase 2 must trim ~33 lines; that is achievable by moving middleware setup and lifespan into a helper. No business logic in main.py. CLEAN wiring. Composition root pattern already established.

---

## 3. Candidate Primitives — Pure-Function Confirmation

All five charter candidates confirmed as EXTRACTABLE pure transforms in `domain/services.py` today. They exist as inline logic today — not yet isolated into `domain/primitive/` submodules.

| Candidate | Current location | Pure? | Deterministic? | Extraction verdict |
|---|---|---|---|---|
| **similarity-scorer** | `apply_temporal_decay()` — `1.0 / (1.0 + r.distance)` formula | YES | YES (given fixed distance) | EXTRACT |
| **relevance-threshold-gate** | `filter_by_max_distance()` — `r.distance <= max_distance` | YES | YES | EXTRACT |
| **temporal-decay-scorer** | `compute_recency_score()` + decay formula | YES | YES (given fixed `now` param injection) | EXTRACT — inject `now: datetime` for determinism |
| **top-k-selector** | `ranked[: request.limit]` in `SearchUseCase.execute()` | YES | YES | EXTRACT from application to primitive |
| **context-window-packer** | `_build_embedding_text()` in `application/usecases.py` | YES | YES | EXTRACT from application to primitive |

Note on top-k-selector and context-window-packer: they currently live in the application layer, not domain/services.py. Extraction moves them to `domain/primitive/` (pure functions, no infra). This is correct DDD rewiring, not a violation.

**CRITICAL ADAPTER BOUNDARY (charter §Key risks #1) — CONFIRMED:**

- `SentenceTransformersEmbedder` in `infrastructure/embedder.py` IS an infrastructure adapter. It loads the sentence-transformers model and produces `EmbeddingVector` objects. It MUST NOT become a primitive or be called from primitives. It is injected via `EmbedderPort` at the composition root.
- `LanceDBVectorStore` in `infrastructure/repositories.py` IS an infrastructure adapter. The ANN vector search is non-deterministic across runs. It MUST NOT be called from primitives or module tests. It is injected via `VectorStorePort` at the composition root.
- Sandbox scenario JSON design: embedding vectors are PRE-COMPUTED fixed float arrays fed as inputs. Primitives receive `list[float]` — they never call the embedder or LanceDB. This is the determinism gate for G1/G2.

**Module candidate — `retrieval`:**

Confirmed. The `retrieval` module composes the pipeline: context-window-packer → (embedder adapter, via port) → similarity-scorer → relevance-threshold-gate → temporal-decay-scorer → top-k-selector. The module composition is through ports (the `EmbedderPort` and `VectorStorePort` are injected, never imported from infra). The module does NOT import `infrastructure.embedder` or `infrastructure.repositories` directly.

---

## 4. G5 Rewire Surface — MCP Tool Handlers

### System-map fact

`system-map.json` records `rag-service` with `tools: []` and `crons: []`. This means zero tools are officially registered as rag-service callers in the SSOT.

### Actual MCP-server rag access patterns

Brownfield scan of `apps/mcp-server/src/` reveals TWO distinct data paths for RAG data:

**Path A — `rag_analyses` SQLite table (DIRECT DB — in mcp-server's own SQLite DB)**

The `rag_analyses` table is a table inside mcp-server's own `mcp-server.db` (not rag-service's `rag_service.db`). Multiple MCP tools query it directly:

- `interface/mcp/tools/alerts/alerts.ts` — `get_analysis_history` queries `rag_analyses`
- `interface/mcp/tools/news-analysis/sentimentTrendTools.ts` — queries `rag_analyses`
- `interface/mcp/tools/market-data/dataFreshnessTools.ts` — `SELECT MAX(created_at) FROM rag_analyses`
- `interface/mcp/tools/system/dataFreshnessTools.ts` — same freshness query
- `interface/mcp/tools/market-data/marketContextTools.ts` — references "RECENT ANALYSIS — latest RAG analysis entries"
- `interface/mcp/tools/market-data/marketTools.ts` — `get_patterns` queries `rag_analyses` for historical precedents
- `interface/mcp/tools/kinhdich/kinhDichTools.ts` — Hao 1 queries `rag_analyses`
- `interface/mcp/tools/financial-reports/bctcFullTools.ts` — sentiment trend OLS from `rag_analyses`
- `interface/mcp/tools/macro/policyTools.ts` — `get_policy_signals` reads `rag_analyses`
- `interface/mcp/server.ts` — inserts into `rag_analyses`
- `interface/mcp/tools/news-analysis/analysis.ts` — inserts into `rag_analyses`
- Scheduler jobs: `pipelineWatchdogJob.ts`, `vpsProxyWatchdogJob.ts`, `freshnessSlaMonitorJob.ts`, `dataAuditJob.ts` — all query `rag_analyses` staleness

**This is NOT a G5 violation.** The `rag_analyses` table is mcp-server's own SQLite analysis store, separate from `apps/rag-service/`'s LanceDB + `rag_service.db`. These tools are NOT bypassing the rag-service HTTP API — they are reading a PARALLEL analysis log table in mcp-server's own DB.

**Path B — `infrastructure/rag/` in mcp-server (PARALLEL LANCEDB INSTANCE)**

`apps/mcp-server/src/infrastructure/rag/` contains its own TypeScript LanceDB stack:
- `vectorstore.ts` — TypeScript LanceDB client (connects to the SAME `./data/lancedb` path on disk)
- `embeddings.ts` — HuggingFace Transformers (TS) embedder, same `paraphrase-multilingual-MiniLM-L12-v2` model
- `retriever.ts` — `searchContext()` / `insertAnalysis()` — direct LanceDB calls, bypassing rag-service HTTP
- `ragHttpClient.ts` — HTTP client for port 5002 (EXISTS but unused by retriever.ts)

The `analysis.ts` tool (`fetch_and_analyze`) imports `searchContext` and `insertAnalysis` from `infrastructure/rag/retriever.ts` — this is a DIRECT LanceDB import bypassing rag-service's HTTP API.

The `dataAuditJob.ts` imports `getCount` from `infrastructure/rag/vectorstore.ts` — same bypass pattern.

The `index.ts` entry point imports `closeVectorStore` from `infrastructure/rag/vectorstore.ts` — lifecycle management of the parallel LanceDB connection.

**G5 rewire surface assessment:**

| Item | Bypass type | G5 scope |
|---|---|---|
| `news-analysis/analysis.ts` → `infrastructure/rag/retriever.ts` | Direct LanceDB (no HTTP) | G5b — rewire to `ragHttpClient.ts` at port 5002 |
| `scheduler/news-analysis/dataAuditJob.ts` → `vectorstore.ts` `getCount` | Direct LanceDB count | G5b — rewire to `GET /health` or new `/stats` endpoint |
| `index.ts` → `vectorstore.ts` `closeVectorStore` | Lifecycle bypass | G5b — remove once rag-service owns its LanceDB |
| `infrastructure/rag/embeddings.ts` (TS HF model) | Parallel embedder | G5a candidate — duplicate infra in mcp-server |
| `infrastructure/rag/vectorstore.ts` | Parallel LanceDB | G5a candidate — duplicate infra in mcp-server |
| `infrastructure/rag/retriever.ts` | Orchestration logic | G5a candidate — duplicate of rag-service's SearchUseCase |

**`ragHttpClient.ts` already exists** at `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` with correct `ragSearch()` and `ragIndex()` functions. The HTTP rewire surface is `retriever.ts` → replace `searchContext`/`insertAnalysis` calls with `ragSearch`/`ragIndex` via `ragHttpClient.ts`. The client already reads `RAG_SERVICE_URL` env var (default `http://localhost:5002`).

G5a (move legacy → `_deprecated/`) applies to: `infrastructure/rag/embeddings.ts`, `infrastructure/rag/vectorstore.ts`, `infrastructure/rag/retriever.ts`. These are the TS-side parallel implementations that become dead code after rewire.

G5b rewire is narrower than kinh-dich (which required 6 tool rewires). Here the callers funnel through `retriever.ts` — rewiring `retriever.ts` to call `ragHttpClient.ts` propagates to all callers. One surgical change.

G5c: grep for `TODO.*migrat` in `apps/rag-service/` and `apps/mcp-server/src/infrastructure/rag/` — confirm zero post-rewire.

**Pre-delete tag:** `rag-pre-delete` created by dev-rag-service before `git mv` of `infrastructure/rag/{embeddings,vectorstore,retriever}.ts` → `infrastructure/rag/_deprecated/`.

---

## 5. Risk Flags

**R-1 — DUAL LANCEDB WRITERS (CRITICAL)** Two processes write to `./data/lancedb` simultaneously: rag-service container (Python, async lancedb) and mcp-server (TS, @lancedb/lancedb). LanceDB files are not transactionally safe for multi-process writes. After G5b rewire all writes route through rag-service (single writer). Before G5b, this risk is pre-existing and not introduced by the pilot. Flag for dev-rag-service: do NOT expand write patterns from mcp-server side during Phase 1.

**R-2 — `datetime.now()` in `apply_temporal_decay()` (determinism gap)** `compute_recency_score()` calls `datetime.now(tz=timezone.utc)` internally. Scenarios that include timestamp inputs will produce different recency scores on different run dates, making golden scenarios time-sensitive. Fix: extract `now` as an injectable parameter in the primitive (`similarity-scorer` + `temporal-decay-scorer` split). Pre-computed fixed embedding vectors already address the ANN non-determinism. The datetime.now() injection is the remaining gap.

**R-3 — `application/usecases.py` `_build_embedding_text()` in application layer** The `context-window-packer` candidate is currently a private function inside `IndexUseCase`. It must move to `domain/primitive/context_window_packer/` before it can be scenario-tested. No cross-layer import is introduced — only a move.

**R-4 — `top-k-selector` lives in application layer (slice `ranked[:limit]`)** The top-k selection is an inline slice expression inside `SearchUseCase.execute()`. As a primitive it needs explicit type: `def select_top_k(results: list[SearchResult], k: int) -> list[SearchResult]`. Trivial to extract; scenarios are simple (boundary conditions at k=0, k=len, k>len).

**R-5 — LanceDB disk growth (29GB incident)** Known pre-existing risk from charter §Key risks #3. Pilot MUST preserve `HF_HUB_OFFLINE=1` env var and model cache hardening from current Dockerfile. Do not change `embedding_cache_dir` behavior. The sandbox runner must NOT trigger model download.

**R-6 — mcp-server `rag_analyses` table is SEPARATE from rag-service DB** `rag_analyses` in mcp-server's SQLite is an analysis event log, not the LanceDB vector store. After G5b rewire, mcp-server still writes to `rag_analyses` (analysis log) but calls rag-service HTTP for semantic search/index. Both can coexist. Do NOT migrate `rag_analyses` in this pilot (out of scope).

---

## 6. SI-4 Architecture Fence Decision

**SI-4 DECISION: `import-linter` (grimp backend)**

**Rationale:**

`import-linter` (pip package `import-linter`, config in `pyproject.toml` or `.importlinter`) is the correct choice for rag-service (and the Python pilot fleet).

Comparison:

| Criterion | import-linter | ruff banned-imports |
|---|---|---|
| Offline-runnable | YES — pure Python, no network needed | YES — pure Rust binary |
| Contract style | Layered + independence contracts in `.importlinter` | Per-rule `banned-module-imports` in `pyproject.toml [tool.ruff]` |
| Fence-A (primitive ← domain only) | YES — `independence` contract forbids cross-primitive imports | PARTIAL — only bans specific modules, not bidirectional |
| Fence-B (module ← no infra) | YES — `layers` contract enforces domain < application < infrastructure | PARTIAL |
| Deliberate-violation proof | YES — add violation → `lint-imports` exits non-zero; revert → exits 0 | YES — ruff exits non-zero |
| CI integration | `lint-imports` CLI, wraps in `rag-service-py-lint` GitHub Actions job | `ruff check --select=TID252` |
| Python-native pattern | YES | YES |
| Granularity | Full contract system (layers + independence + forbid) | Module-level banned import rules only |

`import-linter` is purpose-built for DDD layer enforcement — it understands "domain CANNOT import from infrastructure" as a layered contract, which matches our Fence-A/B/C needs exactly. ruff's `TID252` is a simpler banned-import rule that requires listing every specific module name; it doesn't express "no imports from any module in `infrastructure/`" as a single contract.

**Config target** (`pyproject.toml` or `.importlinter` under `apps/rag-service/`):

```ini
[tool.importlinter]
root_packages = ["domain", "application", "infrastructure", "interface"]

[[tool.importlinter.contracts]]
name = "Fence-A: primitives are pure domain — no infra/application/interface"
type = "independence"
modules = [
    "domain.primitive.similarity_scorer",
    "domain.primitive.relevance_threshold_gate",
    "domain.primitive.temporal_decay_scorer",
    "domain.primitive.top_k_selector",
    "domain.primitive.context_window_packer",
]

[[tool.importlinter.contracts]]
name = "Fence-B: retrieval module cannot import infrastructure"
type = "forbidden"
source_modules = ["domain.module.retrieval"]
forbidden_modules = ["infrastructure"]

[[tool.importlinter.contracts]]
name = "Fence-C: domain layer has zero infrastructure imports"
type = "layers"
layers = ["interface", "application", "domain"]
```

**Offline proof requirement:** `lint-imports` is called as `python -m importlinter` (via `import-linter` package installed in dev extras). No network access. Mirrors Go depguard offline pattern.

**CI job name:** `rag-service-py-lint` scoped to `working-directory: apps/rag-service`.

**Deliberate-violation protocol (mirrors Go R-FENCE gate):**
1. Add one line importing `infrastructure.embedder` into `domain/primitive/similarity_scorer.py`
2. Run `lint-imports` → must exit non-zero + print "Fence-A" contract violation
3. Revert → never committed
4. QA independently reproduces exit non-zero
R-FENCE gate: step 2 non-zero exit is the GATE criterion. If `lint-imports` exits 0 on the violation, G4 is blocked.

**GATE NOTE:** SI-4 (import-linter selection + deliberate-violation proof) must be completed before G4 ACs can be locked. This is a Phase 2 gate, not Phase 1. Phase 1 installs `import-linter` as a dev dependency and adds the `.importlinter` contract file (stub contracts) but does NOT run the deliberate-violation proof until Phase 2 (when primitive subfolders exist to violate).

---

## 7. [Architect] Brownfield Findings

- **Zone:** `apps/rag-service/`
- **Verified paths:**
  - `apps/rag-service/domain/services.py` — 5 primitive candidates as pure functions/SearchService; all extractable
  - `apps/rag-service/domain/repositories.py` — ports ABC already defined (VectorStorePort, AnalysisRepositoryPort, EmbedderPort)
  - `apps/rag-service/application/usecases.py` — `_build_embedding_text()` (context-window-packer) + `ranked[:limit]` (top-k-selector) to extract to domain/primitive/
  - `apps/rag-service/main.py:27-97` — composition root `create_app()` factory; clean, 113L (target ≤80 after Phase 2)
  - `apps/mcp-server/src/infrastructure/rag/retriever.ts` — DIRECT LanceDB bypass; G5b rewire target
  - `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` — HTTP client already exists; use this for rewire
  - `apps/mcp-server/src/infrastructure/rag/{embeddings,vectorstore,retriever}.ts` — G5a _deprecated/ candidates
- **Reuse patterns:**
  - `domain/repositories.py` ports are the injection interfaces for the `retrieval` module — extend, do not duplicate
  - `ragHttpClient.ts` already implements HTTP rewire surface — dev-rag-service does NOT need to build a new client
- **Design decisions:**
  - Primitive target folder: `apps/rag-service/domain/primitive/<name>/` (one subfolder per primitive, `__init__.py` + `<name>.py` + `scenarios/`)
  - Module target folder: `apps/rag-service/domain/module/retrieval/` (`__init__.py` + ports composition)
  - Sandbox runner: `apps/rag-service/sandbox/__main__.py` (shared Python runner, design for reuse with pdf-extractor — WIP=1 coordination required; see §8)
  - Dashboard: `apps/rag-service/dashboard/index.html` (3-panel: 5 primitive cards + retrieval module + rag-service microservice)
  - Architecture fence: `import-linter` (SI-4 decision — see §6)
  - `now` injection for temporal-decay-scorer determinism: `compute_recency_score(similarity, created_at_iso, half_life_days, now=None)` — `now` defaults to `datetime.now(tz=timezone.utc)` in production, injected as fixed datetime in scenarios
- **DDD violations:** NONE detected in current codebase. All layers are correctly separated.
- **G5b rewire surface:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` + `apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts` + `apps/mcp-server/src/index.ts` (3 files, funnels through `retriever.ts`)
- **G5a candidates:** `infrastructure/rag/{embeddings,vectorstore,retriever}.ts` in mcp-server (TS-side parallel LanceDB stack, deprecated after rewire)
- **Risk flags:** R-1 (dual LanceDB writers — pre-existing, resolves at G5b), R-2 (datetime.now injection needed in temporal-decay-scorer), R-3/R-4 (top-k + context-window-packer in application layer — extractable), R-5 (LanceDB disk growth — preserve HF_HUB_OFFLINE=1), R-6 (rag_analyses table is separate — do not migrate)
- **Scan clean:** true (no DDD violations in rag-service itself; G5 bypass is in mcp-server, pre-existing)

---

## 8. Python Sandbox Runner — Shared Gap Coordination

The Python scenario runner (`python -m sandbox --tier=primitive --scenario=<file>`) is a shared gap between rag-service and pdf-extractor pilots. Neither pilot has a sandbox runner today.

**WIP=1 coordination rule:** Only ONE pilot builds the runner. The other inherits it.

**Assignment:** rag-service builds the runner first (Phase 1 P1-A task). pdf-extractor inherits the runner from rag-service Phase 1 output.

**Rationale:** rag-service is the simpler Python DDD service (no OCR, no heavy PDF processing). Its primitives are pure math functions — ideal for validating the Python sandbox pattern before pdf-extractor's more complex OCR pipeline.

**Runner design requirements (for reuse):**
- CLI: `python -m sandbox --service=<service-name> --tier=<primitive|module> --scenario=<path-to-json>`
- Inputs: scenario JSON with `input` (dict with pre-computed fixed embedding vectors), `expected_output` (dict)
- Output: trace JSON `{passed: bool, actual: dict, expected: dict, diff: [...], elapsed_ms: int}`
- Zero model load, zero LanceDB, zero network access
- `sys.path` injection so it can run from `apps/rag-service/` root
- Compatible with pdf-extractor by parameterizing `--service` (each service has its own primitive modules at predictable paths)

**Coordination signal:** When rag-service P1-A closes, dev-rag-service emits a signal `rag-service-sandbox-runner-ready-<ISO>.json` so dev-pdf-extractor can inherit the runner without rebuilding it.

---

## 9. Pre-Revert Tags (Phase 0 declaration)

Per fleet anchor discipline, pre-revert tags declared Day 0:

| Tag | Phase | Created by | Purpose |
|---|---|---|---|
| `rag-pre-ci` | Phase 2 (before CI job activation) | dev-rag-service | Revert point if import-linter CI job fails CI gate |
| `rag-pre-delete` | Phase 2 (before git mv to _deprecated/) | dev-rag-service | Revert point if G5a deletion breaks mcp-server |
| `rag-pre-inject` | Phase 2 (before bug injection) | qa | Revert point before G10 deliberate bug |

No Phase 1 pre-revert tags required (Phase 1 is scaffold only; no deletion, no CI activation, no bug injection).
