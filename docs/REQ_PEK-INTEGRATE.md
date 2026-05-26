# REQ_PEK-INTEGRATE — Re-engine apps/pdf-extractor on PDF-Extract-Kit (CPU-only, 8GB-safe)

**Sprint:** PEK-INTEGRATE | **BA Agent:** ba | **Created:** 2026-05-26T21:00Z
**Source vision:** `docs/SPRINT_GOAL.md § Sprint PEK-INTEGRATE`
**Handoff doc:** `docs/handoffs/TASK_PEK-INTEGRATE.md`
**Gate:** PO must approve this spec BEFORE architect begins PEK-DESIGN. Architect (PEK-DESIGN) is BLOCKED until PO approval is received.

---

## Purpose

Decompose Sprint PEK-INTEGRATE into atomic, testable requirements with DDD layer mapping. No architecture proposals. No solutioning. Pure scope-pinning, acceptance-criteria anchoring, and blocker identification.

The four decisions (a)-(d) in the sprint goal are NOT pre-decided here — they are flagged as **architect-deferred** and will be resolved in PEK-DESIGN with explicit RAM numbers. Each decision block below names what the architect must decide and why BA cannot pre-answer it.

---

## Context Snapshot (PO-verified ground truth — do NOT re-derive)

- **Pristine clone:** `apps/pdf-extractor/PDF-Extract-Kit` — 89MB, depth-1, retains its own `.git`. ZERO lines may be modified. Treat as a published library.
- **Known-broken path being replaced:** `text_table_extractor.py` / `generic_md_table_extractor.py` / `ocr_adapter.py` OCR column-guessing path. Live evidence: 94 junk rows + 44 orphan values of 150 stored rows (BCTC-TABLE-3 REOPENED 2026-05-25).
- **`requirements-cpu.txt` is NOT 8GB-safe as-is:** still pulls `unimernet==0.2.1` (~1.4GB, OUT of scope) + `struct-eqtable` (InternVL2-1B VLM, ~2GB+ on CPU). Architect must trim further than the stock CPU file.
- **`configs/table_parsing.yaml` defaults to StructEqTable** (InternVL2-1B VLM, `output_format: latex`) — the single biggest RAM risk on a CPU-only 8GB-capped host.
- **Current Dockerfile does `COPY . .`** and `.dockerignore` does NOT exclude `PDF-Extract-Kit/` — naive build copies the 89MB pristine repo + its `.git` into the image. Decision (c) must fix this.
- **LF-OVERLAY contract preserved:** PDF-Extract-Kit's layout-detection output (bounding boxes per zone) feeds the SAME `bctc_page_zones` / `bctc_layout_units` overlay contract from `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md` §3. Architect REUSES this contract; does NOT reinvent it.
- **Structured path stays untouched:** `text_table_extractor.py` / `bctc_table_rows` remains 0-byte-diff, the SSOT for analyzable figures.

---

## REQ-PEK-0 — Pristine-Engine Invariant (Hard Constraint — Applies to Every Task)

**DDD Layer:** Infrastructure (dependency management policy)
**Priority:** CRITICAL — a blocking violation if broken at any point

### Goal statement

PDF-Extract-Kit is a published upstream library cloned PRISTINE at `apps/pdf-extractor/PDF-Extract-Kit`. No agent, no dev task, no automated script may modify a single file inside that subtree. The engine is consumed as-is — configured from outside, never patched from inside. This invariant must be provably verifiable at QA time.

### Testable acceptance criteria

- [ ] **AC-PEK-0a (git-diff proof at QA time):** `git -C apps/pdf-extractor/PDF-Extract-Kit diff` returns empty output. The subtree's own `.git` shows zero local modifications — no staged changes, no unstaged changes, no untracked files that shadow upstream files.
- [ ] **AC-PEK-0b (zero internal edits in commit history):** `git -C apps/pdf-extractor/PDF-Extract-Kit log --oneline` shows only the original upstream commits — no local commit was ever made to that subtree.
- [ ] **AC-PEK-0c (grep-proof of edit path):** `find apps/pdf-extractor/PDF-Extract-Kit -newer apps/pdf-extractor/PDF-Extract-Kit/.git/HEAD -name "*.py" -o -name "*.yaml"` returns empty output (no source or config file was modified after the clone).

---

## REQ-PEK-1 — Trimmed Task Set and Model Pick (Architect-Deferred: Decision a)

**DDD Layer:** Infrastructure (dependency configuration, model selection)
**Priority:** CRITICAL — the primary RAM risk and 8GB-safety gate

### Goal statement

PDF-Extract-Kit supports five task modules: `layout_detection`, `table_parsing`, `ocr`, `formula_detection`, and `formula_recognition`. For BCTC financial-statement table extraction, formula modules are OUT OF SCOPE (financial tables contain numbers, not mathematical formulae; UniMERNet ~1.4GB is the heaviest model and is not needed). Only three modules are RECOMMENDED by the sprint goal: `layout_detection` + `table_parsing` + `ocr`. Additionally, `configs/table_parsing.yaml` currently defaults to the StructEqTable model (InternVL2-1B VLM, ~2GB+ RAM on CPU) — but PDF-Extract-Kit also offers a lighter alternative: `PaddleOCR + TableMaster` (CNN-based, smaller footprint). The architect must pick the table model with an explicit RAM budget before dev starts.

**BA does NOT pre-decide which model or whether formula modules can be silently dropped — those choices carry RAM consequences the architect must quantify.**

### Testable acceptance criteria

- [ ] **AC-PEK-1a (formula modules absent at runtime):** After deployment, `configs/formula_detection.yaml` and `configs/formula_recognition.yaml` are NOT loaded by the running service. No import or initialisation of `unimernet` appears in any Python import trace at container startup.
- [ ] **AC-PEK-1b (trimmed requirements file):** The `requirements` file used by the pdf-extractor Dockerfile does NOT include `unimernet` as a dependency. `pip show unimernet` inside the running container returns "not found" or equivalent.
- [ ] **AC-PEK-1c (table model explicitly configured):** The `configs/table_parsing.yaml` (or the override mechanism chosen by the architect) explicitly names the table-recognition model chosen for this deployment. The chosen model name is documented in the architect brief with its RAM budget figure.
- [ ] **AC-PEK-1d (layout + table + ocr modules operational):** A single-doc test extraction via the FastAPI `/api` endpoint exercises all three retained modules — layout detection produces bounding boxes, table parsing produces row data, OCR produces text — without a runtime error or missing-module exception.

### Architect-deferred (Decision a)

The architect must specify in PEK-DESIGN, each with a RAM number:
- Which table-recognition model to use: `PaddleOCR+TableMaster` (lighter CNN) vs `StructEqTable` (InternVL2-1B VLM). Model resident-set size at inference must be stated.
- Whether any other modules beyond the three named must be included or excluded.
- The trimmed `requirements` file name or patch strategy (e.g. a new `requirements-pek.txt` vs an edited copy).

---

## REQ-PEK-2 — CPU-Only, 8GB-Safe Memory Budget (Architect-Deferred: Decision a + b)

**DDD Layer:** Infrastructure (runtime configuration, process topology)
**Priority:** CRITICAL — the kernel-panic history makes this a safety constraint, not a performance target

### Goal statement

This host is a 16GB Apple-Silicon Mac with NO NVIDIA GPU and a history of kernel-panic (watchdog timeout) under swap exhaustion. Docker fleet is hard-capped at 8GB total (enforced 2026-05-25). The pdf-extractor container plus ALL models it loads must fit within its portion of that 8GB cap while the rest of the fleet (mcp-server, api-gateway, stock-price, TA, macro-indicators, kinh-dich, alert-engine, rag-service, news-fetch, frontend) is also running.

Running GPU-targeting packages (`paddlepaddle-gpu`, `lmdeploy`) on this host is not only unnecessary — it will fail at import time on a CUDA-free Apple-Silicon host.

### Testable acceptance criteria

- [ ] **AC-PEK-2a (no GPU packages installed):** `pip show paddlepaddle-gpu lmdeploy` inside the running container returns "not found" for both. The container starts without CUDA-related import errors.
- [ ] **AC-PEK-2b (resident RSS under load):** ops captures the resident set size of the pdf-extractor container process during a real single-doc extraction (not idle — models loaded) with the full fleet running simultaneously. The measured RSS must be below the per-container ceiling specified in the architect brief. This is verified by ops at PEK-DEPLOY time and reported in the QA artefact.
- [ ] **AC-PEK-2c (no kernel panic during verification):** The full fleet runs continuously during the single-doc extraction test. No kernel panic, no watchdog timeout, no OOM-kill event on the host during or after the verification run.
- [ ] **AC-PEK-2d (CPU-path only):** No CUDA or Metal device is queried at model-load time. Models run on CPU only. Verified by the absence of CUDA/MPS device-initialisation log lines at container startup.

### Architect-deferred (Decision a + b)

The architect must specify in PEK-DESIGN:
- Explicit per-option RAM budget table: model resident set + inference peak + FastAPI base + concurrent-fleet headroom, vs the 8GB hard ceiling.
- Whether in-process (always-on, model resident in the shared container) or on-demand worker container (spun per-job, higher transient ceiling, torn down after) is the safer topology given the kernel-panic history. Each option must include its own RAM budget.
- The per-container RSS cap value that ops will enforce and measure.

---

## REQ-PEK-3 — Docker Build Hygiene (Architect-Deferred: Decision c)

**DDD Layer:** Infrastructure (build configuration, image management)
**Priority:** HIGH — current state WILL bloat the image if unchanged; also a correctness concern (pristine subtree must not be modified by build steps)

### Goal statement

The current `apps/pdf-extractor/Dockerfile` runs `COPY . .` and `apps/pdf-extractor/.dockerignore` does NOT exclude `PDF-Extract-Kit/`. If unchanged, a Docker build copies the entire 89MB pristine repo (including its `.git` history) into the image layer — bloating the image and potentially masking the pristine-invariant check. Additionally, multi-GB model weights must NOT be baked into the image layer — they must be cached at a location that persists across rebuilds so they are downloaded once, not per-build or per-run.

### Testable acceptance criteria

- [ ] **AC-PEK-3a (PDF-Extract-Kit excluded from image layer):** After `docker compose build pdf-extractor`, `docker run --rm <built-image> ls /app/PDF-Extract-Kit` returns "No such file or directory" (or equivalent) — the pristine subtree source tree is NOT present inside the built image. The engine is consumed via the mechanism chosen by the architect (pip-from-path, submodule, or other — architect decides).
- [ ] **AC-PEK-3b (model weights NOT baked into image):** The built image size does not include multi-GB model weight files. `docker image inspect <built-image>` confirms image size is within reason (architect specifies the bound). Model weights are stored in the location specified by the architect (named volume, runtime cache dir, or other) and are NOT re-downloaded on every container start after the first download.
- [ ] **AC-PEK-3c (build succeeds cleanly):** `docker compose build pdf-extractor` exits 0 with no warnings about missing `.dockerignore` entries. The build does not copy `.git` of the pristine subtree into the image.
- [ ] **AC-PEK-3d (.gitignore hygiene):** `apps/pdf-extractor/.gitignore` is updated (if necessary) so that the model-weight cache directory (wherever the architect places it) is NOT accidentally committed to the repo. `git status` after a weight-download shows no new untracked weight files staged for commit.
- [ ] **AC-PEK-3e (weight-cache survives rebuild):** After a `docker compose build pdf-extractor && docker compose up -d --no-deps --force-recreate pdf-extractor`, the model weights do NOT need to be re-downloaded if they were already present in the cache location. The first extraction after rebuild does not trigger a weight-download HTTP request.

### Architect-deferred (Decision c)

The architect must specify in PEK-DESIGN:
- Clone embedding strategy: git submodule vs vendored+gitignored vs pip-install-from-path — and the Docker-build implication for each.
- Exact `.dockerignore` and `.gitignore` entries required.
- Where model weights live at runtime (named Docker volume? host bind-mount? container-local cache dir?), how they are downloaded on first use, and how the cache location is configured.

---

## REQ-PEK-4 — Lazy Model Loading and Per-Process RSS Caps (Architect-Deferred: Decision d)

**DDD Layer:** Application (model lifecycle management) + Infrastructure (process configuration)
**Priority:** HIGH — always-resident multi-GB models in the shared container is the highest RAM risk scenario

### Goal statement

PDF-Extract-Kit models (layout detection, table parsing, OCR) must NOT be loaded at container boot time. They load on first use (lazy init) so the container starts fast and allocates RAM only when an extraction is actually requested. Additionally, an explicit per-process RSS cap must be enforced so a runaway inference job cannot exhaust swap and trigger a kernel panic on the host.

### Testable acceptance criteria

- [ ] **AC-PEK-4a (cold-start RAM baseline):** Immediately after container start (before any extraction request), the container's RSS is below the idle baseline specified in the architect brief. No model weight is loaded at boot. `docker stats pdf-extractor` at cold-start shows RSS at FastAPI-base level only.
- [ ] **AC-PEK-4b (model loads on first request):** The first extraction request causes model weights to load. Subsequent requests within the same process reuse the already-loaded models (no reload per request). This is verifiable by logging or by comparing container RSS before and after the first request.
- [ ] **AC-PEK-4c (per-process RSS cap enforced):** The container runs with an RSS cap (e.g. Docker `--memory` flag or cgroup limit) at the value specified in the architect brief. If inference exceeds that cap, the process is killed (OOM) rather than pushing to swap. This prevents the host swap-exhaustion / kernel-panic failure mode.
- [ ] **AC-PEK-4d (sequential extraction enforced):** The FastAPI interface accepts one extraction job at a time. Concurrent extraction requests are queued or rejected — never processed in parallel. This prevents two simultaneous model-inference instances from doubling the RAM footprint.

### Architect-deferred (Decision d)

The architect must specify in PEK-DESIGN:
- The exact lazy-load initialisation pattern (singleton guard, FastAPI lifespan event, or on-demand per-request factory).
- The per-process RSS cap value to enforce.
- How queuing or rejection of concurrent requests is implemented at the FastAPI layer.

---

## REQ-PEK-5 — FastAPI /api PULL Contract Preservation

**DDD Layer:** Interface (FastAPI routes) + Application (extraction orchestration)
**Priority:** CRITICAL — mcp-server depends on this contract; breaking it disconnects the entire BCTC analysis pipeline

### Goal statement

The existing FastAPI `/api` endpoints that mcp-server calls to pull BCTC extractions must continue to work after the engine swap. The endpoint contracts (paths, HTTP methods, request/response schemas) must be preserved without modification. mcp-server must be able to pull extractions end-to-end (push from VPS → pdf-extractor processes → mcp-server pulls result) without any change to the mcp-server calling code.

### Testable acceptance criteria

- [ ] **AC-PEK-5a (endpoint paths unchanged):** Every FastAPI route path that existed before PEK-IMPL is present and returns HTTP 200 for valid requests after PEK-DEPLOY. No previously-working route returns 404 or 405.
- [ ] **AC-PEK-5b (response schema unchanged):** The JSON response schema for each existing endpoint is unchanged. mcp-server can deserialise responses from the new engine using the same parsing code it used before. Verified by running the existing mcp-server integration tests against the redeployed pdf-extractor service.
- [ ] **AC-PEK-5c (end-to-end PULL verified):** mcp-server successfully pulls an extraction result from pdf-extractor via the existing PULL pipeline (the `reference_pdf_ocr_vps_architecture` path) after PEK-DEPLOY. The result is stored in market.db. Verified by QA via direct market.db query — not the endpoint alone.
- [ ] **AC-PEK-5d (push endpoint intact):** The inbound push endpoint (pdf-extractor receives a new PDF from the VPS scraper) continues to accept POSTs and trigger the new engine extraction. The VPS→pdf-extractor push path is not broken.

---

## REQ-PEK-6 — Structured bctc_table_rows Path Non-Regression

**DDD Layer:** Infrastructure (existing structured extraction path — text_table_extractor.py)
**Priority:** CRITICAL — regression here breaks the financial-analysis pipeline

### Goal statement

The structured `bctc_table_rows` path produced by `text_table_extractor.py` is the SSOT for analyzable financial figures (net revenue, gross profit, total assets, equity). This path is CLOSED, proven, and must not be modified. PEK-INTEGRATE AUGMENTS the extraction path by replacing the broken generic column-guesser; it does NOT replace or touch the proven structured balance-sheet path. The architect decides in the brief whether the PEK engine replaces or wraps the hand-built tiers — but in either case, `text_table_extractor.py` receives zero edits unless the architect explicitly plans a migration (which must include a no-regression guarantee).

### Testable acceptance criteria

- [ ] **AC-PEK-6a (0-byte-diff on text_table_extractor.py):** `git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py` produces empty output at PEK-QA time, unless the architect brief explicitly specifies a migration plan with a non-regression guarantee.
- [ ] **AC-PEK-6b (balance check non-regression):** `balance_pass=true` for FPT Q4 2025 (report_id `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`) in `bctc_table_rows` remains true after PEK-DEPLOY. Verified via direct market.db query (`docker compose exec -T mcp-server bun -e` + `require("bun:sqlite")`).
- [ ] **AC-PEK-6c (bctc_table_rows write path not overwritten):** No write from the PEK engine path writes to the `bctc_table_rows` table without an explicit architect-designed migration plan. The two paths must not overwrite each other's rows.
- [ ] **AC-PEK-6d (1954c write-chain non-collision):** The 1954c consolidated write chain (mcp-server as sole market.db write-owner) is unaffected. The new engine extraction results flow through the same consolidated write chain or a clearly-bounded new path — not a parallel unconstrained write.

---

## REQ-PEK-7 — Live BCTC Rows Quality Gate (Scale-Pilot Done-Bar)

**DDD Layer:** Domain (extraction correctness rules) + Application (quality gate)
**Priority:** CRITICAL — the primary success metric of the sprint; 5 prior false-greens on this surface

### Goal statement

The end-goal of replacing the broken column-guesser with PDF-Extract-Kit is to produce CLEAN BCTC rows across the multi-doc corpus. The current state (94 junk rows + 44 orphan values of 150, BCTC-TABLE-3) is the before-state. The after-state must show clean rows verified by DIRECT market.db query. The endpoint is explicitly NOT the arbiter because it may be stale. NOT-RUN panels are not green.

"Clean" means: no rows with null code AND null label (junk rows); no rows with a value but no label (orphan values); code field populated for every coded financial-statement line; all coded lines in the structured path still present and reconciled.

### Testable acceptance criteria

- [ ] **AC-PEK-7a (zero junk rows in corpus):** After PEK-DEPLOY and re-extraction of the multi-doc corpus (strictly sequential, one doc at a time), a direct market.db query via `docker compose exec -T mcp-server bun -e` + `require("bun:sqlite")` returns zero rows where `code IS NULL AND label IS NULL` for any document in the validation corpus.
- [ ] **AC-PEK-7b (zero orphan values in corpus):** Same direct query returns zero rows where `label IS NULL OR label = ''` AND at least one value column is non-null, for any document in the validation corpus.
- [ ] **AC-PEK-7c (measured corpus pass-rate emitted):** QA emits a structured report (`qa-pek-integrate-<UTC>.json`) that includes: total docs processed, docs with clean rows (meeting AC-PEK-7a + 7b), docs with remaining issues, and per-doc row counts. A single-doc pass is NOT accepted as the corpus gate.
- [ ] **AC-PEK-7d (direct market.db is the arbiter):** QA must NOT use the `/api/bctc-inspect` endpoint as the sole truth gate for row quality. The endpoint may be stale. All pass/fail decisions are made against direct in-container DB queries.
- [ ] **AC-PEK-7e (FPT Q4 2025 sentinels intact):** For report_id `e71f845d-ffa5-48f9-8f09-30ac2cd09c65` (FPT Q4 2025), the existing verified sentinel values are present and unmodified: code 270 = 88089621779862, code 300 = 44338155487272, code 400 = 43751466292590, code 440 = 88089621779862. This proves the structured path was not regressed.

### Validation corpus (binding)

The following 18 documents in `market.db`.`pdf_extracted_text` form the mandatory validation corpus. Exactly one (FPT Q4 2025, row id=11) ever ran the prior bbox engine — generalisation is UNPROVEN for the rest. Re-extraction is STRICTLY SEQUENTIAL single-doc; NEVER invoke `run_bctc_batch_sweep`.

| Sector | Tickers |
|--------|---------|
| Banks | VCB, ACB, EIB, SHB |
| Industrials | FPT, HPG, DGC, GAS, BSR |
| Pharma | DHG |
| Consumer | VNM |
| Real-estate | DIG |
| Other | VEA |

---

## REQ-PEK-8 — LF-OVERLAY Contract Reuse (Supersession Note for Architect)

**DDD Layer:** Interface (overlay rendering contract) + Infrastructure (zone-geometry storage)
**Priority:** HIGH — this is a preservation requirement; the overlay work is NOT wasted

### Goal statement

Sprint BCTC-LAYOUT-FIRST defined an engine-agnostic overlay contract in `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md` §3: `bctc_page_zones` / `bctc_layout_units` tables + the `POST /api/push-bctc-layout` handler + the ON/OFF toggle on `/api/bctc-inspect`. PDF-Extract-Kit's layout-detection output (bounding boxes per zone type) is structurally compatible with this contract — it produces per-zone bounding boxes that can populate `bctc_page_zones` directly. The architect must REUSE this contract rather than reinventing a parallel overlay mechanism.

BA cannot pre-decide HOW the PEK layout bboxes map to the LF-OVERLAY JSON schema — that is an architect-level contract decision. BA CAN state that the overlay contract must be reused and that PEK's output must be mapped to it.

### Testable acceptance criteria

- [ ] **AC-PEK-8a (overlay contract referenced in architect brief):** The PEK-DESIGN brief explicitly references the LF-OVERLAY contract from `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md` §3 and states whether it is adopted as-is or adapted (with the adaptation documented).
- [ ] **AC-PEK-8b (overlay renders ON/OFF on live bctc-inspect):** After PEK-DEPLOY, the `/api/bctc-inspect` ON/OFF toggle continues to function (if LF-OVERLAY was already deployed) or becomes available (if this is the first deployment). Toggling ON renders geometric zones from PDF-Extract-Kit's layout-detection output on the page image.
- [ ] **AC-PEK-8c (zone data sourced from PEK layout output):** The bounding boxes shown in the overlay originate from PDF-Extract-Kit's `DocLayout-YOLO` layout detection output — not from the prior hand-built Tier-1 projection-profile zoning. Verifiable by confirming the zone-geometry write path goes through the PEK extraction pipeline.
- [ ] **AC-PEK-8d (no duplicate overlay tables created):** The architect confirms that only ONE set of overlay tables (`bctc_page_zones` / `bctc_layout_units` or equivalent) is in market.db — not a new PEK-specific table duplicating the LF-OVERLAY schema.

### Architect-deferred (overlay reconciliation)

The architect must specify in PEK-DESIGN:
- Whether the PEK layout bbox schema maps directly to `bctc_page_zones` / `bctc_layout_units` or requires an adapter layer.
- Whether the `POST /api/push-bctc-layout` handler is reused as-is, extended, or replaced.
- If the overlay-render half genuinely requires mcp-server changes beyond what LF-OVERLAY already specified, the architect flips the zone to `multi` in the brief.

---

## REQ-PEK-9 — Privacy and Locality Guardrail

**DDD Layer:** Infrastructure (tool selection policy) + Application (execution mode)
**Priority:** CRITICAL — non-negotiable; violation is a blocking defect

### Goal statement

Financial PDFs and page-images MUST NEVER leave the local machine. PDF-Extract-Kit and all its models run FULLY ON-HOST — this is the primary reason it was selected over cloud-VLM alternatives. No extraction step calls any remote API, cloud OCR, cloud VLM, or any endpoint outside the local Docker network. This guardrail is carried forward from Sprint BCTC-LAYOUT-FIRST and is COMPATIBLE with PDF-Extract-Kit (local-only inference confirmed by the sprint goal).

The one permitted outbound call is the initial model-weight download from HuggingFace/ModelScope — but only during first setup. After the first download, weights are cached locally and no further outbound calls are made during extraction.

### Testable acceptance criteria

- [ ] **AC-PEK-9a (no off-machine calls during extraction):** During a real extraction run (after model weights are already cached), network monitoring shows zero outbound HTTP/HTTPS requests from the pdf-extractor container to any host outside the Docker network. Model inference is fully local.
- [ ] **AC-PEK-9b (grep-proof of extraction path):** `grep -rn "openai\|anthropic\|google\|textract\|document.ai\|cloud.vision\|gemini\|gpt\|azure.cognitive" apps/pdf-extractor/` returns zero matches in any production extraction code path (not in comments or test fixtures).
- [ ] **AC-PEK-9c (model weights cache confirmed local):** The model weights are stored in the location specified by the architect brief. The path is on a named Docker volume or host-mapped directory — not pulled from a remote endpoint at every container start.
- [ ] **AC-PEK-9d (sequential extraction mode):** NEVER invoke `run_bctc_batch_sweep` or any concurrent extraction batch during this sprint. Host kernel-panic risk. Sequential single-doc re-extraction only.

---

## REQ-PEK-10 — ops REBUILD (Not Restart) After Dev Change

**DDD Layer:** Infrastructure (deployment pipeline)
**Priority:** HIGH — a restart without rebuild relaunches the stale pre-PEK image; this is the root cause of prior deployment false-greens

### Goal statement

After PEK-IMPL ships new code to `apps/pdf-extractor/`, ops must rebuild the Docker image from source before the new engine is live. A `docker compose restart` or `docker compose up -d` without `--build` relaunches the stale image and silently runs the OLD (broken) engine. This must be explicitly verified at PEK-DEPLOY time.

### Testable acceptance criteria

- [ ] **AC-PEK-10a (build command used):** ops runs `docker compose build pdf-extractor` before `docker compose up -d --no-deps --force-recreate pdf-extractor`. The container running after deployment was built from repo HEAD, not from a cached stale layer.
- [ ] **AC-PEK-10b (image SHA matches HEAD):** After deployment, the running container's image SHA matches the SHA produced by the build from the current commit. If DRIFT-3-A2 `verify-deploy-sha.sh` is available, it is run and exits 0.
- [ ] **AC-PEK-10c (stale image not accepted as green):** QA explicitly confirms the running container was started from the rebuilt image — not from a prior image. A container that passes health-check but runs the old engine is a blocking false-green.

---

## Done-Bar (Scale-Pilot Bar — Do NOT Close Early)

The sprint is NOT done until ALL six conditions hold simultaneously. No partial green is accepted. The 5 prior false-greens on this surface mandate this bar.

1. **Live BCTC rows are CLEAN** across the multi-doc corpus (AC-PEK-7a through 7e) — measured by DIRECT market.db query, never the (stale-capable) endpoint; NOT-RUN panels are not green; measured corpus pass-rate, not one doc.
2. **Fleet within 8GB / NO kernel panic** under load — ops captures resident + peak RSS during a real single-doc extraction with the full fleet running (AC-PEK-2b, AC-PEK-2c).
3. **`/api` PULL contract unbroken** (mcp-server still pulls extractions end-to-end — AC-PEK-5a through 5d) and **`bctc_table_rows` unregressed** (AC-PEK-6a through 6d).
4. **ZERO lines of `PDF-Extract-Kit/` modified** — git-diff proof on the subtree's own `.git` (AC-PEK-0a through 0c).
5. **ops REBUILT** (not restarted) the pdf-extractor container after the dev change (AC-PEK-10a through 10c).
6. **USER verbal G9 sign-off.** Goal stays ARMED until the user says so.

---

## Non-Functional Requirements

- **NFR-PEK-1 (no batch sweep):** NEVER invoke `run_bctc_batch_sweep` or any concurrent extraction job during this sprint. Sequential single-doc only. Host kernel-panic risk.
- **NFR-PEK-2 (deploy discipline):** pdf-extractor builds from BUILD-CONTEXT (no source mount). `docker compose build pdf-extractor` then `up -d --no-deps --force-recreate`. A restart without rebuild relaunches the stale image.
- **NFR-PEK-3 (market.db query tool):** `sqlite3` is NOT installed in containers. Use `docker compose exec -T mcp-server bun -e 'const db = require("bun:sqlite"); ...'` for all direct DB queries.
- **NFR-PEK-4 (frozen surfaces — must NOT touch):** `apps/pdf-extractor/sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`, the pdf-extractor dashboard trust-contract (spec/png). The `/api/bctc-inspect` overlay IS in scope (carries forward from LF-OVERLAY, engine-agnostic).
- **NFR-PEK-5 (recurring-bug discipline):** The broken column-guessing path carries 9 MD-EXTRACT + 7 BT fix commits. PEK-DESIGN IS the architect root-cause rethink required by `feedback_recurring_bug_escalation.md`. No blind dev patches to the column-guesser. dev-pdf-extractor (PEK-IMPL) implements only the architect's blueprint.
- **NFR-PEK-6 (commit discipline):** Explicit-file staging only (`git add <path>`, never `-A` or `.`). No `--force`/`--no-verify`/`--no-gpg-sign`. No `git push` (user owns push). All work on `main`, no branches. Subagents leave files UNSTAGED; main terminal commits. Commit-mutex is uncallable by subagents.
- **NFR-PEK-7 (not a scale pilot):** PEK-INTEGRATE does NOT consume the WIP=2 fleet cap. Does NOT touch any `pilot-status-*.json`. But the DONE-BAR is the scale-pilot bar (per `feedback_scale_pilot_done_bar` memory) because it replaces a known-broken production path.

---

## DDD Layer Summary

| Requirement | Domain | Application | Infrastructure | Interface |
|-------------|--------|-------------|----------------|-----------|
| REQ-PEK-0 (pristine invariant) | — | — | Dependency management policy | — |
| REQ-PEK-1 (trimmed task set + model pick) | — | — | Dependency config, model selection | — |
| REQ-PEK-2 (CPU-only 8GB budget) | — | — | Runtime config, process topology | — |
| REQ-PEK-3 (Docker build hygiene) | — | — | Build config, image management | — |
| REQ-PEK-4 (lazy load + RSS caps) | — | Model lifecycle management | Process configuration | — |
| REQ-PEK-5 (/api contract preservation) | — | Extraction orchestration | — | FastAPI routes |
| REQ-PEK-6 (structured path non-regression) | — | — | text_table_extractor.py (0-byte-diff) | — |
| REQ-PEK-7 (live rows quality gate) | Extraction correctness rules | Quality gate orchestration | — | — |
| REQ-PEK-8 (LF-OVERLAY contract reuse) | — | — | Zone-geometry storage | Overlay rendering contract |
| REQ-PEK-9 (privacy + locality) | — | Execution mode (sequential) | Tool selection (local-only) | — |
| REQ-PEK-10 (ops REBUILD) | — | — | Deployment pipeline | — |

---

## Out of Scope

- `formula_detection` + `formula_recognition` modules (UniMERNet ~1.4GB — not needed for financial-statement tables)
- Any edit to files inside `apps/pdf-extractor/PDF-Extract-Kit/` (pristine upstream — read-only library)
- GPU variant / `paddlepaddle-gpu` / `lmdeploy` (impossible on this Apple-Silicon host without NVIDIA GPU)
- Cloud/off-machine OCR or VLM (privacy guardrail — local only)
- Batch backfill / `run_bctc_batch_sweep` (host kernel-panic risk — sequential single-doc only)
- mcp-server market.db write-path changes beyond the (preserved) LF-OVERLAY zone-render contract
- Any other frozen pilot surface: `sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`, dashboard trust-contract spec/png
- Sprint BCTC-LAYOUT-FIRST LF-EXTRACT / LF-DEPLOY / LF-QA (PAUSED pending PEK architect brief)
- Sprint BCTC-TABLE-2, MCPZONE-HARDEN-1, DEPLOY-DRIFT — remain separate

---

## Blockers for PO

None that block the architect from beginning PEK-DESIGN once PO approves this spec. All hard constraints are PO-resolved and user-co-authored. Pre-confirmed ground truth:

- **Pristine clone location:** `apps/pdf-extractor/PDF-Extract-Kit` — confirmed present (89MB, depth-1, own `.git`).
- **`requirements-cpu.txt` not 8GB-safe as-is:** confirmed — still includes `unimernet` + `struct-eqtable`. Architect trims further.
- **Recommended trimmed task set:** `layout_detection` + `table_parsing` + `ocr` ONLY. Skip formula modules. Architect picks table model.
- **Docker hygiene gap confirmed:** `COPY . .` + `.dockerignore` does NOT exclude `PDF-Extract-Kit/`. Decision (c) must fix.
- **LF-OVERLAY contract reusable:** confirmed engine-agnostic. Architect maps PEK bbox output to it.
- **Structured `bctc_table_rows` path:** confirmed 0-byte-diff required unless architect specifies migration plan.
- **Done-bar:** confirmed scale-pilot bar per `feedback_scale_pilot_done_bar`. 5 prior false-greens.

**Architect-open questions (for PEK-DESIGN only — architect resolves with RAM numbers, not PO):**

1. **Decision (a) — Table model pick:** `PaddleOCR+TableMaster` (lighter CNN) vs `StructEqTable` (InternVL2-1B VLM). Architect provides resident RSS + inference peak for each option against the 8GB ceiling.
2. **Decision (b) — Topology:** in-process always-on model vs on-demand worker container (torn down per-job). Each option must have an explicit RAM budget and a judgement on kernel-panic risk.
3. **Decision (c) — Clone embedding + Docker hygiene:** submodule vs vendored+gitignored vs pip-from-path; exact `.dockerignore` / `.gitignore` entries; model-weight cache location and lifecycle.
4. **Decision (d) — Lazy load + RSS caps:** initialisation pattern, per-process cap value, concurrent-request queuing/rejection mechanism.
5. **Overlay reconciliation:** how PEK's `DocLayout-YOLO` bbox schema maps to the `bctc_page_zones` / `bctc_layout_units` LF-OVERLAY contract; whether any mcp-server change is needed (and if so, zone flips to `multi`).

These are technical design questions — NOT PO-level blockers. Architect resolves them in PEK-DESIGN.
