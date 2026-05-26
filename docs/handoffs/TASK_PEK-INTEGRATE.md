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
