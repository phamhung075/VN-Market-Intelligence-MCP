---
title: "Scale Charter — rag-service"
date: "2026-05-24"
author: "po"
status: "READY"
service: "rag-service"
owner: "dev-rag-service"
language: "Python"
scale_order: "parallel-eligible (after macro-indicators)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `rag-service`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Language-agnostic goals. Apply verbatim, substituting `rag-service` for `technical-analysis` and `dev-rag-service` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking (canonical SSOT, schema = docs/data/pilot-status-schema.json):** `docs/data/pilot-status-rag-service.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-rag-service` |
| **Language** | **Python** (stays Python — sentence-transformers / LanceDB / ML ecosystem constraint overrides Go-first default). |
| **Anti-scope-creep boundary** | `apps/rag-service/` ONLY. |

### Current state — CLEAN PYTHON DDD

`apps/rag-service/` already has DDD layers (`domain/`, `application/`, `infrastructure/`, `interface/`, `main.py`, `__tests__/`, `pyproject.toml`, `requirements.txt`). Clean Python service. **No primitive/module subfolders yet** — extraction is the first refactor task. Shares the Python sandbox-runner gap with pdf-extractor.

This is **rewire + extract**, not rebuild.

### Candidate primitives (target-state §News / NLP primitives + cross-cutting)
Pure-function units in the embed→retrieve→rank pipeline: e.g. `chunk-splitter`, `similarity-scorer`, `top-k-selector`, `context-window-packer`, `relevance-threshold-gate`. Module candidate: a `retrieval` module. (Embedding model invocation itself is an adapter, not a primitive.)

### Key risks
1. **Embedding model + LanceDB are impure/heavyweight.** The sentence-transformers model load and LanceDB vector search are adapters, NOT primitives. Primitives are the deterministic transforms around them (chunking, scoring math, top-k, packing). Security Clause: sandbox must run scenario JSON with ZERO model/DB access — feed pre-computed embeddings as scenario inputs.
2. **Non-determinism.** Vector similarity + ANN search can be non-deterministic across runs. Scenario JSON must use fixed embedding vectors and pinned ranking so the sandbox is reproducible (no false reds from float jitter / ANN randomness).
3. **Disk/resource sensitivity.** LanceDB has caused disk-pressure incidents (29GB growth → container hang). The refactor is structural and should NOT change storage behavior, but the owner must keep the model-cache / offline-load hardening (HF_HUB_OFFLINE=1, pre-baked model) intact — do not regress cold-start fixes.
4. **Python sandbox tooling gap** — same as pdf-extractor; the Python scenario runner is an early Phase prerequisite for G1.
