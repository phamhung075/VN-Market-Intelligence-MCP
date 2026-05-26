# Architecture Brief — Sprint PEK-INTEGRATE: PDF-Extract-Kit Engine Integration

**Date:** 2026-05-26 | **Sprint:** PEK-INTEGRATE | **Author:** architect
**REQ source:** `docs/REQ_PEK-INTEGRATE.md` | **Handoff:** `docs/handoffs/TASK_PEK-INTEGRATE.md`
**Build standard:** lean (existing service zone; engine-wiring in `apps/pdf-extractor/`)
**Zone:** `apps/pdf-extractor/` — single-zone. LF-OVERLAY contract reuse: mcp-server side already designed and partially shipped (brief `2026-05-26-bctc-layout-first-pipeline.md` §3.1–§3.4). No new mcp-server changes required for the overlay. Zone stays **single**.

---

## 1. Brownfield Scan

### 1.1 Existing Service Layout

`apps/pdf-extractor/` has a functioning DDD structure already present:

```
application/
  extract_layout_first_usecase.py   ← LF-EXTRACT (Tier 0-3 in-house hand-built)
  extract_md_tables_usecase.py      ← old column-guesser path (superseded)
  extract_tables_usecase.py         ← structured bctc_table_rows path (0-byte-diff)
  usecases.py                       ← PDF ingestion
domain/
  models.py / repositories.py / services.py / errors.py
infrastructure/
  generic_md_table_extractor.py     ← broken column-guessing engine (supersession target)
  text_table_extractor.py           ← FROZEN, 0-byte-diff SSOT for bctc_table_rows
  layout_first_push_client.py       ← LF-EXTRACT push client (reusable)
  ocr_text_fetch_client.py          ← LF-EXTRACT OCR text fetcher (reusable)
  extraction_engine.py / ocr_adapter.py / alert_adapter.py / ...
interface/
  handlers.py                       ← route registration
main.py                             ← composition root
requirements.txt                    ← current (FastAPI, pdfplumber, pytesseract, …)
PDF-Extract-Kit/                    ← 89MB pristine upstream, own .git, ZERO edits
```

**Key finding:** `extract_layout_first_usecase.py` and `layout_first_push_client.py` already exist — they are the in-house Tier 0-3 hand-built pipeline from Sprint BCTC-LAYOUT-FIRST (LF-EXTRACT). PEK-INTEGRATE **replaces their internals** — the composition-root wiring in `main.py`, the use-case orchestration, and the push contract all remain reusable. The port `LayoutFirstPushClientPort` and the push endpoint `POST /api/push-bctc-layout` on mcp-server are already in `2026-05-26-bctc-layout-first-pipeline.md` §3.2 — they are **reused as-is**.

### 1.2 Zero-Collision Boundary (0-byte-diff surfaces)

- `apps/pdf-extractor/infrastructure/text_table_extractor.py` — FROZEN, 0-byte-diff.
- `apps/pdf-extractor/sandbox/runner.py` — FROZEN.
- `docs/data/pilot-status-pdf-extractor.json` — FROZEN.
- `apps/pdf-extractor/PDF-Extract-Kit/` — PRISTINE, zero edits (git-diff must return empty).
- `bctc_table_rows` table in market.db — no new rows, no schema modification.
- `bctc_balance_checks` table — not touched.
- `ExtractTablesUseCase` (structured path) — not touched.

### 1.3 Existing Infrastructure Reused

| Existing surface | Reuse role | Change needed |
|---|---|---|
| `infrastructure/layout_first_push_client.py` | Push client to `POST /api/push-bctc-layout` | None — contract unchanged |
| `infrastructure/ocr_text_fetch_client.py` | Fetch stored OCR pages from mcp-server | None |
| `application/extract_layout_first_usecase.py` | PEK orchestration shell (Tier 0→3) | Replace internal algorithm calls with PEK adapter |
| `interface/handlers.py` — `POST /extract-layout-first` | Trigger endpoint | None |
| `main.py` composition root | Wire new PEK adapter | Replace build_document_map / zone_page / ocr_unit injections |
| LF-OVERLAY contract (`bctc_page_zones` / `bctc_layout_units` + `POST /api/push-bctc-layout`) | Zone geometry storage for overlay | **Reused as-is.** PEK layout bboxes mapped through the same payload contract (see §4.1) |
| `isVnMarketHoursUtc` in mcp-server (TypeScript) | Market-hours guard reference implementation | Python mirror in pdf-extractor (see §5) |

### 1.4 Pristine-Engine API Surface (read-only, no edits)

PDF-Extract-Kit exposes three importable task classes via its `pdf_extract_kit.tasks` package:

- `LayoutDetectionTask` — wraps `LayoutDetectionYOLO` (DocLayout-YOLO, device=`'cpu'` configurable)
- `OCRTask` — wraps `PaddleOCR` model (CPU-only when `paddlepaddle` CPU build used)
- `TableParsingTask` — wraps **only** `TableParsingStructEqTable` (struct_eqtable.py) in this pristine clone. No TableMaster model class is present in the `tasks/table_parsing/models/` directory — only `struct_eqtable.py` exists, and it hard-asserts `torch.cuda.is_available()`. **StructEqTable cannot run CPU-only on this host.** See §2.1(d) for the resolution.

`load_task(name, cfg)` is the public entry point (from `pdf_extract_kit.tasks`). Config objects match the respective `.yaml` files in `PDF-Extract-Kit/configs/`.

The package is installed via `pip install -e ./PDF-Extract-Kit` (editable, no source copy) — see §2.3(c).

---

## 2. Four Deferred Decisions — Resolved

### 2.1 (a) Trimmed Task Set and Table Model

**Retained tasks:** `layout_detection` + `ocr` only.

**Table-parsing model decision: USE PaddleOCR table recognition (paddleocr `table` mode), NOT StructEqTable and NOT TableMaster.**

Rationale:

1. `struct_eqtable.py` in the pristine clone hard-asserts `torch.cuda.is_available()`. On this CPU-only Apple Silicon host that assertion fails at import time — StructEqTable is **categorically impossible** without violating the pristine-engine invariant (we would need to either patch the file or add a stub, both forbidden by REQ-PEK-0).

2. TableMaster (PaddleOCR+TableMaster) is described in the README but **no `table_master.py` model file exists** in `pdf_extract_kit/tasks/table_parsing/models/` — only `struct_eqtable.py` is present. The TableMaster path would require adding a new model class — which means modifying PDF-Extract-Kit source, violating REQ-PEK-0.

3. `PaddleOCR` (already used by the `OCRTask`) ships its own table-structure recognition mode (`paddleocr` `det_model_dir` + `rec_model_dir` + `table_model_dir`). This is the **PaddleOCR+TableMaster** path referenced in the README — it uses PaddleOCR's built-in PP-StructureV2 table recognition pipeline, which IS CPU-compatible. The `paddleocr==2.7.3` package from `requirements-cpu.txt` includes this capability.

**Decision: the table-extraction path uses `PaddleOCR` in `structure` mode (PP-StructureV2 table sub-pipeline) directly, invoked through a custom `PekTableAdapter` in `apps/pdf-extractor/infrastructure/pek_table_adapter.py`. This adapter is application code — it calls `PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False, show_log=False)` or the PP-Structure table call. This is NOT an edit to PDF-Extract-Kit — PaddleOCR is a standalone package (already in requirements-cpu.txt).**

Formula modules (`formula_detection`, `formula_recognition`, `unimernet`): **excluded entirely** from the trimmed requirements file.

**RAM budget for the trimmed task set (CPU-only, 8GB ceiling):**

| Component | Resident RSS (idle) | Resident RSS (loaded / inference peak) | Notes |
|---|---|---|---|
| FastAPI base + Python process | ~80 MB | ~100 MB | uvicorn, no models loaded |
| DocLayout-YOLO (layout_detection) | 0 (lazy) | ~250 MB | YOLO-v10 nano/small checkpoint; doclayout-yolo==0.0.2 uses CPU |
| PaddleOCR (OCR + table structure) | 0 (lazy) | ~600–800 MB | PP-OCRv4 det+rec + PP-StructureV2 table; CPU inference |
| Inference peak (active single-doc) | — | ~1.2 GB total | DocLayout + OCR + table concurrently, one page at a time |
| **Total pdf-extractor container** | **~80 MB** | **~1.3 GB peak** | With sequential single-doc, one page at a time |
| Rest of fleet (11 services) | ~3–4 GB | — | mcp-server 2GB cap, rag-service 1.5GB, others smaller |
| **Fleet total under load** | **~5.5 GB** | **< 6 GB** | Well within 8GB hard cap; 2GB headroom |

The `pdf-extractor` service Docker `--memory` cap is currently `2.5g` in `docker-compose.yml`. This cap is **adequate** for the trimmed model set (1.3 GB peak, 2.5 GB cap = 1.2 GB headroom for OS + Python runtime). No change to the existing cap is required.

**Formula modules excluded:** `unimernet==0.2.1` (~1.4 GB model weights alone, plus the package footprint) is dropped. Not needed for financial-statement tables.

**StructEqTable excluded:** would require `struct-eqtable` pip package (~2 GB VLM weights) + CUDA. Both impossible and out of scope.

**Trimmed requirements file:** `apps/pdf-extractor/requirements-pek.txt` (new file — see §3.1). This is NOT an edit to `PDF-Extract-Kit/requirements-cpu.txt` (that file stays pristine). The Dockerfile is updated to reference `requirements-pek.txt` instead of the current `requirements.txt`.

### 2.2 (b) Topology Decision

**Decision: ON-DEMAND BATCH JOB, run inside the existing `pdf-extractor` container — but with models loaded lazily on first request and unloaded after each job. NOT a separate worker container.**

Detailed reasoning:

**Option A — always-resident model in the pdf-extractor container:**
- RAM footprint: ~1.3 GB peak (models resident 24/7).
- Risk: models held in memory during VN market hours when the cowork fleet is at peak load.
- Verdict: REJECTED — violates the new hard constraint (no heavy model resident during market hours).

**Option B — separate on-demand worker container:**
- Architecture: a second Docker service (`pdf-extractor-worker`) spun up per-job via `docker compose run` or a job-queue trigger.
- RAM: transient spike to ~1.3 GB, container torn down after.
- Pros: zero RAM held during market hours.
- Cons: Docker compose spawn latency (~3–5s), requires docker socket access from within a container (security footprint), complex orchestration, requires a queue or webhook to kick off.
- Verdict: REJECTED — operational complexity outweighs benefit for a single-user sequential-batch use case; the market-hours guard at the application layer achieves the same isolation goal more simply.

**Option C (CHOSEN) — lazy-load + market-hours guard inside the existing container:**
- Models are loaded on the first extraction request (lazy singleton — `_pek_models_cache` module-level dict, initialized to `None`). They remain loaded for the session duration.
- A **market-hours guard** (Layer 1: cron timing; Layer 2: runtime guard at request time) prevents any extraction from running during VN trading hours. See §5.
- After each individual page's inference, the output is immediately serialized and released from the inference buffer. Models stay resident but inference tensors are not accumulated.
- RAM benefit: models are NOT loaded at container boot. Cold-start RSS = ~80 MB (FastAPI only). Models load on first off-market extraction request.
- This approach has a simpler operational model (no docker socket, no second service), is verifiable via RSS sampling, and meets the market-hours constraint through the guard rather than teardown.

**RSS cap enforcement:** `docker-compose.yml` `deploy.resources.limits.memory: 2.5g` is already set. This is the per-process OOM kill threshold. No change needed. A Docker OOM kill during a runaway inference is preferable to swap-triggered kernel panic.

### 2.3 (c) Clone Embedding + Docker Hygiene + Model Weight Cache

#### Clone embedding strategy

**Decision: pip editable install from path (`pip install -e ./PDF-Extract-Kit`).**

- The pristine subtree lives at `apps/pdf-extractor/PDF-Extract-Kit/` (own `.git`, 89MB, zero local edits).
- Dockerfile installs it as an editable package: `RUN pip3 install -e ./PDF-Extract-Kit --no-cache-dir --break-system-packages`.
- This makes `pdf_extract_kit` importable from within the container as a package, without copying the source tree into the site-packages directory.
- The source tree IS present in the container (at `/app/PDF-Extract-Kit/`) but is not copied as a layer (it is part of the build context AFTER the gitignore fix).

**Why not git submodule?** Submodule config goes in the parent repo's `.git/config`. Since `apps/pdf-extractor/PDF-Extract-Kit` already has its own `.git` (depth-1 clone), converting it to a submodule requires deleting its `.git` and running `git submodule add` — which changes the parent repo's structure. This is not a zero-diff operation on the pristine subtree's own `.git`. Additionally, a git submodule does not solve the Dockerfile COPY bloat by itself.

**Why not vendored+gitignored?** The 89MB repo with its `.git` history is already committed to the parent repo (as a non-submodule tree). Converting it to a gitignored drop would require removing it from the parent repo's git history, which is a destructive operation. Editable install is the simplest path that leaves the existing clone structure undisturbed.

#### Dockerfile changes required

```dockerfile
# After COPY . . — install PEK as editable package (no source copy to site-packages)
RUN pip3 install -e ./PDF-Extract-Kit --no-cache-dir --break-system-packages

# Update requirements install to use the trimmed file
COPY requirements-pek.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements-pek.txt
```

**`.dockerignore` additions** (REQUIRED — prevents 89MB + model weights from being uploaded as separate layers or triggering cache misses):

```
# PEK pristine repo git history — NOT excluded from image (source needed for editable install)
# But exclude the model weights download cache if present
PDF-Extract-Kit/.git/
PDF-Extract-Kit/models/
models/
```

Wait — **key architectural clarification**: `COPY . .` copies the full build context including `PDF-Extract-Kit/`. The editable install (`pip install -e ./PDF-Extract-Kit`) inside the Dockerfile needs the source files to be present in the container so the `pdf_extract_kit` package is importable at runtime. The `.git/` directory of the pristine subtree must NOT be copied into the image (it adds ~20MB and violates AC-PEK-3c spirit). Model weights must NOT be baked in (they are runtime-downloaded).

**Revised `.dockerignore` entries:**

```
# Existing entries preserved
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.egg-info/
.eggs/
dist/
build/
.pytest_cache/
.mypy_cache/
.venv/
venv/
*.db
data/
__tests__/
.git/
.gitignore

# PEK additions
PDF-Extract-Kit/.git/
PDF-Extract-Kit/models/
PDF-Extract-Kit/outputs/
models/
```

This means: the `PDF-Extract-Kit/` source tree (Python files + configs + assets) IS present in the image (needed for editable install). The `.git/` sub-directory of the pristine repo is excluded. Model weights (`PDF-Extract-Kit/models/`) are excluded from the image. The `AC-PEK-3a` verification (`docker run --rm <image> ls /app/PDF-Extract-Kit`) will find the source tree present — this is required for the editable install to function. However, the spirit of AC-PEK-3a is that model weights are not baked in — the exact AC text should be clarified with PO (see §8, Risk Flag R-CRIT-1).

**Flagging this to PO (§8):** AC-PEK-3a says `ls /app/PDF-Extract-Kit` should return "No such file or directory." But editable install requires the source to be present in the container. These two requirements are in conflict. The architect resolves this in favor of **function over the AC literal**: the source tree is present, the `.git/` subdirectory is excluded, model weights are never baked in. PO must update AC-PEK-3a to reflect "model weights not baked in + .git excluded" rather than "source tree absent."

#### Model weight cache

**Decision: named Docker volume `pek_model_cache` mounted at `/app/pek_models` inside the pdf-extractor container.**

Model weights are downloaded by PDF-Extract-Kit / PaddleOCR / doclayout-yolo on first use via HuggingFace hub / ModelScope / PaddleHub. They are stored in paths configurable via environment variables:

| Package | Default cache path | Override env var |
|---|---|---|
| `doclayout-yolo` / YOLO | `~/.cache/ultralytics` or model_path in config | `YOLO_CONFIG_DIR` |
| `paddleocr` | `~/.paddleocr` | None native; bind-mount override |
| HuggingFace hub | `~/.cache/huggingface` | `HUGGINGFACE_HUB_CACHE` |
| ModelScope | `~/.cache/modelscope` | `MODELSCOPE_CACHE` |

**Implementation:** set the following env vars in `docker-compose.yml` for the `pdf-extractor` service:

```yaml
environment:
  - HUGGINGFACE_HUB_CACHE=/app/pek_models/huggingface
  - MODELSCOPE_CACHE=/app/pek_models/modelscope
  - YOLO_CONFIG_DIR=/app/pek_models/yolo
  - PADDLEOCR_HOME=/app/pek_models/paddleocr
```

And mount the volume:

```yaml
volumes:
  - pek_model_cache:/app/pek_models
```

Named volume in the top-level `volumes:` section:

```yaml
volumes:
  market_data:
    driver: local
  pek_model_cache:
    driver: local
```

**Weight download on first run:** the first extraction request after deployment triggers the download. This is expected and normal. Subsequent runs reuse the cached weights from the named volume (AC-PEK-3e: volume persists across `docker compose build` + `force-recreate`).

**`.gitignore` addition** (in `apps/pdf-extractor/.gitignore`):

```
# Model weight cache (runtime-downloaded, never committed)
pek_models/
PDF-Extract-Kit/models/
PDF-Extract-Kit/outputs/
```

### 2.4 (d) Lazy Model Loading and Per-Process RSS Caps

**Lazy-load pattern: module-level singleton guard (`_pek_models_cache`).**

```python
# apps/pdf-extractor/infrastructure/pek_engine_adapter.py
_pek_models_cache: dict | None = None

def _get_pek_models() -> dict:
    global _pek_models_cache
    if _pek_models_cache is None:
        _pek_models_cache = _load_pek_models()
    return _pek_models_cache
```

Models load on the **first extraction request** after container start. Container cold-start RSS = ~80 MB (FastAPI base). After first request, models remain loaded for the process lifetime (re-loading per request would double inference time and spike RAM on every call).

**Per-process RSS cap:** enforced by Docker `--memory 2.5g` already set in `docker-compose.yml`. This is the OOM kill threshold. The process is killed (OOM) rather than swapping if inference pushes beyond 2.5 GB — preventing the host kernel-panic failure mode.

**Concurrent-request queuing:** FastAPI by default processes requests sequentially in a single-process uvicorn worker. The extraction endpoint does NOT use `async def` and runs in the thread pool. To guarantee sequential single-document processing (REQ-PEK-9d, AC-PEK-4d), the `POST /pek-extract` endpoint uses a **module-level `threading.Semaphore(1)`** that any concurrent request must acquire before model inference begins. A second simultaneous request waits (queue depth = 0 for the semaphore) or returns HTTP 429 if wait > 30s timeout. This prevents two concurrent model instances from doubling RAM.

---

## 3. LF-OVERLAY Contract Reuse (REQ-PEK-8)

**The LF-OVERLAY contract from `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md` §3 is adopted as-is.** No adaptation required for the geometric overlay rendering.

### 3.1 Mapping: PDF-Extract-Kit Layout Bboxes → `bctc_page_zones` / `bctc_layout_units`

PDF-Extract-Kit's `LayoutDetectionYOLO.predict()` returns a list of bounding boxes per page with class labels from the 10-class vocabulary:

```
0: title  1: plain text  2: abandon  3: figure  4: figure_caption
5: table  6: table_caption  7: table_footnote  8: isolate_formula  9: formula_caption
```

For BCTC financial PDFs the relevant classes are: `5: table` (table regions) and `1: plain text` / `0: title` (non-table regions). The PEK layout detection output provides per-zone bounding boxes in pixel coordinates.

The adapter maps PEK bbox output to the LF-OVERLAY `zones_json` contract as follows:

| LF-OVERLAY field | Source from PEK |
|---|---|
| `image_width_px` / `image_height_px` | PDF page rasterized at 200 DPI (same as current pipeline) |
| `image_dpi` | 200 |
| `coordinate_origin` | `"top-left"` |
| `coordinate_unit` | `"px"` |
| `header_band` | First `title` or `plain_text` bbox in top 15% of page |
| `footer_band` | Last bbox in bottom 10% of page |
| `column_gutters` | Table bbox `x_min` / `x_max` projected as the table region; column sub-division via PaddleOCR structure output (cell columns) |
| `row_bands` | Table bbox row sub-divisions from PaddleOCR structure cells |
| `unit_hints` | Raw OCR text from `title` bboxes on the page (metadata only) |
| `unit_boundary_after_page` | Computed from logical unit grouping |

**The `POST /api/push-bctc-layout` endpoint on mcp-server, and the `bctc_layout_units` + `bctc_page_zones` tables, are used identically to the LF-OVERLAY design.** The only difference is the source of the zone coordinates: PEK DocLayout-YOLO instead of the in-house Tier 0-3 projection-profile fingerprinting.

### 3.2 mcp-server Zone Change Assessment

**No mcp-server code changes required for this sprint.** The `pushBctcLayoutHandler.ts` and the `bctcInspectHandler.ts` overlay rendering (if LF-OVERLAY was implemented as part of Sprint BCTC-LAYOUT-FIRST) accept the same payload schema. The zone data source changes from hand-built projection profiles to PEK DocLayout-YOLO, but the payload contract is identical.

If LF-OVERLAY's mcp-server side (handler + DDL + tests) has NOT yet been shipped (Sprint BCTC-LAYOUT-FIRST LF-OVERLAY PAUSED), then PEK-IMPL must ship both the pdf-extractor PEK engine AND the mcp-server overlay handler. The zone stays **single** (dev-pdf-extractor implements both), because the mcp-server overlay handler is a pure receiver with no business logic — it is a simple DB write with one test.

**Architect confirms:** no duplicate overlay tables. Only `bctc_page_zones` and `bctc_layout_units` (per §3.1 of the LF-OVERLAY brief). Zero collision with `bctc_table_rows`.

---

## 4. Market-Hours Constraint — Two-Layer Enforcement (New Hard Constraint)

**This is a DESIGN REQUIREMENT.** PO is notified that this constraint warrants a formal new AC appended to REQ-PEK-INTEGRATE (see §8).

### 4.1 Layer 1: Cron Timing (Schedule-Level)

The `bctcReparseJob` (in mcp-server `cronConfig.ts`) is the scheduled job that triggers BCTC re-extraction by calling `POST /pek-extract` on the pdf-extractor service. Its current cron expression: `'30 9 * * *'` (09:30 ICT / 02:30 UTC daily).

**This cron MUST be rescheduled to fire only outside VN market hours.** The VN HOSE session is 09:00–15:00 ICT (02:00–08:00 UTC Mon–Fri, inclusive of 11:30–13:00 ICT lunch break). The no-run window in UTC is **02:00–08:59 UTC Mon–Fri**.

**Required cron change (in `apps/mcp-server/src/scheduler/cronConfig.ts`):**

```typescript
bctcReparseJob: Bun.env.CRON_BCTC_REPARSE_JOB ?? '0 21 * * *',
// 21:00 UTC = 04:00 ICT+7 next day = deep overnight, well outside HOSE hours
```

Recommended value: `'0 21 * * *'` (21:00 UTC = off-market Vietnamese overnight). For weekday-only: `'0 21 * * 1-5'` is acceptable but weekends are already off-market so daily is fine.

**Note:** this requires a 1-line change to `apps/mcp-server/src/scheduler/cronConfig.ts`. This is in the **mcp-server zone** but it is a configuration change, not a logic change. dev-pdf-extractor cannot make this change (wrong zone). **PM must route this as a sub-task to dev-mcp-server (or a cross-service dev) as part of PEK-IMPL.** Zone flips to `multi` for this one config file only. Alternatively, the cron env var `CRON_BCTC_REPARSE_JOB` can be set in `docker-compose.yml` (which is in the repo root, accessible by both zones).

**Preferred approach (simpler, no zone split):** set `CRON_BCTC_REPARSE_JOB=0 21 * * *` in `docker-compose.yml` under the `mcp-server` service environment block. This does not require editing `cronConfig.ts` source code and keeps the zone boundary clean.

### 4.2 Layer 2: Runtime Market-Hours Guard (Request-Level)

**A Python guard function is added to `apps/pdf-extractor/infrastructure/market_hours_guard.py`.**

The guard replicates the logic of `isVnMarketHoursUtc` from `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts` (the existing market-hours reference implementation in the system):

```python
# apps/pdf-extractor/infrastructure/market_hours_guard.py
from datetime import datetime, timezone

# VN HOSE session: 09:00-15:00 ICT (UTC+7) = 02:00-08:59 UTC, Mon-Fri
# Matches isVnMarketHoursUtc in mcp-server/src/scheduler/vpsProxyWatchdogJob.ts
VN_MARKET_OPEN_UTC_HOUR = 2   # 09:00 ICT
VN_MARKET_CLOSE_UTC_HOUR = 8  # 15:59 ICT (exclusive: 9 would be 16:00)

def is_vn_market_open_utc(now: datetime | None = None) -> bool:
    """
    Returns True if the current instant is inside VN HOSE trading hours.
    Mon-Fri 02:00-08:59 UTC (= 09:00-15:59 ICT).
    Mirrors isVnMarketHoursUtc() from mcp-server/vpsProxyWatchdogJob.ts.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    weekday = now.weekday()  # 0=Mon, 6=Sun
    if weekday >= 5:  # Sat/Sun
        return False
    h = now.hour
    return VN_MARKET_OPEN_UTC_HOUR <= h <= VN_MARKET_CLOSE_UTC_HOUR
```

This guard is called **at the FastAPI route handler level** for the `POST /pek-extract` endpoint (see §6.1). If the guard returns `True` (market open), the handler returns HTTP 503 `{"error": "market_open", "retry_after": "after 15:00 ICT (08:00 UTC)"}` immediately — no model loading, no inference.

**QA-verifiable check for this constraint:**
- Process/RSS sampling: run `docker stats pdf-extractor` during simulated market hours (e.g. Monday 03:00 UTC). RSS should be at cold-start baseline (~80 MB) if no extraction was triggered during market hours.
- Force-call the endpoint during a simulated market open instant: confirm HTTP 503 returned, no model loaded (RSS unchanged, no HuggingFace download logs).
- Force-call after simulated market close: confirm extraction proceeds, models load, RSS rises to ~1.3 GB peak.

---

## 5. DDD Layer Assignment

| Component | DDD Layer | File |
|---|---|---|
| Market-hours guard pure function | **Domain** | `domain/services.py` (extend) OR `domain/primitives/market_hours/` |
| Extraction quality rules (orphan, junk) | **Domain** | `domain/primitives/layout_invariants/primitive.py` (existing or new) |
| PEK orchestration (layout→OCR→table→push) | **Application** | `application/extract_layout_first_usecase.py` (replace internals) |
| Market-hours HTTP guard (route-level) | **Interface** | `interface/handlers.py` (PEK endpoint guard) |
| PEK engine adapter (DocLayout-YOLO + PaddleOCR calls) | **Infrastructure** | `infrastructure/pek_engine_adapter.py` (NEW) |
| Trimmed requirements file | **Infrastructure** | `apps/pdf-extractor/requirements-pek.txt` (NEW) |
| Market-hours guard runtime (cron config) | **Infrastructure** (mcp-server config) | `docker-compose.yml` env var override |
| Model weight cache volume | **Infrastructure** | `docker-compose.yml` named volume |

**DDD golden rule compliance:**
- `domain/` has zero imports from `infrastructure/` — the market-hours pure function is injected as a callable at the composition root.
- `application/extract_layout_first_usecase.py` imports only from `domain/` (ports). The PEK adapter is injected.
- `infrastructure/pek_engine_adapter.py` imports `pdf_extract_kit.tasks` (the pristine package) and `paddleocr`. No imports from `application/` or `interface/`.

---

## 6. Files to Create / Modify

### 6.1 New Files

| File | DDD Layer | Purpose |
|---|---|---|
| `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` | Infrastructure | Lazy-init PEK models; call `LayoutDetectionTask`, `OCRTask`, `PaddleOCR` (table structure mode); map bboxes to LF-OVERLAY zone contract; semaphore-guard sequential execution |
| `apps/pdf-extractor/infrastructure/market_hours_guard.py` | Infrastructure/Domain | `is_vn_market_open_utc()` pure function; mirrors mcp-server `isVnMarketHoursUtc` |
| `apps/pdf-extractor/requirements-pek.txt` | Infrastructure | Trimmed deps: omit `unimernet`, `struct-eqtable`, `paddlepaddle-gpu`, `lmdeploy`; add `torch` (CPU), `torchvision` (CPU) |
| `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` | Test | Unit tests: lazy-load guard, semaphore rejection, bbox-to-zone mapping (injected fake PEK output) |
| `apps/pdf-extractor/__tests__/test_market_hours_guard.py` | Test | Unit tests: Mon 02:00 UTC (open), Mon 01:59 UTC (closed), Sat 03:00 UTC (closed), Fri 08:59 UTC (open), Fri 09:00 UTC (closed) |
| `apps/pdf-extractor/scenarios/pek_single_doc_extraction.py` | Scenarios | FastAPI TestClient scenario: POST /pek-extract with injected fake PEK adapter; no real model, no creds; verifies JSON payload structure pushed to mcp-server mock |

### 6.2 Modified Files

| File | Change |
|---|---|
| `apps/pdf-extractor/Dockerfile` | Change `requirements.txt` → `requirements-pek.txt`; add `RUN pip3 install -e ./PDF-Extract-Kit`; add SHA label (DRIFT-3 Phase B: `ARG GIT_SHA=unknown` + `LABEL`) |
| `apps/pdf-extractor/.dockerignore` | Add `PDF-Extract-Kit/.git/`, `PDF-Extract-Kit/models/`, `PDF-Extract-Kit/outputs/`, `models/` |
| `apps/pdf-extractor/.gitignore` | Add `pek_models/`, `PDF-Extract-Kit/models/`, `PDF-Extract-Kit/outputs/` |
| `apps/pdf-extractor/main.py` | Replace `build_document_map_fn`, `zone_page_fn`, `ocr_unit_fn` injections with `PekEngineAdapter` injection; wire market-hours guard at composition root |
| `apps/pdf-extractor/application/extract_layout_first_usecase.py` | Replace internal algorithm calls with PEK adapter port calls; keep port interface, orchestration shell, and push contract |
| `apps/pdf-extractor/interface/handlers.py` | Add HTTP 503 guard on `POST /pek-extract` endpoint using the market-hours guard |
| `docker-compose.yml` | Add `CRON_BCTC_REPARSE_JOB=0 21 * * *` env var under mcp-server; add `pek_model_cache:/app/pek_models` volume to pdf-extractor service; add model cache env vars (`HUGGINGFACE_HUB_CACHE`, `PADDLEOCR_HOME`, etc.) |
| `apps/pdf-extractor/domain/repositories.py` | Add `PekEngineAdapterPort` protocol (port for PEK adapter injection) |

### 6.3 Frozen Surfaces — 0-byte-diff Required

- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/sandbox/runner.py`
- `docs/data/pilot-status-pdf-extractor.json`
- `apps/pdf-extractor/PDF-Extract-Kit/` (entire subtree)

---

## 7. Extraction Pipeline — End-to-End Flow

```
VPS → POST /pdf-push → pdf-extractor receives PDF
                         ↓
              market_hours_guard.is_vn_market_open_utc()
              → if True: return HTTP 503 (defer, no model load)
              → if False: continue
                         ↓
              threading.Semaphore(1).acquire(timeout=30)
              → if timeout: return HTTP 429
                         ↓
              ExtractLayoutFirstUseCase.execute(report_id, pdf_path)
                         ↓
              PekEngineAdapter (lazy singleton _pek_models_cache)
                  ├── LayoutDetectionTask.predict_pdfs(pdf_path) → bboxes per page
                  │     [DocLayout-YOLO, CPU, ~100MB peak]
                  ├── For each 'table' bbox region:
                  │     OCRTask.predict(table_region_img) → text tokens
                  │     PaddleOCR(table mode)(table_region_img) → table cells + rows
                  │     [PaddleOCR PP-StructureV2, CPU, ~600-800MB peak]
                  └── map bboxes → page_zones JSON (LF-OVERLAY contract)
                         ↓
              Domain: layout_invariants (check orphan/junk rows)
                         ↓
              LayoutFirstPushClient → POST /api/push-bctc-layout (mcp-server)
                  payload: { report_id, document_map, units, page_zones, pass_rate_report }
                         ↓
              mcp-server writes to bctc_layout_units + bctc_page_zones
              (reusing pushBctcLayoutHandler.ts from LF-OVERLAY)
                         ↓
              Semaphore.release()
```

**Structured path completely separate:**
```
mcp-server bctcReparseJob (at 21:00 UTC)
  → POST /extract-tables (pdf-extractor)
  → ExtractTablesUseCase → TextTableExtractor → TablePushClient
  → POST /api/push-bctc-tables (mcp-server)
  → bctc_table_rows + bctc_balance_checks
  [unchanged, 0-byte-diff on text_table_extractor.py]
```

---

## 8. Risk Flags

| Risk | Severity | Flag | Mitigation |
|---|---|---|---|
| AC-PEK-3a literal vs editable install conflict | CRITICAL | R-CRIT-1 | AC-PEK-3a says `ls /app/PDF-Extract-Kit` = "No such file" but editable install REQUIRES source present. Recommend PO amend AC-PEK-3a to: "model weights NOT in image (verify with `docker inspect` image size < 2GB) + `.git` subdirectory of PEK excluded." Flag to PO before PEK-IMPL starts. |
| No `TableMaster` model class in pristine PEK clone | CRITICAL | R-CRIT-2 | The README mentions PaddleOCR+TableMaster but no model implementation exists in `tasks/table_parsing/models/`. Decision: use `PaddleOCR` PP-StructureV2 table mode directly (separate from PEK task framework). This is NOT an edit to PEK — it uses the `paddleocr` package directly from application code. Architect-confirmed CPU-compatible. |
| StructEqTable hard-asserts `torch.cuda.is_available()` | CRITICAL | R-CRIT-3 | If dev accidentally imports `struct_eqtable` at any point (e.g. via `from pdf_extract_kit.tasks import *`), import fails. Guard: `pek_engine_adapter.py` imports ONLY `LayoutDetectionTask` and `OCRTask` explicitly. Never imports `TableParsingTask` or `FormulaDetectionTask`. Unit test confirms no CUDA import in the extraction path. |
| PaddleOCR PP-StructureV2 RAM higher than estimated on large pages | HIGH | R-HIGH-1 | BCTC PDFs can be large (A3 landscape, dense). If a single page pushes PaddleOCR to >2.5GB, Docker OOM kill triggers mid-extraction. Mitigation: rasterize at 150 DPI (not 200 DPI) for table structure detection. 150 DPI is adequate for PaddleOCR table structure. Monitor RSS during PEK-DEPLOY. |
| First-run model download during off-market window | HIGH | R-HIGH-2 | On first deployment, models download at first extraction call (~2-3 GB download). This is slow but expected. During download, RSS may spike. ops must perform a "model pre-warm" step: call `POST /pek-extract` on a test doc in an off-market window, wait for download, then verify. Not a kernel-panic risk but adds 15-30 min to first PEK-DEPLOY. |
| cron config zone boundary (CRON_BCTC_REPARSE_JOB) | MEDIUM | R-MED-1 | The Layer 1 schedule fix requires either editing `cronConfig.ts` (mcp-server zone) or overriding via `docker-compose.yml` env var. Chosen path: `docker-compose.yml` env var override (repo root, single file, no zone split). PM must include this in PEK-IMPL scope. |
| Existing `extract_layout_first_usecase.py` internals in-flight | MEDIUM | R-MED-2 | The in-house Tier 0-3 LF-EXTRACT functions (`build_document_map`, `zone_page`, `ocr_unit`) are currently injected into the use case via `main.py`. PEK-IMPL replaces these injections with `PekEngineAdapter`. The old functions in `generic_md_table_extractor.py` remain (dead code — kept for unit test backward compat per existing docstring rule). No deletion needed. |
| Sequential semaphore timeout on slow PEK inference | LOW | R-LOW-1 | PaddleOCR table structure on a dense 46-page BCTC can take 5-10 min (CPU). A 30s semaphore timeout would reject legitimate concurrent calls during a slow extraction. Solution: semaphore timeout = 0 (non-blocking) + return HTTP 429 immediately. The endpoint is called by the mcp-server cron job, which can retry on next cycle. |
| DDD violation: market hours guard in infrastructure | LOW | R-LOW-2 | `market_hours_guard.py` implements a pure function with zero I/O — it belongs in `domain/`. Place it in `domain/primitives/market_hours/primitive.py` and reference from interface/handlers.py via injection. The infrastructure adapter `market_hours_guard.py` becomes a thin re-export. |
| Docker layer cache: requirements-pek.txt vs requirements.txt | LOW | R-LOW-3 | Rename from `requirements.txt` to `requirements-pek.txt` in Dockerfile. Change in COPY instruction invalidates the requirements install layer. Rebuild is required once — this is expected and correct. |

---

## 9. Test Strategy

### Unit Tests (zero network, zero model weights, zero credentials)

| Test file | What it tests |
|---|---|
| `__tests__/test_market_hours_guard.py` | `is_vn_market_open_utc()` all 5 boundary cases |
| `__tests__/test_pek_engine_adapter.py` | Lazy-load guard: first call loads (mock); second call reuses. Semaphore: concurrent caller returns 429. Bbox-to-zone mapping: fake PEK output → correct `zones_json` shape. GPU package absence: `assert 'paddlepaddle_gpu' not in sys.modules` |
| `__tests__/test_layout_invariants.py` | (existing, from LF-EXTRACT) Orphan row check, junk row check |

### Scenario Test (FastAPI TestClient, injected fake adapter)

`scenarios/pek_single_doc_extraction.py`:
- Injects a fake `PekEngineAdapterPort` that returns deterministic bbox + table data.
- Calls `POST /pek-extract` with a sample `report_id`.
- Asserts push payload has correct shape: `report_id`, `page_zones` array with `col_0`/`col_1` gutters, `units` array with non-empty `stitched_markdown`.
- Asserts zero network calls to HuggingFace / PaddleHub.
- Asserts `text_table_extractor.py` was not imported in the execution path.

### QA Verification Commands (per REQ-PEK-7d)

```bash
# Direct market.db query — no orphan/junk rows
docker compose exec -T mcp-server bun -e '
const { Database } = require("bun:sqlite");
const db = new Database("/app/data/market.db", { readonly: true });
const junk = db.query("SELECT COUNT(*) as cnt FROM bctc_layout_units WHERE quarantined=0 AND stitched_markdown LIKE \"%|  |  |%\"").get();
const orphan = db.query("SELECT COUNT(*) as cnt FROM bctc_layout_units WHERE quarantined=1 AND quarantine_reason LIKE \"%orphan%\"").all();
console.log("junk-in-passing:", junk.cnt, "orphan-quarantined:", JSON.stringify(orphan));
'

# FPT Q4 2025 sentinel check
docker compose exec -T mcp-server bun -e '
const { Database } = require("bun:sqlite");
const db = new Database("/app/data/market.db", { readonly: true });
const rows = db.query("SELECT code, value_current FROM bctc_table_rows WHERE report_id=\"e71f845d-ffa5-48f9-8f09-30ac2cd09c65\" AND code IN (\"270\",\"300\",\"400\",\"440\")").all();
console.log(JSON.stringify(rows));
'

# Market-hours guard — confirm 503 during simulated open hours (manual test)
# curl -X POST http://localhost:5001/pek-extract -H "Content-Type: application/json" \
#   -d '{"report_id":"test","pdf_path":"/app/data/pdfs/test.pdf"}' \
#   # Expected: HTTP 503 if called between 02:00-08:59 UTC Mon-Fri

# Pristine invariant check
git -C apps/pdf-extractor/PDF-Extract-Kit diff
# Expected: empty output
```

---

## 10. QA-Verifiable Market-Hours Enforcement Check (new AC)

**Proposed new AC for PO to append to REQ-PEK-INTEGRATE:**

> **AC-PEK-NEW-1 (market-hours guard prevents model load during session):** During a simulated VN market-open window (e.g. a test call sent at 03:00 UTC Monday), `POST /pek-extract` returns HTTP 503 with `{"error": "market_open"}` and the container RSS (measured by `docker stats pdf-extractor`) does not rise above the cold-start baseline (~100 MB). No model weight is loaded. No HuggingFace or PaddleHub download log appears. Verifiable by ops: call the endpoint manually with a spoofed time parameter OR at an actual open-hours instant; confirm 503 + no RSS spike.

> **AC-PEK-NEW-2 (cron fires off-market only):** `docker compose exec mcp-server bun -e 'const {CRONS} = require("./src/scheduler/cronConfig.js"); console.log(CRONS.bctcReparseJob)'` returns a cron expression that does NOT fire between 02:00 and 08:59 UTC on weekdays. Verifiable by parsing the cron expression: hour field must not include values 2-8 for weekday entries.

---

## 11. Build Standard Tag

**BUILD-STANDARD: lean** (existing service zone, no new service). dev-pdf-extractor drives end-to-end.

---

## 12. Parallelism Decision

**Sequential dispatch.** All changes are in `apps/pdf-extractor/` (single zone) plus `docker-compose.yml` (shared config file). The `docker-compose.yml` change is a shared SSOT file → sequential dispatch is mandatory per dev-standards.md.

One optional parallel: after PEK-IMPL ships the pdf-extractor code, dev-mcp-server can ship the mcp-server side of LF-OVERLAY (if not yet shipped) independently, because the contract is fully specified. The LF-DEPLOY gate requires BOTH to be done.

---

## Appendix: Trimmed `requirements-pek.txt` Specification

```
# apps/pdf-extractor/requirements-pek.txt
# PEK-INTEGRATE trimmed requirements (CPU-only, 8GB-safe)
# Base: Ubuntu 24.04, Python 3.12

# FastAPI service runtime
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
python-multipart>=0.0.9
pydantic>=2.6.4

# PDF processing
pdfplumber>=0.10.3
pdf2image>=1.16.0

# Image + HTTP
Pillow>=10.2.0
aiohttp>=3.9.3

# Tesseract (still used for existing structured path)
pytesseract>=0.3.10

# PDF-Extract-Kit runtime deps (from PDF-Extract-Kit/requirements-cpu.txt — trimmed)
omegaconf
matplotlib
PyMuPDF

# Layout detection (DocLayout-YOLO, CPU)
ultralytics>=8.2.85
doclayout-yolo==0.0.2

# OCR + table structure (CPU, no GPU variant)
paddlepaddle
paddleocr==2.7.3

# PyTorch CPU (required by DocLayout-YOLO; explicitly CPU build)
# Install after pip: torch torchvision --index-url https://download.pytorch.org/whl/cpu
torch
torchvision

# EXCLUDED: unimernet==0.2.1 (formula model, ~1.4GB, OUT OF SCOPE)
# EXCLUDED: struct-eqtable (StructEqTable VLM, GPU-only, OUT OF SCOPE)
# EXCLUDED: paddlepaddle-gpu (no NVIDIA GPU on this host)
# EXCLUDED: lmdeploy (GPU serving framework, impossible on Apple Silicon CPU)

# Dev / testing
pytest>=8.1.1
pytest-asyncio>=0.23.6
import-linter>=2.0
```

Note: `torch` and `torchvision` must be installed as CPU-only builds. The Dockerfile RUN command for these should use:
```dockerfile
RUN pip3 install --no-cache-dir --break-system-packages \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu
```
This is added as a separate RUN step before the `-r requirements-pek.txt` install.
