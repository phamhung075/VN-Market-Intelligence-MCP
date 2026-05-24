---
title: "Phase 1 Task Plan (Python) — rag-service Pilot"
date: "2026-05-24"
author: "architect (cycle-71 phase-0 P0-RAG-2)"
pilot: "rag-service"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-brownfield-inventory.md"
pilot_status_ref: "docs/data/pilot-status-rag-service.json"
language: "Python"
deliverable: "PHASE0-D7"
parent_pattern: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md (macro pilot, B/C/E bucket pattern)"
wip_limit: 1
---

# Phase 1 Task Plan (Python) — rag-service Pilot

**Generated:** 2026-05-24 by architect (Phase 0, P0-RAG-2)
**Pattern:** B/C/E bucket structure from macro P1-B1/C1/E1; Python sandbox runner from first principles
**Language:** Python (locked Day 0 per charter §Service-Specific Deltas)
**Status:** READY-FOR-DISPATCH to dev-rag-service

---

## Summary

Phase 1 delivers the Python scaffold + sandbox runner + the **B/C/E task streak** required for G12. The streak consists of exactly 3 tasks: one B-bucket (first primitive), one C-bucket (module stub), one E-bucket (dashboard stub). These three tasks form the minimum viable evidence chain for G12 (3-task streak of sandbox-green-before-RETURN).

Phase 1 scope: sandbox runner (G1 prerequisite, shared with pdf-extractor) + first primitive (`similarity-scorer`) + `retrieval` module stub + dashboard stub (3-panel, NOT-RUN state). No G4 fence activation (Phase 2), no G5 deletion (Phase 2), no bug injection (Phase 2).

**First primitive rationale:** `similarity-scorer` chosen first because:
1. It is the simplest pure function (one formula: `1.0 / (1.0 + distance)`) — easy scenario JSON to author
2. It directly demonstrates the determinism gate: input is a raw L2 `distance: float`, output is a bounded `[0,1]` float — no datetime dependency
3. It is the first stage in the retrieval pipeline (similarity → decay → top-k → pack), making it the natural entry point
4. It is small enough (5 lines of logic) that the primitive structure, scenario format, and sandbox runner can be validated before tackling the datetime-injected `temporal-decay-scorer`

---

## Charter Context (unchanged from charter v2.0)

- **Deadline:** 2026-07-05 (kickoff + 6 sprints, hard)
- **Goals:** G1–G12 in `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
- **WIP cap:** 1 task In Progress at a time (single dev-rag-service agent)
- **Anti-scope-creep:** pilot covers `apps/rag-service/` ONLY
- **Security (G7):** sandbox env audit must return empty for: DB_PATH, LANCEDB_PATH, HF_TOKEN, HUGGINGFACE_*, OPENAI_API_KEY, LANCEDB_*, EMBEDDING_MODEL — any embedding-provider credential key
- **Determinism (charter §Key risks #2):** scenario inputs = PRE-COMPUTED fixed float vectors (384-dim list[float]) — ZERO sentence-transformers call, ZERO LanceDB access
- **HF_HUB_OFFLINE=1 (charter §Key risks #3):** must remain set in all contexts; do NOT remove or override
- **L84:** `git add <explicit-path>` per file. Never `-A` or `.`
- **G12 gate:** dev-rag-service MUST paste sandbox-green evidence into every handoff before RETURN (from Phase 0, agent-father flow commit)

---

## Python Sandbox Runner — Shared Gap (WIP=1 Coordination)

**This runner is rag-service's to build. pdf-extractor inherits it.**

The Python sandbox runner is a shared gap between rag-service and pdf-extractor pilots (brownfield §8). Building it twice wastes tokens and risks divergence. Assignment rule: rag-service builds first (simpler domain — pure math, no OCR), pdf-extractor inherits.

**WIP=1 coordination protocol:**
- rag-service P1-A closes → dev-rag-service emits signal `rag-service-sandbox-runner-ready-<ISO>.json`
- pdf-extractor Phase 1 P1-A task is BLOCKED on that signal
- PM enforces this ordering in pdf-extractor Phase 1 dispatch

**Runner location (rag-service canonical):** `apps/rag-service/sandbox/__main__.py`
**Runner invoke:** `python -m sandbox --service=rag-service --tier=primitive --scenario=<path>`

---

## Pre-Revert Tags (Phase 1 scope)

Phase 1 creates scaffold only. No deletion, no CI activation, no bug injection. Pre-revert tags for Phase 2 declared in brownfield §9:

| Tag | Phase |
|---|---|
| `rag-pre-ci` | Phase 2 P2-A (before CI job) |
| `rag-pre-delete` | Phase 2 P2-B (before git mv to _deprecated/) |
| `rag-pre-inject` | Phase 2 P2-L (before G10 bug injection) |

---

## Task Ledger

| ID | Title | Bucket | Goals | Blocks | Est | AC count |
|----|-------|--------|-------|--------|-----|----------|
| **P1-A** | Python sandbox runner: `apps/rag-service/sandbox/__main__.py` — scenario JSON → trace JSON, ZERO model/DB access | Scaffold | G7, G12 prereq | P1-B | 45m | 8 |
| **P1-B** | First primitive: `domain/primitive/similarity_scorer/` — `score(distance: float) -> float` + 3 scenario JSONs | B-bucket | G1, G7, G12 streak #1 | P1-C | 1.5h | 9 |
| **P1-C** | Module stub: `domain/module/retrieval/` — ports composition, mock-port tests, Fence-B stub | C-bucket | G2, G7, G12 streak #2 | P1-E | 1h | 7 |
| **P1-E** | Dashboard stub: `apps/rag-service/dashboard/index.html` — 3-panel (5 primitive cards + retrieval + rag-service), NOT-RUN state | E-bucket | G6, G8, G9, G12 streak #3 | — | 2h | 8 |

**Total atomic tasks:** 4 (1 Scaffold + 1 B + 1 C + 1 E)
**Total estimated effort:** ~5.25 hours (single agent, WIP=1)
**G12 streak tasks:** P1-B + P1-C + P1-E (3-task streak — all three must show sandbox-green evidence in handoff)

---

## Per-Task Acceptance Criteria

---

### P1-A — Python Sandbox Runner

**Owner:** dev-rag-service
**Title:** Python sandbox runner — `apps/rag-service/sandbox/__main__.py`
**Goals advanced:** G7 (env audit sub-gate established), G12 prerequisite
**Blocks:** P1-B (B-bucket cannot start until runner is proven)

**Files touched:**
- `apps/rag-service/sandbox/__init__.py` (CREATE — empty)
- `apps/rag-service/sandbox/__main__.py` (CREATE — CLI runner)
- `apps/rag-service/sandbox/README.md` (CREATE — usage doc, ≤30L)

**Acceptance criteria:**

**AC-1 (CLI interface):** `python -m sandbox --service=rag-service --tier=primitive --scenario=<path>` runs from `apps/rag-service/` root directory. Exits 0 on pass, non-zero on fail or schema error.

**AC-2 (scenario JSON schema):** Runner accepts scenario JSON with schema:
```json
{
  "primitive": "<name>",
  "input": { "<key>": "<value>" },
  "expected_output": { "<key>": "<value>" }
}
```
Embedding vectors are plain `list[float]` in `input` — no model load required.

**AC-3 (trace JSON output):** Runner writes trace JSON to stdout (or `--output=<path>`):
```json
{
  "passed": true,
  "primitive": "<name>",
  "actual": { "<key>": "<value>" },
  "expected": { "<key>": "<value>" },
  "diff": [],
  "elapsed_ms": 42
}
```
On failure: `passed: false`, `diff` contains key-level mismatches.

**AC-4 (ZERO model/DB access):** Runner MUST NOT import `sentence_transformers`, `lancedb`, `torch`, or `transformers` at any point during execution. Grep: `grep -rn "sentence_transformers\|import lancedb\|import torch" apps/rag-service/sandbox/` returns 0.

**AC-5 (env audit PASS):** Running `env | grep -E 'DB_PATH|LANCEDB|HF_TOKEN|HUGGINGFACE|OPENAI_API_KEY|EMBEDDING_MODEL'` in the sandbox process returns empty. Add explicit check in runner: if any forbidden env var is detected, runner prints warning but does NOT fail (G7 baseline establishment only; full pass/fail gate is Phase 2 P2-E).

**AC-6 (reusable for pdf-extractor):** Runner is parameterized by `--service` and `--tier`. When `--service=pdf-extractor` is passed, runner adjusts `sys.path` to `apps/pdf-extractor/` and loads primitive from `domain/primitive/<name>/`. Tested by dev-rag-service with a mock primitive path.

**AC-7 (no pyproject.toml deps added):** Runner uses only stdlib (`json`, `sys`, `os`, `time`, `argparse`, `importlib`). No new pip packages required. Runner invokes primitive via `importlib.import_module` with injected sys.path.

**AC-8 (commit):** Commit message references P1-A, G7, WIP=1, sandbox-runner-ready signal path.

**Determinism note:** Runner executes the primitive function directly — it passes the `input` dict as kwargs to the primitive's main function. Primitive functions must be pure (no side effects, no datetime.now(), no random). Runner does not inject datetime — that is the primitive's responsibility via its function signature (see `temporal-decay-scorer` design in P1-B notes).

**After P1-A close:** dev-rag-service emits `docs/signals/rag-service-sandbox-runner-ready-<ISO>.json` (next_actor: pm). PM unblocks pdf-extractor P1-A.

---

### P1-B — First Primitive: `similarity-scorer`

**Owner:** dev-rag-service
**Bucket:** B (first primitive, G12 streak task #1)
**Goals advanced:** G1 (primitive ships with scenarios), G7 (sandbox-green evidence), G12 streak #1
**Blocks:** P1-C
**Blocked by:** P1-A (sandbox runner must exist before scenarios can be run)

**Files touched:**
- `apps/rag-service/domain/primitive/similarity_scorer/__init__.py` (CREATE — export `score`)
- `apps/rag-service/domain/primitive/similarity_scorer/similarity_scorer.py` (CREATE — pure function)
- `apps/rag-service/domain/primitive/similarity_scorer/scenarios/golden.json` (CREATE)
- `apps/rag-service/domain/primitive/similarity_scorer/scenarios/edge_zero_distance.json` (CREATE)
- `apps/rag-service/domain/primitive/similarity_scorer/scenarios/failure_negative_distance.json` (CREATE)

**Primitive function spec:**
```python
def score(distance: float) -> float:
    """
    Convert L2 distance to similarity score in [0, 1].
    Formula: similarity = 1.0 / (1.0 + distance)
    Distance 0.0 → similarity 1.0 (identical)
    Distance 0.5 → similarity 0.667
    Distance inf → similarity 0.0
    Raises ValueError if distance < 0.
    """
```

**Determinism gate:** Input is a raw float (L2 distance). Output is a bounded float. No datetime, no random, no model, no DB. 100% deterministic.

**Acceptance criteria:**

**AC-1 (pure function):** `similarity_scorer.py` imports ONLY stdlib. Zero imports from `infrastructure/`, `application/`, `interface/`. Grep: `grep -n "import" apps/rag-service/domain/primitive/similarity_scorer/similarity_scorer.py | grep -v "^#"` returns only stdlib imports (or none).

**AC-2 (formula correctness):** `score(0.0) == 1.0`, `score(0.5) == pytest.approx(1.0/1.5)`, `score(float('inf')) == pytest.approx(0.0)`.

**AC-3 (error case):** `score(-0.1)` raises `ValueError` (negative distance is nonsensical).

**AC-4 (scenario golden):** `scenarios/golden.json` contains:
```json
{
  "primitive": "similarity_scorer",
  "input": {"distance": 0.5},
  "expected_output": {"similarity": 0.6667}
}
```
Running `python -m sandbox --service=rag-service --tier=primitive --scenario=apps/rag-service/domain/primitive/similarity_scorer/scenarios/golden.json` exits 0 and `passed: true` in trace.

**AC-5 (scenario edge):** `scenarios/edge_zero_distance.json` — input `distance: 0.0`, expected `similarity: 1.0`. Runner exits 0.

**AC-6 (scenario failure):** `scenarios/failure_negative_distance.json` — input `distance: -0.1`, expected `error: "ValueError"`. Runner exits non-zero and `passed: false` in trace (proves honest-red before primitive is correct).

**AC-7 (sandbox-green evidence in handoff):** Dev-rag-service pastes the full golden scenario trace JSON into the handoff signal before RETURN. G12 gate: sandbox must be GREEN (all 3 scenarios passing) for this task to count as streak #1.

**AC-8 (env audit):** Sandbox process env audit returns empty for all G7 forbidden keys. Evidence: paste output of `env | grep -E 'DB_PATH|LANCEDB|HF_TOKEN|HUGGINGFACE|OPENAI_API_KEY|EMBEDDING_MODEL'` = "" into handoff.

**AC-9 (no import-linter yet):** import-linter is NOT yet installed or configured in Phase 1. Fence-A compliance is manual (AC-1 grep). import-linter config is Phase 2 P2-A.

**Commit message pattern:**
```
feat(rag-service): P1-B similarity-scorer primitive + 3 scenario JSONs

G12 streak #1 — sandbox-green evidence in handoff.
G1 advancing: first primitive with golden/edge/failure scenarios.

- domain/primitive/similarity_scorer/__init__.py (NEW)
- domain/primitive/similarity_scorer/similarity_scorer.py (NEW)
- domain/primitive/similarity_scorer/scenarios/golden.json (NEW)
- domain/primitive/similarity_scorer/scenarios/edge_zero_distance.json (NEW)
- domain/primitive/similarity_scorer/scenarios/failure_negative_distance.json (NEW)
```

---

### P1-C — Module Stub: `retrieval`

**Owner:** dev-rag-service
**Bucket:** C (module stub, G12 streak task #2)
**Goals advanced:** G2 (module composes primitives via ports), G12 streak #2
**Blocks:** P1-E
**Blocked by:** P1-B

**Files touched:**
- `apps/rag-service/domain/module/__init__.py` (CREATE — empty)
- `apps/rag-service/domain/module/retrieval/__init__.py` (CREATE — exports `RetrievalModule`)
- `apps/rag-service/domain/module/retrieval/module.py` (CREATE — composes primitives via ports, thin stub)
- `apps/rag-service/domain/module/retrieval/ports.py` (CREATE — EmbedderModulePort, VectorSearchPort Protocol definitions)
- `apps/rag-service/domain/module/retrieval/scenarios/module_golden.json` (CREATE — multi-primitive scenario)
- `apps/rag-service/__tests__/unit/test_retrieval_module.py` (CREATE — mock-port unit tests)

**Module design spec:**

The `retrieval` module is a thin composition barrel. It receives pre-computed embedding vectors (from the EmbedderModulePort) and raw search results (from the VectorSearchPort) and applies the primitive pipeline: similarity-score → relevance-threshold-gate → temporal-decay-score → top-k-select.

```python
# domain/module/retrieval/ports.py
from typing import Protocol

class EmbedderModulePort(Protocol):
    async def embed(self, text: str) -> list[float]: ...

class VectorSearchPort(Protocol):
    async def search(self, vector: list[float], limit: int) -> list[dict]: ...
```

```python
# domain/module/retrieval/module.py
class RetrievalModule:
    def __init__(self, embedder: EmbedderModulePort, vector_search: VectorSearchPort):
        self._embedder = embedder
        self._vector_search = vector_search

    async def retrieve(self, query_text: str, top_k: int, max_distance: float, half_life_days: float) -> list[dict]:
        # 1. Embed query (via port — never call infrastructure directly)
        # 2. Search (via port)
        # 3. similarity_scorer.score() per result
        # 4. relevance_threshold_gate.gate() to filter
        # 5. temporal_decay_scorer.score() per result (inject fixed now for determinism)
        # 6. top_k_selector.select() to trim
        ...
```

**Fence-B requirement:** `domain/module/retrieval/module.py` MUST NOT import from `infrastructure/`. Grep: `grep -n "from infrastructure\|import infrastructure" apps/rag-service/domain/module/retrieval/module.py` returns 0.

**Determinism gate for module scenario:** The `module_golden.json` scenario provides:
- `query_vector: list[float]` (pre-computed, 384 dims, fixed literal values)
- `raw_results: list[dict]` (distance values, created_at timestamps — fixed literals)
- `now_iso: str` (fixed ISO timestamp injected as override)
- `expected_top_k: list[str]` (expected result IDs in order)

The module sandbox runner (`--tier=module`) passes these fixed inputs to `RetrievalModule.retrieve()` via mock ports that return the pre-baked raw_results. Zero model load, zero LanceDB.

**Acceptance criteria:**

**AC-1 (Fence-B):** `grep -n "from infrastructure\|import infrastructure" apps/rag-service/domain/module/retrieval/module.py` returns 0.

**AC-2 (Protocol ports):** `domain/module/retrieval/ports.py` defines `EmbedderModulePort` and `VectorSearchPort` as `typing.Protocol` classes. No ABC import, no infra import.

**AC-3 (primitive composition):** `module.py` imports `domain.primitive.similarity_scorer`, `domain.primitive.relevance_threshold_gate` (stub — only similarity-scorer exists in P1; stub others as pass-through). Fence-B: no infrastructure import.

**AC-4 (mock-port unit tests pass):** `test_retrieval_module.py` uses `AsyncMock` for EmbedderModulePort + VectorSearchPort. Tests: (a) happy path returns top-k results, (b) empty vector store returns empty list, (c) all results beyond max_distance returns empty.

**AC-5 (module scenario sandbox-green):** Running `python -m sandbox --service=rag-service --tier=module --scenario=apps/rag-service/domain/module/retrieval/scenarios/module_golden.json` exits 0 and `passed: true`. This is the multi-primitive scenario (exercises similarity-scorer via the module pipeline with mock VectorSearchPort).

**AC-6 (no other primitives extracted):** P1-C does NOT extract `temporal-decay-scorer`, `relevance-threshold-gate`, `top-k-selector`, or `context-window-packer`. The module references them as stubs or the existing domain/services.py functions. Extraction of remaining 4 primitives is Phase 2 bucket-B tasks.

**AC-7 (sandbox-green evidence in handoff):** Dev-rag-service pastes the module scenario trace JSON into the handoff before RETURN. G12 streak #2 requires: sandbox-green on BOTH the primitive scenario (carry-forward from P1-B) AND the new module scenario.

**Commit message pattern:**
```
feat(rag-service): P1-C retrieval module stub + Protocol ports + mock-port tests

G12 streak #2 — module sandbox-green evidence in handoff.
G2 advancing: retrieval module composes primitives via ports (Fence-B: zero infra import).

- domain/module/retrieval/__init__.py (NEW)
- domain/module/retrieval/module.py (NEW)
- domain/module/retrieval/ports.py (NEW)
- domain/module/retrieval/scenarios/module_golden.json (NEW)
- __tests__/unit/test_retrieval_module.py (NEW)
```

---

### P1-E — Dashboard Stub

**Owner:** dev-rag-service
**Bucket:** E (dashboard stub, G12 streak task #3)
**Goals advanced:** G6 (3-level dashboard renders from JSON traces), G8 (honest NOT-RUN state), G9 (trust contract), G12 streak #3
**Blocked by:** P1-C (dashboard renders primitive + module traces from P1-B/P1-C)

**Files touched:**
- `apps/rag-service/dashboard/index.html` (CREATE — 3-panel dashboard, file:// compatible)
- `apps/rag-service/dashboard/traces/similarity_scorer_golden.json` (CREATE — trace output from P1-B scenario)
- `apps/rag-service/dashboard/traces/module_golden.json` (CREATE — trace output from P1-C scenario)

**Dashboard design spec:**

Clone the TA/macro/kinh-dich/alert-engine dashboard pattern. 3-panel layout:
1. **Primitives panel** — 5 cards (one per candidate primitive):
   - `similarity-scorer` — GREEN (P1-B sandbox-green)
   - `relevance-threshold-gate` — NOT-RUN (grey)
   - `temporal-decay-scorer` — NOT-RUN (grey)
   - `top-k-selector` — NOT-RUN (grey)
   - `context-window-packer` — NOT-RUN (grey)
2. **Module panel** — 1 card: `retrieval` — GREEN (P1-C sandbox-green)
3. **Microservice panel** — 1 card: `rag-service` port 5002 — NOT-RUN (grey)

**SI-2 boundary (HARD):** `apps/rag-service/dashboard/index.html` is the ONLY dashboard file for rag-service. `docs/dashboards/index.html` is stock-price EXCLUSIVE. Rag-service MUST NOT touch `docs/dashboards/index.html`. Bake an HTML comment into `apps/rag-service/dashboard/index.html`:
```html
<!-- SI-2: This dashboard is rag-service-EXCLUSIVE. docs/dashboards/index.html is stock-price-EXCLUSIVE. Do not merge or cross-reference. -->
```

**Renders from JSON traces:** Dashboard JavaScript reads `traces/*.json` files via `fetch()` with a relative path (works from `file://` via `FileReader` or inline JSON). Zero CDN, zero network calls, zero embedding-model access.

**Honest NOT-RUN pattern:** Cards for primitives not yet extracted show grey badge "NOT-RUN" (not green, not red). This is the honest state — G8 requires honesty: a card is only green if its scenario trace shows `passed: true`.

**Acceptance criteria:**

**AC-1 (file:// open):** `open apps/rag-service/dashboard/index.html` renders in a browser without network errors, CDN requests, or console errors. Verify: open file → browser network tab shows zero external requests.

**AC-2 (3 panels):** HTML contains exactly 3 section elements (or equivalent) for: Primitives, Module (retrieval), Microservice (rag-service). Grep: `grep -c "panel\|section" apps/rag-service/dashboard/index.html` ≥ 3.

**AC-3 (5 primitive cards):** Exactly 5 primitive card elements present: `similarity-scorer`, `relevance-threshold-gate`, `temporal-decay-scorer`, `top-k-selector`, `context-window-packer`.

**AC-4 (honest green for similarity-scorer):** The `similarity-scorer` card renders GREEN (from `traces/similarity_scorer_golden.json` with `passed: true`). All other primitive cards render NOT-RUN (grey).

**AC-5 (honest green for retrieval module):** The `retrieval` module card renders GREEN (from `traces/module_golden.json` with `passed: true`).

**AC-6 (honest NOT-RUN for microservice):** The `rag-service` microservice card renders NOT-RUN (grey) — no live HTTP call to port 5002 in Phase 1 dashboard.

**AC-7 (SI-2 disavowal comment):** HTML file contains the SI-2 boundary comment verbatim (see §SI-2 boundary above).

**AC-8 (sandbox-green evidence in handoff):** Dev-rag-service pastes a screenshot description or `file://` open confirmation into handoff. G12 streak #3: for streak to complete, dev-rag-service must demonstrate dashboard renders with correct green/NOT-RUN states. This is the streak-complete evidence.

**Commit message pattern:**
```
feat(rag-service): P1-E dashboard stub — 3-panel file:// (similarity-scorer GREEN, retrieval GREEN, others NOT-RUN)

G12 streak #3 — G12 streak COMPLETE (P1-B + P1-C + P1-E).
G6 advancing: 3-level dashboard renders from JSON traces.
G8 advancing: honest NOT-RUN state (no false greens).
SI-2 disavowal baked in HTML comment.

- dashboard/index.html (NEW)
- dashboard/traces/similarity_scorer_golden.json (NEW)
- dashboard/traces/module_golden.json (NEW)
```

---

## Goals Advanced Map — Phase 1

| Goal | Status after Phase 1 | Evidence |
|---|---|---|
| G1 | EARNED-PENDING | similarity-scorer primitive + 3 scenario JSONs (P1-B) |
| G2 | EARNED-PENDING | retrieval module stub + Protocol ports + mock-port tests (P1-C) |
| G3 | NOT advanced | main.py composition root already exists — G3 verifiable at Phase 1 close (count lines, verify no business logic) |
| G4 | STILL-UNMET | import-linter not yet installed — Phase 2 |
| G5 | STILL-UNMET | No deletion or HTTP rewire — Phase 2 |
| G6 | EARNED-PENDING | 3-panel dashboard renders from traces (P1-E) |
| G7 | EARNED-PENDING (partial) | env audit empty established in P1-A; sandbox zero-model/DB proven in P1-B/C |
| G8 | EARNED-PENDING | Honest NOT-RUN + 1 honest-green (P1-E) |
| G9 | STILL-UNMET | Playwright not yet run — Phase 2 |
| G10 | STILL-UNMET | Bug injection — Phase 2 |
| G11 | STILL-UNMET | 2-trial coupling proof — Phase 2 |
| G12 | EARNED-PENDING | 3-task streak: P1-B + P1-C + P1-E (all sandbox-green evidence in handoffs) |

`goalsEarned` stays 0 throughout Phase 1. PO flips YES at terminal 12/12 atomic close. No goal status changes in pilot-status during Phase 1 — all are EARNED-PENDING carrying forward.

---

## §4.5 Compliance

This task plan contains NO instructions to flip any goal to YES, NO instructions to populate `decisionMatrix`, NO instructions to set `goalsEarned` to anything other than 0. Goal flips are PO-only, atomic with 12/12 terminal close (pilot-charter.md §4.5 inviolable).

---

## Hard Constraints

| Constraint | Rule |
|---|---|
| L84 staging | `git add <explicit-path>` per file. NEVER `-A` or `.` |
| No force push | No `--force`, `--no-verify`, `--no-gpg-sign` |
| Main branch only | All work on `main` (no branches per CLAUDE.md) |
| WIP=1 | Only 1 task In Progress at a time |
| Sandbox runner before B-bucket | P1-A must be DONE and runner proven before P1-B starts |
| No model load in sandbox | `sentence_transformers`, `lancedb`, `torch`, `transformers` must not appear in sandbox code |
| HF_HUB_OFFLINE=1 preserved | Do not remove or override this env var anywhere |
| SI-2 boundary | Do NOT touch `docs/dashboards/index.html` (stock-price exclusive) |
| Anchor discipline | Frozen anchor remains ancestor of HEAD; no retag/rewrite |
| Shared runner coordination | Emit signal after P1-A close; PM blocks pdf-extractor P1-A until signal |
| Fleet serialization | git diff --cached --name-only must be empty before staging (fleet single-committer rule) |

---

## Execution Notes

**Scenario vector format:** Scenario JSONs for similarity-scorer use plain float inputs, not embedding vectors. Only the `temporal-decay-scorer` (Phase 2 B-bucket) and `context-window-packer` (Phase 2 B-bucket) will have pre-computed 384-dim vectors in their scenario inputs. Phase 1 primitives use simpler scalar inputs.

**`now` injection for temporal-decay-scorer (Phase 2):** The `compute_recency_score()` function currently calls `datetime.now(tz=timezone.utc)` internally. When this primitive is extracted in Phase 2, its signature must become `score(similarity: float, created_at_iso: str, half_life_days: float, now: Optional[datetime] = None) -> float` where `now` defaults to `datetime.now()` in production but is injected as a fixed datetime in scenario JSON. This is the determinism gate for that primitive. Phase 1 does NOT need to fix this — similarity-scorer has no datetime dependency.

**Scenario file count target (G1):** G1 calibration requires ≥15 scenario files (3×5 primitives). Phase 1 delivers 3 scenarios for similarity-scorer + 1 module scenario = 4. Remaining 12 scenarios land in Phase 2 as each of the 4 remaining primitives is extracted (3 scenarios each).

**import-linter dev dep (Phase 1 optional):** If dev-rag-service wants to add `import-linter` to `pyproject.toml [project.optional-dependencies] dev` in Phase 1, that is acceptable — it does not violate WIP=1 since it's a config-only change with no contract files yet. Phase 2 P2-A adds the actual `.importlinter` contract file and CI job.

**G3 verification at Phase 1 close:** main.py is already 113 lines. QA should count lines and confirm: (a) no business logic (zero chunking/scoring/ranking math), (b) only wiring (imports + DI + FastAPI startup). This is a verify-only step — no code change needed in Phase 1. G3 is EARNED-PENDING after Phase 1 close if both checks pass.
