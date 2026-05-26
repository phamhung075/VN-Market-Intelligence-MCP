# Handoff — Sprint PEK-INTEGRATE (Re-engine apps/pdf-extractor on PDF-Extract-Kit)

**Opened:** 2026-05-26T20:37Z by PO (explicit user directive, full autonomy).
**Goal SSOT:** `docs/SPRINT_GOAL.md § Sprint PEK-INTEGRATE`. Task board: `docs/TASKS.md § Sprint PEK-INTEGRATE`.
**Owner chain:** BA → architect (PEK-DESIGN, brief only) → dev-pdf-extractor (PEK-IMPL, sole code owner) → ops (PEK-DEPLOY, rebuild) → qa (PEK-QA) → PO (PEK-EXIT) → USER (verbal G9).
**Zone:** `apps/pdf-extractor/` (single-zone code) + `docs/architecture/microservice/pdf-extractor/`; architect → `docs/architecture-briefs/` only. Architect may flip to `multi` if the overlay-render half needs mcp-server.

---

## What this sprint is

Re-engine the BCTC table-extraction path of `apps/pdf-extractor` onto the published **PDF-Extract-Kit** (OpenDataLab) engine — used PRISTINE as a library, never edited. This REPLACES the known-broken `text_table_extractor.py`/`generic_md_table_extractor.py`/`ocr_adapter.py` column-guessing path with PDF-Extract-Kit's layout-aware table detection + recognition. CPU-only, on-host, within the 8GB Docker cap, FastAPI `/api` PULL contract preserved.

## PO-verified ground truth (do NOT re-derive — already checked against the filesystem)

- Clone present: `apps/pdf-extractor/PDF-Extract-Kit` — 89MB, depth-1, retains its OWN `.git`. PRISTINE. DO NOT re-clone. DO NOT modify a single line.
- `requirements-cpu.txt` content: `omegaconf, matplotlib, PyMuPDF, ultralytics>=8.2.85, doclayout-yolo==0.0.2, unimernet==0.2.1, paddlepaddle (CPU), paddleocr==2.7.3, struct-eqtable`. → STILL pulls `unimernet` (~1.4GB, OUT of scope) + `struct-eqtable` (the heavy table model). NOT 8GB-safe as-is — architect must trim further.
- `requirements.txt` (full/GPU): same + `paddlepaddle-gpu` + `lmdeploy`. NOT for this host.
- `configs/` present: `config.yaml, formula_detection.yaml, formula_recognition.yaml, layout_detection.yaml, layout_detection_layoutlmv3.yaml, layout_detection_yolo.yaml, ocr.yaml, table_parsing.yaml`.
- `configs/table_parsing.yaml` defaults to `table_parsing_struct_eqtable` (StructEqTable = InternVL2-1B VLM, `output_format: latex`, `lmdeploy: False`, `flash_atten: True`) — biggest RAM risk on a CPU/8GB host. PDF-Extract-Kit README lists a lighter alternative: `PaddleOCR+TableMaster`. Architect picks.
- Layout-detection model = `DocLayout-YOLO` (light). OCR = `PaddleOCR` (moderate).
- `apps/pdf-extractor/Dockerfile`: Ubuntu 24.04 base, installs tesseract+poppler+python3, `pip install -r requirements.txt`, then `COPY . .` → would copy the 89MB pristine repo + its `.git` into the image.
- `apps/pdf-extractor/.dockerignore`: excludes `__pycache__/ .venv/ data/ __tests__/ .git/` etc. — does NOT exclude `PDF-Extract-Kit/`. (c) decision must fix.
- `apps/pdf-extractor/.gitignore`: excludes `__pycache__/ .venv/ data/ dashboard/traces/` — does NOT mention `PDF-Extract-Kit/`.
- Existing service layout (DDD): `application/ domain/ infrastructure/ interface/ sandbox/ scenarios/ spike/ __tests__/`, `main.py`, `requirements.txt`. The extraction path lives in `infrastructure/` (`text_table_extractor.py`, `generic_md_table_extractor.py`, `ocr_adapter.py`).

## Hard constraints (gate the architecture — each needs a RAM number from the architect)

1. **CPU-only.** No NVIDIA GPU on this Apple-Silicon host. Drop `paddlepaddle-gpu`, `lmdeploy`, `unimernet`.
2. **8GB Docker cap = HARD ceiling.** Kernel-panic history (`project_host_memory_panic`). Architect: explicit per-option RAM budget (model RSS + inference peak + FastAPI base + concurrent-fleet headroom < 8GB).
3. **FastAPI `/api` PULL contract intact.** mcp-server pulls extractions (`reference_pdf_ocr_vps_architecture`). Don't break push/pull.

## Architect-deferred decisions (BA: flag these as architect's call, do NOT pre-decide)

- (a) Trimmed task set = `layout_detection` + `table_parsing` + `ocr` ONLY; SKIP formula_*. + table-model pick (TableMaster vs StructEqTable) w/ RAM budget.
- (b) In-process (always-on 8GB container) vs separate on-demand worker container (spun per-job, torn down).
- (c) Clone embedding (submodule / vendored+gitignored / pip-from-path) + Docker `.dockerignore`/`.gitignore` hygiene + model-weight cache location (named volume? baked layer? runtime cache dir? download-once).
- (d) Lazy model load (first-use, not boot) + per-process RSS caps.

## Supersession / reconciliation with Sprint BCTC-LAYOUT-FIRST

- PEK SUPERSEDES the in-house ENGINE (`LF-EXTRACT`). PEK PRESERVES the UX overlay (`LF-OVERLAY`) — engine-agnostic; PDF-Extract-Kit's layout bboxes feed the SAME `bctc_page_zones`/`bctc_layout_units` overlay contract from brief `2026-05-26-bctc-layout-first-pipeline.md` §3. Architect reuses that contract, does NOT reinvent it.
- `LF-EXTRACT`/`LF-DEPLOY`/`LF-QA` PAUSED pending PEK architect brief. `LF-OVERLAY` (if in flight) absorbed, not wasted.
- Structured `bctc_table_rows` (`text_table_extractor.py`, 0-byte-diff, SSOT for analyzable figures) UNTOUCHED + UNREGRESSED under both. Architect decides if PEK REPLACES or WRAPS the hand-built tiers, with a migration plan if it touches `bctc_table_rows`.
- Privacy guardrail (LOCAL-ONLY, no off-machine page images / cloud VLM) PRESERVED — PDF-Extract-Kit + models run fully on-host.

## DoD (scale-pilot bar — do NOT close early)

1. Live BCTC rows clean across multi-doc corpus via DIRECT market.db query (endpoint stale-capable, never arbiter; NOT-RUN ≠ green; measured corpus pass-rate).
2. Fleet within 8GB / NO kernel panic under load (ops captures resident + peak RSS during a real single-doc extraction with fleet running).
3. `/api` PULL unbroken + `bctc_table_rows` unregressed.
4. ZERO `PDF-Extract-Kit/` lines modified (git-diff proof on that subtree's own `.git`).
5. ops REBUILD (not restart) after dev change.
6. USER verbal G9.

---

## Appends (BA / architect append below)

---

### [BA] PEK-BA — Spec Complete 2026-05-26T21:00Z

**Spec file:** `docs/REQ_PEK-INTEGRATE.md`
**Status:** DONE — pending PO approval gate. Architect PEK-DESIGN remains BLOCKED until PO approves.

**Requirements summary (10 REQs, 35 ACs):**

| REQ | Name | DDD Layer | Priority |
|-----|------|-----------|----------|
| REQ-PEK-0 | Pristine-engine invariant (git-diff proof) | Infrastructure | CRITICAL |
| REQ-PEK-1 | Trimmed task set + model pick | Infrastructure | CRITICAL |
| REQ-PEK-2 | CPU-only / 8GB-safe memory budget | Infrastructure | CRITICAL |
| REQ-PEK-3 | Docker build hygiene (.dockerignore / weight cache) | Infrastructure | HIGH |
| REQ-PEK-4 | Lazy model load + per-process RSS caps | Application + Infrastructure | HIGH |
| REQ-PEK-5 | FastAPI /api PULL contract preservation | Interface + Application | CRITICAL |
| REQ-PEK-6 | Structured bctc_table_rows non-regression | Infrastructure | CRITICAL |
| REQ-PEK-7 | Live BCTC rows quality gate (scale-pilot done-bar) | Domain + Application | CRITICAL |
| REQ-PEK-8 | LF-OVERLAY contract reuse | Interface + Infrastructure | HIGH |
| REQ-PEK-9 | Privacy + locality guardrail | Infrastructure + Application | CRITICAL |
| REQ-PEK-10 | ops REBUILD (not restart) after dev change | Infrastructure | HIGH |

**Architect-deferred decisions (do NOT pre-decide — each needs a RAM number in PEK-DESIGN):**
- (a) Table model pick: `PaddleOCR+TableMaster` vs `StructEqTable` — resident RSS + inference peak for each
- (b) Topology: in-process always-on vs on-demand worker container — kernel-panic risk judgement per option
- (c) Clone embedding + Docker `.dockerignore` / `.gitignore` hygiene + model-weight cache location
- (d) Lazy-load initialisation pattern + per-process RSS cap value + concurrent-request queuing

**Blockers for PO:** None. All PO decisions pre-resolved. Ground truth confirmed. Architect questions are technical design decisions, not PO-level blockers.

**Frozen surfaces confirmed (not touched by this sprint):** `PDF-Extract-Kit/` (pristine, zero edits), `text_table_extractor.py` (0-byte-diff unless architect migration plan), `sandbox/runner.py`, `pilot-status-pdf-extractor.json`, dashboard trust-contract.

---

### [Architect] PEK-DESIGN — Design Complete 2026-05-26T21:00Z

**Brief:** `docs/architecture-briefs/2026-05-26-pek-integrate-design.md`
**Status:** DONE — PEK-IMPL UNBLOCKED for dev-pdf-extractor.

**Zone:** `apps/pdf-extractor/` (single-zone for code) + `docker-compose.yml` (env var Layer-1 schedule fix). No mcp-server code change required — LF-OVERLAY handler reused as-is.
**BUILD-STANDARD: lean**

#### Brownfield Findings

- **Zone:** `apps/pdf-extractor/`
- **Verified paths:**
  - `apps/pdf-extractor/application/extract_layout_first_usecase.py` — LF-EXTRACT orchestration shell (REUSE: replace internal injections with PEK adapter)
  - `apps/pdf-extractor/infrastructure/layout_first_push_client.py` — push client to `POST /api/push-bctc-layout` (REUSE unchanged)
  - `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — broken column-guesser (SUPERSEDED, kept as dead code per docstring rule)
  - `apps/pdf-extractor/infrastructure/text_table_extractor.py` — FROZEN, 0-byte-diff
  - `apps/pdf-extractor/main.py` — composition root (extend: swap `build_document_map_fn` / `zone_page_fn` / `ocr_unit_fn` injections for `PekEngineAdapter`)
  - `apps/pdf-extractor/PDF-Extract-Kit/pdf_extract_kit/tasks/table_parsing/models/struct_eqtable.py` — HARD-ASSERTS `torch.cuda.is_available()` — CATEGORICALLY EXCLUDED
  - `apps/pdf-extractor/PDF-Extract-Kit/pdf_extract_kit/tasks/table_parsing/models/` — only `struct_eqtable.py` present; NO TableMaster model class exists in this clone
  - `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts:isVnMarketHoursUtc()` — existing market-hours guard (MIRROR in Python for pdf-extractor)
  - `docker-compose.yml` — pdf-extractor `deploy.resources.limits.memory: 2.5g` (adequate; no change needed)

- **Reuse patterns:**
  - `LayoutFirstPushClient` + `POST /api/push-bctc-layout` + `bctc_layout_units` / `bctc_page_zones` schema — all reused from LF-OVERLAY brief §3; no reinvention
  - `isVnMarketHoursUtc` logic (Mon-Fri 02:00-08:59 UTC) — mirrored as `is_vn_market_open_utc()` in Python
  - `extract_layout_first_usecase.py` orchestration shell — reused; only the injected callables change

- **Design decisions (all 4 deferred decisions resolved):**
  - **(a) Trimmed task set + table model:** `layout_detection` (DocLayout-YOLO, ~250MB peak) + `ocr` (PaddleOCR PP-StructureV2 table mode, ~600-800MB peak). StructEqTable: GPU-only, impossible. TableMaster: not implemented in this clone. Table extraction via `paddleocr==2.7.3` PP-StructureV2 table pipeline directly (CPU-compatible). Formula modules excluded. Total pdf-extractor container peak RAM: ~1.3GB (well within 2.5GB cap and 8GB fleet total).
  - **(b) Topology:** ON-DEMAND batch, inside existing pdf-extractor container, lazy-load singleton + market-hours guard. No separate worker container needed. `docker-compose.yml` `memory: 2.5g` cap = OOM kill before swap exhaustion.
  - **(c) Clone embedding:** `pip install -e ./PDF-Extract-Kit` (editable install inside Dockerfile; source present in container, model weights excluded via `.dockerignore`). Model weights → named volume `pek_model_cache` at `/app/pek_models`. `.dockerignore`: add `PDF-Extract-Kit/.git/`, `PDF-Extract-Kit/models/`. `.gitignore`: add `pek_models/`, `PDF-Extract-Kit/models/`.
  - **(d) Lazy load + RSS caps:** module-level `_pek_models_cache` singleton; `threading.Semaphore(1)` for sequential execution; Docker `--memory 2.5g` enforces OOM kill; cold-start RSS = ~80MB.

- **Market-hours constraint (new hard constraint, two-layer enforcement):**
  - Layer 1 (schedule): `CRON_BCTC_REPARSE_JOB=0 21 * * *` env var in `docker-compose.yml` mcp-server env block (21:00 UTC = 04:00 ICT next day, deep off-market). No cron source code edit required.
  - Layer 2 (runtime): `POST /pek-extract` handler checks `is_vn_market_open_utc()` and returns HTTP 503 if market is open. No model loaded, no inference.
  - PO action required: append AC-PEK-NEW-1 and AC-PEK-NEW-2 to REQ-PEK-INTEGRATE (full text in brief §10).

- **Risk flags (CRITICAL):**
  - **R-CRIT-1:** AC-PEK-3a literal conflicts with editable install requirement. AC says `ls /app/PDF-Extract-Kit` = "No such file" — but editable install NEEDS source present. PO must amend AC-PEK-3a before PEK-IMPL starts. Recommended amendment: "model weights NOT baked in image (image size < 2GB); `.git/` of PEK excluded."
  - **R-CRIT-2:** TableMaster model not in pristine clone — table extraction uses PaddleOCR PP-StructureV2 directly. Not a PEK edit.
  - **R-CRIT-3:** Import guard in `pek_engine_adapter.py` must NEVER import `TableParsingTask` or `FormulaDetectionTask` — both fail on CPU.

- **Scan clean:** true (0-byte-diff surfaces confirmed, pristine clone confirmed, write-chain collision audit confirmed)
- **LF-OVERLAY zone:** **single** — no new mcp-server code. mcp-server overlay handler from LF-OVERLAY brief §3.2 is reused as-is (or implemented as part of PEK-IMPL if LF-OVERLAY is still PAUSED).

**Next:** PM decomposes PEK-IMPL into atomic tasks for dev-pdf-extractor. PM also includes the `docker-compose.yml` schedule fix (Layer-1 market-hours constraint) in scope. dev-pdf-extractor is the sole code implementer for the pdf-extractor zone.
