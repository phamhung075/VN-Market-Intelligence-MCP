# Architect — Notebook

**Last updated:** 2026-05-27 21:00 UTC | **Sprint:** NEWS-CMD

[3 most recent cycles retained below. Archive in git history.]

## NEWS-CMD — NEWS-CMD-DESIGN (2026-05-27) — DESIGN COMPLETE

**Task:** NEWS-CMD-DESIGN. Single-zone feature: `/news` Telegram command — synchronous pull returning full daily news digest in plain Vietnamese.

**Brownfield summary:**
- `telegramCommands.ts` command router confirmed: switch, `CommandResult { text, chatId }`, outer try/catch, `HELP_TEXT` const. `/news` grep-clean.
- `webhookHandler.ts` confirmed: single `sendTelegramMarket(result.text, {chatId})` — must be extended to loop over `texts[]`.
- `VN_OFFSET_MS` lives in `domain/services/timeConstants.ts` (pure constant, infra → domain import is valid DDD).
- `rag_analyses` schema confirmed: `summary` column present (correct addition vs `newsFetchLiveHandler.ts` which omits it).
- Test file `214-telegram-commands.test.ts` is the correct extension point for T-NEWS-1..8.

**Key decisions:**
- Chunking contract: `CommandResult.texts?: string[]` + sequential `for...of` send-loop in `webhookHandler.ts`. Handler-driven Telegram sends rejected (layer violation). Story-boundary chunker in `handleNews` packs pre-built story blocks greedily up to 4096 chars. AC-FR6-1/2/3 provably met.
- B2 (fallback window): PO-settled as most-recent N, no date window. Header switches to "Tin tức gần đây" when fallback active. Confirmed.
- `VN_OFFSET_MS`: import from `timeConstants.js` (not inline — SSOT is there). Midnight arithmetic function body inlined in `handleNews`.

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-27-news-cmd-design.md` — NEW (full brief: §1 context, §2 brownfield, §3 chunking contract decision + algorithm + AC proof, §4 handleNews spec, §5 DDD, §6 file change list, §7 risks, §8 frozen surfaces, §9 constraints)
2. `docs/handoffs/TASK_NEWS-CMD.md` — CREATED (BA section + [Architect] section with verified paths, design decisions, exact file-change list, risk flags)
3. `docs/TASKS.md` — NEWS-CMD-DESIGN → DONE; NEWS-CMD-IMPL → Todo
4. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** pm → decompose NEWS-CMD-IMPL into atomic tasks for dev-mcp-server; then dev-mcp-server implements 4-file change set; ops REBUILD; qa live-verify; po G9.

---

## PEK-INTEGRATE — PEK-QA-ADJUDICATE (2026-05-27) — ADJUDICATION COMPLETE

**Task:** Gate B RED adjudication. qa's re-sweep after PEK-MULTIPAGE fix (2e228f0d) shows unit `905248f4` (FPT pages 7/8/9) has `row_count=3`, failing Gate B `>= 10`.

**Method:** Direct in-container DB dump (python3 sqlite3 in pdf-extractor container — bun not present). Read-only. No re-extraction.

**Dumped evidence:**

- unit `905248f4`: page_numbers_json=[7,8,9], row_count=3, md_len=2903 bytes, extracted_at=2026-05-27 18:57:58.
- Markdown has 3 newline chars: one after page-7 block, one after `| --- | --- |` separator, one after page-8 block. Page-9 block is section 3 (no trailing newline).
- Content confirmed: page 7 has ~16 balance-sheet financial codes (400-440 series, Vietnamese labels), page 8 has ~20 P&L codes (01-71 series, Q4+YTD current+prior values), page 9 partial header.
- `row_count` source confirmed at `pek_engine_adapter.py:799`: `row_count = stitched_md.count("\n")` — counts newline characters, NOT financial line items.

**VERDICT: VERDICT-METRIC.** Content is present (2903 bytes, 36+ financial items identified by mã số regex). Grouping fix correct. Stitch correct. Gate B threshold `row_count >= 10` is wrong metric — counts top-level pipe-table boundary newlines (1 per page), not item rows.

**Fix (metric only — no algorithm change):**
1. `pek_engine_adapter.py:799`: fix `row_count` expression to count non-separator pipe rows (informational improvement).
2. §6 Gate B contract: replace `row_count >= 10` with `LENGTH(stitched_markdown) >= 1000` + corrected LIKE clause `'%"7"%'` (not `'%7%'`).

**Gate D order:** dev 1-line fix → ops --no-cache build + force-recreate + DELETE stale rows for all 12 corpus reports + re-extract all 12 → qa re-sweep with revised Gate B.

**Files updated this cycle:**
1. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-QA-ADJUDICATE` appended (full evidence dump, verdict, change-list, Gate D ruling)
2. `docs/architecture-briefs/2026-05-27-pek-multipage.md` — §6 Gate B revised (threshold changed, LIKE clause corrected, adjudication evidence cited)
3. `docs/agent-memory/notebooks/architect.md` — this entry

---

## PEK-INTEGRATE — PEK-WEIGHTS (2026-05-27) — DESIGN COMPLETE

**Task:** PEK-WEIGHTS. PEK-MULTIPAGE fix (commit `2e228f0d`) done and committed. Newly-exposed deploy blocker: no model weights on the named volume after `--no-cache` rebuild. ops cannot force-recreate the container into a working state. qa cannot run. DESIGN ONLY.

**Root cause (structural — AC-PEK-3 divergence):**

1. `doclayout_yolo` auto-download path tries GitHub `doclayout_yolo/assets` releases — gets HTTP 404 because `doclayout_yolo_ft.pt` is not in GITHUB_ASSETS_NAMES. `attempt_download_asset` returns path as-is; `torch.load` raises FileNotFoundError; fail-loud wraps it as RuntimeError. Terminal.
2. `PADDLEOCR_HOME` env var in compose is IGNORED by paddleocr 2.10. Correct var is `PADDLE_OCR_BASE_DIR`. Without this, PaddleOCR downloads to `/root/.paddleocr/` (ephemeral container layer — lost on force-recreate).
3. Original volume mount (`/app/pek_models`) was never on the adapter's read path. Ops's edit to `/app/PDF-Extract-Kit/models` is CORRECT — the adapter resolves weights to `/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt`.

**Decisions (all five design mandates resolved):**

A. **Canonical path: `/app/PDF-Extract-Kit/models`** (volume mount target). All four cache env vars and adapter resolved path agree. Ops's compose edit STAYS.
B. **Provisioning: `scripts/pek-fetch-weights.sh`** (committed, idempotent, ops runs once). YOLO only — 40.7 MB from HF `opendatalab/PDF-Extract-Kit-1.0`. PaddleOCR self-provisions from Paddle CDN on first call.
C. **Network: HF + ModelScope + Paddle CDN all reachable (live-verified)**. GitHub dead. Probe command documented. Dual fallback HF→MS.
D. **Acceptance contract:** ops probe + fetch + volume verify + proof rebuild (no re-fetch) + model-load in logs. QA: 4-gate PEK-MULTIPAGE contract + durability extension (Gate B after second rebuild).
E. **AC-PEK-3 divergence CLOSED:** AC-PEK-3b/3c updated, AC-PEK-3d added. PO updates REQ_PEK-INTEGRATE.md.

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-27-pek-weights-provisioning.md` — NEW
2. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-WEIGHTS` section appended
3. `docs/agent-memory/notebooks/architect.md` — this entry

**Change-list for ops (3 files, 1 commit):** `docker-compose.yml` (PADDLE_OCR_BASE_DIR fix + keep ops edit), `apps/pdf-extractor/Dockerfile` (PADDLEOCR_HOME → PADDLE_OCR_BASE_DIR line 85), `scripts/pek-fetch-weights.sh` (CREATE + chmod +x).

**Next actor:** ops implements 3-file change-list → runs ops gates → qa 4-gate + durability → USER G9.

---

## PEK-INTEGRATE — PEK-MULTIPAGE (2026-05-27T17:41Z) — DESIGN COMPLETE

**Task:** PEK-MULTIPAGE. G9 REJECTED by user. Round 5 escalation on pdf-extractor module. User finding: DocLayout-YOLO zone overlay IS displaying on pages 3/4/5 of FPT BCTC, but only 1 page's table content is exported/persisted per financial statement unit.

**Backend vs Frontend verdict (live DB query confirmed):**

BACKEND. `bctc_page_zones` has 30 table pages correctly stored for FPT `e71f845d`. Overlay display is working. The defect is `bctc_layout_units`: 23 populated units, each with `page_numbers_json` covering only 1 page (e.g. `"[7]"`, `"[8]"`, `"[9]"` as 3 separate units instead of 1 unit `"[7,8,9]"`). A 3-page balance-sheet run produces 3 units × 2 rows = 6 rows instead of 1 unit × 30+ rows.

**Root cause (two defects in `_group_bboxes_into_units`, `pek_engine_adapter.py`):**

1. X-range threshold (10%) fires on natural BCTC column-header / indentation / footer variance across continuation pages — splits one financial statement into N single-page units. No consecutive-page-continuity concept.
2. Double `finalize_unit()` on prose pages creates ghost empty units (one per prose page). Evidence: 78 total units for 46-page doc (should be 10-20). Every table schema_page appears twice: one populated, one empty ghost twin.

**QA false-green confirmed:** "23/23 non-empty units" metric is page-blind — passes even when all units cover 1 page. Replaced by 4-gate contract (A: every table page covered, B: FPT pages 7-9 in one unit with row_count≥10, C: zero ghost table units, D: corpus sweep).

**Decisions:**

- Replace `_group_bboxes_into_units` body with consecutive-table-page algorithm: prose page = unit boundary, consecutive table pages grouped into one unit, cap at 8 pages. Double-finalize structurally eliminated. Function signature unchanged.
- ONE file, ONE function edit.
- Ops must DELETE old `bctc_layout_units` + `bctc_page_zones` rows for FPT before re-extraction (INSERT OR REPLACE on `unit_id` won't remove old ghost units with different UUIDs).

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-27-pek-multipage.md` — NEW (§1 escalation, §2 backend verdict + live DB evidence, §3 precise root cause location RC-1/RC-2/RC-3, §4 classification table, §5 fix design + algorithm, §6 4-gate acceptance contract, §7 frozen surfaces, §8 constraints, §9 risk flags, §10 DDD, §11 verification sequence, §12 handoff)
2. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-MULTIPAGE` section appended
3. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** dev-pdf-extractor rewrites `_group_bboxes_into_units` per brief §5 + 5 new unit tests. Then ops --no-cache build + DELETE stale rows + force-recreate + trigger FPT re-extraction. Then qa 4-gate check per §6.

---

## PEK-INTEGRATE — PEK-OCR-ROOTCAUSE (2026-05-27T08:00Z) — DESIGN COMPLETE

**Task:** PEK-OCR-ROOTCAUSE. Round 4 escalation (4 fix commits on same module). QA cycle-132: uniform FAIL across 5 BCTC reports — layout detection correct (46 pages, 23 table pages, valid column gutters confirmed), but every table cell produces empty text. Mandatory root-cause rethink — no point-patch.

**Root cause confirmed (live code read):**

`_to_pil` is called at `ocr_backends.py:108` inside `TesseractVieBackend.recognize_text()` but is never defined or imported anywhere in the file. Python raises `NameError: name '_to_pil' is not defined` at the first real extraction. The bare `except Exception` at line 134 swallows the NameError and returns `("", 0.0)`. Because `tesseract-vie` is the default backend and is selected for every extraction, all cells return empty text. The pipeline reports success (layout + bboxes valid), OCR text is zero.

**Second defect found in same audit pass:** `pek_engine_adapter.py:316` has `lang="en"` — English PaddleOCR model for Vietnamese documents. This would have been the next cycle's discovery.

**Structural root cause:** The serial loop exists because `except Exception → return ("", 0.0)` transforms all backend errors into false-green. Each fix only exposes the next swallowed defect. The fix ends the loop by removing the swallows and replacing them with raises (same pattern proven on `_load_pek_models()` in `e6b84ca5`).

**Decisions:**

- Option A selected for `_to_pil`: define module-level helper (ndarray → PIL via `Image.fromarray`; PIL passthrough; None passthrough; RuntimeError on unsupported type). Option B (default to PaddleOCR) rejected — does not fix the structural swallow, leaves same false-green posture.
- `lang="en"` → `lang="vi"` in `_load_pek_models()`: PaddleOCR 2.7.3 ships Vietnamese PP-OCRv4 model. One-token fix.
- `except Exception` at lines 134 + 237 removed; per-crop isolation catches at lines 1006 + 1019 in adapter are correct and annotated.
- 5 new tests in `test_ocr_backends.py` that pass real numpy ndarray shapes — the exact gap that let `_to_pil` ship green.
- One-pass audit grep mandated before implementing (§8 in brief).

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-27-pek-ocr-rootcause.md` — NEW (§1 escalation, §2 brownfield confirmed, §3 immediate defect, §4 fail-loud decision, §5 _to_pil fix, §6 contract+lang fix, §7 test mandate, §8 audit directive, §9 exact change-list 3 files, §10 verification sequence, §11 DDD, §12 risks, §13 handoff)
2. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-OCR-ROOTCAUSE` section appended
3. `docs/TASKS.md` — PEK-IMPORT-CHAIN marked SUPERSEDED; PEK-OCR-ROOTCAUSE added as READY
4. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** dev-pdf-extractor implements 3-file edit per brief §9 + one-pass audit grep first. Then ops --no-cache rebuild + force-recreate. Then qa FPT Q4 2025 sentinel + corpus sweep.

---

## PEK-INTEGRATE — PEK-IMPORT-CHAIN (2026-05-27T05:15Z) — DESIGN COMPLETE

**Task:** PEK-IMPORT-CHAIN. Round 3 escalation on pdf-extractor module. QA cycle-130 FAIL: `ModuleNotFoundError: No module named 'unimernet'` at first /pek-extract. Mandatory architect root-cause review before any dev fix.

**Root cause confirmed (live test harness + code read):**

Python's import system rule: importing any symbol from `pdf_extract_kit.tasks.*` — including via a fully-qualified leaf path like `from pdf_extract_kit.tasks.layout_detection import LayoutDetectionTask` — unconditionally executes `pdf_extract_kit/tasks/__init__.py` first. This was verified with a `/tmp/pek_import_test` harness (not an assumption). `tasks/__init__.py` eagerly imports all 6 task classes, including `FormulaRecognitionTask` → `formula_recognition/__init__.py` → `models/unimernet.py:9` → `import unimernet.tasks` → crash. There is no safe sub-path under `pdf_extract_kit.tasks`.

The dev correctly followed R-CRIT-3 (only import LayoutDetectionTask + OCRTask). The prior architect brief did not flag that even those safe-looking imports trigger `tasks/__init__.py`. This is the design gap this brief closes.

**Dead import discovered:** `OCRTask` was imported and stored in the models dict but NEVER invoked in `_run_extraction()`. Confirmed by reading every call site in the adapter. It was dead import weight.

**Fix selected:** Option B — bypass `pdf_extract_kit.tasks` entirely. Add `_PekLayoutModel` class in our adapter using `doclayout_yolo.YOLOv10` + `fitz` (PyMuPDF) directly. No PEK task imports. Drop dead OCRTask. PEK subtree untouched.

**Smoke gate gap closed:** Prior gate tested proxy symbols (numpy/cv2/paddleocr/YOLOv10/torch). Corrected gate imports `pek_engine_adapter` module itself — so any import regression fails the build, not the first extraction.

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-27-pek-import-chain.md` — NEW (full brief: §1 traced entry point with live evidence, §2 option analysis + selection, §3 exact edit list for 2 files, §4 corrected smoke gate, §5 DDD, §6 risk flags, §7 file list, §8 verification sequence)
2. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-IMPORT-CHAIN` section appended
3. `docs/TASKS.md` — PEK-DEP-RECONCILE marked DONE; PEK-IMPORT-CHAIN added as READY
4. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** dev-pdf-extractor implements 2-file edit per brief §3 + §8 verification sequence. Then ops force-recreate (--no-cache build required). Then qa re-runs FPT Q4 2025 sentinel + direct bun:sqlite row check.

---

## PEK-INTEGRATE — PEK-DEP-RECONCILE (2026-05-27T00:30Z) — DESIGN COMPLETE

**Task:** PEK-DEP-RECONCILE. Recurring-bug escalation (2 QA crashes on same module: Fix #1 ghost doclayout-yolo pin, Fix #2 numpy ABI crash at first model load — 0 BCTC rows produced). Architect root-cause rethink mandated before next fix.

**Root cause confirmed (live PyPI audit):**

`opencv-python 4.6.0.66` ships a `cp36-abi3` wheel compiled against numpy 1.x C API (ABI `0x1000009`). Container's non-deterministic pip resolution selected it (no explicit pin). `numpy>=1.24.0` resolved to 2.4.4 (ABI `0x2000000`). Mismatch → `numpy.core.multiarray` bootstrap crash on first `import cv2`. Build GREEN because pip install never imports natives; host venv (opencv 4.13.0.92 + numpy 2.3.5) masked it. Same dual-path-drift family as DRIFT-1/DRIFT-2/BCTC-OCR-PSM.

Secondary: `ultralytics 8.2.85–8.3.0` declared `numpy<2.0.0` in `requires_dist`. With `ultralytics>=8.2.85`, pip might select 8.2.85 (exactly) which conflicts with numpy 2.x. Floor to `>=8.3.10` (first version to remove the `<2.0.0` ceiling).

**Structural fix (ends one-crash-at-a-time loop):**

Build-time smoke gate: `RUN python3 -c "import numpy, cv2, paddleocr; from doclayout_yolo import YOLOv10; print('pek-native-imports: ALL OK')"` — fails Docker build if any ABI mismatch. No container runs with a broken numpy stack.

**3-file edit prescription:**
- `requirements-pek.txt`: `numpy>=2.0.0,<2.3.0` + `opencv-python==4.12.0.88` + `ultralytics>=8.3.10`
- `Dockerfile`: `torch==2.5.1 torchvision==0.20.1` explicit + smoke gate before EXPOSE
- `scenarios/pek_single_doc_extraction.py` line ~534: `patch("pdf2image.convert_from_path")` (was `patch("infrastructure.pek_engine_adapter.convert_from_path")` — wrong target for local import)

**Compatibility confirmed by live PyPI audit (2026-05-27):**
- opencv 4.12.0.88: `numpy>=2.0.0,<2.3.0` for py3.9+ — first numpy-2-native wheel
- paddlepaddle 3.3.1: numpy>=1.21 no upper + host evidence (paddle 3.0.0 + numpy 2.3.5 = working)
- ultralytics 8.3.10+: numpy>=1.23.0 (no upper) — compatible
- torch 2.5.1 / torchvision 0.20.1: no numpy constraint in metadata — compatible
- doclayout-yolo 0.0.3, paddleocr 2.7.3, scipy/pandas/albumentations: all numpy-2 compatible at target versions

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-27-pek-dependency-reconcile.md` — NEW (full brief: §1 escalation, §2 systemic root cause, §3 live dep audit + decision matrix, §4 exact requirements-pek.txt pin set, §5 smoke gate placement, §6 test fix, §7 host-venv advisory, §8 verification sequence, §9 risk flags, §10 file list, §11 DDD layer, §12 handoff)
2. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-DEP-RECONCILE` section appended
3. `docs/TASKS.md` — PEK-IMPL marked DONE (escalated); PEK-DEP-RECONCILE READY added
4. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** dev-pdf-extractor implements the 3-file edit per brief §8 verification sequence. Then ops force-recreate. Then qa re-runs FPT Q4 2025 sentinel + direct bun:sqlite row check.

---

## PEK-INTEGRATE — PEK-DESIGN (2026-05-26T21:00Z) — DESIGN COMPLETE

**Task:** PEK-DESIGN. Recurring-bug guard mandated architect rethink (9 MD-EXTRACT + 7 BT fix commits on the broken column-guessing engine). User directed re-engine on PDF-Extract-Kit (pristine clone at `apps/pdf-extractor/PDF-Extract-Kit`). PO-approved BA spec in `docs/REQ_PEK-INTEGRATE.md` (10 reqs, 35 ACs).

**Critical brownfield findings:**

- `struct_eqtable.py` in the pristine clone hard-asserts `torch.cuda.is_available()` — StructEqTable is GPU-only and CANNOT run on this host. No CUDA, no fallback.
- No `TableMaster` model class exists in `pdf_extract_kit/tasks/table_parsing/models/` — only `struct_eqtable.py`. README mentions PaddleOCR+TableMaster but it is not implemented in this release.
- Table extraction must use `paddleocr==2.7.3` PP-StructureV2 table mode directly (CPU-compatible, already in `requirements-cpu.txt`), NOT via PEK's `TableParsingTask`.
- `LayoutDetectionYOLO` has `device = config.get('device', 'cpu')` — CPU-compatible.
- `extract_layout_first_usecase.py` and `layout_first_push_client.py` already exist from LF-EXTRACT — reuse the orchestration shell and push contract. Replace injected callables with `PekEngineAdapter`.
- `isVnMarketHoursUtc` already exists in `mcp-server/src/scheduler/vpsProxyWatchdogJob.ts` — mirror logic in Python for pdf-extractor Layer-2 guard.
- pdf-extractor container already has `deploy.resources.limits.memory: 2.5g` in docker-compose.yml — adequate for ~1.3GB peak; no change needed.
- AC-PEK-3a conflicts with editable install requirement — PO must amend before PEK-IMPL starts.

**4 Deferred Decisions resolved:**

- (a) Tasks: `layout_detection` + `ocr` + PaddleOCR table structure (PP-StructureV2). Skip formula modules + StructEqTable. RAM peak: ~1.3GB (within 2.5g cap).
- (b) Topology: on-demand batch inside existing container, lazy singleton + market-hours guard (no second container).
- (c) Clone: pip editable install (`pip install -e ./PDF-Extract-Kit`); `.dockerignore` adds `PDF-Extract-Kit/.git/` + `PDF-Extract-Kit/models/`; model weights → named volume `pek_model_cache:/app/pek_models`.
- (d) Lazy load: `_pek_models_cache` module singleton; `threading.Semaphore(1)`; Docker OOM kill at 2.5GB cap.

**Market-hours constraint (new, primary driver):**

- Layer 1: `CRON_BCTC_REPARSE_JOB=0 21 * * *` in `docker-compose.yml` mcp-server env block (21:00 UTC = 04:00 ICT, deep off-market). No source code edit to cronConfig.ts needed.
- Layer 2: `is_vn_market_open_utc()` pure function in `domain/`; HTTP 503 guard on `POST /pek-extract` at handler level.
- PO action: append AC-PEK-NEW-1 + AC-PEK-NEW-2 to REQ-PEK-INTEGRATE (full text in brief §10).

**LF-OVERLAY reconciliation:**

- `POST /api/push-bctc-layout` endpoint and `bctc_layout_units` / `bctc_page_zones` schema adopted as-is from LF-OVERLAY brief §3. PEK DocLayout-YOLO bbox → LF-OVERLAY zone JSON mapping defined in brief §3.1. Zone stays **single** (no new mcp-server code changes from architect).

**Files authored this cycle:**

1. `docs/architecture-briefs/2026-05-26-pek-integrate-design.md` — NEW (full blueprint: §1 brownfield, §2 decisions a-d with RAM budgets, §3 LF-OVERLAY reuse, §4 market-hours two-layer enforcement, §5 DDD layers, §6 files to create/modify, §7 pipeline flow, §8 risk flags, §9 test strategy, §10 new ACs, appendix requirements-pek.txt)
2. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-DESIGN` section appended
3. `docs/TASKS.md` — PEK-DESIGN → DONE; PEK-IMPL → READY
4. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** PM decomposes PEK-IMPL into atomic tasks for dev-pdf-extractor (sole code owner). Also includes docker-compose.yml Layer-1 schedule fix in PEK-IMPL scope.

---

## DRIFT-3 — CI/CD Image SHA Drift Guard (2026-05-26T20:45Z) — DESIGN COMPLETE

**Task:** DRIFT-3. Recurring-bug escalation (2 deploy-drift instances: DRIFT-1 macro + DRIFT-2 kinh-dich). Root cause: `docker compose up -d` without `--build` relaunches stale image; health check passes; deploy declared complete; code absent. Existing Step 4 in deployment runbook uses timestamp comparison (imprecise + manual). Structural fix mandated.

**Brownfield findings:**

- No existing SHA-based gate. `scripts/preflight-disk.sh` is the only deploy pre-flight script — pattern to mirror.
- `docs/protocols/docker-deployment-runbook.md` Step 4 = `docker inspect {{.Created}}` timestamp comparison. Replaced by `scripts/verify-deploy-sha.sh` call.
- All 11 local Dockerfiles use multi-stage builds (builder + runtime stages). ARG/LABEL addition is 2-line append to runtime stage — zero logic impact.
- `flaresolverr` is a pulled image — no Dockerfile, excluded from guard scope.
- `apps/pdf-extractor/` has an active parallel session. Its Dockerfile update deferred to Phase B (after session closes).

**Design decisions:**

- SHA label: `vn.market.git_sha` injected via `ARG GIT_SHA=unknown` + `LABEL` in final runtime stage (last 2 lines, after all COPYs to avoid layer-cache stale SHA risk).
- New build command: `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <svc>`.
- Verification script: `scripts/verify-deploy-sha.sh` — reads label from running container, compares to HEAD. Exit 1 = drift or label absent. Exit 0 = verified.
- Deliberate-stale-image proof: `scripts/test-sha-drift-guard.sh` — builds image with STALE_SHA label, runs container, asserts verify script exits 1. Proof itself exits 0 only if guard correctly catches drift.
- Unit tests: `scripts/test-sha-comparison-unit.sh` — no Docker daemon required, 3 cases (match/mismatch/empty).

**Key risk flags:**

- Docker layer cache: mitigated by placing ARG/LABEL as last 2 lines of runtime stage (no cacheable dependency).
- Multiple container IDs during restart: mitigated by filtering for `running` state in verify script.
- First-run "label absent": expected and correct; forces rebuild.

**Files authored this cycle:**

1. `docs/architecture-briefs/2026-05-26-ci-cd-image-sha-drift-guard.md` — NEW (full blueprint: §1 root cause, §2 mechanism, §3 test strategy + deliberate-proof, §4 ACs, §5 risks, §6 file list, §7 frozen surfaces, §8 sequence, §9 parallelism)
2. `docs/handoffs/TASK_DEPLOY-DRIFT.md` — `[Architect] DRIFT-3` entry appended
3. `docs/agent-memory/notebooks/architect.md` — this entry (prepended)

**Next actor:** PM decomposes into atomic tasks: (Phase A) dev-cross-service implements 10 Dockerfiles + 3 scripts + runbook; (Phase B, after pdf-extractor session closes) dev-pdf-extractor or dev-cross-service adds label to apps/pdf-extractor/Dockerfile.

---

## BCTC-LAYOUT-FIRST — LF-DESIGN (2026-05-26T19:30Z) — DESIGN COMPLETE

**Task:** LF-DESIGN. Recurring-bug guard mandated architect root-cause rethink. `generic_md_table_extractor.py` = 9 MD-EXTRACT fix commits; `text_table_extractor.py` = 7 BT fix commits. The per-page column-guessing engine has no cross-page context and scrambles continuation pages with no column header (FPT Q1 2026 page 5 = proven root cause). PO-approved BA spec in `docs/REQ_BCTC-LAYOUT-FIRST.md`.

**Brownfield findings:**

- Redesign target confirmed: `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` (Steps A–G, per-page only, no unit grouping). The `ExtractMdTablesUseCase` calls `_extractor.extract_md_tables()` in a page-by-page loop — zero document context.
- 0-byte-diff boundary confirmed: `text_table_extractor.py` and `ExtractTablesUseCase` are structurally separate. Different trigger (`/extract-table` vs `/extract-md-tables`), different ports, different DB tables. The 1954c write chain writes only to `bctc_table_rows` + `bctc_balance_checks`.
- Existing `bctc_md_tables` table (UNIQUE on `report_id`, `md_tables_json` flat array) is extended additively. Old endpoint `POST /api/push-bctc-md-tables` stays live — backward compatible.
- New push endpoint: `POST /api/push-bctc-layout` → new handler `pushBctcLayoutHandler.ts` → writes to NEW tables `bctc_layout_units` + `bctc_page_zones`.
- `bctcInspectHandler.ts` extended with `GET /api/bctc-inspect/zones/{doc_id}?page=N` + ON/OFF toggle HTML control. Balance badge + `bctc_table_rows` read path UNCHANGED.

**3 architect-open questions resolved:**

1. **Schema:** `bctc_layout_units` (per-unit, quarantine flag) + `bctc_page_zones` (per-page, zones_json). Zero overlap with structured path. DDL in brief §3.1.
2. **JSON contract:** Full contract in brief §3.2. Coordinate system: top-left origin, px, 200 DPI. Column IDs positional (`col_0`/`col_1`). Continuation pages inherit schema-page's identical gutters. `unit_hints` metadata-only, never in branching logic.
3. **Quarantine storage:** `quarantined=1` in `bctc_layout_units`. QA counts via `SELECT quarantined, COUNT(*) FROM bctc_layout_units GROUP BY quarantined` — direct bun:sqlite, no endpoint.

**Design decisions:**

- Tier 0: 50-DPI PIL pixel ops + stored `pdf_extracted_text`. No Tesseract in Tier 0. Rasters ~5MB peak for 46-page doc.
- Tier 1: schema inheritance = skip column detection on continuation pages; use `unit_schema.gutter_x_positions` directly. This is the named fix for the FPT Q1 p5 scramble.
- Tier 2: one `image_to_data` call per page (200 DPI); cell text derived by bbox intersection filtering — not per-cell Tesseract.
- Tier 3: three invariants — balance identity (generic code-range heuristic, not sentinel hardcoding), codes monotonic, no orphan rows. Failing units quarantined, not pipeline-blocked.
- Parallelism: LF-EXTRACT + LF-OVERLAY dispatched in parallel (contract fully specified). LF-DEPLOY gated on both.

**Key risk flags:**

- Tier 0 fails on low-contrast/rotated pages → fallback: mark as `prose` (conservative), log WARNING.
- Continuation-page column-count mismatch → flag `schema_mismatch=true`, attempt inherited schema, let Tier 3 decide.
- Balance identity heuristic false-positive on non-balance-sheet units (notes with 3-digit reference codes) → gated on `max_code >= 400`.
- Overlay coordinate scaling: JS renderer MUST scale `zones_json` px coordinates by `display_width / image_width_px`.

**Files authored this cycle:**

1. `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md` — NEW (full blueprint: §1 brownfield, §2 tier contracts, §3 open Qs resolved, §4 per-task ACs, §5 constraints, §6 risks, §7 frozen surfaces, §8 parallelism)
2. `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md` — `[Architect] LF-DESIGN` entry appended
3. `docs/TASKS.md` — LF-DESIGN → DONE; LF-EXTRACT + LF-OVERLAY → READY
4. `docs/agent-memory/notebooks/architect.md` — this entry (full overwrite)

**Next actor:** PM dispatches dev-pdf-extractor (LF-EXTRACT) + dev-mcp-server (LF-OVERLAY) in parallel. LF-DEPLOY gated on both. QA verifies corpus pass-rate via direct bun:sqlite query per brief §3.3. Done-bar: Tier-3 corpus pass + overlay live + user verbal G9.

---

## MD-EXTRACT-9 — Label-Row Ordinal Reconstruction (2026-05-26T17:45Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-9. Recurring-bug escalation (many fix commits on `generic_md_table_extractor.py`). LIVE-VERIFY-8 showed income value columns FIXED (MD-EXTRACT-8) but label-row STILL BROKEN: label-row over-merge (`2 1 Doanh Các khoản thu giảm bán hàng trừ…`) + ordinal offset (code-02 values under code-01 label). Mandate: diagnostic-gate-first, live OCR token dump, root-cause classify, design. NOT a patch.

**Diagnostic completed (live, local Tesseract, single page 7 of FPT Q4 2025, no batch):**
- h_med=18px, label_pitch=36px (median), value_pitch=36px (uniform, col@1182 21 tokens)
- LABEL_BAND_FACTOR×h_med = 27px. 2×band=54px > label_pitch=36px → OVER-MERGE confirmed
- Ordinal grid rows: 24. Physical label lines: 24. COUNT MATCHES — zero count mismatch
- Band over-reach is the SOLE root cause. live simulation: rank=0 band=[474,528] captures 15 tokens from 2 consecutive label lines → exact LIVE-VERIFY-8 defect reproduced mechanically
- Fix-path-D dropped in 7-REV on wrong comparator (`band < pitch` checked; correct gate is `2×band > pitch`)

**Fix designed:**
- ADD Step C10.5: `_cluster_text_into_label_lines(text_tokens, gap=15px)` — sort by (top,left), greedy line grouping by gap threshold. Separates line-1 (top 488-496) from line-2 (top 522-524) on 26px gap >> 15px threshold.
- ADD Step C10.6: `_exclude_pre_data_label_lines` — exclude lines with y_med < first_value_top - 20px. Removes column-header fragments.
- MODIFY `_attach_labels_ordinal` — replace band body with ordinal-rank pairing (data_label_lines[k] ↔ grid[k], direct index). Signature UNCHANGED (backward compat with 12+ TestOrdinalReconstruction tests).
- MODIFY `_process_page` — insert C10.5+C10.6 between C10 and C11.

**Non-regression:** AC-8-SEG / AC-8-BALANCE / AC-8-VALUE-COLUMNS all structurally guaranteed (value ordinal reconstruction Steps C6-C10 untouched; segment has no pure-code cols so ordinal labeling path is identical; balance pitch >> gap threshold).

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §MD-EXTRACT-9 appended (~220 lines: §9.1 diagnostic, §9.2 root cause, §9.3 post-mortem, §9.4 design, §9.5 functions, §9.6 non-regression, §9.7 ACs, §9.8 fixture proof, §9.9 risks, §9.10 files, §9.11 constraints)
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — §[Architect] MD-EXTRACT-9 appended
3. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** main terminal → re-trace §9.8 fixture proof → dispatch dev-pdf-extractor MD-EXTRACT-9 → ops MD-DEPLOY-9 (single doc, full UUID `e71f845d`) → main-terminal live-verify → qa MD-QA-9 → po MD-EXIT.

---

## MD-EXTRACT-8 — Root-Cause Rethink: Anchor Gap Oracle (2026-05-26T16:12Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-8. Recurring-bug escalation (≥2 fix commits on `generic_md_table_extractor.py`). LIVE-VERIFY-7 failed on income statement (AC-7-REV-INC HARD FAIL) despite 122/439 unit tests green. Mandate: diagnostic-gate-first on actual live OCR token stream, classify root cause, design fix. NOT a patch.

**Diagnostic completed (live, local Tesseract, single-page, no batch):**
- Page 8 of FPT Q4 2025 PDF at 200 DPI: 2339×1654px, 404 words, 87 value tokens
- 4 real value columns at x-left: Val-A=1182, Val-B=1477, Val-C=1768, Val-D=2061. Per-row pitch: 35–37px (clean, recoverable).
- `w_med = 167px` (inflated by 18–20 char annual cumulative values like `20.258.866.135.395`)
- `col_gap = 1.5 × 167 = 250.5px` — swallows Val-A gap of 225px from code anchor 957. All 4 value columns absorbed under wrong anchors.
- FINAL ANCHORS PRODUCED: [255, 957, 1330, 1642, 1916] — all 4 real value columns lost.

**Root-cause classification: DOWNSTREAM-RECOVERABLE.** OCR reading order is clean. Upstream psm/preprocessing is NOT the cause. Dense multi-period income tables do NOT need a different reconstruction path. Same ordinal path; corrected anchor gap oracle.

**FIXTURE_TOKENS_REV divergence:** Fixture tokens had short widths → `w_med ≈ 60px` → `col_gap ≈ 90px` → correct anchors. Live tokens are 2.8× wider → col_gap collapses anchors. Fixture was not a valid proxy for live income data. This explains false-greens across MD-EXTRACT-5/6/7/7-REV.

**Fix designed (minimal, 1 constant + 1 function change):**
- New constant `_MIN_INTER_COLUMN_GAP_PX = 80` (1cm whitespace at 200 DPI, AC-0 compliant)
- Two-pass `_detect_column_anchors_from_tokens`: Pass 1 uses CODE token widths for fine bin_width (~6.9px); Pass 2 merges with fixed 80px threshold instead of `1.5 × w_med`
- Zero changes to REV-3/REV-4 additions or downstream grid functions

**Risk flags:** R-HIGH: parenthetical negatives `(73.049.924.176)` match `_NUMBER_TOKEN_RE` but not `_VALUE_TOKEN_RE`; dev must verify on live tokens that pure-code detector does not misclassify value columns. R-MED: Pass-1 fallback when no code tokens present. R-MED: constant assumes 200 DPI (document in docstring).

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §MD-EXTRACT-8 appended
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — §[Architect] MD-EXTRACT-8 appended
3. `docs/agent-memory/notebooks/architect.md` — this entry

---
