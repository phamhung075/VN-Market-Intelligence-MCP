---
title: "Phase 2 Task Plan (Python) — rag-service Pilot"
date: "2026-05-24"
author: "architect (Phase 2 dispatch — rag-service)"
pilot: "rag-service"
phase: "2"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-brownfield-inventory.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-phase-1-task-plan.md"
ssot_ref: "docs/data/pilot-status-rag-service.json"
phase1_gate: "APPROVED — QA cycle-74 (commit 1823e716) + PO cycle-75. All P1 artefacts verified. G12 streak COMPLETE."
language: "Python"
service_port: 5002
service_zone: "apps/rag-service"
specialist: "dev-rag-service"
wip_limit: 1
structural_template: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md (structural mirror)"
---

# Phase 2 Task Plan (Python) — rag-service Pilot

**Generated:** 2026-05-24 by architect (Phase 2 dispatch — rag-service)
**Phase 1 Gate:** APPROVED — QA cycle-74 (commit 1823e716), PO cycle-75. G12 streak COMPLETE (P1-B + P1-C + P1-E).
**Phase 2 Goal scope:** G1-full, G2-full, G3, G4, G5, G6-full, G7-full, G8-full, G9, G10, G11 (G12 EARNED-PENDING carry-forward)
**WIP:** 1 sequential (charter wip_limit — no parallel dispatch within Phase 2)

> **IMPORTANT — no goal flips in Phase 2:** Task completion does NOT flip any G-goal state.
> All goal flips (including EARNED-PENDING → YES) are PO-only, in one atomic close commit,
> after ALL 12 goals reach terminal state simultaneously. Every task in this plan says so
> explicitly. `goalsEarned` stays 0 throughout Phase 2. §4.5 matrix-authorship rule is
> binding and inviolable.
> **No task in this plan instructs anyone to flip G-goals or write decisionMatrix values.**

---

## Service Facts (verified via jq on docs/data/system-map.json — never hardcode)

```
id: rag-service | language: Python | port: 5002
zone: apps/rag-service/ | DB: rag_service.db (SQLite) + LanceDB ./data/lancedb
specialist: dev-rag-service
```

---

## Phase 1 Artefacts Baseline (Phase 2 inherits — do NOT re-earn)

The following Phase-1 artefacts exist in the repository and are the Phase-2 starting baseline:

- `apps/rag-service/sandbox/__main__.py` — Python sandbox runner, zero model/DB access (P1-A)
- `apps/rag-service/domain/primitive/similarity_scorer/` — score(), 3 scenario JSONs (P1-B)
- `apps/rag-service/domain/module/retrieval/` — module stub, Protocol ports, mock-port tests (P1-C)
- `apps/rag-service/dashboard/index.html` — 3-panel file:// dashboard, similarity-scorer + retrieval GREEN, 4 primitives + microservice NOT-RUN (P1-E)
- `apps/rag-service/dashboard/traces/similarity_scorer_golden.json` — P1-B trace (P1-E)
- `apps/rag-service/dashboard/traces/module_golden.json` — P1-C trace (P1-E)
- `apps/rag-service/dashboard/dash-check.py` — AI/CI headless inspector, 17/17 PASS (P1-E)

**Sandbox baseline command (G12 DoD gate — applies to every dev task in Phase 2):**
```bash
cd apps/rag-service && python3 -m sandbox --service=rag-service --tier=primitive --scenario=all
# AND:
python3 -m sandbox --service=rag-service --tier=module --scenario=all
```
Currently (Phase 1 close): **4/4 primitive PASS + 1/1 module PASS**. This must never regress.
G12 DoD gate: sandbox-green + env-audit-empty before every RETURN.

**Env audit baseline (G7 — hard gate, every task):**
```bash
env | grep -E 'DB_PATH|LANCEDB|HF_TOKEN|HUGGINGFACE|OPENAI_API_KEY|EMBEDDING_MODEL|DATABASE_URL'
# Must return empty
```

**HF_HUB_OFFLINE=1 (R-5 — preserved throughout Phase 2):** Do NOT remove or override.

---

## Pre-Revert Tags (declared Phase 0 — Phase 2 activates them)

| Tag | Task | Purpose |
|---|---|---|
| `rag-pre-ci` | P2-A | Created before import-linter CI job activation |
| `rag-pre-delete` | P2-F | Created before git mv to _deprecated/ |
| `rag-pre-inject` | P2-J | Created by QA before G10 bug injection |

Tag discipline: created once, never retagged/pushed. Reverts use `git checkout <tag>`. Tags are annotated (`git tag -a`). Tag MUST remain an ancestor of HEAD at all times after creation.

---

## Phase 2 Summary

Phase 2 completes all 11 still-advancing goals. G12 is EARNED-PENDING carry-forward — no new code task re-earns it; it is re-confirmed at close.

**Total atomic tasks:** 11 (P2-A through P2-K)
**Total estimated effort:** ~11-13 hours (single agent, WIP=1)

**Dependency order (sequenced; each task blocks the next unless noted):**

```
P2-B1 (relevance-threshold-gate primitive — G1 advancing)
  ↓
P2-B2 (top-k-selector primitive — G1 advancing)
  ↓
P2-B3 (context-window-packer primitive — G1 advancing)
  ↓
P2-B4 (temporal-decay-scorer primitive w/ now-injection — G1 advancing)
  ↓
P2-C  (G2 module-full: wire all 5 primitives into retrieval module via ports)
  ↓
P2-D  (G3 composition-root verify: main.py ≤80L, zero business logic)
  ↓
P2-E  (G6 dashboard-full: all 5 primitive cards GREEN)
  ↓
P2-G7 (G7 full gate: edit-JSON-rerun + env-audit PASS/FAIL hard gate)
  ↓
P2-G8 (G8 deliberate-break proof: 5 known-bad RED, no false-greens)
  ↓
P2-A  (G4 import-linter fence: deliberate-violation proof — needs primitives stable)
  ↓
P2-F  (G5 old-code delete + HTTP rewire — needs primitives + module done)
  ↓
P2-J  (G10 bug injection ≤2 cycles — QA injects, dev fixes; needs primitives stable)
  ↓
P2-K1 (G11 regression alarm — 2-trial proof, builds on P2-J trial-1)
  ↓
P2-K2 (G9 Playwright headless trust contract — LAST)
```

**Note on parallel readiness:** P2-A (G4 fence) and P2-F (G5 delete+rewire) both require primitives to be stable (P2-B1–B4 + P2-C done). They can be dispatched after P2-G8 in sequence as shown, or swapped if G5 rewire risk demands earlier scheduling — PM decides at P2-G8 close.

---

## Task Ledger

| ID | Title | Goals | Owner | Est | AC count | Pre-revert tag |
|---|---|---|---|---|---|---|
| **P2-B1** | relevance-threshold-gate primitive | G1 | dev-rag-service | 1h | 7 | — |
| **P2-B2** | top-k-selector primitive | G1 | dev-rag-service | 1h | 7 | — |
| **P2-B3** | context-window-packer primitive | G1 | dev-rag-service | 1h | 8 | — |
| **P2-B4** | temporal-decay-scorer primitive + now-injection | G1 | dev-rag-service | 1.5h | 9 | — |
| **P2-C** | G2 module-full: wire all 5 primitives via ports | G2 | dev-rag-service | 1.5h | 8 | — |
| **P2-D** | G3 composition-root verify: main.py ≤80L | G3 | dev-rag-service | 1h | 7 | — |
| **P2-E** | G6 dashboard-full: 5 primitive cards + module + microservice | G6 | dev-rag-service | 1h | 7 | — |
| **P2-G7** | G7 full gate: edit-JSON-rerun + env-audit hard gate | G7 | dev-rag-service | 0.5h | 6 | — |
| **P2-G8** | G8 deliberate-break proof: 5 known-bad → 5 RED | G8 | qa (co-owner) | 0.5h | 6 | — |
| **P2-A** | G4 import-linter fence + CI job + violation proof | G4 | dev-rag-service + qa | 1.5h | 9 | `rag-pre-ci` |
| **P2-F** | G5 delete+rewire: git mv → _deprecated/ + retriever.ts → ragHttpClient.ts | G5 | dev-rag-service | 1.5h | 9 | `rag-pre-delete` |
| **P2-J** | G10 bug injection ≤2 cycles (QA injects, dev fixes) | G10 | qa (inject) + dev-rag-service (fix) | 1h | 7 | `rag-pre-inject` |
| **P2-K1** | G11 regression alarm — 2-trial coupling proof | G11 | dev-rag-service + qa | 1h | 7 | — |
| **P2-K2** | G9 Playwright headless trust contract (LAST) | G9 | dev-rag-service | 1h | 6 | — |

**Total atomic tasks:** 14 (4 B-bucket + 10 cross-cutting gates)
**Total estimated effort:** ~14 hours (single agent, WIP=1)

---

## Per-Task Acceptance Criteria

---

### P2-B1 — Primitive: `relevance-threshold-gate`

**Owner:** dev-rag-service
**Goals advanced:** G1 (second primitive extracted; scenario count: 3+3=6 of 15 target)
**Blocked by:** (none — P2-B1 is the first Phase 2 task)
**Blocks:** P2-B2

**Files:**
- `apps/rag-service/domain/primitive/relevance_threshold_gate/__init__.py` (CREATE)
- `apps/rag-service/domain/primitive/relevance_threshold_gate/relevance_threshold_gate.py` (CREATE)
- `apps/rag-service/domain/primitive/relevance_threshold_gate/scenarios/golden.json` (CREATE)
- `apps/rag-service/domain/primitive/relevance_threshold_gate/scenarios/edge_at_threshold.json` (CREATE)
- `apps/rag-service/domain/primitive/relevance_threshold_gate/scenarios/failure_all_below.json` (CREATE)

**Primitive function spec:**
```python
def gate(results: list[dict], max_distance: float) -> list[dict]:
    """
    Filter search results by max_distance threshold.
    Extracted from domain/services.py filter_by_max_distance().
    A result passes if result["distance"] <= max_distance.
    Returns the filtered list (order preserved). Empty list is valid.
    """
```

**Determinism gate:** Inputs are plain floats (distances) and a threshold. Zero datetime, zero model, zero DB. 100% deterministic on fixed inputs.

**AC-1 (pure function + Fence-A):** `relevance_threshold_gate.py` imports ONLY stdlib or `domain.models` (if needed for type hints). Zero imports from `infrastructure/`, `application/`, `interface/`. Grep: `grep -n "^from\|^import" apps/rag-service/domain/primitive/relevance_threshold_gate/relevance_threshold_gate.py | grep -vE "^#|stdlib|typing|domain\.models"` returns 0 non-stdlib/non-models imports.

**AC-2 (gate correctness):** `gate([{"distance": 0.3}, {"distance": 0.8}], max_distance=0.5)` returns `[{"distance": 0.3}]`. `gate([], max_distance=0.5)` returns `[]`. `gate([{"distance": 0.5}], max_distance=0.5)` returns `[{"distance": 0.5}]` (inclusive boundary).

**AC-3 (scenario golden):** `scenarios/golden.json` — 2-element input list with one result passing, one failing the threshold. Runner exits 0, `passed: true`.

**AC-4 (scenario edge):** `scenarios/edge_at_threshold.json` — result with `distance == max_distance` passes (inclusive boundary). Runner exits 0, `passed: true`.

**AC-5 (scenario failure):** `scenarios/failure_all_below.json` — all results above threshold, expected output is empty list `[]`. Runner exits 0, `passed: true` (this is not a runtime error — an empty filtered list is a valid honest-failure scenario proving the gate works).

**AC-6 (sandbox-green evidence in handoff):** Full golden trace JSON pasted in handoff before RETURN. All 3 scenarios passed. G12 DoD gate applies: sandbox must be GREEN on ALL scenarios (carry-forward P1 scenarios + new B1 scenarios).

**AC-7 (env audit empty):** Paste output of env audit command: `env | grep -E 'DB_PATH|LANCEDB|HF_TOKEN|HUGGINGFACE|OPENAI_API_KEY|EMBEDDING_MODEL|DATABASE_URL'` = "" into handoff.

**Determinism note:** All scenario inputs are `list[dict]` with plain float `distance` fields and a `float` threshold. No pre-computed embedding vectors needed for this primitive. Zero ANN/float jitter possible.

---

### P2-B2 — Primitive: `top-k-selector`

**Owner:** dev-rag-service
**Goals advanced:** G1 (third primitive; scenario count: 6+3=9 of 15 target)
**Blocked by:** P2-B1
**Blocks:** P2-B3

**Files:**
- `apps/rag-service/domain/primitive/top_k_selector/__init__.py` (CREATE)
- `apps/rag-service/domain/primitive/top_k_selector/top_k_selector.py` (CREATE)
- `apps/rag-service/domain/primitive/top_k_selector/scenarios/golden.json` (CREATE)
- `apps/rag-service/domain/primitive/top_k_selector/scenarios/edge_k_equals_len.json` (CREATE)
- `apps/rag-service/domain/primitive/top_k_selector/scenarios/failure_k_exceeds_len.json` (CREATE)

**Primitive function spec:**
```python
def select_top_k(results: list[dict], k: int) -> list[dict]:
    """
    Return the first k results from an ordered list.
    Extracted from SearchUseCase.execute() ranked[:request.limit].
    k=0 returns []. k > len(results) returns all results (no error).
    Order of results is preserved (caller is responsible for pre-sorting by score).
    """
```

**Determinism gate:** Input is a `list[dict]` and an integer `k`. No datetime, no model, no DB. Output is deterministic given fixed inputs.

**AC-1 (pure function + Fence-A):** `top_k_selector.py` imports ONLY stdlib (or typing). Grep returns 0 non-stdlib imports.

**AC-2 (selection correctness):** `select_top_k([a, b, c], k=2)` returns `[a, b]`. `select_top_k([a], k=0)` returns `[]`. `select_top_k([a], k=5)` returns `[a]` (k > len: return all, no error).

**AC-3 (scenario golden):** 3-element list, `k=2`, expected 2-element output. Runner exits 0, `passed: true`.

**AC-4 (scenario edge):** `k == len(results)`: returns full list. Runner exits 0, `passed: true`.

**AC-5 (scenario failure):** `k > len(results)`: expected output is full list (all results returned). Runner exits 0, `passed: true`. This proves the primitive handles over-fetch gracefully (caller must not assume truncation).

**AC-6 (sandbox-green evidence in handoff):** All B1 + B2 scenarios passing (cumulative). Trace JSON pasted before RETURN.

**AC-7 (env audit empty):** Env audit paste in handoff (same keys as B1).

**Determinism note:** Pure list slice logic. No floats, no dates, no randomness.

---

### P2-B3 — Primitive: `context-window-packer`

**Owner:** dev-rag-service
**Goals advanced:** G1 (fourth primitive; scenario count: 9+3=12 of 15 target)
**Blocked by:** P2-B2
**Blocks:** P2-B4

**Extraction note (R-3 from brownfield):** `context-window-packer` is currently `_build_embedding_text()` inside `application/usecases.py` `IndexUseCase`. This is an application-layer function that belongs in `domain/primitive/`. Extraction moves it — no cross-layer import is introduced.

**Files:**
- `apps/rag-service/domain/primitive/context_window_packer/__init__.py` (CREATE)
- `apps/rag-service/domain/primitive/context_window_packer/context_window_packer.py` (CREATE)
- `apps/rag-service/domain/primitive/context_window_packer/scenarios/golden.json` (CREATE)
- `apps/rag-service/domain/primitive/context_window_packer/scenarios/edge_empty_content.json` (CREATE)
- `apps/rag-service/domain/primitive/context_window_packer/scenarios/failure_exceeds_max_tokens.json` (CREATE)
- `apps/rag-service/application/usecases.py` (MODIFY — replace inline `_build_embedding_text()` call with import from `domain.primitive.context_window_packer`)

**Primitive function spec:**
```python
def pack(title: str, content: str, source: str, max_chars: int = 512) -> str:
    """
    Assemble a single embedding-ready text string from metadata fields.
    Extracted from application/usecases.py _build_embedding_text().
    Returns a string. Truncates content to max_chars if needed.
    Never calls the embedder — caller passes result to the EmbedderPort.
    """
```

**Determinism gate:** All inputs are plain strings and integers. Output is a deterministic string. No embedding call, no model, no DB.

**AC-1 (pure function + Fence-A):** `context_window_packer.py` imports ONLY stdlib. Zero infra/application/interface imports. Grep returns 0.

**AC-2 (packing correctness):** `pack("HOSE", "Earnings growth", "VNDirect", max_chars=512)` returns a non-empty string containing all three fields. `pack("", "", "", max_chars=512)` returns a string (possibly empty or minimal). Content truncation: if `len(content) > max_chars`, result content portion is truncated to `max_chars` characters.

**AC-3 (usecases.py migration):** `application/usecases.py` no longer contains `_build_embedding_text()` as an inline function — it imports and calls `context_window_packer.pack()` instead. Grep: `grep -n "_build_embedding_text" apps/rag-service/application/usecases.py` returns 0.

**AC-4 (scenario golden):** Standard title+content+source pack. Runner exits 0, `passed: true`.

**AC-5 (scenario edge):** Empty content field — primitive handles gracefully (no ValueError). Runner exits 0, `passed: true`.

**AC-6 (scenario failure):** Content that exceeds `max_chars` — expected output is truncated. Runner exits 0, `passed: true` (proves truncation path).

**AC-7 (pytest baseline preserved):** `python3 -m pytest` still passes all prior tests (usecases.py refactor must not break existing unit tests for IndexUseCase). Paste pytest output showing exit 0 before RETURN.

**AC-8 (sandbox-green + env audit):** All B1 + B2 + B3 scenarios passing. Env audit empty. Evidence in handoff before RETURN.

**Determinism note:** String assembly is pure. Scenario inputs are plain strings. No pre-computed vectors needed.

---

### P2-B4 — Primitive: `temporal-decay-scorer` (with `now` injection — R-2)

**Owner:** dev-rag-service
**Goals advanced:** G1 (fifth and final primitive; scenario count: 12+3=15 of 15 target — G1 fully addressed)
**Blocked by:** P2-B3
**Blocks:** P2-C

**R-2 critical (determinism gap, brownfield §5):** `compute_recency_score()` currently calls `datetime.now(tz=timezone.utc)` internally. The extracted primitive MUST accept `now` as an injectable parameter so scenario timestamps are time-stable. Production path: `now` defaults to `datetime.now(tz=timezone.utc)`. Test/scenario path: `now` is injected as a fixed ISO datetime string (parsed by the primitive).

**Files:**
- `apps/rag-service/domain/primitive/temporal_decay_scorer/__init__.py` (CREATE)
- `apps/rag-service/domain/primitive/temporal_decay_scorer/temporal_decay_scorer.py` (CREATE)
- `apps/rag-service/domain/primitive/temporal_decay_scorer/scenarios/golden.json` (CREATE)
- `apps/rag-service/domain/primitive/temporal_decay_scorer/scenarios/edge_same_day.json` (CREATE)
- `apps/rag-service/domain/primitive/temporal_decay_scorer/scenarios/failure_future_date.json` (CREATE)
- `apps/rag-service/domain/services.py` (MODIFY — replace inline `compute_recency_score` / `apply_temporal_decay` with import from `domain.primitive.temporal_decay_scorer`)

**Primitive function spec:**
```python
from datetime import datetime, timezone
from typing import Optional

def score(
    similarity: float,
    created_at_iso: str,
    half_life_days: float,
    now: Optional[datetime] = None,
) -> float:
    """
    Apply temporal decay to a similarity score.
    Extracted from domain/services.py compute_recency_score() + apply_temporal_decay().
    now defaults to datetime.now(tz=timezone.utc) in production.
    In scenarios, now is injected as a fixed datetime (ISO string parsed internally).
    Returns float in [0, 1]. Future dates (created_at > now) return decayed score
    treating age as 0 (or raise ValueError — architect ratifies in AC-2).
    """
```

**Scenario JSON `now` injection format:**
```json
{
  "primitive": "temporal_decay_scorer",
  "input": {
    "similarity": 0.8,
    "created_at_iso": "2026-05-10T00:00:00Z",
    "half_life_days": 7.0,
    "now_iso": "2026-05-24T00:00:00Z"
  },
  "expected_output": { "score": 0.4321 }
}
```
The sandbox runner passes `now_iso` as a parsed `datetime` argument to `score()`. This is the determinism gate: same inputs always produce the same output regardless of run date.

**Determinism gate:** Inject fixed `now` via `now_iso` field in scenario. Zero `datetime.now()` calls during scenario execution. Primitive is time-stable: running the golden scenario on any date produces byte-identical output.

**AC-1 (pure function + Fence-A):** `temporal_decay_scorer.py` imports ONLY stdlib (`datetime`, `math`, `typing`). Zero infra/application/interface imports. Grep returns 0.

**AC-2 (`now` injection signature):** Function signature is `score(similarity: float, created_at_iso: str, half_life_days: float, now: Optional[datetime] = None) -> float`. When `now=None`, defaults to `datetime.now(tz=timezone.utc)`. Sandbox runner passes a fixed `datetime` object parsed from scenario `now_iso` field.

**AC-3 (decay correctness):** With `similarity=0.8`, `created_at_iso="2026-05-10T00:00:00Z"`, `half_life_days=7.0`, `now=2026-05-24T00:00:00Z` (14 days age = 2 half-lives): expected output is `0.8 * 0.5^2 = 0.2`. Golden scenario validates this value to 4 decimal places.

**AC-4 (domain/services.py migration):** After extraction, `domain/services.py` no longer contains the inline decay arithmetic. It imports from `domain.primitive.temporal_decay_scorer` instead. Grep: `grep -n "compute_recency_score\|apply_temporal_decay" apps/rag-service/domain/services.py` returns only the import line, not arithmetic implementations.

**AC-5 (scenario golden):** 14-day-old document, 7-day half-life — score = 0.2. Runner exits 0, `passed: true`.

**AC-6 (scenario edge):** `created_at_iso == now_iso` (same day, age=0): decay factor = 1.0, score = similarity unchanged. Runner exits 0, `passed: true`.

**AC-7 (scenario failure):** Future-dated document (`created_at_iso` in the future relative to `now_iso`). Verify behaviour (no crash): either treat age as 0 (score = similarity) or raise `ValueError`. Whichever path is chosen, scenario JSON captures the expected behaviour and runner validates it deterministically.

**AC-8 (pytest baseline):** `python3 -m pytest` passes all prior tests after `domain/services.py` migration. Paste exit 0 evidence before RETURN.

**AC-9 (sandbox-green + env audit):** All 15 scenario files across 5 primitives passing (cumulative). Env audit empty. G1 addressing: 15 scenario files = 3 per primitive × 5 = G1 calibration target reached. Evidence in handoff before RETURN.

**Determinism note:** The `now` injection is the load-bearing determinism gate for this primitive. QA MUST verify golden scenario is byte-identical across two separate runs. Any deviation = determinism failure = task blocked.

---

### P2-C — G2 Module-Full: Wire All 5 Primitives into Retrieval Module

**Owner:** dev-rag-service
**Goals advanced:** G2 (module-full: all 5 primitives composed via ports)
**Blocked by:** P2-B4 (all 5 primitives must exist before module can wire them)
**Blocks:** P2-D

**Files:**
- `apps/rag-service/domain/module/retrieval/module.py` (MODIFY — replace stubs with real primitive imports)
- `apps/rag-service/domain/module/retrieval/scenarios/module_golden.json` (MODIFY or CREATE NEW — full 5-primitive pipeline scenario)
- `apps/rag-service/domain/module/retrieval/scenarios/module_edge_no_results.json` (CREATE — all results filtered by threshold)
- `apps/rag-service/__tests__/unit/test_retrieval_module.py` (MODIFY — add tests exercising real primitives via mock ports)

**Module pipeline (final Phase 2 wiring):**
```
query_text
  → EmbedderModulePort.embed() [via port — returns pre-baked vector in scenarios]
  → VectorSearchPort.search() [via port — returns pre-baked results in scenarios]
  → context_window_packer.pack() [per result — pack metadata for re-embedding if needed]
  → similarity_scorer.score() [per result — distance → similarity float]
  → relevance_threshold_gate.gate() [filter by max_distance]
  → temporal_decay_scorer.score() [per result — inject fixed now for scenarios]
  → top_k_selector.select_top_k() [trim to k]
  → list[dict] returned
```

**Fence-B requirement (brownfield §6):** `domain/module/retrieval/module.py` MUST NOT import from `infrastructure/`. Grep: `grep -n "from infrastructure\|import infrastructure" apps/rag-service/domain/module/retrieval/module.py` returns 0.

**Multi-primitive scenario design:** `module_golden.json` provides:
```json
{
  "primitive": "retrieval_module",
  "input": {
    "query_text": "VN-Index earnings growth",
    "query_vector": [/* 384 pre-computed fixed floats */],
    "raw_results": [
      {"id": "doc-1", "distance": 0.3, "created_at": "2026-05-10T00:00:00Z", "title": "...", "content": "...", "source": "..."},
      {"id": "doc-2", "distance": 0.9, "created_at": "2026-05-01T00:00:00Z", "title": "...", "content": "...", "source": "..."}
    ],
    "top_k": 1,
    "max_distance": 0.5,
    "half_life_days": 7.0,
    "now_iso": "2026-05-24T00:00:00Z"
  },
  "expected_output": {
    "result_ids": ["doc-1"]
  }
}
```
Mock VectorSearchPort returns `raw_results` directly. Mock EmbedderModulePort returns `query_vector` directly. Zero real embedding/LanceDB access.

**AC-1 (Fence-B clean):** Grep for infrastructure imports in `module.py` returns 0.

**AC-2 (all 5 primitives wired):** `module.py` imports all 5: `similarity_scorer`, `relevance_threshold_gate`, `temporal_decay_scorer`, `top_k_selector`, `context_window_packer`. Grep: `grep -n "from domain.primitive" apps/rag-service/domain/module/retrieval/module.py` returns 5 lines.

**AC-3 (`now` injection propagated):** Module accepts a `now: Optional[datetime] = None` parameter in `retrieve()` and passes it through to `temporal_decay_scorer.score()`. Scenarios inject `now_iso` which the module sandbox runner parses into a `datetime` and injects. Zero `datetime.now()` calls inside module during scenario execution.

**AC-4 (module golden scenario passes):** `python3 -m sandbox --service=rag-service --tier=module --scenario=apps/rag-service/domain/module/retrieval/scenarios/module_golden.json` exits 0, `passed: true`. Expected: doc-2 filtered (distance=0.9 > max_distance=0.5), doc-1 returned.

**AC-5 (module edge scenario passes):** `module_edge_no_results.json` — all raw results above threshold, expected `result_ids: []`. Runner exits 0, `passed: true`.

**AC-6 (mock-port unit tests pass):** All existing `test_retrieval_module.py` tests pass. Add 2 new tests: (a) end-to-end pipeline with all 5 primitives, (b) `now` injection is passed through correctly. `python3 -m pytest` exit 0.

**AC-7 (sandbox-green cumulative):** All 15 primitive scenarios + ≥2 module scenarios passing (cumulative). Paste evidence before RETURN.

**AC-8 (env audit empty):** Paste env audit before RETURN.

**Determinism note:** Module golden scenario uses pre-computed fixed `query_vector` (384-dim list literal) and fixed `now_iso`. QA verifies byte-identical across two runs. Any deviation = determinism failure.

---

### P2-D — G3 Composition-Root Verify: `main.py` ≤80L

**Owner:** dev-rag-service
**Goals advanced:** G3 (clean composition root: ≤80L, zero business logic, OpenAPI contract, port 5002)
**Blocked by:** P2-C (module must be fully wired before composition root can wire it)
**Blocks:** P2-E

**Files:**
- `apps/rag-service/main.py` (MODIFY — trim from 113L to ≤80L; extract middleware/lifespan to helper)
- `apps/rag-service/app_factory.py` (CREATE — receives extracted middleware/lifespan logic; optional if trimming achieves ≤80L without a new file)

**Current state (brownfield §2):** `main.py` is 113L with `create_app()` factory pattern. It has a single factory function — already clean wiring. G3 requires: (a) ≤80L, (b) zero business logic, (c) OpenAPI contract captured, (d) port 5002 verified.

**Trim strategy (architect-recommended):** Move `@app.on_event("startup")` / `@app.on_event("shutdown")` / CORS middleware config into `apps/rag-service/app_factory.py`. `main.py` becomes: imports + `create_app()` call + `uvicorn.run()` only.

**OpenAPI contract:** FastAPI auto-generates `/openapi.json`. Run: `curl http://localhost:5002/openapi.json > apps/rag-service/interface/openapi.json` (or capture from test client) and commit the snapshot. This is the HTTP contract document.

**AC-1 (line count ≤80):** `wc -l apps/rag-service/main.py | awk '{print $1}'` ≤ 80. Paste output.

**AC-2 (zero business logic):** Grep: `grep -n "similarity_score\|top_k\|chunk_split\|pack_context\|compute_recency\|filter_by_max" apps/rag-service/main.py` returns 0.

**AC-3 (port 5002):** `grep -n "5002\|port" apps/rag-service/main.py` confirms port 5002 is declared (or inherited from system-map env var). No hardcoded alternate port.

**AC-4 (OpenAPI contract committed):** `apps/rag-service/interface/openapi.json` (or `openapi.yaml`) exists in the repo and contains at least the `/search` and `/index` endpoint schemas. File committed via explicit `git add apps/rag-service/interface/openapi.json`.

**AC-5 (composition root is wiring only):** `main.py` contains only: import statements, DI bindings (instantiating infrastructure adapters and injecting into usecases/module), FastAPI app creation call, uvicorn startup. QA reads the file and confirms: zero `if` conditions on data values, zero math operations, zero domain function calls.

**AC-6 (pytest baseline):** `python3 -m pytest` exits 0 after trim. Paste before RETURN.

**AC-7 (sandbox-green + env audit):** Sandbox still passing (trim must not break any code paths under test). Env audit empty. Evidence before RETURN.

**Determinism note:** No new scenario files in P2-D. G3 is a structural verification task. Determinism gate applies to existing scenarios (must all still pass after trim).

---

### P2-E — G6 Dashboard-Full: All 5 Primitive Cards GREEN

**Owner:** dev-rag-service
**Goals advanced:** G6 (full dashboard: 5 primitive cards + module + microservice honest state)
**Blocked by:** P2-D (all primitives + module must be stable before dashboard is considered final)
**Blocks:** P2-G7

**Files:**
- `apps/rag-service/dashboard/index.html` (MODIFY — add 4 new primitive trace cards; update microservice panel)
- `apps/rag-service/dashboard/traces/relevance_threshold_gate_golden.json` (CREATE — from P2-B1 scenario run)
- `apps/rag-service/dashboard/traces/top_k_selector_golden.json` (CREATE — from P2-B2 scenario run)
- `apps/rag-service/dashboard/traces/context_window_packer_golden.json` (CREATE — from P2-B3 scenario run)
- `apps/rag-service/dashboard/traces/temporal_decay_scorer_golden.json` (CREATE — from P2-B4 scenario run)
- `apps/rag-service/dashboard/traces/module_full_golden.json` (CREATE — from P2-C full-pipeline scenario run)
- `apps/rag-service/dashboard/dash-check.py` (MODIFY — update expected counts: 5 GREEN primitives, module GREEN, microservice card check)

**Dashboard target state (Phase 2 final):**

```
Primitives panel (5 cards):
  similarity-scorer         GREEN  (trace passed=true — P1-B carry-forward)
  relevance-threshold-gate  GREEN  (trace passed=true — P2-B1 new)
  temporal-decay-scorer     GREEN  (trace passed=true — P2-B4 new)
  top-k-selector            GREEN  (trace passed=true — P2-B2 new)
  context-window-packer     GREEN  (trace passed=true — P2-B3 new)
Module panel (1 card):
  retrieval                 GREEN  (trace passed=true — P2-C full-pipeline)
Microservice panel (1 card):
  rag-service (port 5002)   NOT-RUN or LIVE (Phase 2: if Docker live, show live;
                             if not running, show NOT-RUN — must be honest either way)
```

**Microservice panel policy:** If port 5002 is reachable at dashboard render time, show `LIVE (port 5002)`. If not reachable, show `NOT-RUN` (grey). Never hard-code GREEN or LIVE — the panel must reflect actual connectivity.

**SI-2 boundary (HARD):** Do NOT touch `docs/dashboards/index.html` (stock-price exclusive). The SI-2 disavowal HTML comment in `apps/rag-service/dashboard/index.html` must remain verbatim.

**AC-1 (5 primitive cards GREEN):** dash-check.py reports all 5 primitive cards with `passed=true` traces. Each card GREEN is backed by a `dashboard/traces/<primitive>_golden.json` file with `passed: true`.

**AC-2 (module card GREEN):** Module card shows GREEN from `dashboard/traces/module_full_golden.json` with `passed: true`. This is the Phase-2 full-pipeline module trace.

**AC-3 (microservice card honest):** Microservice card does NOT hardcode GREEN. Shows LIVE or NOT-RUN based on actual port 5002 connectivity. No false-green.

**AC-4 (dash-check.py updated + passes):** `python3 apps/rag-service/dashboard/dash-check.py` exits 0, ≥22 PASS (17 Phase-1 checks + 5 new Phase-2 checks for 4 new GREEN primitives + module-full trace). Zero FAIL. Paste output before RETURN.

**AC-5 (file:// compatible):** Zero external URLs in HTML. Zero CDN. Zero network calls to embedding models or LanceDB. Confirm with dash-check.py "Zero external URLs" check.

**AC-6 (SI-2 disavowal preserved):** `grep -c "SI-2: This dashboard is rag-service-EXCLUSIVE" apps/rag-service/dashboard/index.html` returns ≥1.

**AC-7 (sandbox-green + env audit):** All primitives + module scenarios passing. Env audit empty. Evidence before RETURN.

**Determinism note:** Trace files in `dashboard/traces/` are static JSON — they do not execute at dashboard render time. The dashboard renders from pre-generated trace JSON. Zero model/DB access during dashboard open.

---

### P2-G7 — G7 Full Gate: Edit-JSON-and-Rerun + Env-Audit PASS/FAIL Hard Gate

**Owner:** dev-rag-service
**Goals advanced:** G7 (full gate: env-audit is now a hard FAIL, not just a warning; edit-JSON-and-rerun cycle proven; all forbidden keys listed)
**Blocked by:** P2-E
**Blocks:** P2-G8

**Context (brownfield §5, G7 calibration):** Phase 1 established env-audit as a WARNING (AC-5 of P1-A: "prints warning but does NOT fail"). Phase 2 upgrades it to a HARD FAIL gate. If any forbidden key is present in the sandbox environment, the sandbox runner MUST exit non-zero and abort. This is the G7 full DoD.

**Files:**
- `apps/rag-service/sandbox/__main__.py` (MODIFY — upgrade env-audit from warn-only to hard fail)
- `apps/rag-service/sandbox/README.md` (MODIFY — document hard-fail gate + forbidden key list)

**Forbidden keys (G7 calibration, from pilot-status):**
```
DB_PATH, LANCEDB_*, HF_TOKEN, HUGGINGFACE_*, OPENAI_API_KEY, EMBEDDING_MODEL, DATABASE_URL
```
`HF_HUB_OFFLINE=1` is NOT a forbidden key — it must be PRESERVED (R-5). Do not add it to the forbidden list.

**Edit-JSON-and-rerun cycle (G7 verification):** User (or QA) edits a scenario JSON input value, re-runs sandbox, sees updated trace output. Sandbox runner must regenerate the trace without any external call. This proves the edit→rerun→verify loop is complete.

**AC-1 (hard-fail gate):** If any forbidden env var is present when sandbox runs, sandbox exits non-zero and prints which key was found. Proof: set `export LANCEDB_TEST=x` in shell → run sandbox → exits non-zero. Unset → exits 0.

**AC-2 (forbidden key list in code):** Forbidden key regex is declared as a constant in `sandbox/__main__.py` (not hardcoded inline). Pattern: `r'^(DB_PATH|LANCEDB_[A-Z_]*|HF_TOKEN|HUGGINGFACE_[A-Z_]*|OPENAI_API_KEY|EMBEDDING_MODEL|DATABASE_URL)$'`.

**AC-3 (HF_HUB_OFFLINE=1 preserved):** `grep -n "HF_HUB_OFFLINE" apps/rag-service/sandbox/__main__.py` must NOT appear in the forbidden-key list. R-5: HF_HUB_OFFLINE=1 is a safety flag, not a credential.

**AC-4 (edit-JSON-rerun cycle):** Modify one input field in `domain/primitive/similarity_scorer/scenarios/golden.json` (e.g., change `distance` from `0.5` to `0.7`). Re-run sandbox. Confirm trace output changes (`similarity` in actual output changes). Revert the edit. Paste before/after trace diff in handoff.

**AC-5 (env audit empty in production-mode run):** Standard env audit `env | grep -E 'DB_PATH|LANCEDB|HF_TOKEN|HUGGINGFACE|OPENAI_API_KEY|EMBEDDING_MODEL|DATABASE_URL'` returns empty (no forbidden keys present in normal dev environment). Paste output.

**AC-6 (sandbox-green + env audit):** All scenarios still passing after sandbox upgrade. Env audit empty. Evidence before RETURN.

**Determinism note:** G7 is a gate verification task, not a new primitive. No new scenario files. Determinism of existing scenarios must be preserved after sandbox runner change.

---

### P2-G8 — G8 Deliberate-Break Proof: 5 Known-Bad Scenarios → 5 RED

**Owner:** qa (co-owner: dev-rag-service for dashboard fix if needed)
**Goals advanced:** G8 (honest red/green: deliberate break + 5 known-bad all RED, no false greens)
**Blocked by:** P2-G7
**Blocks:** P2-A

**Context (G8 calibration):** Phase 1 established honest NOT-RUN state. Phase 2 proves the RED state is honest: a corrupted scenario produces a RED card, and 5 known-bad scenarios all show RED with no false greens.

**Files:**
- `apps/rag-service/domain/primitive/similarity_scorer/scenarios/` (MODIFY — QA corrupts golden.json temporarily to prove RED; reverted after)
- `apps/rag-service/domain/primitive/` (QA creates 5 known-bad scenario files, one per primitive)
- `apps/rag-service/dashboard/` (no change expected — honesty was baked in Phase 1)

**Known-bad scenario files (QA creates; these are PERMANENT test artefacts — do NOT delete after task):**
```
domain/primitive/similarity_scorer/scenarios/known_bad_wrong_score.json
domain/primitive/relevance_threshold_gate/scenarios/known_bad_wrong_filter.json
domain/primitive/top_k_selector/scenarios/known_bad_wrong_k.json
domain/primitive/context_window_packer/scenarios/known_bad_wrong_pack.json
domain/primitive/temporal_decay_scorer/scenarios/known_bad_wrong_decay.json
```
Each file has `expected_output` that does NOT match what the primitive actually returns — deliberately wrong. The sandbox runner exits non-zero (`passed: false`) on each.

**AC-1 (deliberate break: 1 corrupted golden → RED):** QA takes `similarity_scorer/scenarios/golden.json`, changes `expected_output.similarity` to a wrong value (e.g., `9.9`). Runs sandbox: exits non-zero, `passed: false`. Dashboard `similarity-scorer` card shows RED. Revert golden.json: exits 0, `passed: true`, card shows GREEN. Evidence: before/after sandbox output + description of dashboard state.

**AC-2 (5 known-bad → 5 RED):** QA runs sandbox against each of the 5 known-bad scenario files. All 5 exit non-zero, `passed: false`. Dashboard shows each corresponding card as RED (if dashboard is reloaded with bad traces). Evidence: paste 5 sandbox outputs.

**AC-3 (no false greens):** After reverting the golden.json corruption and removing bad traces from dashboard, all 5 primitive cards return to GREEN. Confirm: `python3 apps/rag-service/dashboard/dash-check.py` exits 0 with all GREEN.

**AC-4 (known-bad files committed):** The 5 known-bad scenario files are committed to the repo as permanent test artefacts. They must be excluded from the `--scenario=all` default run (either by naming convention `known_bad_*.json` or a sandbox CLI flag `--include-bad`). QA and dev agree on exclusion mechanism. This is a design decision to be noted in `sandbox/README.md`.

**AC-5 (sandbox regression):** After G8 proof, all standard scenarios (non-known-bad) pass: `python3 -m sandbox --service=rag-service --tier=primitive --scenario=all` exits 0. `dash-check.py` exits 0.

**AC-6 (env audit empty):** Env audit still empty. Evidence before RETURN.

**Determinism note:** Known-bad scenarios must have fixed wrong expected values — not random. The "wrong" value must be a specific literal (e.g., `9.9` not `random()`). This ensures the RED state is as deterministic as the GREEN state.

---

### P2-A — G4 Import-Linter Fence + CI Job + Deliberate-Violation Proof

**Owner:** dev-rag-service (fence implementation) + qa (violation proof co-owner)
**Goals advanced:** G4 (architecture fence enforced: Fence-A, Fence-B, Fence-C; CI job; offline proof)
**Blocked by:** P2-G8 (all primitives must be stable before violation proof can be meaningful)
**Blocks:** P2-F

**Pre-revert tag:** `rag-pre-ci` — MUST be created by dev-rag-service before any CI configuration is committed.

```bash
git tag -a rag-pre-ci -m "rag-pre-ci: anchor before import-linter CI job"
# Paste tag SHA into handoff before proceeding
```

**SI-4 tool (locked — brownfield §6):** `import-linter` (pip package, grimp backend). Config in `apps/rag-service/pyproject.toml` under `[tool.importlinter]`.

**Fence contracts (from brownfield §6):**
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

**CI job:** `.github/workflows/rag-service-py-lint.yml` (CREATE):
```yaml
name: rag-service-py-lint
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/rag-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install import-linter
      - run: lint-imports
```

**Files:**
- `apps/rag-service/pyproject.toml` (MODIFY — add `[tool.importlinter]` contracts + add `import-linter` to `[project.optional-dependencies] dev`)
- `.github/workflows/rag-service-py-lint.yml` (CREATE — CI job, working-directory=apps/rag-service)

**Deliberate-violation protocol (R-FENCE gate — mirrors Go depguard offline pattern):**

1. Dev-rag-service adds ONE line to `domain/primitive/similarity_scorer/similarity_scorer.py`:
   ```python
   from infrastructure.embedder import SentenceTransformersEmbedder  # DELIBERATE VIOLATION — DO NOT COMMIT
   ```
2. Runs `lint-imports` from `apps/rag-service/`: MUST exit non-zero + print "Fence-A" contract name in output.
3. Reverts the violation (`git checkout domain/primitive/similarity_scorer/similarity_scorer.py`).
4. Verifies `lint-imports` exits 0 after revert.
5. The violating line is NEVER committed. Only the revert state is committed.
6. QA independently reproduces steps 1-4 and confirms non-zero exit.

**R-FENCE gate criterion:** Step 2 non-zero exit with "Fence-A" in output is the GATE criterion. If `lint-imports` exits 0 on the deliberate violation, G4 is BLOCKED — fix the contracts before proceeding.

**Offline-runnable evidence:** `lint-imports` is a pure Python package. It does NOT require network access. Run from `apps/rag-service/` with `import-linter` installed in dev extras. Mirrors Go `depguard` offline pattern.

**AC-1 (pre-revert tag created):** `git tag -a rag-pre-ci -m "..."` created. Tag SHA pasted in handoff. Tag is an ancestor of HEAD.

**AC-2 (pyproject.toml contracts):** `grep -c "Fence-A\|Fence-B\|Fence-C" apps/rag-service/pyproject.toml` returns 3. All three contract names present.

**AC-3 (import-linter passes clean codebase):** `lint-imports` exits 0 on unmodified codebase (after all Phase 2 B/C/D/E tasks). Paste exit code evidence.

**AC-4 (deliberate violation exits non-zero — R-FENCE gate):** Dev-rag-service and QA both run the violation protocol. Both confirm: `lint-imports` exits non-zero with "Fence-A" in output. Violation reverted, never committed. Paste violation command + non-zero exit code + "Fence-A" text snippet into handoff.

**AC-5 (revert exits 0):** After revert, `lint-imports` exits 0. Paste exit code.

**AC-6 (CI job file present):** `.github/workflows/rag-service-py-lint.yml` exists in repo, `working-directory: apps/rag-service` confirmed by grep.

**AC-7 (offline-runnable):** `lint-imports` runs without network access. Confirm by running with `NO_PROXY=* HTTP_PROXY="" HTTPS_PROXY=""` prefix (or note that `import-linter` uses no network by design — pure Python graph analysis).

**AC-8 (QA co-sign):** QA independently reproduces the violation proof and confirms in handoff. QA pastes their own `lint-imports` non-zero exit evidence.

**AC-9 (sandbox-green + env audit):** Fence changes must not break sandbox. All scenarios still passing. Env audit empty. Evidence before RETURN.

**Determinism note:** `lint-imports` is deterministic — same contracts + same imports = same verdict. No float/ANN randomness. Violation proof is reproducible.

---

### P2-F — G5 Old-Code Delete + HTTP Rewire

**Owner:** dev-rag-service
**Goals advanced:** G5 (G5a: move legacy TS files → _deprecated/; G5b: retriever.ts rewired → ragHttpClient.ts; G5c: zero TODO.*migrat; R-1 dual-writer resolves)
**Blocked by:** P2-A (fence must be proven before structural surgery on mcp-server)
**Blocks:** P2-J

**Pre-revert tag:** `rag-pre-delete` — MUST be created by dev-rag-service before any `git mv` or file deletion.

```bash
git tag -a rag-pre-delete -m "rag-pre-delete: anchor before G5a/G5b mcp-server surgery"
# Paste tag SHA into handoff before proceeding
```

**G5a — Move legacy TS files → _deprecated/ (brownfield §4 + §7):**

Target files to move:
```
apps/mcp-server/src/infrastructure/rag/embeddings.ts    → apps/mcp-server/src/infrastructure/rag/_deprecated/embeddings.ts
apps/mcp-server/src/infrastructure/rag/vectorstore.ts   → apps/mcp-server/src/infrastructure/rag/_deprecated/vectorstore.ts
apps/mcp-server/src/infrastructure/rag/retriever.ts     → apps/mcp-server/src/infrastructure/rag/_deprecated/retriever.ts
```

**G5b — Rewire retriever.ts callers → ragHttpClient.ts (brownfield §4 + §7):**

Three caller files funnel through `retriever.ts`. After G5a moves `retriever.ts` to `_deprecated/`, these callers break — they must be rewired to `ragHttpClient.ts`:

| Caller file | Old import | New import |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` | `searchContext` from `infrastructure/rag/retriever` | `ragSearch` from `infrastructure/rag/ragHttpClient` |
| `apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts` | `getCount` from `infrastructure/rag/vectorstore` | Use `GET http://localhost:5002/health` or new `/stats` endpoint |
| `apps/mcp-server/src/index.ts` | `closeVectorStore` from `infrastructure/rag/vectorstore` | Remove (rag-service owns its own LanceDB lifecycle) |

`ragHttpClient.ts` already exists at `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` with `ragSearch()` and `ragIndex()` — no new client needed.

**R-1 resolution:** After G5b, all LanceDB writes route through rag-service HTTP API. The dual-writer risk (brownfield R-1) is eliminated. mcp-server no longer holds a direct LanceDB connection.

**G5c — Zero TODO.*migrat:**

```bash
grep -rn "TODO.*migrat" apps/rag-service/ apps/mcp-server/src/infrastructure/rag/
# Must return 0
```

**Integration test:** After rewire, the MCP tool `fetch_and_analyze` (which calls `ragSearch`) must work end-to-end via port 5002. If an integration test exists, it must pass. If not, dev-rag-service emits a manual smoke-test evidence: start rag-service on port 5002, call `ragSearch`, verify response.

**Files:**
- `apps/mcp-server/src/infrastructure/rag/_deprecated/` (CREATE directory)
- `apps/mcp-server/src/infrastructure/rag/_deprecated/embeddings.ts` (git mv)
- `apps/mcp-server/src/infrastructure/rag/_deprecated/vectorstore.ts` (git mv)
- `apps/mcp-server/src/infrastructure/rag/_deprecated/retriever.ts` (git mv)
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` (MODIFY — rewire import)
- `apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts` (MODIFY — rewire import)
- `apps/mcp-server/src/index.ts` (MODIFY — remove closeVectorStore import)

**AC-1 (pre-revert tag):** `rag-pre-delete` tag created, SHA in handoff, is ancestor of HEAD.

**AC-2 (G5a — files in _deprecated/):** `ls apps/mcp-server/src/infrastructure/rag/_deprecated/` lists `embeddings.ts`, `vectorstore.ts`, `retriever.ts`. Original paths return "no such file".

**AC-3 (G5b — callers rewired):** Grep: `grep -rn "from.*infrastructure/rag/retriever\|from.*infrastructure/rag/vectorstore" apps/mcp-server/src/interface/ apps/mcp-server/src/scheduler/ apps/mcp-server/src/index.ts` returns 0. (Callers now use `ragHttpClient` or have removed the import.)

**AC-4 (ragHttpClient.ts used):** `grep -n "ragSearch\|ragIndex" apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` returns ≥1 line. The HTTP client is active.

**AC-5 (R-1 resolved — single writer):** `grep -rn "lancedb\|LanceDB" apps/mcp-server/src/infrastructure/rag/` — result shows only files under `_deprecated/`. Active code in `apps/mcp-server/src/` has zero direct LanceDB usage outside `_deprecated/`.

**AC-6 (G5c — zero TODO.*migrat):** Grep returns 0 results.

**AC-7 (mcp-server TS build exits 0):** `cd apps/mcp-server && bun run build` (or equivalent TS compile) exits 0 after rewire. No broken imports.

**AC-8 (integration smoke test):** Evidence that `ragSearch` via `ragHttpClient.ts` routes to port 5002 and returns valid response. Either: existing integration test passes, or manual smoke-test output pasted in handoff.

**AC-9 (sandbox-green + env audit):** rag-service sandbox still passing (G5 changes are in mcp-server, should not break rag-service primitives). Env audit empty. Evidence before RETURN.

**Determinism note:** G5 is a structural surgery task. No new scenario files. Determinism applies to existing scenarios — must all still pass after G5b rewire.

---

### P2-J — G10 Bug Injection ≤2 Cycles (QA Injects, Dev Fixes)

**Owner:** qa (injection) + dev-rag-service (fix — ≤2 cycles)
**Goals advanced:** G10 (AI agent fixes deliberate primitive bug in ≤2 cycles; baseline 1.5 from bug-inventory)
**Blocked by:** P2-F (primitives must be stable and G5 surgery complete before injection)
**Blocks:** P2-K1

**Pre-revert tag:** `rag-pre-inject` — MUST be created by QA before injecting the bug.

```bash
git tag -a rag-pre-inject -m "rag-pre-inject: anchor before G10 deliberate primitive bug injection"
# Paste tag SHA into handoff before proceeding
```

**Bug injection protocol:**

1. QA selects 1 primitive and 1 specific single-literal to corrupt. Target must be realistic (off-by-one, wrong comparator, wrong literal constant — NOT a syntax error).
2. QA creates a branch-free commit injecting the bug (on main, per CLAUDE.md constraint).
3. QA records the injection in handoff: which file, which line, what was changed — REDACTED from dev-rag-service (blind fix protocol).
4. dev-rag-service receives only: "A deliberate bug has been injected in one primitive. Dashboard shows RED. Fix until dashboard-GREEN. You have ≤2 cycles."
5. dev-rag-service diagnoses from dashboard RED state, fixes, demonstrates GREEN.
6. QA counts cycles (each fix commit = 1 cycle). ≤2 cycles = PASS.

**Recommended injection targets (QA selects one — architect recommends):**
- `temporal_decay_scorer`: change `0.5 ** (age_days / half_life_days)` exponent sign (e.g., `+(age_days / half_life_days)` instead of `-(age_days / half_life_days)`) — scores decay upward instead of downward, golden scenario fails
- `top_k_selector`: change `results[:k]` to `results[k:]` (off-by-one slice direction) — returns wrong items, golden scenario fails

**Max cycles:** 2. Baseline: 1.5 (from `docs/data/bug-inventory.json` `rag_service_baseline.baselineCycleCount`).

**AC-1 (pre-revert tag by QA):** `rag-pre-inject` tag created by QA, SHA recorded in handoff.

**AC-2 (injection committed on main):** Bug injected as a commit on main. Commit message: `test(rag-service): G10 deliberate primitive bug injection [QA ONLY — not for dev-rag-service review]`. The specific primitive + line is redacted from dev-rag-service.

**AC-3 (dashboard RED confirmed before fix):** After injection, `python3 -m sandbox --service=rag-service --tier=primitive --scenario=all` exits non-zero. At least 1 scenario shows `passed: false`. Dashboard corresponding card shows RED. QA pastes sandbox output.

**AC-4 (dev-rag-service fix in ≤2 cycles):** dev-rag-service diagnoses from RED state and submits fix commit(s). Cycle count = number of fix commits before sandbox returns to full GREEN. ≤2 = G10 PASS. >2 = G10 FAIL (pilot constraint).

**AC-5 (dashboard GREEN after fix):** `python3 -m sandbox --service=rag-service --tier=primitive --scenario=all` exits 0. `dash-check.py` exits 0. All cards GREEN. dev-rag-service pastes evidence.

**AC-6 (git log shows ≤2 fix commits):** QA pastes `git log --oneline -5` showing injection commit + ≤2 fix commits. Cycle count recorded in handoff.

**AC-7 (env audit empty):** Env audit still empty after fix. Evidence before RETURN.

**Determinism note:** The injected bug must produce a deterministic RED (not intermittent). Fixed input vectors + fixed expected outputs mean the wrong literal produces a wrong result on EVERY run. This makes the cycle count measurable.

---

### P2-K1 — G11 Regression Alarm: 2-Trial Coupling Proof

**Owner:** dev-rag-service + qa (co-owner)
**Goals advanced:** G11 (2-trial coupling proof: each trial = primitive mutation + fix + ≥1 coupled module scenario RED)
**Blocked by:** P2-J (G10 trial-1 is P2-J itself — reuse G10 fix as Trial-1 evidence if it shows coupled RED)
**Blocks:** P2-K2

**G11 rubric (from pilot-status calibration):** 2-trial coupling-proof. Trial-1 and Trial-2 are different primitive mutations. Each must show ≥1 COUPLED scenario RED (a module-level retrieval scenario that exercises the mutated primitive flips red) + a single-edit fix restores green. Outcome-(a)×2 = PASS.

**Trial-1 (may reuse G10 evidence):** If the G10 injection (P2-J) caused a module scenario to flip RED (not just the primitive scenario), Trial-1 is proven. QA verifies: did `python3 -m sandbox --service=rag-service --tier=module --scenario=all` exit non-zero during the G10 injection window? If YES, Trial-1 is documented from G10 evidence. If NO (module scenario was not coupled), QA designs a dedicated Trial-1 mutation.

**Trial-2 (DIFFERENT primitive):** QA mutates a different primitive than Trial-1. Requirements: (a) mutation flips ≥1 module scenario RED, (b) single-edit fix restores GREEN. Recommended Trial-2 target: whichever primitive Trial-1 did NOT use.

**Pre-revert tag for Trial-2:** No new tag required — `rag-pre-inject` revert can serve if Trial-2 mutation is separate from the G10 code path. If Trial-2 needs its own anchor, QA creates `rag-pre-inject-2` with same discipline.

**Files (Trial-2 only — Trial-1 reuses P2-J artefacts):**
- `apps/rag-service/domain/primitive/<trial-2-target>/<file>.py` (MODIFY by QA — inject Trial-2 mutation)
- `apps/rag-service/domain/module/retrieval/scenarios/module_golden.json` (must be the COUPLED scenario that flips RED)

**AC-1 (Trial-1 coupling evidence):** Evidence that during Trial-1 (G10 / P2-J), ≥1 module scenario flipped RED. Either paste `python3 -m sandbox --tier=module --scenario=all` non-zero exit from G10 window, OR document that a dedicated Trial-1 was run with a module scenario that shows coupled RED.

**AC-2 (Trial-1 single-edit fix):** Trial-1 fix was a single edit (1 file, 1 line) that restored GREEN. git log shows 1 fix commit for Trial-1 (G10 fix commit satisfies this).

**AC-3 (Trial-2 mutation — different primitive):** QA mutates a DIFFERENT primitive than Trial-1. The specific mutation is committed. `python3 -m sandbox --tier=module --scenario=all` exits non-zero (module scenario RED). Paste output.

**AC-4 (Trial-2 coupled RED — ≥1 module scenario):** At least 1 module-level scenario (in `domain/module/retrieval/scenarios/`) flips RED during Trial-2. This proves coupling: a primitive mutation propagates to the module layer. Paste module sandbox non-zero exit output.

**AC-5 (Trial-2 single-edit fix):** dev-rag-service fixes Trial-2 with a single edit. `python3 -m sandbox --tier=module --scenario=all` exits 0. `python3 -m sandbox --tier=primitive --scenario=all` exits 0. Both GREEN.

**AC-6 (outcome-(a)×2 PASS):** QA declares G11 outcome-(a)×2 PASS: both trials showed (a) coupled module scenario RED + single-edit primitive fix restores GREEN. Outcome-(a) rubric: "single-edit fix restores all scenarios to GREEN without introducing new RED." Paste verdict in handoff.

**AC-7 (env audit empty):** Env audit empty after Trial-2 revert. Evidence before RETURN.

**Determinism note:** Both mutations must produce deterministic RED (not intermittent) — fixed input vectors + wrong literal = wrong output every run. This makes the coupling proof measurable and reproducible.

---

### P2-K2 — G9 Playwright Headless Trust Contract (LAST)

**Owner:** dev-rag-service
**Goals advanced:** G9 (Playwright headless trust contract — Path B PO default, Day-0)
**Blocked by:** P2-K1 (dashboard must be in final GREEN state with all 5 primitive cards; regression proofs complete)
**Blocks:** (none — this is the final Phase 2 task)

**Context (G9 calibration):** Path B (PO Playwright headless) is the Day-0 default per L6 carry-over from TA cycle-19 + macro cycle-53. Playwright opens `file://apps/rag-service/dashboard/index.html` headlessly, asserts panels and cards, confirms correct red/green from trace JSON, verifies zero console errors and zero network calls.

**VERDICT fields (G9 trust contract):**
```json
{
  "panels_rendered": true,
  "panels_count": 3,
  "primitive_cards_count": 5,
  "primitive_cards_all_green": true,
  "module_card_green": true,
  "microservice_card_present": true,
  "console_errors": 0,
  "network_calls": 0,
  "verdict": "PASS"
}
```

**Files:**
- `apps/rag-service/dashboard/playwright.config.js` or `playwright.config.ts` (CREATE — config for file:// headless run)
- `apps/rag-service/dashboard/tests/trust-contract.spec.js` (CREATE — headless assertions)

**Playwright run command:**
```bash
npx playwright test apps/rag-service/dashboard/tests/trust-contract.spec.js --reporter=json
```

**AC-1 (Playwright config exists):** `playwright.config.js` in `apps/rag-service/dashboard/` with `baseURL: file://` and `headless: true`. No server spawn — pure file:// open.

**AC-2 (3 panels rendered):** Playwright finds 3 panel elements (`#panel-primitives`, `#panel-module`, `#panel-microservice` or equivalent IDs). Assertion passes.

**AC-3 (5 primitive cards present):** Playwright counts 5 primitive card elements. All 5 names present: `similarity-scorer`, `relevance-threshold-gate`, `temporal-decay-scorer`, `top-k-selector`, `context-window-packer`. Assertion passes.

**AC-4 (all 5 primitive cards GREEN):** Playwright checks each primitive card element for a "GREEN" CSS class or badge text. All 5 show GREEN. Assertion passes.

**AC-5 (zero console errors):** Playwright listener captures 0 console errors during dashboard load + 2-second settle period. Assertion passes.

**AC-6 (zero network calls):** Playwright network listener captures 0 HTTP requests (file:// URL produces zero network I/O). Assertion passes.

**Playwright VERDICT JSON output committed:** `apps/rag-service/dashboard/playwright-verdict.json` (CREATE — from playwright test run output). This is the G9 evidence artefact. Committed via explicit `git add`.

**Sandbox-green + env audit:** Final confirmation: all 15 primitive scenarios + ≥2 module scenarios still passing. Env audit empty. Evidence before RETURN.

**Determinism note:** Playwright assertions are deterministic — dashboard renders from static JSON traces (no network, no model, no DB). The VERDICT fields are binary pass/fail, not floats. Reproducible across machines.

---

## Goals Advanced Map — Phase 2

| Goal | Phase 1 status | Phase 2 work | Phase 2 task(s) |
|---|---|---|---|
| G1 | IN-PROGRESS (1/5 primitives) | +4 primitives → 15 scenarios | P2-B1, P2-B2, P2-B3, P2-B4 |
| G2 | IN-PROGRESS (module stub) | Full wiring of all 5 primitives | P2-C |
| G3 | TBD | main.py ≤80L verify | P2-D |
| G4 | TBD | import-linter fence + CI + violation proof | P2-A |
| G5 | TBD | git mv _deprecated/ + retriever.ts rewire | P2-F |
| G6 | IN-PROGRESS (2 cards GREEN) | +4 primitive cards + module-full trace | P2-E |
| G7 | IN-PROGRESS (warn-only) | Upgrade to hard-fail gate | P2-G7 |
| G8 | IN-PROGRESS (NOT-RUN honest) | Deliberate-break + 5 known-bad RED | P2-G8 |
| G9 | TBD | Playwright headless trust contract | P2-K2 |
| G10 | TBD | Bug injection ≤2 cycles | P2-J |
| G11 | TBD | 2-trial coupling proof | P2-K1 |
| G12 | EARNED-PENDING | No new code task — re-confirmed at close | (all tasks maintain G12 gate) |

`goalsEarned` stays 0 throughout Phase 2. PO flips YES at terminal 12/12 atomic close. No goal status changes in pilot-status during Phase 2 — all remain in their current state until PO-only terminal atomic flip.

---

## §4.5 Compliance

This task plan contains NO instructions to flip any G-goal to YES. NO instructions to populate `decisionMatrix`. NO instructions to set `goalsEarned` to anything other than 0. All goal flips are PO-only, atomic with 12/12 terminal close (pilot-charter.md §4.5 inviolable). No task in this plan instructs any agent to write decisionMatrix values.

---

## Hard Constraints

| Constraint | Rule |
|---|---|
| L84 staging | `git add <explicit-path>` per file. NEVER `-A` or `.` |
| No force push | No `--force`, `--no-verify`, `--no-gpg-sign` |
| Main branch only | All work on `main` (no branches per CLAUDE.md) |
| WIP=1 | Only 1 task In Progress at a time |
| HF_HUB_OFFLINE=1 | DO NOT remove or override in any context (R-5) |
| No model load in sandbox | `sentence_transformers`, `lancedb`, `torch`, `transformers` MUST NOT appear in sandbox/primitive/module code paths |
| Pre-revert tag discipline | Tags created ONCE before surgery; never retagged/pushed; must remain ancestor of HEAD |
| decisionMatrix | PO-ONLY authorship, atomic with 12/12. Do NOT touch |
| Fleet serialization | `git diff --cached --name-only` must be empty before staging. Stage only your task files by explicit path. Verify git status shows ONLY your file before commit. |
| SI-2 boundary | Do NOT touch `docs/dashboards/index.html` (stock-price exclusive) |
| Anchor discipline | Frozen anchors remain ancestors of HEAD; no retag/rewrite/push |
| §4.5 inviolable | No goal flip instructions in any task. goalsEarned stays 0. |
| Known-bad scenarios | After P2-G8, do NOT delete known_bad_*.json files — they are permanent test artefacts |
| G10 blind fix | dev-rag-service must NOT read QA injection handoff until fix is complete |
