# Architecture Brief: PEK-WEIGHTS — Durable Model-Weight Provisioning

**Date:** 2026-05-27
**Architect:** architect
**Zone:** `apps/pdf-extractor/`
**BUILD-STANDARD:** not-applicable (infrastructure / deployment design)
**Escalation trigger:** PEK-MULTIPAGE fix (commit `2e228f0d`) exposed deploy blocker — no weights
on volume after `--no-cache` rebuild. Recurring-bug escalation mandates architect-first design.

---

## 1. Ground Truth Confirmed (do not re-derive)

| Fact | Status |
|---|---|
| Image `439d42948589` (QA image) is gone — no weight recovery from old image | CONFIRMED |
| Named volume `vn-market-intelligence-mcp_pek_model_cache` created 2026-05-27T18:02:30Z | CONFIRMED |
| Volume contains ONLY `yolo/settings.yaml` — no `.pt` weights, no PaddleOCR models | CONFIRMED |
| Volume is mounted at `/app/PDF-Extract-Kit/models` (ops's compose edit, uncommitted) | CONFIRMED |
| `HuggingFace.co` reachable from inside container: HTTP 200 | LIVE-VERIFIED |
| `hf-mirror.com` reachable from inside container: HTTP 200 | LIVE-VERIFIED |
| `www.modelscope.cn` reachable from inside container: HTTP 200 | LIVE-VERIFIED |
| Paddle CDN `paddleocr.bj.bcebos.com` reachable: HTTP 200 on model URL (403 on root is normal) | LIVE-VERIFIED |
| GitHub `doclayout_yolo/assets` releases: HTTP 404 — auto-download path is DEAD | LIVE-VERIFIED |
| `doclayout_yolo_ft.pt` is NOT in `GITHUB_ASSETS_NAMES` — `attempt_download_asset` returns path as-is without downloading | CODE-VERIFIED |
| `doclayout_yolo_ft.pt` exists at HF `opendatalab/PDF-Extract-Kit-1.0`: `models/Layout/YOLO/doclayout_yolo_ft.pt` (40.7 MB) | LIVE-VERIFIED |
| PaddleOCR 2.10.0 uses `PADDLE_OCR_BASE_DIR` (NOT `PADDLEOCR_HOME`) for model storage | CODE-VERIFIED |
| PaddleOCR auto-downloads its own weights from Paddle CDN at first call (self-provisioning) | CODE-VERIFIED |
| `docker-compose.yml` has `PADDLEOCR_HOME` set — this env var is IGNORED by paddleocr 2.10 | CODE-VERIFIED |
| `docker-compose.yml` does NOT set `PADDLE_OCR_BASE_DIR` | CONFIRMED |

---

## 2. Root Cause (Architectural Defect — AC-PEK-3 Divergence)

The original AC-PEK-3 design stated "runtime-downloaded to named volume pek_model_cache." This assumption was never backed by a working download mechanism:

1. **YOLO weight auto-download is hardcoded GitHub-first and 404s.** `doclayout_yolo.YOLOv10` calls `attempt_download_asset` which tries `github.com/doclayout_yolo/assets` — not the `opendatalab/DocLayout-YOLO` repo. The file name `doclayout_yolo_ft.pt` is NOT in the Ultralytics GITHUB_ASSETS_NAMES set. The function returns the unresolved path, `torch.load` raises `FileNotFoundError`, caught by fail-loud `RuntimeError` in `_load_pek_models`. No extraction possible.

2. **PaddleOCR home env var is wrong.** The compose sets `PADDLEOCR_HOME` which is not read by paddleocr 2.10. The correct var is `PADDLE_OCR_BASE_DIR`. Without this, PaddleOCR downloads to `/root/.paddleocr/` (ephemeral container writeable layer, lost on force-recreate).

3. **Path mismatch between original design and ops's edit — now reconciled (see §3).**

---

## 3. Decision A — Single Canonical Weights Path

**VERDICT: ops's compose edit STAYS (with one correction).**

The volume mount `pek_model_cache:/app/PDF-Extract-Kit/models` is CORRECT. Rationale:

- The adapter resolves the YOLO weight to `pek_root + "models/Layout/YOLO/doclayout_yolo_ft.pt"` where `pek_root = /app/PDF-Extract-Kit`. The resolved path is `/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt`.
- Mounting the volume at `/app/PDF-Extract-Kit/models` puts the weight at exactly that path.
- The original mount `/app/pek_models` was NEVER on the adapter's read path — it was a design-divergence from the start.

**Single canonical base path: `/app/PDF-Extract-Kit/models`** — everything lives here.

**Required reconciliation table (all four must agree after ops implement):**

| Item | Must be set to |
|---|---|
| Volume mount in `docker-compose.yml` | `pek_model_cache:/app/PDF-Extract-Kit/models` (KEEP ops's edit) |
| `YOLO_CONFIG_DIR` env in compose | `/app/PDF-Extract-Kit/models/yolo` (KEEP ops's edit) |
| `HUGGINGFACE_HUB_CACHE` env in compose | `/app/PDF-Extract-Kit/models/huggingface` (KEEP ops's edit) |
| `MODELSCOPE_CACHE` env in compose | `/app/PDF-Extract-Kit/models/modelscope` (KEEP ops's edit) |
| `PADDLEOCR_HOME` env in compose | **DELETE** — this var is ignored by paddleocr 2.10 |
| `PADDLE_OCR_BASE_DIR` env in compose | **ADD**: `/app/PDF-Extract-Kit/models/paddleocr` |
| Dockerfile `ENV PADDLEOCR_HOME` (line 85) | **CORRECT to `PADDLE_OCR_BASE_DIR=/app/pek_models/paddleocr`** (Dockerfile default, not the compose override — ops must also add `PADDLE_OCR_BASE_DIR` to Dockerfile ENV block as the default) |
| Dockerfile `ENV HUGGINGFACE_HUB_CACHE` | Keep `/app/pek_models/huggingface` (Dockerfile default, overridden by compose) |
| Adapter `_pek_root` | `/app/PDF-Extract-Kit` (computed from `_PEK_CONFIG_DIR/../` — correct, no change) |
| Adapter `model_path` resolved | `/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt` (correct, no change) |

The Dockerfile ENV block defaults (`/app/pek_models/*`) are fine as fallbacks for standalone runs without compose. The compose envs override them for the fleet deployment. Both are consistent with the volume at `/app/PDF-Extract-Kit/models`.

**Note on Dockerfile ENV:** The Dockerfile currently has `ENV PADDLEOCR_HOME=/app/pek_models/paddleocr` (line 85). This must be changed to `ENV PADDLE_OCR_BASE_DIR=/app/pek_models/paddleocr` so PaddleOCR reads it both in standalone container and compose contexts. No other Dockerfile change is needed for the env block.

---

## 4. Decision B — Provisioning Mechanism

### Options evaluated

| Option | Pro | Con |
|---|---|---|
| Entrypoint fetch-if-missing on container start | No separate step | Adds 20-40s cold-start on every fresh deploy; entrypoint code change; weights fetch blocks FastAPI startup path |
| Compose `init`/one-shot service | Self-contained | Adds service to compose; requires shared volume + ordering; more ops complexity |
| **Committed bootstrap script (SELECTED)** | Idempotent; ops runs once; committed to git; no container startup delay; no compose topology change | Manual step (documented, not automatic) |

**Selected: `scripts/pek-fetch-weights.sh`** — a committed, idempotent shell script that ops runs ONCE after any fresh volume provision or `docker volume rm`. This is the cleanest single-step operation: one command, skips if files already present, committed to the repo so the procedure is never lost.

The entrypoint option is rejected because: (a) the container must be healthy before weights are on disk — the health check passes immediately (HTTP /health returns 200 without loading models), but the first `/pek-extract` call triggers `_load_pek_models()` which now fails loudly. Adding a blocking fetch to the entrypoint would delay start and couples network latency to container boot, which is wrong for the lazy-load design. (b) It hides an infrastructure state problem inside application code.

The compose init-service option adds architecture complexity (shared volume mount on a new service) with no benefit over a script.

### Exact fetch recipe

**File to fetch:** `models/Layout/YOLO/doclayout_yolo_ft.pt` (40.7 MB, LFS-managed on HuggingFace).

**Target path on volume:** `/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt` (inside the `pek_model_cache` Docker volume, accessed from the container at that path, or from the host at the Docker volume mountpoint).

**Method:** `docker run` using the same image, mounting the volume, running `huggingface_hub snapshot_download` to fetch the single file. This avoids installing `huggingface_hub` on the host and uses the already-installed package inside the image.

**Primary source:** HuggingFace `opendatalab/PDF-Extract-Kit-1.0`, filename `models/Layout/YOLO/doclayout_yolo_ft.pt`.

**Fallback source:** ModelScope `OpenDataLab/PDF-Extract-Kit-1.0`, same relative path.

```bash
#!/usr/bin/env bash
# scripts/pek-fetch-weights.sh
# Provision DocLayout-YOLO weights onto the pek_model_cache named volume.
# IDEMPOTENT: exits 0 immediately if the weight file already exists on the volume.
# Run this ONCE after any fresh volume creation or docker volume rm pek_model_cache.
#
# Usage:
#   bash scripts/pek-fetch-weights.sh
#   bash scripts/pek-fetch-weights.sh --source modelscope   # force ModelScope
#
# Prerequisites: docker running, pek_model_cache volume exists or will be created by compose.

set -euo pipefail

VOLUME_NAME="vn-market-intelligence-mcp_pek_model_cache"
IMAGE="vn-market-intelligence-mcp-pdf-extractor:latest"
WEIGHT_DEST="/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt"
HF_REPO="opendatalab/PDF-Extract-Kit-1.0"
HF_FILENAME="models/Layout/YOLO/doclayout_yolo_ft.pt"
MS_REPO="OpenDataLab/PDF-Extract-Kit-1.0"
SOURCE="${1:-hf}"  # hf | modelscope

echo "[pek-fetch-weights] Checking if weights already on volume..."
EXISTS=$(docker run --rm \
  -v "${VOLUME_NAME}:/app/PDF-Extract-Kit/models" \
  "${IMAGE}" \
  python3 -c "
import os, sys
p = '${WEIGHT_DEST}'
if os.path.exists(p) and os.path.getsize(p) > 1_000_000:
    print('EXISTS')
else:
    print('MISSING')
")

if [ "${EXISTS}" = "EXISTS" ]; then
  echo "[pek-fetch-weights] Weight file already present — skipping download."
  exit 0
fi

echo "[pek-fetch-weights] Weight file MISSING. Fetching from ${SOURCE}..."

if [ "${SOURCE}" = "modelscope" ]; then
  docker run --rm \
    -v "${VOLUME_NAME}:/app/PDF-Extract-Kit/models" \
    -e MODELSCOPE_CACHE=/app/PDF-Extract-Kit/models/modelscope \
    "${IMAGE}" \
    python3 -c "
from modelscope.hub.snapshot_download import snapshot_download
import shutil, os
local = snapshot_download(
    '${MS_REPO}',
    cache_dir='/app/PDF-Extract-Kit/models/modelscope',
    allow_patterns=['models/Layout/YOLO/doclayout_yolo_ft.pt']
)
src = os.path.join(local, 'models/Layout/YOLO/doclayout_yolo_ft.pt')
dst = '${WEIGHT_DEST}'
os.makedirs(os.path.dirname(dst), exist_ok=True)
shutil.copy2(src, dst)
print('[pek-fetch-weights] ModelScope fetch done:', dst, os.path.getsize(dst), 'bytes')
"
else
  # Primary: HuggingFace hf_hub_download (single file — faster than snapshot_download)
  docker run --rm \
    -v "${VOLUME_NAME}:/app/PDF-Extract-Kit/models" \
    -e HUGGINGFACE_HUB_CACHE=/app/PDF-Extract-Kit/models/huggingface \
    "${IMAGE}" \
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil, os
local = hf_hub_download(
    repo_id='${HF_REPO}',
    filename='${HF_FILENAME}',
    cache_dir='/app/PDF-Extract-Kit/models/huggingface',
)
dst = '${WEIGHT_DEST}'
os.makedirs(os.path.dirname(dst), exist_ok=True)
shutil.copy2(local, dst)
size = os.path.getsize(dst)
assert size > 1_000_000, f'Weight file suspiciously small: {size} bytes'
print('[pek-fetch-weights] HuggingFace fetch done:', dst, size, 'bytes')
"
fi

echo "[pek-fetch-weights] DONE. Verify:"
echo "  docker run --rm -v ${VOLUME_NAME}:/app/PDF-Extract-Kit/models ${IMAGE} ls -lh /app/PDF-Extract-Kit/models/Layout/YOLO/"
```

**PaddleOCR weights — NOT provisioned by this script.** PaddleOCR auto-downloads its own models from Paddle CDN (`paddleocr.bj.bcebos.com`) on first `PaddleOCR()` instantiation. The first `/pek-extract` call after a fresh deploy will trigger this download (~8 MB for the SLANet table structure model, ~25 MB for detection + recognition models). This is acceptable because:

- Paddle CDN is reachable from the container (HTTP 200 verified live).
- Total download is ~35 MB and takes ~10-30s on first call only.
- Subsequent calls hit the local cache on the volume (once `PADDLE_OCR_BASE_DIR` is correctly set).
- The download happens inside the lazy-load path, which already has a `threading.Semaphore(1)` guard, so no concurrent download race.

**Files on volume after full provisioning:**

```
/app/PDF-Extract-Kit/models/
  Layout/
    YOLO/
      doclayout_yolo_ft.pt          (40.7 MB — from fetch script)
  huggingface/                       (HF cache dir — created by script)
  yolo/
    settings.yaml                    (created by doclayout_yolo on first use)
  paddleocr/                         (auto-created by PaddleOCR on first use)
    whl/
      det/...                        (~7 MB detection model)
      rec/...                        (~9 MB latin rec model)
      table/...                      (~8 MB SLANet table model)
```

---

## 5. Decision C — Network Reachability

**Verified live from inside the container (image `d8f4815665ed`):**

| Endpoint | Status |
|---|---|
| `https://huggingface.co` | REACHABLE (HTTP 200) |
| `https://hf-mirror.com` | REACHABLE (HTTP 200) |
| `https://www.modelscope.cn` | REACHABLE (HTTP 200) |
| `https://paddleocr.bj.bcebos.com` | REACHABLE (HTTP 200 on model URL; 403 on root = CDN normal) |
| `https://github.com/doclayout_yolo/assets` | DEAD (HTTP 404 confirmed) |

**Probe command ops must run before executing the fetch script:**

```bash
docker run --rm vn-market-intelligence-mcp-pdf-extractor:latest \
  python3 -c "
import urllib.request
for label, url in [
    ('HuggingFace', 'https://huggingface.co'),
    ('ModelScope',  'https://www.modelscope.cn'),
]:
    try:
        resp = urllib.request.urlopen(url, timeout=10)
        print(f'{label}: REACHABLE ({resp.status})')
    except Exception as e:
        print(f'{label}: UNREACHABLE — {e}')
"
```

**Fallback ordering:**
1. HuggingFace (`hf_hub_download`, single-file fetch, faster) — primary
2. ModelScope (`snapshot_download` with `allow_patterns`) — fallback via `--source modelscope`

**If BOTH HuggingFace AND ModelScope are unreachable:** This is a hard infrastructure blocker. No architectural workaround exists — the file must be obtained externally. Ops must surface this to the user for manual intervention (e.g., download on host and `docker cp` into the volume). This scenario should be treated as an ops blocker, not a developer task.

---

## 6. Decision D — Acceptance Contract

### Ops gate (before qa)

1. **Probe:** Run the reachability probe above and confirm at least one of HF/ModelScope is REACHABLE.
2. **Fetch:** Run `bash scripts/pek-fetch-weights.sh` (primary = HF). Script must exit 0 with message containing "done: ... bytes".
3. **Verify weight on volume:**
   ```bash
   docker run --rm \
     -v vn-market-intelligence-mcp_pek_model_cache:/app/PDF-Extract-Kit/models \
     vn-market-intelligence-mcp-pdf-extractor:latest \
     ls -lh /app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt
   ```
   Expected: file size ~38-42 MB.
4. **Compose env fix:** Confirm `docker-compose.yml` has `PADDLE_OCR_BASE_DIR=/app/PDF-Extract-Kit/models/paddleocr` (NOT `PADDLEOCR_HOME`) and `YOLO_CONFIG_DIR=/app/PDF-Extract-Kit/models/yolo`. All four env vars must point to `/app/PDF-Extract-Kit/models/*`.
5. **Proof rebuild (durability gate):** Run `docker compose build --no-cache pdf-extractor`. Then force-recreate WITHOUT re-running the fetch script:
   ```bash
   docker compose up -d --no-deps --force-recreate pdf-extractor
   ```
   The weight file must STILL be present (it is on the named volume, not the image — survives both operations).
6. **Model load verification:** After force-recreate, trigger a PEK extraction:
   ```bash
   curl -X POST http://localhost:5001/pek-extract \
     -H 'Content-Type: application/json' \
     -d '{"report_id":"e71f845d-ffa5-48f9-8f09-30ac2cd09c65","pdf_path":"/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}'
   ```
   Container logs must contain `PekEngineAdapter: _PekLayoutModel loaded (DocLayout-YOLO, CPU)` — NOT a FileNotFoundError or RuntimeError.
7. **Market-hours guard:** POST /pek-extract during HOSE open (Mon-Fri 02:00-08:59 UTC) must return HTTP 503. Do not run extraction during HOSE hours.

### QA gate (after ops)

1. **Multi-page grouping (PEK-MULTIPAGE regression):** Delete stale FPT units then re-extract:
   ```sql
   -- In mcp-server container via bun
   DELETE FROM bctc_layout_units WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65';
   DELETE FROM bctc_page_zones WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65';
   ```
   Then trigger re-extraction. Run all four gates from PEK-MULTIPAGE brief §6:
   - Gate A: every `page_type='table'` page covered by unit with `LENGTH(stitched_markdown) > 0`
   - Gate B: FPT pages 7, 8, 9 appear in a SINGLE unit with `row_count >= 10`
   - Gate C: `ghost_table_units = 0`
   - Gate D: corpus sweep — Gates A+C for every report_id
2. **Durability assertion:** After gates A-D pass, ops runs the proof rebuild (§ops gate step 5) again, and QA reruns Gate B only. If Gate B passes after the proof rebuild WITHOUT any manual step between rebuild and qa — durability is confirmed.
3. **RAM:** pdf-extractor RSS must stay under 2.5 GiB during extraction. Fleet total under 8 GiB.
4. **Market-hours guard intact:** no extraction during HOSE 02:00-08:59 UTC Mon-Fri.

---

## 7. Decision E — AC-PEK-3 Doc Update (Close Divergence Permanently)

The following AC-PEK-3 sub-items must be updated to match deployed reality:

| AC | Old (diverged) | New (correct) |
|---|---|---|
| AC-PEK-3b | "weights only in named volume pek_model_cache at /app/pek_models" | "weights only in named volume pek_model_cache at /app/PDF-Extract-Kit/models" |
| AC-PEK-3c | "runtime auto-download via HF/ModelScope on first call" | "YOLO weight provisioned via scripts/pek-fetch-weights.sh (committed, idempotent); PaddleOCR auto-downloads from Paddle CDN on first use into PADDLE_OCR_BASE_DIR" |
| AC-PEK-3d (NEW) | — | "PADDLE_OCR_BASE_DIR (not PADDLEOCR_HOME) set to /app/PDF-Extract-Kit/models/paddleocr in both Dockerfile ENV and docker-compose.yml" |
| AC-PEK-3e | "weights survive docker compose build + force-recreate" | UNCHANGED — this is the durability guarantee; the fetch script + named volume delivers it |

**Files to update:** `docs/REQ_PEK-INTEGRATE.md § REQ-PEK-3` (PO owns SSOT for ACs). Architect marks the divergence CLOSED here.

---

## 8. Change-List for ops

Files ops must touch (ALL in a single commit, not piecemeal):

| File | Change |
|---|---|
| `docker-compose.yml` | (a) Keep `pek_model_cache:/app/PDF-Extract-Kit/models`. (b) Delete `PADDLEOCR_HOME` line. (c) Add `PADDLE_OCR_BASE_DIR=/app/PDF-Extract-Kit/models/paddleocr`. Verify all 4 cache env vars point to `/app/PDF-Extract-Kit/models/*`. |
| `apps/pdf-extractor/Dockerfile` | Change `ENV PADDLEOCR_HOME=/app/pek_models/paddleocr` (line 85) to `ENV PADDLE_OCR_BASE_DIR=/app/pek_models/paddleocr`. No other Dockerfile changes needed. |
| `scripts/pek-fetch-weights.sh` | CREATE — exact script body per §4 above. Make executable (`chmod +x`). |

**Frozen (ops must not touch):**
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`
- `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- `apps/pdf-extractor/sandbox/runner.py`
- `apps/pdf-extractor/PDF-Extract-Kit/` (entire subtree)
- `docs/data/pilot-status-pdf-extractor.json`
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`

---

## 9. Risk Flags

**R-CRIT-1 — PaddleOCR first-call latency under market-hours guard.** If the market-hours guard is active (02:00-08:59 UTC Mon-Fri), the first extraction after a fresh deploy will attempt to download PaddleOCR weights from Paddle CDN at ~09:00 UTC. The `_load_pek_models()` singleton is initialized on first `/pek-extract` call; if the Paddle CDN download takes >30s and the healthcheck is probing `/health` (which does NOT trigger model load), the container stays healthy but the first extraction call may appear slow. This is expected behavior — document in ops runbook.

**R-MED-1 — YOLO settings.yaml `weights_dir` is "weights" (relative).** The `doclayout_yolo` package writes `settings.yaml` with `weights_dir: weights` (relative path). If `doclayout_yolo` ever tries to resolve the weights_dir for its own downloaded assets, it uses the relative path from the CWD. This is a non-issue for our use case because we pass the absolute model path directly — `doclayout_yolo` never needs to search for `doclayout_yolo_ft.pt` itself. Annotate the `settings.yaml` in the yolo config dir as a doclayout_yolo artifact (not our config).

**R-LOW-1 — Script requires image to be built first.** `pek-fetch-weights.sh` runs `docker run` using the pdf-extractor image. If the image was just deleted (`docker image prune`), the script will fail with "image not found". ops must run `docker compose build pdf-extractor` first. Document order: build → fetch-weights → force-recreate.

---

## 10. Pipeline State

**PIPELINE: continue**
**ZONE: apps/pdf-extractor/**

Next: ops implements §8 change-list (3 files) → runs §6 ops gates → qa runs §6 qa gates → USER verbal G9.

The PEK-MULTIPAGE fix (commit `2e228f0d`) is blocked at ops until weights are provisioned. ops must complete this design's change-list before force-recreating the container.
