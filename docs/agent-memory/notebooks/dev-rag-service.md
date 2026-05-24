# dev-rag-service — Notebook

Zone: `apps/rag-service/` | Stack: Python/FastAPI | DB: rag_service.db (write)

## Working Memory

### 2026-05-24 — TASK P2-K2 (G9 Playwright headless trust contract — LAST Phase 2 task)

**Spec:** `apps/rag-service/dashboard/trust-contract.spec.mjs` (standalone Playwright .mjs, mirrors kinh-dich dash-check.mjs pattern)
**Result:** `apps/rag-service/dashboard/trust-contract-result.json` — PASS
**Screenshot:** `apps/rag-service/dashboard/trust-contract-screenshot.png`

**VERDICT (LIVE Playwright run, Chromium 147.0.7727.15, playwright-core from apps/mcp-server/node_modules):**
- panels_ok: true (3/3 panels rendered)
- primitive_cards_count: 5/5 all GREEN (similarity-scorer, relevance-threshold-gate, temporal-decay-scorer, top-k-selector, context-window-packer)
- module_ok: true (retrieval GREEN)
- microservice_not_run: true (honest NOT-RUN)
- colors_match_traces: true — proved via page.route() DOM patch: similarity-scorer trace patched to passed=false in-memory → card showed FAIL (RED). File on disk NOT modified. Transient, never committed.
- console_errors: 0
- network_calls: 0
- verdict: PASS

**G12 DoD (final):** 16/16 primitive sandbox GREEN, 2/2 module sandbox GREEN, 81/81 pytest, env audit empty.

**Commits:** `fa1b7773` (spec + result, via concurrent pdf-extractor agent pick-up), `4c0c0edb` (screenshot + commitSHA fix)

**P2-K2 status:** DONE. All Phase 2 tasks complete (P2-B1 through P2-K2). G9 PASS verdict live. NEXT: PO does G9 Path-B sign-off + terminal 12/12 atomic close + decisionMatrix.

---

### [ARCHIVED] 2026-05-20 — watchdog-3/watchdog-10 (model pre-bake + mkdir cleanup)

Pre-baked `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` into Dockerfile at `/opt/model-cache`. HF_HUB_OFFLINE=1 enforced. Removed dead `/app/data/models` mkdir. Cold-start <20s. 41/41 tests GREEN. Commits: watchdog-3 + watchdog-10.

---

### [ARCHIVED] 2026-05-24 — Phase 1 tasks P1-A through P1-E

- P1-A (commit `c8e29f08`): sandbox runner, mock_adder proof, 41/41 tests.
- P1-B (commit `cfd38a3b`): similarity_scorer primitive, 3 scenarios, 41/41 tests.
- P1-C (commit `8be07048`): retrieval module stub, Protocol ports, 51/51 tests.
- P1-E (commit `7725ca59`): 3-panel dashboard, 17/17 dash-check, G12 streak #3.
- Phase 1 gate: APPROVED — QA cycle-74 (commit 1823e716), PO cycle-75.

### 2026-05-24 — TASK P2-B1..B4 (four primitive extractions — SCALE pilot Phase 2)

**Tasks:** P2-B1 relevance-threshold-gate + P2-B2 top-k-selector + P2-B3 context-window-packer + P2-B4 temporal-decay-scorer. All executed sequentially (WIP=1).

**P2-B1 — relevance-threshold-gate:**
- Files: `domain/primitive/relevance_threshold_gate/` (pkg + 3 scenarios) + `__tests__/unit/test_relevance_threshold_gate.py`
- `gate(results, max_distance)` pure fn, stdlib only. Inclusive boundary (<=). 7 unit tests.
- Commit: `37dd6956` | sandbox: 7/7 GREEN | pytest: 58/58

**P2-B2 — top-k-selector:**
- Files: `domain/primitive/top_k_selector/` (pkg + 3 scenarios) + `__tests__/unit/test_top_k_selector.py`
- `select_top_k(results, k)` + `select` alias for sandbox runner. k<=0 -> [], k>len -> all.
- Commit: `dd26b146` | sandbox: 10/10 GREEN | pytest: 65/65

**P2-B3 — context-window-packer:**
- Files: `domain/primitive/context_window_packer/` (pkg + 3 scenarios) + `__tests__/unit/test_context_window_packer.py` + `application/usecases.py` (migration)
- `pack(title, content, source, max_chars)` pure fn. `_build_embedding_text` removed from usecases.py, replaced by `_pack_context()` import. Field order preserved for vector compatibility.
- GOTCHA: changing field order in embedding text shifts FakeEmbedder seed → integration test distance 2.037 vs 2.0 threshold. Fixed by passing ordered_parts as content with title="".
- Commit: `696572b3` | sandbox: 13/13 GREEN | pytest: 72/72

**P2-B4 — temporal-decay-scorer (R-2 CRITICAL):**
- Files: `domain/primitive/temporal_decay_scorer/` (pkg + 3 scenarios) + `__tests__/unit/test_temporal_decay_scorer.py` + `domain/services.py` (migration)
- `score(similarity, created_at_iso, half_life_days, now=None, now_iso=None)` pure fn. `now_iso` param for JSON scenario injection. Future dates -> age=0. Invalid dates -> 0.0.
- `domain/services.py`: `compute_recency_score` kept as shim (delegates to primitive), `apply_temporal_decay` kept as wrapper. All tests preserved.
- Commit: `0324ba1b` | sandbox: 16/16 GREEN (5 primitives + mock_adder) | pytest: 79/79

**Final G12 DoD (cumulative):**
- primitive tier --scenario=all: 16/16 PASS
- module tier --scenario=all: 1/1 PASS
- env audit: empty (no forbidden keys)
- Fence-A: all 4 new primitives stdlib-only (comments only match in grep)
- pilot-status: P2-B1/B2/B3/B4 all DONE with commit SHAs

**Zone health:** 79/79 tests GREEN, 16/16 primitive scenarios GREEN, module GREEN. 4 primitives extracted, 2 service migrations done (usecases.py, services.py). Next: P2-C (module-full: wire all 5 primitives via ports).

---

### 2026-05-24 — TASKS P2-C → P2-D → P2-E (SCALE pilot Phase 2)

**P2-C — G2 module-full: wire all 5 primitives into retrieval module via ports**

- `domain/module/retrieval/module.py`: replaced all Phase 1 stubs with real imports of all 5 domain primitives. Pipeline: `context_window_packer` → `similarity_scorer` → `relevance_threshold_gate` → `temporal_decay_scorer` → `top_k_selector`. Removed `_compute_recency_score_inline` stub. `now` injection preserved through to temporal_decay_scorer.
- `module_golden.json`: updated to 2-doc scenario per AC spec (doc-1 distance=0.3 passes filter, doc-2 distance=0.9 fails max_distance=0.5). Expected: `top_k_ids: ["doc-1"]`.
- `module_edge_no_results.json`: NEW — both results beyond threshold → `top_k_ids: []`.
- `test_retrieval_module.py`: +2 tests — end-to-end all-5-primitives pipeline + now-injection determinism.
- Fence-B: grep returns 0 real infra imports (only comments/docstrings matched).
- AC-2: 5 `from domain.primitive.*` import lines confirmed.
- Sandbox: 16/16 primitive GREEN + 2/2 module GREEN. pytest: 81/81.
- Commit: `dc0c28f9`

**P2-D — G3 composition-root verify: main.py ≤80 lines**

- `main.py`: trimmed 113L → 74L. Extracted lifespan + CORS middleware to `app_factory.py`. Pure wiring only: config, DI bindings, FastAPI creation, uvicorn run.
- `app_factory.py`: NEW — `build_lifespan()` + `add_cors_middleware()`.
- `interface/openapi.json`: NEW — HTTP contract for /health, /search, /index (accurate from serializers.py + handlers.py inspection).
- AC-1: `wc -l main.py` = 74. AC-2 grep: exit 1 (no business logic). AC-3: port 5002 in docstring + cfg.port.
- Sandbox: 16/16 + 2/2 GREEN. pytest: 81/81.
- Commit: `82f5a112`
- NOTE: pilot-status commit `0a4d2d84` contaminated with `apps/kinh-dich-service/dashboard/index.html` (concurrent agent had already staged it). Content is correct (language comment Go update). Not reverted — data is valid.

**P2-E — G6 dashboard-full: all 5 primitive cards + module + microservice**

- `dashboard/index.html`: added 4 new primitive inline traces (relevance-threshold-gate, top-k-selector, context-window-packer, temporal-decay-scorer). Updated module traceId to `trace-module-full-golden` (P2-C full pipeline). PRIMITIVE_CARDS all 5 wired. Phase badge updated to "Phase 2". SI-2 disavowal preserved.
- `dashboard/dash-check.py`: 24/24 PASS (was 17/17). All 5 primitive traces verified GREEN. Module-full trace verified GREEN. Microservice NOT-RUN (honest). Zero external URLs. No port-5002 fetch.
- `dashboard/traces/`: 5 new trace files generated from sandbox golden runs.
- dash-check: 24/24 PASS. Sandbox: 16/16 + 2/2 GREEN. pytest: 81/81.
- Commit: `95f9f539`

**Final zone health:** 81/81 tests GREEN, 16/16 primitive scenarios GREEN, 2/2 module scenarios GREEN, 24/24 dash-check PASS, env audit empty. main.py 74L. All 5 primitives wired in module. Dashboard full Phase 2. Next: P2-G7 (G7 env-audit hard gate + edit-JSON-rerun).

---

### 2026-05-24 — TASKS P2-G7 + P2-A dev-side (SCALE pilot Phase 2)

**P2-G7 — G7 env-audit HARD gate + edit-JSON-and-rerun proof**

- `sandbox/__main__.py`: upgraded env-audit from WARN-only (Phase 1) to HARD FAIL. If any forbidden credential env var present → exits 1 immediately, no scenarios run.
- `_FORBIDDEN_ENV_REGEX`: anchored regex constant covering DB_PATH/DB_*/LANCEDB_*/HF_TOKEN/HUGGINGFACE_*/OPENAI_API_KEY/EMBEDDING_MODEL/DATABASE_URL/API_KEY/SECRET/TOKEN/PASSWORD families.
- `_ENV_ALLOWLIST = {"HF_HUB_OFFLINE"}`: R-5 safety flag preserved — NOT blocked. CTX_ADVISOR_* also unblocked (not credentials).
- `_collect_scenario_files`: added `known_bad_` prefix to exclusion filter (prep for G8 known-bad artefacts).
- `sandbox/README.md`: documented hard-fail gate, forbidden key list, proof commands, edit-rerun cycle, known-bad naming.
- Edit-JSON-rerun proof: `similarity_scorer/golden.json` distance changed 0.5→0.7 (similarity 0.6667→0.5882), then reverted. Dashboard trace regenerated, dash-check 25/25 PASS (was 24).
- Proofs: (a) clean env → EXIT:0 16/16 GREEN; (b) `LANCEDB_PATH=/tmp/x` → EXIT:1 "[SANDBOX ERROR] Forbidden credential env vars detected: ['LANCEDB_PATH']"; (c) `HF_HUB_OFFLINE=1` → EXIT:0 16/16 GREEN.
- Commit: `fd775e55` | sandbox: 16/16+2/2 GREEN | pytest: 81/81 | env audit: empty | dash-check: 25/25

**P2-A dev-side — G4 import-linter fence infrastructure**

- `apps/rag-service/.importlinter`: 3 contracts (INI format):
  - `fence-c-layered-ddd`: layers type, order interface>application>domain
  - `fence-a-primitive-independence`: independence type, 5 primitives mutual independence
  - `fence-b-retrieval-no-infra`: forbidden type, domain.module.retrieval cannot import infrastructure
- `apps/rag-service/domain/primitive/__init__.py`: created (was missing — import-linter needs proper Python packages to traverse)
- `apps/rag-service/pyproject.toml`: `import-linter>=2.11` added to dev extras; `[tool.importlinter]` section mirrors contracts
- `.github/workflows/rag-service-py-lint.yml`: CI job, working-directory=apps/rag-service, runs lint-imports
- `rag-pre-ci` tag: `c061a740` (created before P2-A commit per protocol)
- lint-imports: `Contracts: 3 kept, 0 broken` EXIT:0. 32 files analyzed, 19 dependencies.
- Status: IN-PROGRESS (dev-fence-built). Awaiting QA for violation proof (AC-4/AC-8 co-sign).
- Commit: `8a410685` | sandbox: 16/16+2/2 GREEN | pytest: 81/81 | env audit: empty

**Final zone health (P2-G7+P2-A cycle):** 81/81 tests GREEN, 16/16+2/2 sandbox GREEN, 25/25 dash-check PASS, env audit empty. Fence: 3 contracts KEPT. Next: QA does P2-A violation proof + P2-G8 deliberate-break proof.

---

### 2026-05-24 — TASK P2-J (G10 AI-fixability blind fix — SCALE pilot)

**Bug injected at commit `12d2381c`:** `results[k:]` (tail slice) in `top_k_selector.py` line 30. Should be `results[:k]` (head slice). Returning items AFTER first k instead of first k items.

**Diagnosis path:** sandbox primitive tier immediately showed 3 `top_k_selector` failures. All 3 scenarios returned empty or tail-only results. Single source read confirmed the inversion.

**Fix:** `results[k:]` → `results[:k]` in `domain/primitive/top_k_selector/top_k_selector.py` line 30.

**Coupled repair:** Dashboard inline traces in `index.html` and `.json` trace files were captured from the bugged run — regenerated both `top_k_selector_golden.json` and `module_full_golden.json` via `--output` flag, then updated inline `<script type="application/json">` blocks in `index.html`.

**Commit:** `695947d6` | Cycle count: **1** (single commit, full GREEN)

**G12 DoD (P2-J):**
- primitive tier: 16/16 GREEN
- module tier: 2/2 GREEN (coupled scenario also GREEN — root cause fixed)
- pytest: 81/81 (unchanged count)
- dash-check: 24/24 PASS, exit 0
- env-audit: empty
